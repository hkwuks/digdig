# Plan — 修复会话迁移锁
> Task version: v1
> Status: completed

No spec required — 聚焦现有锁与数据库打开路径。

## Reference Pointers
- `TaskFlowDocs/repository-docs/index.md`、`LICENSE`、`CONTRIBUTING.md`、`CODE_STYLE.md`：遵循仓库许可、测试和代码规范。
- `cli/src/deep/session-lock.ts`、`session-migrate.ts`、`session-db.ts`、`session-store.ts` 与迁移集成测试。

## Related Tasks
- TF-20261116-273731：现有缺陷记录。

## Skills / Tools Used
- TaskFlow：已有待办提升、任务记录。
- debugging-and-error-recovery：检查调用方、复现和回归验证。
- ponytail：最小完整修改。

## Plan Review
- Verdict: 通过；仍有旧版本锁超时行为及遗留锁人工恢复的限制。
- Coverage: 已迁移路径、首次迁移互斥及错误路径。
- Layer ownership: 迁移标记由数据库拥有；旧锁只保护首次迁移。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-19 +0800
- Approved version: v1
- Approved scope: 会话锁排查修复及相关待办整理。

## Steps

### Step 1 — 实现并验证
- Goal: 修复锁边界并核实数据安全。
- Dependencies: 无。
- Files: 会话锁、迁移与测试。
- Implementation checklist:
  - [x] 复现、实现并核对调用方。
  - [x] 运行针对性测试及类型检查。
- Acceptance: 满足 PRD 各项。
- Verification: 迁移和并发集成测试。
- Rollback: 恢复本任务对源码和测试的改动。
- Status: done

## Verification / Review
- 新增的两项测试在修改前分别复现旧锁被删除和已迁移会话被锁阻塞；修改后迁移与存储集成测试 19 项通过。
- `npx tsc --noEmit`：通过。
- `npm test`：首次 816 通过、1 项 local-doc 测试超时；该文件单独 36 项通过，重跑全量 70 文件、817 项通过。
- 遗留锁不再自动删除；只有确认没有旧进程持锁后才能人工删除。旧版本自身仍可超时清锁，不能保证与长时间运行的旧进程互斥。

## Change Log
- 2026-11-19 reopen — retrieved achieved task `2026-11-19-session-lock` for new work; re-approval required before core changes
- 已迁移数据库绕开目录锁；未迁移会话对已有锁 fail closed。

## Follow-ups
- 不同版本进程同时使用旧 JSON 的锁语义仍受旧版本实现限制。

## Version History
- v1 — 用户确认已有锁待办和待办清理。
