# C9 — graph-add 畸形输入抛未捕获 TypeError
> Task version: v1
> Status: completed

## Goal

graph-add 对畸形输入抛未捕获 TypeError：graph-add.ts:52,59 收到 {entities:'not-an-array'} 或 {entities:[null]} 时抛 Fatal error 到 stderr，stdout 为空、无 JSON envelope，Agent 无法解析

## Task Kind

- Kind: defect

## Background / Confirmed Facts

`graph-add` 只检查根值是否为对象，随后将未知值断言为数组并直接读取元素字段。字符串、null 或其他错误类型可引发未捕获 TypeError。它在读取输入前调用 `initSessionDir`，会改写 session 元数据。

## Requirements

- 用户确认：结构畸形输入返回结构化错误，整批不写入；先验证数组、元素和字段类型，不能依赖类型断言。
- 必要字段和可选字段须在读取或写入前验证；来源引用仍使用已有的批准来源校验与错误契约。
- 未通过结构校验不得创建或改写 graph、session 结果及元数据。

## Acceptance Criteria

- 对非数组、null 元素、错误字段类型和混合有效/畸形批次，返回非零 JSON envelope，无未捕获异常，磁盘状态不变。
- 合法实体、合法边、空列表和既有来源校验行为有回归覆盖；未请求的新字段规则不擅自扩展。

## External Facts

- Depends on external facts: no
- Why not: 输入契约和调用路径定义于 `cli/src/commands/graph-add.ts`、`cli/src/commands/json-input.ts`。

## In Scope

图输入边界校验、写入顺序及命令级回归测试。

## Out of Scope

变更语义图关系规则、来源批准或路径生成算法。

## Risks / Deferred Items

非法输入包括被 JavaScript 隐式转换的非字符串 ID 和数值字段；测试须避免仅检查 exit code 而遗漏部分写入。

## Open Questions

用户已选择结构化错误和整批拒绝。
