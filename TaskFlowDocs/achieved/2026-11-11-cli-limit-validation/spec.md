# Spec — 搜索数量参数修复
> Task version: v1

## Objective and Success Criteria

按用户指定的正整数限制结果数量，在网络与会话操作之前拒绝非法数量。

## Architecture Boundaries and Responsibilities

参数解析层保留完整输入用于严格验证，命令路由层解析根与子命令重复选项的实际归属；执行函数不猜测用户意图。

## Project Structure / Affected Files

`cli/src/runCli.ts`、CLI 集成测试、必要文档与 Todo；调用链覆盖根搜索和 graph-search。

## Interfaces, Data Flow, and Contracts

严格正安全整数；`-l` 与 `--limit` 统一处理，默认搜索配置保持现有行为；graph-search 无显式值时为 10。出错时非零退出且不请求后端或写会话。

## Invariants and Compatibility

正常参数、默认值和命令格式不变；不对其他数值选项扩大校验。

## Validation and Error Semantics

以真实程序解析与图查询验证前后位置、短长选项；以 mock 服务和临时会话验证无副作用。错误遵循现有 CLI 错误协议。

## Code and Test Constraints

先写失败回归；不修改现有断言掩盖缺陷，运行类型检查和全量测试。

## Design Decisions and Alternatives

使用已有 Commander 全局选项归属策略，具体取值须以用户传入优先级和默认值测试验证。

## Open Questions

无。
