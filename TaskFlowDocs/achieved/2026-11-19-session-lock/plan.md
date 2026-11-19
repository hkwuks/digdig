# Plan — 修复会话迁移锁
> Task version: v3
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
- Approved version: v3
- Approved scope: 迁移步骤和未知锁的恢复提示。

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
- v3：新增断言修改前失败；修改后迁移、存储及 README 命令表测试 33 项通过，`npx tsc --noEmit` 通过，`git diff --check` 通过。
- v2：真实子进程持锁期间返回忙碌；杀死后两个恢复者并发成功迁移并写入，旧锁及不完整标记保留。
- v2：Windows `npx tsc --noEmit` 通过；迁移与存储测试 21 项通过；全量 70 文件、819 项通过。Linux 尚未验证，须由 CI 执行。
- 新锁依赖 SQLite 独占事务而非 PID，避免 PID 复用误判；崩溃发生在标记写入前时保守返回忙碌。
- 新增的两项测试在修改前分别复现旧锁被删除和已迁移会话被锁阻塞；修改后迁移与存储集成测试 19 项通过。
- `npx tsc --noEmit`：通过。
- `npm test`：首次 816 通过、1 项 local-doc 测试超时；该文件单独 36 项通过，重跑全量 70 文件、817 项通过。
- 遗留锁不再自动删除；只有确认没有旧进程持锁后才能人工删除。旧版本自身仍可超时清锁，不能保证与长时间运行的旧进程互斥。

## Change Log
- v3 补充迁移前后使用步骤，未知锁报错列出路径并要求先停止相关进程。
- 2026-11-19 reopen — retrieved achieved task `2026-11-19-session-lock` for new work; re-approval required before core changes
- v2 使用 SQLite 进程锁串行化可识别锁恢复，并保留未知锁。
- 2026-11-19 reopen — retrieved achieved task `2026-11-19-session-lock` for new work; re-approval required before core changes
- 已迁移数据库绕开目录锁；未迁移会话对已有锁 fail closed。

## Follow-ups
- 不同版本进程同时使用旧 JSON 的锁语义仍受旧版本实现限制。

## Version History
- v1 — 用户确认已有锁待办和待办清理。
- v2 — 用户确认新锁自动恢复、旧版不并发使用与平台验证范围。
- v3 — 用户确认补充迁移和恢复提示。

### Step 2 — 新锁崩溃恢复
- Goal: 自动恢复可证明不再被持有的新锁，未知锁保持安全失败。
- Dependencies: v1 锁与迁移检查点。
- Files: session-lock.ts、迁移集成测试、会话文档。
- Implementation checklist:
  - [x] 实现并发互斥和锁标记，保留未知锁。
  - [x] 验证真实崩溃、活动持有者和竞争恢复，运行类型及测试。
- Acceptance: 满足 v2 PRD。
- Verification: Windows 本地测试；Linux 交 CI。
- Rollback: 恢复本步源码和测试提交。
- Status: done

### Step 3 — 迁移和恢复提示
- Goal: 引导安全迁移和人工恢复未知锁。
- Dependencies: v2 锁协议。
- Files: session-lock.ts、迁移测试、两份 README。
- Implementation checklist:
  - [x] 提示停止全部相关 dg 进程并标识具体锁目录。
  - [x] 校验错误和中英文文档，执行测试。
- Acceptance: 满足 v3 PRD，不修改迁移和锁行为。
- Verification: 集成测试、类型检查、文档变更检查。
- Rollback: 恢复本步提交。
- Status: done
