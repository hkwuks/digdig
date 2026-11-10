# P6 — baseUrl 缺失时报错误导、retryable 判定错
> Task version: v1
> Status: completed

## Goal

baseUrl 缺失或非法时报错误导且可重试性判定错：无配置时搜索报 SEARCH_FAILED/Invalid URL 无 hint，--health 提示文字里的 URL 为空，--engines-list 与 --categories-list 对同一配置错误报不同 code，--engines-list 还标 retryable:true。应在发请求前统一报 CONFIG_MISSING

## Task Kind

- Kind: defect

## Background / Confirmed Facts

SearXNG 的 search、health、engines-list、categories-list 使用各自错误包装；缺失或无效 baseUrl 时未在请求前统一校验。外部提供商仅搜索路径不需要 SearXNG。

## Requirements

- 四条需要 SearXNG 的入口对缺失、畸形或非 HTTP(S) baseUrl 统一输出 CONFIG_MISSING、非重试、可操作 hint，且不发送请求。
- 用户确认：仅使用已配置 Ollama 或 DeepSeek 的搜索不因缺少 SearXNG baseUrl 被阻断；混合或需要 SearXNG 的请求须先检查配置。
- 合法 URL 的网络故障仍走现有健康检查和网络错误逻辑，不把服务不可达误报为配置缺失。

## Acceptance Criteria

- 对空、非法及非 HTTP(S) baseUrl，真实 CLI 的搜索、健康、引擎和分类入口均产生一致错误并退出非零；axios 未发请求。
- 仅外部提供商搜索无 SearXNG 配置可成功；混合搜索不会在无效配置时先调用任何提供商。
- 合法 URL 的既有网络、HTTP 状态分类及独立入口行为不退化。

## External Facts

- Depends on external facts: no
- Why not: 配置和错误处理定义在 `cli/src/service.ts`、`cli/src/runCli.ts`、`cli/src/errors.ts`。

## In Scope

SearXNG 配置校验、四条入口错误传递、相关测试及必要文档。

## Out of Scope

改变其他提供商的凭据或通信协议；修改用户本机配置。

## Risks / Deferred Items

在服务构造阶段无条件抛错会破坏仅提供商搜索；在混合搜索的外部请求后校验会产生不必要请求或费用。

## Open Questions

用户已选择仅外部提供商路径无需 SearXNG baseUrl。
