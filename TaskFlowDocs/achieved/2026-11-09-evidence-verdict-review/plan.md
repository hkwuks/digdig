# Plan — verdict 与 review 一致性
> Task version: v1
> Status: completed

## Spec Pointers
- `spec.md`

## Related Tasks
- C2 TF-20261103-e5d727 与 C5 TF-20261103-a2cd67 是同一验证流程，共同修复。

## Skills / Tools Used
- [PRD] Unaided — no capability applied to this phase; considered: root cause investigation；已跟踪 verdict 查找和 review 保存。
- [Test] Unaided — no capability applied to this phase; considered: testing strategy；验证更新、过期 review、complete 和幂等。

## Plan Review
- Verdict: sound
- Coverage: Step 1 覆盖全部验收条件。
- Verifiability: 需通过存储输出验证新 verdict 和 review。
- Layer ownership: 证据验证事务维护 verdict 与 review 一致。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-09
- Approved version: v1
- Approved scope: 更新原 verdict；未立即汇总时清除旧 review。

## Steps
### Step 1 — 修复和验证
- Goal: 防止旧 verdict 和 review 误导。
- Dependencies: 无
- Files: evidence 命令和测试。
- Implementation checklist:
  - [x] 实现并验证。
- Acceptance: PRD 契约成立。
- Verification: 定向测试、类型检查和存储状态验证。
- Rollback: 回退任务改动。
- Status: done

## Verification / Review
Vitest 定向测试 4 项通过：更新 verdict、清理 review、新 verdict、相同重试和 complete 重新聚合；tsc --noEmit 通过。测试使用模拟内存存储，未修改真实会话。未运行完整测试套件。

## Change Log
- 2026-11-09 v1 — 用户确认更新及 review 失效方式。

## PR 检查
- 目标 `hkwuks/digdig` 的 `main`，基线 8373348；`.github/pull_request_template.md` 的背景、改动、验证、兼容性和范围外事项均将填写。
- 审查：已覆盖新判断、更新、重复提交及 complete；仅影响关联 claim 的旧 review。
