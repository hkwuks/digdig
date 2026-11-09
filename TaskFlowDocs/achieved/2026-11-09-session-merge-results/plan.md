# Plan — 会话合并结果
> Task version: v1
> Status: completed

## Spec Pointers
- `spec.md`

## Skills / Tools Used
- [PRD] Unaided — no capability applied to this phase; considered: root cause investigation；已跟踪融合到会话写入。
- [Test] Unaided — no capability applied to this phase; considered: testing strategy；覆盖过滤、排序、限制及持久化。

## Plan Review
- Verdict: sound
- Coverage: Step 1 覆盖全部验收条件。
- Verifiability: 测试需检查最终会话内容和显示。
- Layer ownership: 融合层定义本调用候选；会话层沿用展示结果写入。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-09
- Approved version: v1
- Approved scope: 合并结果与当前搜索结果按限制排序并写入 session。

## Steps
### Step 1 — 修复和验证
- Goal: 合并结果不再被 session 过滤。
- Dependencies: 无
- Files: 融合层及测试。
- Implementation checklist:
  - [x] 实现和验证。
- Acceptance: PRD 契约成立。
- Verification: 定向测试、类型检查和端到端 session 检查。
- Rollback: 回退任务改动。
- Status: done

## Verification / Review
定向 Vitest 11 项通过，tsc --noEmit 通过；真实隔离 session 中验证 CLI 输出和 results.json 都包含 merge 文件中的 URL（fixture: cli/.digdig/validation/session-merge-1794234222941）。未运行完整测试套件。

## Change Log
- 2026-11-09 v1 — 用户确认融合与 limit 语义。

## PR 检查
- 目标 `hkwuks/digdig` 的 `main`，基线 8373348；`.github/pull_request_template.md` 的背景、改动、验证、兼容性和范围外事项均将填写。
- 审查：历史候选仍不显示；合并结果与当轮结果参与 limit；真实隔离 session 落盘已验证。
