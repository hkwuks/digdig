# 修复 session-delete 参数校验
> Task version: v1
> Status: completed

## Task Kind
- Kind: defect

## 目标与背景
负数年龄触发批量删除，非法值可能回退到按名称删除。修复误删风险。

## 要求与验收
- --older 接受大于零的有限数字，支持小数；零、负数及非法值失败且不删除。
- 同时提供名称和 --older 时失败且不删除。
- 合法批量删除保持非交互；错误提供 JSON envelope 和非零退出码。

## External Facts
- Depends on external facts: no
- Why not: 行为由 `cli/src/commands/session.ts` 和用户确认的约定决定。

## 范围与风险
包含 CLI、删除命令、测试及文档；不增加删除确认。现有实现先于任务记录完成，需在 worktree 重新验证和审查。
