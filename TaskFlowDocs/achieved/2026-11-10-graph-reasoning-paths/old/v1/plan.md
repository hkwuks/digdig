# Plan — D10 — path 节点无生产路径，graph-traverse 恒失败
> Task version: v1
> Status: planning

## Spec Pointers

- `spec.md`

## Reference Pointers

`cli/src/deep/path-extraction.ts`、`cli/src/deep/graph-explore.ts`、`cli/src/deep/session.ts`、`cli/src/commands/graph-add.ts`、`cli/src/commands/graph-traverse.ts`、`cli/test/integration/sampling-path-extraction.test.ts`、仓库 `CONTRIBUTING.md` 和 `CODE_STYLE.md`。

## Related Tasks

C6、P7 为独立工作区任务。

## Skills / Tools Used

- [PRD] Unaided — Codex 阶段证据以 `task unaided` 声明；considered: root cause investigation
- [Spec] Unaided — 未调用专门设计能力；considered: architecture and design
- [Plan] Unaided — 未调用专门计划能力；considered: work breakdown
- [Test] Unaided — 未调用专门测试能力；considered: testing strategy
- 实际根因调查使用 `agent-skills:debugging-and-error-recovery`，读取路径提取、图写入、遍历和失效清理；Codex 当前不自动捕获该技能读取。

## Preconditions

用户确认 graph-add 生成并持久化路径，失效实体返回结构化错误。

## Plan Review

- Verdict: sound
- Coverage: Step 1 检验生产路径、幂等和异常；Step 2 验证全量行为与规模风险。
- Verifiability: 集成测试使用 graph-add 的真实输入、存储和 graph-traverse，而非直接调用提取器冒充生产调用。
- Layer ownership: 路径产生由 graph-add 的锁内写入负责，异常检查属于图遍历；不修改输入夹具掩盖错误。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 11:04 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — Implement and verify

- Goal: 接通 graph-add → 持久化路径 → graph-traverse，并处理失效引用。
- Dependencies: 无。
- Files: `cli/src/commands/graph-add.ts`、`cli/src/deep/path-extraction.ts`、`cli/src/deep/graph-explore.ts`、`cli/src/commands/graph-traverse.ts` 及相关测试。
- Implementation checklist:
  - [ ] 构建生产调用的失败测试、重复提交测试和失效实体测试。
  - [ ] 接入锁内路径生成与重复路径处理。
  - [ ] 对无效引用返回结构化错误，并核查来源清理。
  - [ ] 运行相关定向测试。
- Acceptance: 三类真实调用场景符合 PRD，原始图操作保持有效。
- Verification: 运行 graph-add、graph-traverse、path-extraction 对应的集成及单元测试。
- Rollback: 独立工作区代码和测试差异。
- Status: pending

### Step 2 — 完整验证与审查

- Goal: 验证回归及生成路径的实际成本。
- Dependencies: Step 1。
- Files: 任务记录和 PR 描述。
- Implementation checklist:
  - [ ] 运行完整测试和类型检查，检查规模风险和差异。
- Acceptance: 现有测试通过且无重复路径或明显无界退化。
- Verification: `npm.cmd test`、`tsc --noEmit`、现有图性能基准及必要的小规模重复调用检查。
- Rollback: 保留独立工作区和原始提交。
- Status: pending

## Checkpoints

## Verification / Review

## Change Log

## Follow-ups

## Version History

- v1 — planning.
