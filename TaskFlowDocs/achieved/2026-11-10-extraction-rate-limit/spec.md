# D7 设计

> Task version: v1
> Status: planning

## Objective and Success Criteria

带 retryAfterMs 的限流保留失败诊断但不增加失败计数；实际抽取失败保持原有次数上限。

## Architecture Boundaries and Responsibilities

变更归属 `cli/src/deep/session.ts`；调用方和持久化格式以现有实现为准。

## Project Structure / Affected Files

`cli/src/deep/session.ts`；`cli/test/unit/commands/extract.test.ts`。

## Interfaces, Data Flow, and Contracts

带 retryAfterMs 的限流保留失败诊断但不增加失败计数；实际抽取失败保持原有次数上限。

## Invariants and Compatibility

保留未涉问题的现有行为，不新增依赖或迁移。

## Validation and Error Semantics

先红后绿，验证反复限流仍待重试、普通失败仍受预算限制。

## Code and Test Constraints

测试不访问网络；使用现有测试框架。

## Design Decisions and Alternatives

在问题所属层处理，避免仅修改输出或测试掩盖根因。

## Open Questions

无。
