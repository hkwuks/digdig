# Archived Version v1 — Plan — 修复会话迁移锁
> Task: 2026-11-19-session-lock
> Version: v1
> Status: superseded
> Archived: 2026-11-19 10:37 +0800
> Superseded by: v2
> Archive mode: file

## Change Summary
v1 保守拒绝所有已有锁；v2 对新协议中可识别且已释放进程锁的崩溃遗留锁自动恢复，未知锁仍保守拒绝。

## Archived Materials
- prd.md

## Restore
Read the archived v1 core docs from a new temporary restore root. Do not overwrite the current task root.
