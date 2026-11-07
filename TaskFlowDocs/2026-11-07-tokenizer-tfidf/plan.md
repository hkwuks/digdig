# Plan — tokenize() 把含 CJK 的混合 token 整体当 CJK 分支处理，ASCII 部分被切成碎片且原词丢失
> Task version: v1
> Status: planning

No spec required — small, self-contained task.

## Reference Pointers

- `cli/src/deep/tfidf.ts` — 缺陷所在，`tokenize()` 与 `computeTfIdf()`
- `cli/src/deep/coverage.ts:198-239` — `distinctiveTermsOf`，复用 `tokenize()`
- `cli/src/deep/co-occurrence.ts` — `buildCoOccurrence` / `computeCrossResultFrequency`，复用 `tokenize()`
- `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/spec.md:214` — `distinctiveTerms` 的判据，本任务不改变它
- `TaskFlowDocs/achieved/2026-10-30-quality-facts/prd.md:16-22` — 「CLI 不做需要语义判断的事」，移除 `tfidfTerms` 的依据

## Related Tasks

- `TF-20261028-fe548a`（已完成）— 建立 `dg coverage` 与 `distinctiveTerms`，其判据依赖本任务修好的 tokenizer
- `TF-20261107-b09652`（inbox）— 原计划改 `tfidf.ts` 排序。本任务移除 `computeTfIdf` 后该条目的处理对象消失，完成后需改为 cancelled 并注明

## Skills / Tools Used

- [PRD] Unaided — 缺陷与影响面由源码 grep、真实会话数据统计与一次真实 `buildCoverage` 运行确定；considered: requirements elicitation and framing
- [Plan] Unaided — 四步定点修改，Step 1 与 Step 3 有明确先后依赖（先验证修复后该字段仍不可用，再删）；considered: work breakdown and task decomposition
- [Test] Unaided — 沿用仓库既有 vitest 结构，回归用例直接断言真实混合 token 的切分结果；considered: testing strategy

## Preconditions

- 工作树 `.worktrees/2026-11-07-tokenizer-tfidf`，分支 `fix/2026-11-07-tokenizer-tfidf`
- `cli/node_modules` 已从主检出符号链接（本环境 `npm` 不可用）

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-07 22:54 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 修 tokenize() 并补回归测试

- Goal: 混合 token 按 ASCII/CJK 分段处理，ASCII 原词不再丢失
- Dependencies: 无
- Files: `cli/src/deep/tfidf.ts`、`cli/test/unit/deep/tfidf.test.ts`
- Implementation checklist:
  - [ ] 先写失败测试：`tokenize('github中文社区')` 含 `github`、`中文`、`社区`，不含 `gi`/`it`/`th`/`hu`/`ub`
  - [ ] 先写失败测试：`tokenize('rust异步运行时')` 含 `rust`、`异步`、`运行`，不含 `ru`/`us`/`st`
  - [ ] 先写失败测试：`tokenize('Tokio async-std')` 仍产出 `tokio`、`asyncstd`（纯 ASCII 行为不变）
  - [ ] 确认三条测试在现有实现下失败（RED）
  - [ ] 把 `CJK_RANGE.test(cleaned)` 的单分支改为按 run 分段：`cleaned.match(/[CJK]+|[^CJK]+/g)`，ASCII 段长度 ≥3 整段保留，CJK 段按 bigram 展开
  - [ ] 确认三条测试通过（GREEN），且原有 9 条 `tokenize` 测试全部通过
- Acceptance: PRD 前三条验收标准
- Verification: `cd cli && npx vitest run test/unit/deep/tfidf.test.ts`
- Rollback: 单文件单函数，`git checkout -- cli/src/deep/tfidf.ts`
- Status: pending

### Step 2 — 用真实数据验证修复效果

- Goal: 确认真实会话上的碎片归零，且 coverage 输出正确
- Dependencies: Step 1
- Files: 无源码改动，只做测量
- Implementation checklist:
  - [ ] `npm run build`
  - [ ] 对 `.digdig/sessions/ds_1784791971087_gb9ood` 统计：纯 ASCII 碎片（长度 ≤2）从 71 降到 0
  - [ ] 用临时 3 轮中文会话跑 `buildCoverage`，确认 `distinctiveTerms` 含 `epoll` 而非 `ep`/`ol`/`ll`/`po`
  - [ ] 记录修复前后 `dg coverage` 的实际输出到 plan 的 Change Log
- Acceptance: PRD 后两条验收标准
- Verification: 上述脚本输出
- Rollback: 不适用（只读测量）
- Status: pending

### Step 3 — 移除 tfidfTerms

- Goal: 删掉无消费者且分数无基准的字段，SOP 改指替代字段
- Dependencies: Step 2（先确认修复后该字段仍不可用，记录为证据）
- Files: `cli/src/deep/tfidf.ts`、`cli/src/deep/graph-preprocess.ts`、`cli/src/runCli.ts`、`cli/test/integration/graph-preprocess.test.ts`、`cli/test/benchmark/performance.bench.ts`、`skills/digdig/references/SOP.md`、`cli/docs/AGENT-USAGE.md`
- Implementation checklist:
  - [ ] 先记录 Step 2 里修好的 tokenizer 之下 `tfidfTerms` 前 12 位的实际输出（`the`、`andrewyngcontexthub` 等），作为移除依据写进 Change Log
  - [ ] 删除 `cli/src/deep/tfidf.ts` 的 `computeTfIdf`、`TfIdfResult`、`TfIdfOutput`，保留 `tokenize`
  - [ ] 删除 `graph-preprocess.ts` 的 `tfidfTerms` 字段（类型与赋值）
  - [ ] 删除 `runCli.ts:176-185` 的表格渲染
  - [ ] 删除 `graph-preprocess.test.ts` 里三条 `tfidfTerms` 断言；确认 `tokenizationStrategy` 字段的去留
  - [ ] 更新 `performance.bench.ts` 里对 `computeTfIdf` 的引用
  - [ ] 改 `SOP.md:159`：改用 `resultProvenance[].title` 与 `termFrequencies`
  - [ ] 改 `AGENT-USAGE.md:53,111`
  - [ ] `npx tsc --noEmit` 确认无残留引用
- Acceptance: PRD 的四、五、六条要求
- Verification: `cd cli && npm run build && npx vitest run` 全绿
- Rollback: `git revert` 本步提交
- Status: pending

### Step 4 — 全量验证与文档收尾

- Goal: 全套测试通过，导出物核对
- Dependencies: Step 3
- Files: 无新增
- Implementation checklist:
  - [ ] `cd cli && npm run build && npx vitest run`
  - [ ] `npx tsc --noEmit`
  - [ ] `dg graph-preprocess --format json` 输出确认无 `tfidfTerms` 键
  - [ ] `dg graph-preprocess --format md` 确认不崩（表格已删）
  - [ ] 检查 `README.md` / `README.zh-CN.md` / `SKILL.md` 是否提到 TF-IDF 输出字段
- Acceptance: 全套绿
- Verification: 上述命令
- Rollback: 不适用
- Status: pending

## Checkpoints

- Step 1 结束：RED→GREEN 证据齐全，原有 9 条 tokenize 测试不回归
- Step 2 结束：真实数据指标记录在案（71→0；`epoll` 取代四碎片）
- Step 3 结束：`tsc --noEmit` 无残留引用
- Step 4 结束：全套测试绿

## Verification / Review

## Change Log

## Follow-ups

- `TF-20261107-b09652` 需改为 cancelled：它要修的 `tfSum × idf` 排序随 `computeTfIdf` 一并删除，处理对象不再存在。

## Version History

- v1 — planning.
