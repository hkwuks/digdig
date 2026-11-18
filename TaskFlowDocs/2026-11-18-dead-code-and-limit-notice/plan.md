# Plan — 清理 SimHash 死代码与 deep 桶文件、让 provider 上限降级可见、为 README 命令表加校验
> Task version: v1
> Status: planning

No spec required — small, self-contained task.

## Reference Pointers

- `cli/src/deep/simhash.ts`、`cli/src/deep/index.ts`、`cli/src/deep/session.ts:806`：删除对象。
- `cli/src/ollama-service.ts:32`、`cli/src/deepseek-service.ts:43`、`cli/src/runCli.ts:347-359`、`:386-403`：上限常量与降级事实的所在处。
- `cli/src/runCli.ts:100-155`（`formatAsMarkdown`）、`:700-732`（`displayData` 与格式分支）：输出位置。
- `skills/digdig/SKILL.md`、`README.md`、`README.zh-CN.md`：命令表。
- `cli/test/unit/skill-command-table.test.ts`：待扩展的 guard。
- `CONTRIBUTING.md`（提交格式、PR 五节）、`CODE_STYLE.md`（4 空格、单引号、注释写"为什么"）。

## Related Tasks

- `TF-20261116-48f7e2`：SimHash 死代码与桶文件（本次主体之一）。
- `TF-20261116-f8776d`：`--limit` 与 provider 能力不符；本次只做方向 ①「告知降级」，方向 ②（SearXNG 翻页）留给后续。
- `TF-20261116-fa0414`：命令表漂移；复核后把对象从 CLAUDE.md 改为两个 README。
- `TF-20261116-e1c513`：阈值集中化，复核结论是不做，见 PRD Out of Scope。
- `TF-20261116-273731`：会话锁边界，不在本次。
- `e113695`（quality-facts）：删除无调用者模块的先例。

## Skills / Tools Used

- [PRD] Unaided — considered: requirements elicitation and framing; 复核已有 todo 条目在 0.0.13 上的真实状态。
- [Plan] Unaided — considered: work breakdown; decomposition and verification ordering. 按「删除 / 输出 / 文档」三层拆分，保证每步独立可验证。
- [Test] Unaided — considered: testing strategy. 两侧断言（有降级 / 无降级）与先红后绿的 README guard。

## Preconditions

- 工作树 `.worktrees/2026-11-18-dead-code-and-limit-notice` 基于 `origin/main` 的 `58a560d`（= 0.0.13）。
- 用户已于 2026-11-18 同意按复核结论执行，含 `e1c513` 记为不做、`fa0414` 改写对象为 README。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖 AC1、AC2；Step 2 覆盖 AC3–AC7；Step 3 覆盖 AC8；Step 4 覆盖 AC9。
- Verifiability: 每步都有可执行的检查 —— 删除后 `git grep` 无匹配、降级有桩测试断言字段存在与缺失两侧、README guard 先在补行前看它失败再补行。
- Layer ownership: 上限常量归各 provider 模块（它定义协议边界），输出归 `runCli.ts`；不为了测试通过往 provider 返回体里塞新字段。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-18 23:20 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 删除 SimHash 与 deep 桶文件

- Goal: 移除生产代码中零调用者的模块及随桶文件一起失去出口的兼容函数。
- Dependencies: 无。
- Files: `cli/src/deep/simhash.ts`（删）、`cli/src/deep/index.ts`（删）、`cli/test/unit/deep/simhash.test.ts`（删）、`cli/src/deep/session.ts`（删 `mergeExtractedContent`）。
- Implementation checklist:
  - [x] 删三个文件，删 `mergeExtractedContent` 定义。
  - [x] `git grep -n simhash -- cli` 与 `git grep -n mergeExtractedContent -- cli` 均无匹配。
  - [x] `npx tsc --noEmit` 为 0。
- Acceptance: AC1、AC2。
- Verification: 两条 `git grep` + `npx tsc --noEmit`。
- Rollback: `git revert` 本步提交。
- Status: done

### Step 2 — 让 provider 上限降级可见

- Goal: 当请求的 limit 超过某 provider 的上限时，输出里说明这一项被降到多少。
- Dependencies: 无（与 Step 1 在文件上不重叠，但同属一次输出改动，排在删除之后便于 review）。
- Files: `cli/src/ollama-service.ts`、`cli/src/deepseek-service.ts`（各导出上限常量）、`cli/src/runCli.ts`（路由表引用常量、`searchOneQuery` 收集、`displayData` 与 `formatAsMarkdown` 呈现），新增/扩展 `cli/test/unit/provider-routing.test.ts`。
- Implementation checklist:
  - [x] 每个 provider 模块导出自己的上限常量，服务内部与路由表都读它。
  - [x] `searchOneQuery` 在 `limit > 上限` 时记录 `{ provider, requested, applied }`。
  - [x] JSON：非空时作为 `data.limitNotes` 出现；为空时整个字段不出现。
  - [x] md：非空时渲染一行说明，位置与 `*Unresponsive:*` 同区。
  - [x] 测试两侧：超限时有该字段且数值正确，未超限时字段不存在；多个 provider 同时降级时都列出。
- Acceptance: AC3–AC7。
- Verification: `npx vitest run test/unit/provider-routing.test.ts`；并对构建产物做一次端到端探针。
- Rollback: `git revert` 本步提交。
- Status: done

### Step 3 — README 命令表纳入校验

- Goal: 让已存在的命令表 guard 覆盖两个 README，并补齐它们缺的行。
- Dependencies: 无。
- Files: `cli/test/unit/skill-command-table.test.ts`、`README.md`、`README.zh-CN.md`。
- Implementation checklist:
  - [x] 先扩展测试，对两个 README 断言命令集合；此时应失败并报出缺失项。
  - [x] 补 `graph-pending` 行到两个 README；补 `source-relations` 行到中文 README。
  - [x] `query-graph` 复用现有 `EXEMPT`，不在任何表里补行。
  - [x] 测试转绿。
- Acceptance: AC8。
- Verification: 先红后绿的两次 `npx vitest run test/unit/skill-command-table.test.ts` 输出。
- Rollback: `git revert` 本步提交。
- Status: done

### Step 4 — 全量验证

- Goal: 确认没有回归。
- Dependencies: Step 1–3。
- Files: 无。
- Implementation checklist:
  - [x] `npx tsc --noEmit`。
  - [x] `npm test`。
- Acceptance: AC9。
- Verification: 两条命令的完整输出贴进 PR 的「验证」一节。
- Rollback: 不适用。
- Status: done

## Checkpoints

- Step 1 后确认项目仍能构建：删除模块若被隐式引用，`tsc` 会立刻报错。
- Step 3 必须先看到测试失败，否则无法证明新断言真的在检查。

## Verification / Review

- 2026-11-18 Step 4: tsc=0；815/815

- 2026-11-18 Step 3: 补行前报 3 项缺失，补行后 12/12

- 2026-11-18 Step 2: provider-routing 21/21；反向验证 3 项失败；dist 探针 limitNotes 正确

- 2026-11-18 Step 1: git grep 无匹配；tsc=0

## Change Log

## Follow-ups

- `TF-20261116-f8776d` 方向 ②（SearXNG 用 `pageno` 补足 limit）仍待成本判断。
- `TF-20261116-e1c513` 应在 todo 里改为「复核结论：不做」，并写明理由。
- `CLAUDE.md:146` 的 "SimHash is dead code — nothing calls it" 在 Step 1 后描述的是一个不存在的模块；该文件未跟踪，交由用户决定是否纳入版本控制或自行删除该行。

## Version History

- v1 — planning.
