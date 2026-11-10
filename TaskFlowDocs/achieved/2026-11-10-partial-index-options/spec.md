# D5 设计

> Task version: v1
> Status: planning

## Objective and Success Criteria

重建使用来源中记录的扩展名和当前内存预算；没有来源元数据时继续使用默认扩展名。

## Architecture Boundaries and Responsibilities

变更归属 `cli/src/deep/local-doc/indexer.ts`；调用方和持久化格式以现有实现为准。

## Project Structure / Affected Files

`cli/src/deep/local-doc/indexer.ts`；`cli/test/unit/deep/local-doc.test.ts`。

## Interfaces, Data Flow, and Contracts

重建使用来源中记录的扩展名和当前内存预算；没有来源元数据时继续使用默认扩展名。

## Invariants and Compatibility

保留未涉问题的现有行为，不新增依赖或迁移。

## Validation and Error Semantics

先红后绿，验证 JSON 元数据、文件清单和实际检索结果。

## Code and Test Constraints

测试不访问网络；使用现有测试框架。

## Design Decisions and Alternatives

在问题所属层处理，避免仅修改输出或测试掩盖根因。

## Open Questions

无。
