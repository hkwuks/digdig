# Plan — C6 — 跳过最后来源使 claim 永久卡在 verifying
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md`

## Reference Pointers

`cli/src/deep/session.ts`、`cli/src/commands/evidence.ts`、`cli/src/commands/review.ts`、`cli/src/claims/types.ts`、`cli/test/integration/session.test.ts`；仓库规则为 `CONTRIBUTING.md`、`CODE_STYLE.md`。

## Related Tasks

C6 独立修复；与 D10、P7 分别在各自工作区交付。

## Skills / Tools Used

- [PRD] Unaided — Codex 阶段证据通过 `task unaided` 声明；considered: root cause investigation
- [Spec] Unaided — 未调用专门设计能力；considered: architecture and design
- [Plan] Unaided — 未调用专门计划能力；considered: work breakdown
- [Test] Unaided — 未调用专门测试能力；considered: testing strategy
- 实际根因调查使用 `agent-skills:debugging-and-error-recovery`，读取调用路径并拟定红绿验证；Codex 当前不自动捕获该技能读取，以上是宿主阶段记录而非技能使用清单。

## Preconditions

用户确认失效最后证据后回到 pending，保留失效证据；工作区从合并三个前序 PR 后的 main 创建。

## Plan Review

- Verdict: sound
- Coverage: Step 1 复现并覆盖两种失效路径、多个来源及恢复；Step 2 完整验证与审查。
- Verifiability: 使用真实 session、claims store 与命令回读状态、审计证据和 review。
- Layer ownership: 调整失效修复责任层，不通过更改输出或夹具掩盖错误；原有 verifying 断言如无有效证据须依据新契约修改。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 11:04 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — Implement and verify

- Goal: 根据剩余有效证据正确修复状态，并保证后续 review 不被旧失效记录反复撤销。
- Dependencies: 无。
- Files: `cli/src/deep/session.ts`、必要时 `cli/src/commands/evidence.ts`、相关集成测试。
- Implementation checklist:
  - [x] 复现跳过唯一来源、部分来源失效、失效后重新验证和重复修复。
  - [x] 实现状态和 review 修复并保留历史记录。
  - [x] 运行相关集成测试及锁和损坏状态回归。
- Acceptance: PRD 中的三个状态和持久化要求全部通过。
- Verification: `vitest run test/integration/session.test.ts test/claims.test.ts`，按受影响文件补充定向测试。
- Rollback: 独立工作区的代码和测试差异。
- Status: done

### Step 2 — 完整验证与审查

- Goal: 验证全量兼容并准备独立 PR。
- Dependencies: Step 1。
- Files: 任务记录及 PR 描述。
- Implementation checklist:
  - [x] 执行全量测试、类型检查并审查差异。
- Acceptance: 测试通过或明确记录可复现的基线失败。
- Verification: `npm.cmd test`、`tsc --noEmit`。
- Rollback: 保留独立工作区和原始提交。
- Status: done

## Checkpoints

## Verification / Review

- 2026-11-10 Step 2: 635 项全量测试通过

- 2026-11-10 Step 1: 635 项全量测试通过

- `vitest run test/integration/session.test.ts test/claims.test.ts --maxWorkers=2`：87 项通过。
- `npm.cmd test -- --maxWorkers=2`：54 文件、635 项通过；`tsc --noEmit` 通过。
- 默认并发首次运行时 Vitest worker 异常退出；限制并发后全量通过。历史正文变更测试的状态断言由 verifying 改为 pending，依据已确认的无有效证据契约。
- 修复写入顺序先清理旧 review、写 claim，再写失效证据；防止中途失败后证据先持久化而旧 review 遗留。

## Change Log

## Follow-ups

## Version History

- v1 — planning.
