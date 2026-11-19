# 修复会话迁移锁
> Task version: v1
> Status: completed

## Goal
避免已迁移会话受旧目录锁影响，避免首次迁移时错误删除其他进程的锁。

## Task Kind
- Kind: defect

## Requirements
- 已完成迁移的数据库由 SQLite 控制并发，打开时不需要旧目录锁。
- 首次迁移保持旧目录锁与 SQLite 事务保护；不能根据时间戳自动删除锁。
- 记录无法安全自动恢复的遗留锁和旧版本进程局限。

## Acceptance Criteria
- 已迁移会话在旧目录锁存在时可正常打开。
- 未迁移会话遇到任意已有锁时返回 SESSION_BUSY，不删除锁或创建数据库。
- 并发首次迁移和 SQLite 事务测试通过；已有会话数据不变。

## In Scope
会话锁、数据库打开路径、必要测试。

## Out of Scope
旧版本程序的锁算法和 SearXNG 分页。

## Risks / Deferred Items
崩溃遗留锁需确认无进程持有后手动清除；旧版本进程自身仍可能按超时删除持有中的锁。
