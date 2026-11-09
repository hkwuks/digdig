# Plan — claim 风险等级校验
> Task version: v1
> Status: completed

## Spec Pointers
- `spec.md`

## Skills / Tools Used
- [PRD] Unaided — no capability applied to this phase; considered: root cause investigation；追踪 claim 创建、读取和审核入口。
- [Test] Unaided — no capability applied to this phase; considered: testing strategy；验证大小写、无效值、历史数据及审核边界。

## Plan Review
- Verdict: sound
- Coverage: Step 1 覆盖全部输入、历史数据及自动审核验收。
- Verifiability: 通过命令和存储层测试核对错误与写入行为。
- Layer ownership: 输入规范化在 claim 创建，历史校验在共享读取边界。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-09
- Approved version: v1
- Approved scope: 新输入转小写后校验；历史非法值阻止自动审批且不改写。

## Steps
### Step 1 — 修复并验证
- Goal: 防止无效等级绕过策略。
- Dependencies: 无
- Files: claim 命令、store、测试。
- Implementation checklist:
  - [x] 实现并验证。
- Acceptance: PRD 验收条件成立。
- Verification: 定向测试和类型检查。
- Rollback: 回退本任务改动。
- Status: done

## Verification / Review
Vitest 定向测试 8 项通过：大小写、默认值、非法值、批次拒绝及历史数据；tsc --noEmit 与 git diff --check 通过。测试使用模拟存储，未修改真实会话。

## Change Log
- 2026-11-09 v1 — 用户决定对新输入先转小写；历史非法值不自动更改。

## PR 检查
- 远程 `hkwuks/digdig` 的 `main`，基线 3e7a65c；模板 `.github/pull_request_template.md` 的背景、改动、验证、兼容性和范围外事项全部填写。
- 审查：历史非法等级将使读取 claims 的操作报错；不自动改写历史记录。定向测试覆盖输入、批次和读取，未在真实会话上执行。
