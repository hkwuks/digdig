# PRD — 搜索引擎配置与图来源计数
> Task version: v1
> Status: in_progress

## Goal

修复 P11 搜索引擎默认配置未生效，以及 D11 图路径来源数量重复或与列表不一致。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

- `cli/src/runCli.ts` 已读取 defaultEngine 却未用于搜索；allowedEngines 只验证显式选项。
- `cli/src/deep/graph-explore.ts` 按入边累加计数，同时把来源收集到去重集合，且来源属性也会加入集合。
- 用户确认旧 `query-graph` 的 mixed 采样暂不修复。

## Requirements

- 显式 `--engines` 优先；未指定时优先 defaultEngine，其次使用非空 allowedEngines，两者均无则保留后端默认。
- 若 allowedEngines 非空，所有实际选择的引擎（包括默认引擎）均须属于允许列表；错误在网络和会话写入前报告。
- 外部 provider 与 SearXNG 继续共用现有路由和配置检查。
- 图路径的 resultCount 等于不同 result ID 的数量，与返回的 resultIds 一致。

## Acceptance Criteria

- CLI 测试覆盖显式、默认、允许列表和无配置四种选择；非法默认和显式值均拒绝且不搜索；外部 provider 路由和缺密钥情形覆盖。
- 图测试覆盖同一结果多次关联、来源属性与边重合、只通过来源属性关联，数量等于唯一来源 ID 数。
- 原有部分失败、查询、无配置行为保持；完整测试、编译和 CI 通过。

## External Facts

- Depends on external facts: no
- Why not: 路由与结果由 `cli/src/runCli.ts`、`cli/src/deep/graph-explore.ts` 和 `cli/test/unit/provider-routing.test.ts` 可直接验证。

## In Scope

P11 和 D11 的来源计数子项、所需测试、文档和 Todo。

## Out of Scope

本地文档、已废弃命令的 mixed 采样、D11 其余问题、P2/P5 的独立 PR。

## Risks / Deferred Items

启用已有默认配置会改变之前被忽略的配置行为；无效默认应报错，避免绕过允许列表。

## Open Questions

无；遇到不能实现用户已确认行为的情况先报告。
