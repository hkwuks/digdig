# Plan — 修复 session-delete 参数校验
> Task version: v1
> Status: completed

## Spec Pointers
- `spec.md`

## Related Tasks
- Todo: TF-20261103-85fa15

## Skills / Tools Used
- [PRD] Unaided — no capability applied to this phase; considered: root cause investigation; 已检查调用链和模拟行为。
- [Test] Unaided — no capability applied to this phase; considered: testing strategy; 使用模拟文件系统。

## 先决条件
已读取 `TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`。worktree 分支 `fix/2026-11-09-session-delete-validation`。

## Plan Review
- Verdict: sound
- Coverage: Step 1 覆盖全部参数校验、错误输出和合法删除验收。
- Verifiability: 需补充 CLI 参数解析与错误 envelope 检查，现有模拟测试覆盖删除调用。
- Layer ownership: CLI 保留输入，命令层校验；未修改已有测试期望。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-09
- Approved version: v1
- Approved scope: 正有限小数、名称与年龄互斥、有效批量删除保持非交互。

## Steps
### Step 1 — 核查并验证修复
- Goal: 确认所有验收条件及调用入口。
- Dependencies: 无
- Files: CLI、session 命令、测试与 README。
- Implementation checklist:
  - [x] 迁移已有修复到独立 worktree。
  - [x] 补充 CLI 入口及错误 envelope 验证，审查并记录结果。
- Acceptance: PRD 全部验收条件成立。
- Verification: 定向测试、类型检查及 CLI 入口检查。
- Rollback: 回退本任务改动。
- Status: done

## Verification / Review
worktree：定向 Vitest 12 项通过，涵盖 CLI 参数及错误 envelope；tsc --noEmit 通过。代码审查确认校验在删除前；未做真实删除。Vitest 使用 runner 配置加载以避免向链接的依赖目录写缓存。

## Change Log
- 2026-11-09 v1 — 原先错误地在主工作区实施；用户同意后迁入 worktree 并补建记录。审批实际发生在实现前，计划文档在实现后补记。

## Follow-ups
无新增功能性后续事项。

## PR 检查
- 目标：`hkwuks/digdig` 的 `main`；远端 main 已核对为 cfb1ad6，与本地基线一致。
- 模板：`.github/pull_request_template.md`；背景、改动、验证、兼容性与范围外事项均将在 PR 中填写。
- 审查：输入在删除前校验；名称冲突失败；现有 mock 和 CLI 测试覆盖主要路径。未使用真实会话执行删除。
