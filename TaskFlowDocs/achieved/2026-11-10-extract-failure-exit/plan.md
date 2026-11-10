# Plan — P10 — extract 全部失败仍 exit 0
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md`

## Reference Pointers

`cli/src/commands/extract.ts`、`cli/src/protocol.ts`、`cli/src/deep/session.ts`、`cli/test/unit/commands/extract.test.ts`、`CONTRIBUTING.md`、`CODE_STYLE.md`。

## Related Tasks

C9 和 P6 分别在独立工作区处理；本任务不调整已合并的 D7 失败预算。

## Skills / Tools Used

- [PRD] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: root cause investigation
- [Spec] Unaided — 未调用专门设计技能；considered: architecture and design
- [Plan] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: work breakdown
- [Test] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: testing strategy
- 实际读取并采用 `agent-skills:debugging-and-error-recovery`、`agent-skills:planning-and-task-breakdown`、`agent-skills:test-driven-development`：定位结果分支，规划批量边界并先写复现测试。阶段声明不代表没有读取这些技能。

## Preconditions

用户明确选择部分成功返回成功且报告失败；工作区已从当前 main 创建。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖全失败、全成功、混合普通失败、混合及全部限流和 session 写入；Step 2 覆盖类型与全量回归。
- Verifiability: 调用命令并断言实际退出值、envelope 及落盘内容，不能只 mock 输出。
- Layer ownership: 在批量结果判定层修正状态；测试期望仅在用户确认的混合限流行为改变时调整。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 15:43 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — Implement and verify

- Goal: 修复抽取批次状态且保留所有结果和限流信息。
- Dependencies: 无。
- Files: `cli/src/commands/extract.ts`、`cli/test/unit/commands/extract.test.ts`、必要文档。
- Implementation checklist:
- [x] 先复现全失败和部分限流的现有行为。
- [x] 实现全失败错误和部分成功结果，保留失败诊断。
- [x] 验证全成功、全部限流、空响应、会话结果和原有计数。
- Acceptance: PRD 中各批次的退出码、数据和 session 状态符合契约。
- Verification: `vitest run test/unit/commands/extract.test.ts` 及命令集成测试。
- Rollback: 独立工作区代码和测试差异。
- Status: done

### Step 2 — 验证和交付

- Goal: 全量测试、类型检查与审查，准备独立 PR。
- Dependencies: Step 1。
- Files: 任务记录及 PR 模板。
- Implementation checklist:
- [x] 运行 `npm.cmd test -- --maxWorkers=2` 和 `tsc --noEmit`，审查差异。
- Acceptance: 相关测试通过，未通过项明确归因。
- Verification: 记录实际命令及输出。
- Rollback: 保留原始 main 和独立分支。
- Status: done

## Checkpoints

## Verification / Review

- 2026-11-10 Step 2: 8 targeted; 657 full; typecheck passed

- 2026-11-10 Step 1: 8 targeted; 657 full; typecheck passed

- 隔离用户配置运行 `npm.cmd test -- --maxWorkers=2`：55 文件、657 测试通过；`npx.cmd tsc --noEmit`：通过。
- 补充会话持久化断言后，`npx.cmd vitest run test/unit/commands/extract.test.ts`：8 测试通过。
- 审查覆盖空响应、混合限流及全部失败的输出与会话更新。

## Change Log

## Follow-ups

## Version History

- v1 — planning.
