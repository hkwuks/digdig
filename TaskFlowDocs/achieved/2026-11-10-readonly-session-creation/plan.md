# Plan — P7 — 只读命令对不存在的会话名创建目录
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md`

## Reference Pointers

`cli/src/runCli.ts`、`cli/src/deep/session.ts`、`cli/src/commands/coverage.ts`、`cli/test/integration/cli-format.test.ts`、`CONTRIBUTING.md`、`CODE_STYLE.md`。

## Related Tasks

C6、D10 为独立工作区任务。

## Skills / Tools Used

- [PRD] Unaided — Codex 阶段证据以 `task unaided` 声明；considered: root cause investigation
- [Spec] Unaided — 未调用专门设计能力；considered: architecture and design
- [Plan] Unaided — 未调用专门计划能力；considered: work breakdown
- [Test] Unaided — 未调用专门测试能力；considered: testing strategy
- 实际根因调查使用 `agent-skills:debugging-and-error-recovery`，追踪锁、会话解析及 coverage 入口；Codex 当前不自动捕获该技能读取。

## Preconditions

用户要求修复 P7；Todo 已明确对齐 coverage 的 EMPTY_SESSION 行为。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖四条命令的空、缺失及正常会话；Step 2 覆盖整体回归。
- Verifiability: 真实 CLI 调用检查错误、退出码和文件系统副作用，不仅断言 mock。
- Layer ownership: 在只读命令边界检测空会话，不更改共享锁以掩盖副作用。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 11:04 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — Implement and verify

- Goal: 四条命令空会话报错且不创建会话目录。
- Dependencies: 无。
- Files: `cli/src/runCli.ts` 和相关 CLI 集成测试；必要时复用 coverage 现有接口。
- Implementation checklist:
  - [x] 对四条命令复现缺失会话副作用和空会话错误。
  - [x] 在读取图之前检查空会话，区分 --quality 的读取与写入选项。
  - [x] 验证正常会话、会话列表和已有写入操作不受影响。
- Acceptance: PRD 中错误、退出码、无创建和兼容场景全部通过。
- Verification: 定向运行 CLI 集成测试及 coverage、session 测试。
- Rollback: 独立工作区代码和测试差异。
- Status: done

### Step 2 — 完整验证与审查

- Goal: 验证全量回归并准备 PR。
- Dependencies: Step 1。
- Files: 任务记录与 PR 描述。
- Implementation checklist:
  - [x] 运行完整测试、类型检查及差异检查。
- Acceptance: 全量通过或记录可复现基线失败。
- Verification: `npm.cmd test`、`tsc --noEmit`。
- Rollback: 保留独立工作区和原始提交。
- Status: done

## Checkpoints

## Verification / Review

- 2026-11-10 Step 2: 645 项全量测试通过

- 2026-11-10 Step 1: 645 项全量测试通过

- `vitest run test/integration/readonly-session.test.ts test/integration/cli-format.test.ts test/unit/cli.test.ts --maxWorkers=2`：43 项通过。
- `npm.cmd test -- --maxWorkers=2`：55 文件、645 项通过；`tsc --noEmit` 通过。后续仅修改通用错误提示，并重新运行 13 项定向测试。
- 缺失会话验证没有创建目录，session-list 前后不变；已有空会话验证没有创建 graph.json；正常会话和现有批准测试通过。格式测试夹具加入一条结果以符合新的空会话契约。

## Change Log

## Follow-ups

## Version History

- v1 — planning.
