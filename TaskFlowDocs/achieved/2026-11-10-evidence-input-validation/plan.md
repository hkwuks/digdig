# Plan — C13 — 若干 CLI 参数未校验就原样存储
> Task version: v1
> Status: completed

No spec required — small, self-contained task.

## Reference Pointers

`cli/src/commands/evidence.ts`、`results-add.ts`、`json-input.ts`、`cli/src/runCli.ts`、`cli/test/claims.test.ts`、`cli/test/integration/results-add.test.ts`；`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`。

## Related Tasks

C12 涉及其他入口的初始化顺序；本任务仅处理 C13 涉及的两个入口。C11 和 D11 图写入待会话存储研究。

## Skills / Tools Used

- [PRD] Unaided — 直接检查调用链；considered: root cause investigation。
- [Plan] Unaided — Codex 未自动捕获技能记录；considered: work breakdown。实际读取 `agent-skills:planning-and-task-breakdown` 并用于安排边界与验证。
- [Test] Unaided — considered: testing strategy；定向测试覆盖真实 CLI 路径和持久化结果。

## Preconditions

用户确认非法输入不写入，confidence 范围 0–1。

## Plan Review

- Verdict: sound
- Coverage: 四类无效输入、数字边界、有效输入及会话状态。
- Verifiability: 在真实会话下检查 stdout、退出码和文件变化。
- Layer ownership: 命令边界校验类型与值；CLI 保留原始 confidence 字符串以拒绝数值前缀加垃圾字符。

## Approval

- Status: approved
- Approved by: --user-approved
- Approved at: 2026-11-10 16:28 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — Implement and verify

- Goal: 修复输入校验并验证无效输入不修改会话。
- Dependencies: 用户批准本计划。
- Files: `cli/src/commands/evidence.ts`、`results-add.ts`、`cli/src/runCli.ts` 及相关测试。
- Implementation checklist:
  - [x] 先加入能暴露当前错误的测试。
  - [x] 实现四项边界校验并调整初始化时机。
  - [x] 运行定向测试、全量测试和类型检查，审查差异。
- Acceptance: PRD 的两个验收条件全部满足。
- Verification: Vitest 定向测试、`npm.cmd test -- --maxWorkers=2`、`npx.cmd tsc --noEmit`。
- Rollback: 独立工作树中的代码及文档变更。
- Status: done

## Checkpoints

## Verification / Review

- 2026-11-10 Step 1: 11 targeted; 685 full; typecheck passed

- 修复前新增的 8 项 CLI 用例均失败，非法 kind 实际被导入，其他无效项未在边界拦截。
- `npx.cmd vitest run test/integration/input-validation.test.ts`：11 项通过，包括 0、1 及直接调用。
- `npm.cmd test -- --maxWorkers=2`（隔离用户配置）：57 文件、685 项通过；`npx.cmd tsc --noEmit`：通过。
- 审查：命令层负责运行时校验；CLI 原样接收 confidence 后完整转换，不修改既有 fixture 或断言。

## Change Log

## Follow-ups

## Version History

- v1 — planning.
