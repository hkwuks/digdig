# Plan — C9 — graph-add 畸形输入抛未捕获 TypeError
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md`

## Reference Pointers

`cli/src/commands/graph-add.ts`、`cli/src/commands/json-input.ts`、`cli/src/deep/session.ts`、`cli/test/integration/graph-add.test.ts`、`CONTRIBUTING.md`、`CODE_STYLE.md`。

## Related Tasks

P10、P6 独立处理；C7 的节点冲突检查及 D10 路径生成保持原样。

## Skills / Tools Used

- [PRD] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: root cause investigation
- [Spec] Unaided — 未调用专门设计技能；considered: architecture and design
- [Plan] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: work breakdown
- [Test] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: testing strategy
- 实际读取并采用 `agent-skills:debugging-and-error-recovery`、`agent-skills:planning-and-task-breakdown`、`agent-skills:test-driven-development`，用于追踪信任边界、分解验证和先复现后修复；宿主阶段声明不代表没有读取技能。

## Preconditions

用户确认畸形图数据整批拒绝，输出结构化错误。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖各种畸形形状和磁盘状态、合法输入及来源校验；Step 2 覆盖全量和类型。
- Verifiability: 使用实际 session 输入文件和 graph/meta 回读，验证错误码、退出码与字节状态。
- Layer ownership: 在命令输入边界收窄未知 JSON，保留现有 provenance 校验，不改变测试输入或预期以掩盖逻辑。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 15:43 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — Implement and verify

- Goal: graph-add 结构化拒绝畸形输入且整批不写入。
- Dependencies: 无。
- Files: `cli/src/commands/graph-add.ts`、`cli/test/integration/graph-add.test.ts`。
- Implementation checklist:
- [x] 复现数组类型、null 元素、错误字段和混合批次的问题。
- [x] 输入边界收窄类型并把 session 初始化移到结构校验之后。
- [x] 验证失败不写入元数据或图，合法输入及来源错误仍正确。
- Acceptance: PRD 两项输入校验和原子性要求通过。
- Verification: `vitest run test/integration/graph-add.test.ts`。
- Rollback: 独立工作区的代码和测试差异。
- Status: done

### Step 2 — 验证和交付

- Goal: 全量验证及审查，准备独立 PR。
- Dependencies: Step 1。
- Files: 任务记录及 PR 模板。
- Implementation checklist:
- [x] 运行完整测试、类型检查和差异审查。
- Acceptance: 测试通过或已明确记录基线问题。
- Verification: `npm.cmd test -- --maxWorkers=2`、`tsc --noEmit`。
- Rollback: 保留原始 main 和独立分支。
- Status: done

## Checkpoints

## Verification / Review

- 2026-11-10 Step 2: 20 targeted; 663 full; typecheck passed

- 2026-11-10 Step 1: 20 targeted; 663 full; typecheck passed

- 隔离用户配置运行 `npm.cmd test -- --maxWorkers=2`：55 文件、663 测试通过；`npx.cmd tsc --noEmit`：通过。
- 补充有效来源和畸形项的混合批次后，`npx.cmd vitest run test/integration/graph-add.test.ts`：20 测试通过。
- 审查确认畸形输入在初始化会话之前被拒绝，图和元数据字节不变。

## Change Log

## Follow-ups

## Version History

- v1 — planning.
