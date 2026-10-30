# 质量层退场：CLI 只报可数事实，好坏交给 LLM

> Task version: v1
> Status: in_progress

## Goal

把「质量判断」从 CLI 里整个移除。CLI 不再输出 `good / acceptable / poor`，不再持有任何质量阈值，不再用 Jaccard 猜语义相似度。凡是能数出来的（条数、正文长度、来源数、每轮新增与重复、已抽取比例），CLI 报准；凡是"这算不算好"、"该不该换个角度"、"能不能收工"，由读输出的 LLM 判断。

用户价值：一个真正做了三轮调研的 session 和一个只搜了一轮的 session，今天会拿到同一个 verdict。删掉 verdict 之后，LLM 看到的是两轮各带 12 条 / 1 条新结果这样的事实，判断依据从"CLI 说 acceptable"变成"我看到第 3 轮 0 条新增"。

## Background / Confirmed Facts

全部在 `main` @ `9816f2f` 上实测。

### 阈值从未参与过滤

`verdict` 的唯一读者是 `runCli.ts:373` 打印一句 recovery 提示。`--approve-file` 走 `approveResults()`，只看 `hasVerifiedContent()`（`session.ts:328`），不看 quality。`quality-assess.ts:4` 写的 "Programmatic pre-filter: removes obviously poor results before Agent review" 是不实描述。

### `contentDepth` 分母只数已抽取项，方向相反

`quality-assess.ts:69` 先 `filter(r => r.content && r.content.length > 0)` 再求平均。实测：10 条结果里只有 1 条抽取了 9000 字符 → `contentDepth = 9000, pass`，9 条未抽取完全不进分母。抽得越少，分越高。

### 阈值与真实数据不匹配

7 个真实 session 的已抽取平均正文长度：181 / 138 / 123 / 137 / 121 / 106 / 171。**5 of 7 低于 `contentDepth >= 150`**。同批 `sourceDiversity` 为 4–29，几乎永远满足。净效果：verdict 实际上只由"搜得够不够少"决定。

### `novelty` 比的是标题

搜索结果进 session 时 `content` 被移除（`session.ts`），正文在 `excerpt`。`quality-assess.ts:106` 取 `r.content || r.title`，于是拿到 title。实测两条 URL 不同、标题相同 → `novelty = 0`。

### 同一个 session 两个相反 verdict

`--quality` 只把 approved 当先验 → `acceptable, novelty=1`；`assessLatestResultQuality` 把全部更早轮次当先验 → `poor, novelty=0`。两个函数都叫"质量评估"。

### 校准脚本已经跑不动

`test/calibrate-thresholds.ts` 实跑 `TypeError: Cannot read properties of undefined (reading 'value')` —— 它读 `breakdown.resultCount` 与 `breakdown.entityRichness`，两项在 `e423dbc` 已删除。且不在任何 npm script、不在 `vitest.config.ts` 的 include、不在 `tsconfig.json` 的 include，所以连类型错误都不会暴露。`150 / 3 / 0.3 / 0.75` 四个阈值因此没有可追溯来源。

### 重复实现

`extractDomain` 有 4 份：`quality-assess.ts:58`、`coverage.ts` 内联（`domainFactsOf`）、`query-suggest.ts:56`、`runCli.ts`（`domain` 字段内联）。其中 `quality-assess.ts` 对 `file://` 返回 `''`，`coverage.ts` 直接 `continue`，`query-suggest.ts` 返回 hostname 但把 `file://` 当 `file`。纯本地 RAG session 在 `sourceDiversity` 上恒为 0。

### 旧 session 的形状

本机 9 个真实 results.json 中，7 个（全部 `test/research-bench/` 与 `.digdig/` 下的历史数据）结果对象**没有 `origins`、没有 `contentType`**，正文直接在 `content` 上；只有 2 个（`cli/.digdig/sessions/t1`、`t2`，本会话新建）是当前格式。因此任何按轮次分组的输出都必须能退化成"不分轮，只给总计"。

## Requirements

1. **删除判断层**：`QualityScore.verdict`、`failedIndicators`、`IndicatorResult.pass` / `threshold`、`QualityThresholds`、`DEFAULT_THRESHOLDS`、`NOVELTY_SIMILARITY_THRESHOLD`、`--threshold-override`、`INVALID_THRESHOLD_OVERRIDE`。
2. **删除 `novelty`**：整条指标连同 `computeNovelty` 删除。重复 URL 已由身份层去重（`TF-20261028-fe548a`），不需要第二个近似指标。
3. **`contentDepth` 换成抽取覆盖率**：报 `extracted / total`，分母是全部结果。这是一个二值可核验的事实，不是均值。
4. **`sourceDiversity` 换成来源计数**：报 `sources` 条数与来源列表，不带阈值。本地文件按文件路径计入来源，不再被算成 0。
5. **`--quality` 只做两件事**：列出待审批结果的逐条事实；机械门槛（`hasVerifiedContent`，已存在）。不再给任何整体结论。
6. **`recovery-analysis` 命令删除**：它六处分支全部读 `verdict` / `failedIndicators`，删掉判定层后整个模块成为空壳。它的输入（每轮结果数、重复数）`coverage` 已经算好。
7. **`extractDomain` 收拢到一处**：`dedupe.ts` 新增 `sourceKey(url)`，`coverage` / `query-suggest` / `runCli` 三处改为调用它。
8. **删除 `test/calibrate-thresholds.ts`**：没有阈值就没有可校准的对象。
9. **文档同步**：`CLAUDE.md`（本地、不入库）、`skills/digdig/SKILL.md`、`skills/digdig/references/SOP.md`、`README.md`、`README.zh-CN.md`。

## Acceptance Criteria

- **AC1** 全仓库不再有 `verdict` / `good` / `acceptable` / `poor` 这三档质量标签出现在质量语境中；`grep -rn "verdict" cli/src` 只剩 claims 模块（那是法律论证的裁定，与搜索质量无关）。
- **AC2** `grep -rn "threshold" cli/src/deep` 不再命中质量阈值；`--threshold-override` 从 `runCli.ts` 与两份文档中消失。
- **AC3** `--quality --format json` 的输出包含：结果总数、已抽取数、未抽取数、来源数，以及每条待审批结果的 `{id, revision, title, url, source, domain, contentLength, extracted, verified, round}`。不含任何整体结论字段。
- **AC4** 一个 `content` 为空、只有 `excerpt` 的搜索结果，在 `--quality` 输出里 `extracted: false` 且 `contentLength: 0` —— 不再被算作有正文。
- **AC5** 一条抽取完成的正文落地后，重启报告 `extracted` 计数 +1，且该结果所属轮次不变。
- **AC6** 一个只有本地 `file://` 文档的 session，`sources` 计数等于不同文件路径数，不为 0。
- **AC7** `dg recovery-analysis <session>` 不再存在（`commandNames` 不含它）。
- **AC8** `dg coverage` 与 `dg --quality` 的输出无重复字段：`coverage` 报每轮事实，`--quality` 只报当前待审批批次。
- **AC9** `npx tsc --noEmit` 退出 0；`npx vitest run` 全绿（基线 38 files / 541 tests）。
- **AC10** 旧格式 session（无 `origins`）跑 `dg coverage` 与 `dg --quality` 均不抛错，退化输出合理。

## In Scope

- `cli/src/deep/quality-assess.ts`（删除）
- `cli/src/deep/recovery-analysis.ts`（删除）
- `cli/src/deep/iteration-data.ts`（精简）
- `cli/src/deep/query-suggest.ts`（去掉 `qualityLastRound`，复用 `sourceKey`）
- `cli/src/deep/coverage.ts`（复用 `sourceKey`，本地文件计入来源）
- `cli/src/deep/dedupe.ts`（新增 `sourceKey`）
- `cli/src/runCli.ts`（`--quality` 重写、四个格式化器、`--threshold-override`、`recovery-analysis` 命令、`session-report`）
- `cli/test/calibrate-thresholds.ts`（删除）
- `cli/test/unit/deep/quality-assess.test.ts`、`recovery-analysis.test.ts`（删除）
- `cli/test/unit/deep/iteration-data.test.ts`、`query-suggest.test.ts`、`cli.test.ts`、`integration/results-add.test.ts`、`benchmark/performance.bench.ts`（同步）
- `CLAUDE.md`（本地）、`skills/digdig/SKILL.md`、`skills/digdig/references/SOP.md`、`README.md`、`README.zh-CN.md`

## Out of Scope

- `claims/` 模块的 `verdict`（法律论证裁定，与搜索质量无关）
- 知识图谱结构、RRF 融合、冗余检查（`query-redundancy.ts`）的阈值 —— 它们是检索行为参数，不是质量判断
- `search-strategy.ts` 的 `transitionThreshold`（阶段切换参数，产出的是建议不是结论）
- 引入 embedding 或任何语义相似度
- 为删除的字段保留兼容层（用户明确要求不写兼容代码）

## Risks / Deferred Items

- **风险**：`session-report` 变薄后可能被认为信息不足。缓解：它保留 strategy + topEntities，并指向 `dg coverage`；两者都不重复对方的字段。
- **风险**：`skills/digdig/SKILL.md` 与 `SOP.md` 有多处流程描述引用 verdict 与 `recovery-analysis`。这是 LLM 的操作手册，改错会让 Agent 调用不存在的命令。缓解：Step 5 单独一步，逐处核对，并用 `commandNames` 测试兜底。
- **延后**：`TF-20261028-12ced8`（阈值集中化）的前提被本任务删除大半——它要收拢的 14 个阈值里，质量那 4 个会消失。本任务不处理它，完成后需要在它的 todo 条目上记录范围变化。
- **延后**：`backtrackToBestQuery` 在生产代码中无调用者（只有测试），随 `recovery-analysis.ts` 一起删除。

## Open Questions

无。两个先前悬而未决的问题已在 Spec 的 Design Decisions 中定稿：

1. `recovery-analysis` 保留还是删除 → 删除（Requirements 6）。
2. 旧 session 无 `origins` 时如何退化 → 不分轮，只给总计（Background 末段 + AC10）。
