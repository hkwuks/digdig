# Spec — P10 — extract 全部失败仍 exit 0
> Task version: v1

## Objective and Success Criteria

让进程状态和输出反映批量抽取结果，不丢失成功、失败及重试诊断。

## Architecture Boundaries and Responsibilities

`ContentExtractor.extractBatch` 返回单项结果；`runExtract` 负责分类、去重、调用 session 写入并生成 CLI envelope。

## Project Structure / Affected Files

`cli/src/commands/extract.ts`、`cli/test/unit/commands/extract.test.ts`、必要的 CLI 集成测试与项目文档。

## Interfaces, Data Flow, and Contracts

全部普通失败：非零、错误 envelope，details 保留 failed、stats 和 session。全部限流：保持 JINA_RATE_LIMITED。至少一项成功：成功 envelope 包含 extracted、failed、stats；若含限流，保留重试信息。

## Invariants and Compatibility

会话每项结果仍按原有路径持久化；全成功及不含输入的既有行为不变；不改 failureCount 的计数规则。

## Validation and Error Semantics

通过实际 `runExtract` 调用和 session 回读验证普通失败、部分成功、全部限流、部分限流及空响应；不能仅检查 console 被调用。

## Code and Test Constraints

不访问真实网络，沿用现有 envelope 和测试框架；记录真实 stdout 与退出码。

## Design Decisions and Alternatives

用户选择部分成功即成功；因现有 Jina 分支对混合结果也返回错误，必须同时处理该分支并保留限流提示。

## Open Questions

无。
