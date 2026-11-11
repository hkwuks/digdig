# Spec — 搜索引擎配置与图来源计数
> Task version: v1

## Objective and Success Criteria

让配置的有效引擎真正参与搜索；图路径输出的数量与去重后的 ID 相等。

## Architecture Boundaries and Responsibilities

命令层决定有效引擎并在写入/网络前校验，现有 provider 分流执行；图遍历的结果集合是来源计数的唯一依据。

## Project Structure / Affected Files

`cli/src/runCli.ts`、`cli/src/deep/graph-explore.ts`、provider 路由与图遍历测试、README、CHANGELOG、Todo。

## Interfaces, Data Flow, and Contracts

优先级：显式 --engines → 非空 defaultEngine → 非空 allowedEngines → 后端默认；允许列表非空时，对最终引擎列表统一检验，现有 provider 的密钥检查和结构化错误不变。resultCount = resultIds.length，包含路径实体引用的来源及原有边所关联的来源。

## Invariants and Compatibility

不改变图数据或历史会话；不更改其他图采样策略；provider 单独和混合路由不回退为无约束的 SearXNG。

## Validation and Error Semantics

验证实际搜索调用参数、provider 选择、缺密钥与拒绝路径及无副作用；图结果验证唯一 ID 而非边数，保留域名输出语义。

## Code and Test Constraints

先增加失败测试；不重写旧期望绕过验证。运行定向、全量、类型检查和 CI。

## Design Decisions and Alternatives

以用户确认的优先级和来源 ID 唯一性为准；不为了废弃命令扩展采样接口。

## Open Questions

无。
