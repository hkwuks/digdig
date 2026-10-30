# Plan — 质量层退场：CLI 只报可数事实，好坏交给 LLM

> Task version: v1
> Status: in_progress

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
  - [ ] `coverage.ts` 导出 `firstRound`（`pending-facts` 与 `coverage` 都需要"首次出现轮次"这同一个事实，重复实现会分叉）。
  - [ ] 新建 `pending-facts.ts`，导出 `PendingFact`、`PendingReport`、`buildPendingReport(results, pending)`，形状见 `spec.md`。
  - [ ] `buildPendingReport` 的 `contentLength` 取 `result.content?.length ?? 0`，`extracted` 取 `hasVerifiedContent(result)`；**不要**用 `content || excerpt`——这是待审批清单，正文与摘要必须分开，混用会让"未抽取"看起来像"已抽取"。
  - [ ] `runCli.ts` 删除 `--threshold-override` 选项与 `INVALID_THRESHOLD_OVERRIDE` 解析块。
  - [ ] `runCli.ts` 的 `--quality` 三分支（approve / 无待审批 / JSON 待审批）改用 `buildPendingReport`；信封里 `quality` 改名 `facts`，`details.quality` 改名 `details.facts`。
  - [ ] `formatQualityAsMarkdown` 重写为事实表：汇总计数 + 待审批逐条。删掉 `Verdict`、`Threshold`、`Pass` 三列与 `verdictEmoji`。
  - [ ] 测试：`content` 为空、只有 `excerpt` 的搜索结果 → `extracted: false`、`contentLength: 0`（AC4）。
  - [ ] 测试：抽取落地后重跑，`extracted` 计数 +1，该结果 `round` 不变（AC5）。
  - [ ] 测试：无 `origins` 的旧格式 session → `round` 键省略，不抛错（AC10）。
  - [ ] 测试：`--quality` JSON 输出不含 `verdict` / `breakdown` / `failedIndicators`（AC3）。
- Acceptance: AC3、AC4、AC5、AC10（`--quality` 部分）通过。
- Verification: `npx vitest run test/unit/cli-quality.test.ts test/unit/deep/pending-facts.test.ts`；`npx tsc --noEmit`；`npx vitest run`（全量仍绿）。
- Rollback: 恢复 `runCli.ts` 的 `--quality` 分支与本步新增的两个文件即可；`quality-assess.ts` 未被删，`suggest-queries` / `recovery-analysis` / `session-report` 仍走旧路径。

### Step 3 — 删除判断层与其余消费者

- Goal: `deep/` 里不再有任何函数回答"好还是不好"。`recovery-analysis` 命令消失，`session-report` 变薄，`quality-assess.ts` 与 `recovery-analysis.ts` 删除。
- Dependencies: Step 2。
- Files: `cli/src/deep/quality-assess.ts`（删）、`cli/src/deep/recovery-analysis.ts`（删）、`cli/src/deep/iteration-data.ts`、`cli/src/deep/query-suggest.ts`、`cli/src/runCli.ts`、`cli/test/calibrate-thresholds.ts`（删）、`cli/test/unit/deep/quality-assess.test.ts`（删）、`cli/test/unit/deep/recovery-analysis.test.ts`（删）
- Implementation checklist:
  - [ ] `query-suggest.ts` 删除 `qualityLastRound` 字段、构造参数与返回赋值；`generateQuerySuggestions` 签名减为三参。
  - [ ] `iteration-data.ts` 的 `SessionAnalysis` 改为 `{ strategy, suggestions, pending }`；删掉 `quality` / `recovery` 字段与对应调用；`qualityThresholds` 选项删除。
  - [ ] `runCli.ts` 删除 `recovery-analysis` 子命令、`formatRecoveryAsMarkdown`、`formatSuggestAsMarkdown` 的 quality 段、`formatSessionReportAsMarkdown` 的 quality 段与 `> Recovery:` 提示。
  - [ ] `runCli.ts` 的 `session-report` 改为 strategy + topEntities + 指向 `dg coverage` / `dg --quality` 的提示，不自己算任何质量数字（AC8）。
  - [ ] `runCli.ts` 的 `suggest-queries` 命令删除 `assessLatestResultQuality` 调用。
  - [ ] `runCli.ts` 的搜索期 `advice` 块（`stats.entities >= 3` 分支）改为只读 `analysis.suggestions` 与 `analysis.strategy`。
  - [ ] 删除 `quality-assess.ts`、`recovery-analysis.ts`、`calibrate-thresholds.ts` 及两个已失去被测对象的单测文件。
  - [ ] 同步 `test/unit/deep/iteration-data.test.ts`（去掉 `analysis.quality` 断言）、`test/unit/deep/query-suggest.test.ts`、`test/unit/cli.test.ts`（`commandNames` 不含 `recovery-analysis`、`--threshold-override` 不存在）、`test/integration/results-add.test.ts`（两条质量测试改为断言事实而非 verdict）、`test/benchmark/performance.bench.ts`（删 `assessResultQuality` 调用）。
- Acceptance: AC1、AC2、AC7、AC8 通过；全量测试绿。
- Verification: `npx tsc --noEmit`；`npx vitest run`；`grep -rn "verdict\|failedIndicators\|threshold-override" cli/src cli/test`（应只剩 `claims/` 与其测试）。
- Rollback: 判断层是本步唯一删除代码的步骤，`git revert` 本步提交即可把三个文件与两个命令恢复。

### Checkpoint A — 代码完成，文档未动

- [ ] `npx tsc --noEmit` = 0
- [ ] `npx vitest run` 全绿
- [ ] `grep -rn "threshold" cli/src/deep` 无质量阈值命中
- [ ] `dg --help` 里不再出现 `recovery-analysis` / `--threshold-override`

### Step 4 — 文档与 Agent 操作手册同步

- Goal: LLM 读到的指令与实际命令一致；不会去调用已删除的命令，也不会期待已删除的字段。
- Dependencies: Step 3（命令面已定稿）。
- Files: `CLAUDE.md`（本地、不入库）、`skills/digdig/SKILL.md`、`skills/digdig/references/SOP.md`、`README.md`、`README.zh-CN.md`
- Implementation checklist:
  - [ ] `skills/digdig/SKILL.md`：删除 `--threshold-override` 行；`--quality` 描述改为"待审批清单 + 计数事实"；删掉 `recovery-analysis` 命令与其章节；第 229 行"Returns 3 independent diagnostics… Verdict: good/acceptable/poor" 整段替换；第 253 行 `qualityLastRound.failedIndicators` 决策条目删除或改为读 `coverage`。
  - [ ] `skills/digdig/references/SOP.md`：Phase 4 的两层质量评估表（三指标 + 阈值表 + verdict 表）整段替换为事实说明；Phase 5 的 `failedIndicators` 决策条目删除；Phase 7 Recovery Analysis 整节删除并重编号后续 Phase。
  - [ ] `CLAUDE.md`（本地）：`--quality` 段落改为事实清单；`Session Commands` 表删 `recovery-analysis` 行；验证 `grep -c "verdict"` 归零。**保持 untracked，不 `git add`。**
  - [ ] `README.md`：第 45 行特性描述、第 899 行命令表、第 946 行 `--threshold-override`、第 1202 行 "Quality note" 段落。
  - [ ] `README.zh-CN.md`：同步对应位置。
- Acceptance: `grep -rn "recovery-analysis\|threshold-override\|failedIndicators\|good / acceptable / poor"` 在 `skills/` 与两份 README 上除历史 changelog 外无命中；`CLAUDE.md` 仍为 untracked。
- Verification: `git status --porcelain`（`CLAUDE.md` 必须显示 `??`）；`grep -rn` 逐项核对。
- Rollback: 文档是纯文本改动，逐文件 `git checkout --` 即可；`CLAUDE.md` 不在版本控制内，改前先备份到 `/tmp`。

### Step 5 — 全量验收与 AC 逐条核对

- Goal: PRD 的十条验收标准逐条有证据，不是口头声称。
- Dependencies: Step 4。
- Files: 无改动（只读核对）。
- Implementation checklist:
  - [ ] AC1–AC10 逐条执行并记录实际命令与实际输出。
  - [ ] AC9：`npx tsc --noEmit` 与 `npx vitest run` 的完整结果贴进 Verification。
  - [ ] AC10：用 `test/research-bench/.sxng/sessions/ds_1784824003062_hg8fxd`（无 `origins`，6 轮，31 条）实跑 `dg coverage` 与 `dg --quality`。
  - [ ] AC3：用 `cli/.digdig/sessions/t1`（当前格式）实跑，核对输出字段。
  - [ ] 确认 `CLAUDE.md` 未进 git、`TaskFlowDocs/repository-docs/personal.md` 未被改动。
  - [ ] 检查差分范围：只有 PRD 的 In Scope 列表内的文件被改。
- Acceptance: 十条 AC 全部带回实际输出；无越界改动。
- Verification: 结果写入本文件 `## Verification / Review`。
- Rollback: 无（只读）。

### Checkpoint B — 可交付

- [ ] 十条 AC 全绿且有实测输出
- [ ] 工作树干净，`CLAUDE.md` 仍 untracked
- [ ] `TF-20261028-12ced8` 的范围变化已记入本文件 Follow-ups（不改它的 todo 条目，那是它的写入者的事）

## Checkpoints

- **Checkpoint A**（Step 3 后）：代码面完成，编译与全量测试绿。此处适合停下来看一次 `--quality` 与 `coverage` 的实际输出，确认事实清单读起来是有用的。
- **Checkpoint B**（Step 5 后）：可交付。

## Verification / Review

_每个 Step 完成后在此追加实际命令与实际结果。_

## Change Log

- 2026-10-30 — 创建 Plan（v1），依据 PRD 与 Spec 切分五个垂直步骤。

## Follow-ups

- `TF-20261028-12ced8`（阈值集中化）：本任务删除质量层后，它要收拢的 14 个阈值只剩 10 个。完成本任务后在其 todo 条目上记录范围变化——但**不由本任务改那条记录**，它有自己的写入者。
- `TF-20261017-bfc96d`（仓库规则/CODE_STYLE/CONTRIBUTING/CI）：本任务按 `git log` 反推的提交格式执行，不创建这些文档。

## Version History

- v1 — planning.
