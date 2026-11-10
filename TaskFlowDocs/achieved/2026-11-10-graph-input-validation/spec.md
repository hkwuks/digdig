# Spec — C9 — graph-add 畸形输入抛未捕获 TypeError
> Task version: v1

## Objective and Success Criteria

在信任边界验证完整输入，避免异常及半写入。

## Architecture Boundaries and Responsibilities

`readSessionJsonInput` 负责读路径与 JSON 解析；`graph-add` 负责根结构、数组元素和字段；会话图 mutation 负责批准来源及图一致性。

## Project Structure / Affected Files

`cli/src/commands/graph-add.ts`、`cli/test/integration/graph-add.test.ts`，必要时项目文档。

## Interfaces, Data Flow, and Contracts

先读取会话内 JSON → 校验完整输入 → 才进行 session 初始化和持锁 mutation。结构错误以现有 `INVALID_GRAPH_DATA` 错误 envelope 返回，来源不合规继续报告 `INVALID_RESULT_PROVENANCE`。

## Invariants and Compatibility

有效输入格式和外部图接口不变；空批次仍报错；拒绝的批次不产生部分节点、边或 session 元数据更新。

## Validation and Error Semantics

真实会话测试比较输入前后 graph 和 metadata；覆盖非数组、null、数字、错误字段及有效项在前的混合批次，验证标准 JSON 错误和非零退出。

## Code and Test Constraints

使用 `unknown` 收窄；不新加依赖；保留现有锁、来源检查及路径生成。

## Design Decisions and Alternatives

用户选择整批拒绝，不逐项跳过。校验需覆盖可选字段类型，避免将畸形值带入 graphology 或后续消费者。

## Open Questions

无。
