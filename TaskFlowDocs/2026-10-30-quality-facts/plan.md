# Plan — 质量层退场：CLI 只报可数事实，好坏交给 LLM

> Task version: v1
> Status: checking

## Spec Pointers

- `spec.md` — 契约、不变量、D1–D6 决策与备选否决理由

## Reference Pointers

- [Reinforce] `TaskFlowDocs/repository-docs/index.md` — 路由记录；`CONTRIBUTING.md` / `CODE_STYLE.md` / `.github/pull_request_template.md` 均为 missing，本任务从 `git log` 反推提交格式：`type(scope): 中文摘要` + 正文，分支 `<type>/<date>-<slug>`，合并走 GitHub PR。

## Related Tasks

- **上游（已完成）** `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/`（`TF-20261028-fe548a`）。本任务依赖它的**产出**：`origins[].round` 记录首次出现轮次、`resultUrlKey` 统一身份、零抽取时的 `excerpt` 落位。本任务不读它的内部实现。
- **受影响（未开始）** `TF-20261028-12ced8`（阈值集中化）。它要收拢的 14 个阈值里有 4 个属质量层，本任务会删掉。完成后需在该条目的 todo 记录上标注范围变化，不在本任务内改它。

## Skills / Tools Used

- [PRD] `agent-skills:api-and-interface-design` — 目的：在把方向写成需求前，先确认 CLI 与 LLM 之间该以什么形式交接；结论：契约先行、错误信封统一、删除的字段不留别名；已并入：Requirements 1–2 与 Out of Scope 的"不写兼容层"。同阶段还调用了 `taskflow:taskflow`（确定 PRD 该记什么、生命周期纪律）与 `agent-skills:plan`（把方向切成垂直步骤），两者的结论分别并入本文档结构与 Step 依赖顺序。
- [Spec] `agent-skills:spec` — 目的：按 objective / commands / structure / style / testing / boundaries 六要素校验 Spec 完整度；结论：缺"命令清单"一节，补上 `--quality` 与 `coverage` 的边界表；已并入：`spec.md` 的 Interfaces 与 D1–D6。
- [Plan] `agent-skills:plan` — 目的：把已定稿设计切成可验收的垂直步骤并排依赖；结论：按"每步结束都能编译且全绿"排序，Step 2 保留 `quality-assess.ts` 让中间态不破；已并入：五个 Step 的顺序与 Checkpoint A/B。
- [Test] Unaided — 目的：确定验证策略；considered: testing strategy；结论：不引入测试框架，沿用既有 vitest，AC4/AC5/AC10 各写一条针对真实数据形状的断言（空 `content` 只有 `excerpt`、抽取落地后计数、无 `origins` 的旧格式），全量门槛为 `tsc --noEmit` = 0 且 `vitest run` 全绿。


## Preconditions

- 工作树 `.worktrees/2026-10-30-quality-facts`，分支 `refactor/2026-10-30-quality-facts`，基线 `9816f2f`。
- 基线绿：`npx tsc --noEmit` = 0；`npx vitest run` = 38 files / 541 tests passed。
- `TF-20261028-fe548a` 已合并（`9816f2f`），`origins[].round` 与 `excerpt` 落位可用。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-30 21:33 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — `sourceKey` 收拢四处来源提取

- Goal: 同一个 URL，全仓库只有一种"它来自哪里"的答案，且本地 `file://` 文档计入来源而不是被丢掉。
- Dependencies: 无（本步起手）。
- Files: `cli/src/deep/dedupe.ts`、`cli/src/deep/coverage.ts`、`cli/src/deep/query-suggest.ts`、`cli/src/runCli.ts`
- Implementation checklist:
  - [x] `dedupe.ts` 新增并导出 `sourceKey(url): string | undefined`；`file:` 返回 `pathname`，其余返回去 `www.` 的小写 hostname，无法解析返回 `undefined`。
  - [x] `coverage.ts` 的 `domainFactsOf` 改用 `sourceKey`；`file:` 结果按其路径计入，不再 `continue` 跳过。
  - [x] `query-suggest.ts` 的私有 `extractDomain` 删除，改调 `sourceKey`。
  - [x] `runCli.ts` 里 `--quality` JSON 分支内联的 `domain` 表达式改调 `sourceKey`。
  - [x] `quality-assess.ts:58` 的 `extractDomain` **本步不动**（该文件在 Step 3 整个删除）。
  - [x] 新增测试：含两个 `file://` 文档的 session，`coverage.domainsSeen` 报出两条不同路径、计数不为 0。
- Acceptance: AC6 通过；`coverage` 对纯本地 session 不再报 0 来源。
- Verification: `npx vitest run test/unit/deep/coverage.test.ts`；`npx tsc --noEmit`。
- Rollback: `git checkout -- cli/src/deep/dedupe.ts cli/src/deep/coverage.ts cli/src/deep/query-suggest.ts cli/src/runCli.ts`（Step 1 是唯一的独立提交，回退它不影响后续）。
- Actual: `tsc --noEmit` = 0；`vitest run` = 38 files / 542 tests passed（基线 541，新增 1 条本地文档来源测试）。`coverage.test.ts` 原有两条断言 `file:` 结果"没有 host 可报"的行为，与 AC6 相反，已改为断言路径计入来源，并补一条"同一文件的两个 chunk 算一个来源、另一个文件是第二个来源"。
- Status: done

### Step 2 — `pending-facts.ts` 与 `--quality` 重写

- Goal: `--quality` 只输出逐条事实与汇总计数，不再有 `verdict`、`breakdown`、`failedIndicators`。`quality-assess.ts` 本步保留（其它消费者 Step 3 才迁走），因此本步结束时仍然全绿。
- Dependencies: Step 1（`sourceKey`）。
- Files: `cli/src/deep/pending-facts.ts`（新建）、`cli/src/deep/coverage.ts`（导出 `firstRound`）、`cli/src/runCli.ts`
- Implementation checklist:
  - [x] `coverage.ts` 导出 `firstRound`（`pending-facts` 与 `coverage` 都需要"首次出现轮次"这同一个事实，重复实现会分叉）。
  - [x] 新建 `pending-facts.ts`，导出 `PendingFact`、`PendingReport`、`buildPendingReport(results, pending)`，形状见 `spec.md`。
  - [x] `buildPendingReport` 的 `contentLength` 取 `result.content?.length ?? 0`；**不要**用 `content || excerpt`——这是待审批清单，正文与摘要必须分开，混用会让"未抽取"看起来像"已抽取"。`extracted` 与 `verified` 分开：前者是有正文，后者是带齐审批所需元数据，一个结果可以读却不可批。
  - [x] `runCli.ts` 删除 `--threshold-override` 选项与 `INVALID_THRESHOLD_OVERRIDE` 解析块。
  - [x] `runCli.ts` 的 `--quality` 三分支（approve / 无待审批 / JSON 待审批）改用 `buildPendingReport`；信封里 `quality` 改名 `facts`，`details.quality` 改名 `details.facts`。
  - [x] `formatQualityAsMarkdown` 重写为 `formatFactsAsMarkdown`：汇总计数 + 待审批事实表。删掉 `Verdict`、`Threshold`、`Pass` 三列与 `verdictEmoji`。
  - [x] 测试：`content` 为空、只有 `excerpt` 的搜索结果 → `extracted: false`、`contentLength: 0`（AC4）。
  - [x] 测试：抽取落地后重跑，`extracted` 计数 +1，该结果 `round` 不变（AC5）。
  - [x] 测试：无 `origins` 的旧格式 session → `round` 键省略，不抛错（AC10）。
  - [x] 测试：`--quality` JSON 输出不含 `verdict` / `breakdown` / `failedIndicators`（AC3）。
- Acceptance: AC3、AC4、AC5、AC10（`--quality` 部分）通过。
- Verification: `npx vitest run test/unit/deep/pending-facts.test.ts test/unit/cli.test.ts`；`npx tsc --noEmit`；`npx vitest run`（全量仍绿）。
- Rollback: 恢复 `runCli.ts` 的 `--quality` 分支与本步新增的两个文件即可；`quality-assess.ts` 未被删，`suggest-queries` / `recovery-analysis` / `session-report` 仍走旧路径。
- Actual: `tsc --noEmit` = 0；全量 39 files / 552 tests passed。新增 `pending-facts.test.ts` 11 条。实跑两个真实 session 核对：
  - `cli/.digdig/sessions/t1`（当前格式）→ `{total:10, extracted:0, unextracted:10, sources:7}`。旧 `contentDepth` 在这个 session 上会因为"一条都没抽取"而报 0，实际它是 10 条都只有 snippet——正是新口径要说清的事。
  - `test/research-bench/.sxng/sessions/ds_1784824003062_hg8fxd`（无 `origins`，6 轮 31 条）→ `{total:31, extracted:31, unextracted:0, sources:29}`，`pending: []`，无异常；`dg coverage` 同一 session 的 `byRound` 为空但 `rounds: 6`，如实反映"有轮次计数但没有可归轮的记录"。
- Note: 全量首跑曾有一次 `cli.test.ts` 单测失败，随后连续 8 次全绿。失败未重现，未记录到具体断言；`node_modules` 是符号链接到主检出，两棵树共用同一个 `.vite` 缓存，是最可能的来源。若再次出现需单独排查。
- Status: done

### Step 3 — 删除判断层与其余消费者

- Goal: `deep/` 里不再有任何函数回答"好还是不好"。`recovery-analysis` 命令消失，`session-report` 变薄，`quality-assess.ts` 与 `recovery-analysis.ts` 删除。
- Dependencies: Step 2。
- Files: `cli/src/deep/quality-assess.ts`（删）、`cli/src/deep/recovery-analysis.ts`（删）、`cli/src/deep/iteration-data.ts`、`cli/src/deep/query-suggest.ts`、`cli/src/runCli.ts`、`cli/test/calibrate-thresholds.ts`（删）、`cli/test/unit/deep/quality-assess.test.ts`（删）、`cli/test/unit/deep/recovery-analysis.test.ts`（删）
- Implementation checklist:
  - [x] `query-suggest.ts` 删除 `qualityLastRound` 字段、构造参数与返回赋值；`generateQuerySuggestions` 签名减为三参。
  - [x] `iteration-data.ts` 的 `SessionAnalysis` 改为 `{ strategy, suggestions, pending }`；删掉 `quality` / `recovery` 字段与对应调用；`qualityThresholds` 选项删除。
  - [x] `runCli.ts` 删除 `recovery-analysis` 子命令、`formatRecoveryAsMarkdown`、`formatSuggestAsMarkdown` 的 quality 段、`formatSessionReportAsMarkdown` 的 quality 段与 `> Recovery:` 提示。
  - [x] `runCli.ts` 的 `session-report` 改为 strategy + topEntities + 指向 `dg coverage` / `dg --quality` 的提示，不自己算任何质量数字（AC8）。
  - [x] `runCli.ts` 的 `suggest-queries` 命令删除 `assessLatestResultQuality` 调用。
  - [x] `runCli.ts` 的搜索期 `advice` 块（`stats.entities >= 3` 分支）改为只读 `analysis.suggestions` 与 `analysis.strategy`。
  - [x] 删除 `quality-assess.ts`、`recovery-analysis.ts`、`calibrate-thresholds.ts` 及两个已失去被测对象的单测文件。
  - [x] 同步 `test/unit/deep/iteration-data.test.ts`（去掉 `analysis.quality` 断言）、`test/unit/deep/query-suggest.test.ts`、`test/unit/cli.test.ts`（`commandNames` 不含 `recovery-analysis`、`--threshold-override` 不存在）、`test/integration/results-add.test.ts`（两条质量测试改为断言事实而非 verdict）、`test/benchmark/performance.bench.ts`（删 `assessResultQuality` 调用）。
- Acceptance: AC1、AC2、AC7、AC8 通过；全量测试绿。
- Verification: `npx tsc --noEmit`；`npx vitest run`；`grep -rn "verdict\|failedIndicators\|threshold-override" cli/src cli/test`（应只剩 `claims/` 与其测试）。
- Rollback: 判断层是本步唯一删除代码的步骤，`git revert` 本步提交即可把三个文件与两个命令恢复。

- Actual: `tsc --noEmit` = 0；全量 37 files / 519 tests passed。删除 `quality-assess.ts`、`recovery-analysis.ts`、`calibrate-thresholds.ts` 及两个失去被测对象的单测，共 5 个文件。
  - AC1：`grep -rn verdict src/` 只剩 `claims/` 与它自己的命令/测试（证据裁定，与搜索质量无关）。
  - AC2：`grep -rn "threshold-override\|thresholdOverride" src/` 零命中；`src/deep` 下的 `threshold` 只剩 `dedupe.ts` 的 Jaccard 去重与 `co-occurrence.ts` 的共现窗口，两者都是检索参数不是质量阈值。
  - AC7：`dg --help` 不再列 `recovery-analysis`，直接调用报 "too many arguments"。
  - AC8：`session-report` 现在只报 `pending` 计数 + strategy + topEntities，并指向 `dg coverage`，不再自算任何质量数字。
- Deviation: `getSessionAnalysis` 的签名从 `(graph, results, options?)` 改为 `(graph, results, pending, options?)`，待审批列表由调用方读盘传入，避免这个纯分析函数自己做起文件 I/O。
- Follow-up found: 子命令与父命令同名 flag（`-f/--format`）时 commander 把值给父命令，子命令 `opts.format` 为空 —— `session-report`、`suggest-queries`、`strategy-info` 的 `--format md` 都不生效。`coverage` 用 `subcommandFormat(argv, ...)` 绕开了这个问题。这是既有缺陷（`main` 上行为相同），不在本任务范围，记入 Follow-ups。
- Status: done

### Checkpoint A — 代码完成，文档未动

- [x] `npx tsc --noEmit` = 0
- [x] `npx vitest run` 全绿
- [x] `grep -rn "threshold" cli/src/deep` 无质量阈值命中
- [x] `dg --help` 里不再出现 `recovery-analysis` / `--threshold-override`

### Step 4 — 文档与 Agent 操作手册同步

- Goal: LLM 读到的指令与实际命令一致；不会去调用已删除的命令，也不会期待已删除的字段。
- Dependencies: Step 3（命令面已定稿）。
- Files: `CLAUDE.md`（本地、不入库）、`skills/digdig/SKILL.md`、`skills/digdig/references/SOP.md`、`README.md`、`README.zh-CN.md`
- Implementation checklist:
  - [x] `skills/digdig/SKILL.md`：删除 `--threshold-override` 行；`--quality` 描述改为"待审批清单 + 计数事实"；删掉 `recovery-analysis` 命令与其章节；第 229 行"Returns 3 independent diagnostics… Verdict: good/acceptable/poor" 整段替换；第 253 行 `qualityLastRound.failedIndicators` 决策条目删除或改为读 `coverage`。
  - [x] `skills/digdig/references/SOP.md`：Phase 4 的两层质量评估表（三指标 + 阈值表 + verdict 表）整段替换为事实说明；Phase 5 的 `failedIndicators` 决策条目删除；Phase 7 Recovery Analysis 整节删除并重编号后续 Phase。
  - [x] `CLAUDE.md`（本地）：`--quality` 段落改为事实清单；`Session Commands` 表删 `recovery-analysis` 行；验证 `grep -c "verdict"` 归零。**保持 untracked，不 `git add`。**
  - [x] `README.md`：第 45 行特性描述、第 899 行命令表、第 946 行 `--threshold-override`、第 1202 行 "Quality note" 段落。
  - [x] `README.zh-CN.md`：同步对应位置。
- Acceptance: `grep -rn "recovery-analysis\|threshold-override\|failedIndicators\|good / acceptable / poor"` 在 `skills/` 与两份 README 上除历史 changelog 外无命中；`CLAUDE.md` 仍为 untracked。
- Verification: `git status --porcelain`（`CLAUDE.md` 必须显示 `??`）；`grep -rn` 逐项核对。
- Rollback: 文档是纯文本改动，逐文件 `git checkout --` 即可；`CLAUDE.md` 不在版本控制内，改前先备份到 `/tmp`。

- Actual: `tsc --noEmit` = 0；全量 37 files / 519 tests passed。
  - 扫描过程中发现计划里漏列了三个文件：`cli/README.md`、`skills/digdig/references/pipeline.md`、`skills/digdig/references/appendix.md`，均有 `recovery-analysis` / `--threshold-override` / 三指标表述，已一并更新。
  - `CLAUDE.md` 改前备份到 `/tmp/digdig-claude-md-backup/CLAUDE.md.1793368519`；改后 `git status --porcelain CLAUDE.md` 仍为 `??`。
  - 全仓库（排除 `TaskFlowDocs/`）`grep -rn "recovery-analysis|threshold-override|failedIndicators|contentDepth|sourceDiversity|novelty"` 只剩 `SOP.md` 两处：一处是新写的"没有 recovery-analysis 命令"说明，一处是解释旧指标为何被移除。均为刻意保留。
- Status: done

### Step 5 — 全量验收与 AC 逐条核对

- Goal: PRD 的十条验收标准逐条有证据，不是口头声称。
- Dependencies: Step 4。
- Files: 无改动（只读核对）。
- Implementation checklist:
  - [x] AC1–AC10 逐条执行并记录实际命令与实际输出。
  - [x] AC9：`npx tsc --noEmit` 与 `npx vitest run` 的完整结果贴进 Verification。
  - [x] AC10：用 `test/research-bench/.sxng/sessions/ds_1784824003062_hg8fxd`（无 `origins`，6 轮，31 条）实跑 `dg coverage` 与 `dg --quality`。
  - [x] AC3：用 `cli/.digdig/sessions/t1`（当前格式）实跑，核对输出字段。
  - [x] 确认 `CLAUDE.md` 未进 git、`TaskFlowDocs/repository-docs/personal.md` 未被改动。
  - [x] 检查差分范围：只有 PRD 的 In Scope 列表内的文件被改。
- Acceptance: 十条 AC 全部带回实际输出；无越界改动。
- Verification: 结果写入本文件 `## Verification / Review`。
- Rollback: 无（只读）。

## Verification / Review`。
- Rollback: 无（只读）。

### Checkpoint B — 可交付

- [x] 十条 AC 全绿且有实测输出
- [x] 工作树干净，`CLAUDE.md` 仍 untracked
- [x] `TF-20261028-12ced8` 的范围变化已记入本文件 Follow-ups（不改它的 todo 条目，那是它的写入者的事）

## Checkpoints

- **Checkpoint A**（Step 3 后）：代码面完成，编译与全量测试绿。此处适合停下来看一次 `--quality` 与 `coverage` 的实际输出，确认事实清单读起来是有用的。
- **Checkpoint B**（Step 5 后）：可交付。

## Verification / Review

### AC1 — `deep/` 里没有质量三档

```
$ grep -rn "'good'|"good"|'acceptable'|'poor'" src/deep/
（无输出）
```

全仓库的 `verdict` 只剩 `src/claims/`、`src/commands/verdict.ts`、`src/commands/review.ts`、`src/commands/evidence.ts` —— 证据裁定，与搜索质量无关。`src/deep/pending-facts.ts` 的头注释提到 "verdict" 是在解释被替换掉的东西。

### AC2 — 质量阈值清零

```
$ grep -rn "DEFAULT_THRESHOLDS|QualityThresholds|NOVELTY_SIMILARITY" src/
（无输出）
$ grep -rn "threshold-override|thresholdOverride" src/
（无输出）
```

`src/deep` 下剩余的 `threshold` 全部是检索参数：`dedupe.ts` 的 Jaccard 去重阈值、`co-occurrence.ts` 的共现窗口、`coverage.ts` 注释里引用的测量值。

### AC3 — `--quality` 只报事实

```
$ node dist/index.js --session cli/.digdig/sessions/t1 --quality --format json
keys: ['extracted', 'pending', 'sourceList', 'sources', 'total', 'unextracted']
no judgement fields: OK      # verdict/breakdown/failedIndicators/contentDepth/sourceDiversity/novelty 均不存在
```

逐条字段（`test/unit/deep/pending-facts.test.ts` 断言 `Object.keys(report).sort()`）：`id`, `revision`, `title`, `url`, `source`, `domain`, `contentLength`, `extracted`, `verified`, `round`。

### AC4 — 只有 `excerpt` 的搜索结果不算有正文

`pending-facts.test.ts` → `reports a search result as unextracted rather than counting its snippet as a body`：`content: ''` + `excerpt: '...'` → `contentLength: 0`, `extracted: false`。通过。

对照真实数据：`cli/.digdig/sessions/t1` 的 10 条结果全部只有 snippet，报告 `extracted: 0`。旧 `contentDepth` 在这个 session 上给出的也是 0 分，但理由是"没有已抽取项"——它分不清"没抽"和"抽了但很短"。

### AC5 — 抽取落地后计数 +1，轮次不变

`results-add.test.ts` → `records a landed extraction against the round that found the result`：`after.extracted === before.extracted + 1`，`after.total === before.total`，该结果的 `round` 前后相同，且 `content` 确实含新正文。通过。

### AC6 — 本地文档计入来源

`coverage.test.ts` → `counts each local document as its own source`：`file:///docs/a.md#chunk-0` + `#chunk-1` → `/docs/a.md` 计 2；`file:///docs/b.md#chunk-0` → `/docs/b.md` 计 1。`domainsSeen` 不再是 0。通过。

### AC7 — `recovery-analysis` 命令消失

```
$ node dist/index.js --help | grep -c recovery-analysis
0
$ node dist/index.js recovery-analysis x
error: too many arguments. Expected 1 argument but got 2: recovery-analysis, x.
```

`cli.test.ts` 断言 `commandNames` 不含它。

### AC8 — `coverage` 与 `--quality` 无重复字段

```
$ coverage → keys: ['byRound','distinctiveTerms','domainsSeen','repeated','rounds','uniqueResults','untouchedSpecialized']
$ --quality → keys: ['extracted','pending','sourceList','sources','total','unextracted']
```

`coverage` 无 `pending`；`--quality` 无 `byRound`/`repeated`/`distinctiveTerms`。

### AC9 — 编译与全量测试

```
$ npx tsc --noEmit
tsc=0
$ npx vitest run
Test Files  37 passed (37)
     Tests  519 passed (519)
```

基线是 38 files / 541 tests（`9816f2f`）。差值来自删除 5 个失去被测对象的文件（`quality-assess.test.ts`、`recovery-analysis.test.ts`、`calibrate-thresholds.ts` 及两个 bench 用例）与新增 `pending-facts.test.ts` 11 条。

### AC10 — 旧格式 session 不抛错

无 `origins` 的 `test/research-bench/.sxng/sessions/ds_1784824003062_hg8fxd`（6 轮 31 条）：

```
$ dg coverage <...> --format md      → exit 0，rounds: 6，byRound 为空（没有可归轮的记录）
$ dg --quality <...> --format json    → exit 0，{total:31, extracted:31, sources:29}
```

`byRound` 为空是诚实的：那批数据没有轮次归属，不是 0 轮。

### 既有缺陷（不在本任务范围）

`session-report` / `suggest-queries` / `strategy-info` 的 `--format md` 不生效，输出仍是 JSON。根因是 commander 在父子命令同名 flag 时把值给了父命令，子命令 `opts.format` 为 `undefined`。`main` 上行为相同，`coverage` 用 `subcommandFormat(argv, ...)` 绕开。已记入 Follow-ups。

## Change Log

- 2026-10-30 — 创建 Plan（v1），依据 PRD 与 Spec 切分五个垂直步骤。
- 2026-10-30 — Step 2 记录实际的 `extracted`/`verified` 分离（原计划写的是两者同取 `hasVerifiedContent`，实现时发现这两个是不同的事实）。
- 2026-10-30 — Step 3 记录 `getSessionAnalysis` 签名变更（待审批列表由调用方传入，分析函数不读盘）。
- 2026-10-30 — Step 4 补上计划漏列的三个文档：`cli/README.md`、`references/pipeline.md`、`references/appendix.md`。

## Follow-ups

- **`TF-20261028-12ced8`（阈值集中化）范围变化**：它要收拢的 14 个阈值中，`quality-assess.ts` 的 4 个（`contentDepth 150`、`sourceDiversity 3`、`novelty 0.3`、`NOVELTY_SIMILARITY 0.75`）已随本任务的判断层一并删除。剩余 10 个仍在。该条目的 todo 记录由它自己的写入者更新，本任务不改。

- **子命令 `--format md` 不生效**（`session-report`、`suggest-queries`、`strategy-info`）：commander 父子同名 flag 时子命令 `opts.format` 为 `undefined`。`coverage` 已用 `subcommandFormat(argv, ...)` 绕开，其余三个尚未。既有缺陷，`main` 上行为相同。
- `TF-20261028-12ced8`（阈值集中化）：本任务删除质量层后，它要收拢的 14 个阈值只剩 10 个。完成本任务后在其 todo 条目上记录范围变化——但**不由本任务改那条记录**，它有自己的写入者。
- `TF-20261017-bfc96d`（仓库规则/CODE_STYLE/CONTRIBUTING/CI）：本任务按 `git log` 反推的提交格式执行，不创建这些文档。

## Version History

- v1 — planning.
