# Plan — 修复 Windows 测试读取真实配置和 README 换行导致的四项失败
> Task version: v1
> Status: completed

No spec required — small, self-contained task.

## Reference Pointers

`cli/test/unit/config-timeout.test.ts`、`cli/test/unit/provider-routing.test.ts`、`cli/src/legacy.ts`、`CONTRIBUTING.md`、`CODE_STYLE.md`。

## Related Tasks

## Skills / Tools Used

- [PRD] Unaided — Codex 不自动记录能力调用；considered: root cause investigation
- [Plan] Unaided — 未调用专门计划能力；considered: work breakdown
- [Test] Unaided — Codex 未捕获调用；considered: testing strategy
- 已实际读取 `agent-skills:test-driven-development`，使用已有四项失败复现并在修复后运行定向和完整测试；阶段记录的 Unaided 反映 Codex 自动证据限制。

## Preconditions

用户同意一并修复已说明的测试隔离和换行问题；使用独立项目内 worktree。

## Plan Review

- Verdict: sound
- Coverage: Step 1 修复三个根因并验证四项失败，Step 2 验证完整套件和类型。
- Verifiability: 定向测试读取真实用户配置环境与 CRLF README；全量测试检查回归。
- Layer ownership: 修改缺陷所在测试隔离，保留原有数值与路由断言，不调整产品数据。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 10:25 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — Implement and verify

- Goal: 隔离测试配置并兼容 README 换行。
- Dependencies: 无。
- Files: `cli/test/unit/config-timeout.test.ts`、`cli/test/unit/provider-routing.test.ts`。
- Implementation checklist:
  - [x] 设置并恢复临时 HOME、USERPROFILE 和 provider 默认 limit。
  - [x] 规范化 README 换行并保留原有断言。
  - [x] 运行两个定向测试文件。
- Acceptance: 四项失败消除且原有断言仍有效。
- Verification: `vitest run test/unit/config-timeout.test.ts test/unit/provider-routing.test.ts`。
- Rollback: 独立工作区内的两个测试文件差异。
- Status: done

### Step 2 — 完整验证

- Goal: 排查整体回归。
- Dependencies: Step 1。
- Files: 任务计划。
- Implementation checklist:
  - [x] 运行完整测试及类型检查。
- Acceptance: 记录通过情况或可复现的独立失败。
- Verification: `npm test`、`tsc --noEmit`。
- Rollback: 独立工作区，保留其他任务与用户文件。
- Status: done

## Checkpoints

## Verification / Review

- 2026-11-10 Step 2: 完整测试 628 项通过，类型检查通过

- 2026-11-10 Step 1: 定向测试 20 项通过

- 原始复现：两个定向测试文件 4 失败、16 通过，与 main 相同。
- 修复后：两个定向测试文件 20 通过；`npm.cmd test` 54 文件、628 项通过；`tsc --noEmit` 通过；`git diff --check` 通过。
- 用户配置未修改；变更只涉及测试的隔离和换行匹配，既有值与路由断言均保留。

## Change Log

## Follow-ups

## Version History

- v1 — planning.
