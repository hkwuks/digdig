# Spec — P6 — baseUrl 缺失时报错误导、retryable 判定错
> Task version: v1

## Objective and Success Criteria

对同一配置缺陷在所有 SearXNG 请求入口返回一致、不可重试的结构化错误。

## Architecture Boundaries and Responsibilities

配置校验负责识别 URL 与协议；SearXNG 服务在实际使用时拒绝无效配置；CLI 搜索计划在混合请求执行任何提供商前预检，命令层统一错误 envelope。

## Project Structure / Affected Files

`cli/src/errors.ts`、`cli/src/service.ts`、`cli/src/runCli.ts`、相关服务及 CLI 测试。

## Interfaces, Data Flow, and Contracts

需要 SearXNG → 校验 baseUrl → 缺失或非法则 `CONFIG_MISSING`、`retryable:false`、配置提示 → 不发网络；仅外部提供商 → 不执行该校验。

## Invariants and Compatibility

合法 URL 的现有健康和错误分类保留；不在 service 构造时无条件要求 SearXNG 配置。

## Validation and Error Semantics

对空、相对路径、非法端口及非 HTTP(S) 地址逐入口测试错误、退出码、hint 和 axios 调用次数；验证仅外部和混合提供商调用顺序。

## Code and Test Constraints

使用现有 SearchError 与错误 envelope 模式，测试不依赖实际网络或本机 config。按共享调用路径修根因，不仅改提示文字。

## Design Decisions and Alternatives

用户选择仅外部提供商搜索不受 SearXNG 配置影响；检查应位于使用 SearXNG 的边界，而非全局入口。

## Open Questions

无。
