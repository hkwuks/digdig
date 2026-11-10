# C7 设计

> Task version: v1
> Status: planning

## Objective and Success Criteria

检测所有实体 ID，如命中非实体节点，整批返回 GRAPH_NODE_ID_CONFLICT，保留实体和边；既有实体仍可更新。

## Architecture Boundaries and Responsibilities

变更归属 `cli/src/commands/graph-add.ts`；调用方和持久化格式以现有实现为准。

## Project Structure / Affected Files

`cli/src/commands/graph-add.ts`；`cli/test/integration/graph-add.test.ts`。

## Interfaces, Data Flow, and Contracts

检测所有实体 ID，如命中非实体节点，整批返回 GRAPH_NODE_ID_CONFLICT，保留实体和边；既有实体仍可更新。

## Invariants and Compatibility

保留未涉问题的现有行为，不新增依赖或迁移。

## Validation and Error Semantics

先红后绿，断言冲突错误、图数据不变及既有实体更新。

## Code and Test Constraints

测试不访问网络；使用现有测试框架。

## Design Decisions and Alternatives

在问题所属层处理，避免仅修改输出或测试掩盖根因。

## Open Questions

无。
