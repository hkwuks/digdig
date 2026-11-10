# D10 — path 节点无生产路径，graph-traverse 恒失败
> Task version: v1
> Status: planning

## Goal

path 节点没有任何生产路径，graph-traverse 提示用户去做一件做不到的事：path-extraction.ts:266 的 extractPaths 在 src/ 无调用者（仅测试调用），graphPreprocess 从不调用它，所以 dg graph-traverse 恒返回 NO_PATHS 且 hint 无法成功；相关地 graph-explore.ts:430 的 graph.edges(prevId,eId) 未做存在性检查，路径引用已剪除实体时 graphology 抛 NotFoundGraphError，最终表现为裸 Fatal error

## Task Kind

- Kind: defect

## Background / Confirmed Facts

`extractPaths` 当前只有测试调用，生产的 graph-add 不产生 path 节点；`graph-traverse` 找不到路径时建议的步骤因此无效。`traversePath` 对缺失实体调用 graphology.edges 会抛异常。提取器每次按已有最大序号分配 ID，直接重复调用会重复生成路径。

## Requirements

- 用户确认在 graph-add 成功写入语义节点和边时生成并持久化推理路径；相同输入重试不得无限累积重复路径。
- 缺失实体的路径返回结构化错误并提示重新生成，不能产生未捕获异常。
- 保留来源失效的现有清理机制，不把无依据节点或边提升为可用证据。

## Acceptance Criteria

- 使用 graph-add 写入真实支持结果的语义链后，通过 graph-traverse 获取生成并持久化的路径。
- 相同 graph-add 重试不重复增加相同路径；当引用实体不存在时返回可处理的错误。
- 原有无路径与无效路径 ID 错误、实体写入及跳过边语义不退化。

## External Facts

- Depends on external facts: no
- Why not: 路径提取与持久化行为由 `cli/src/deep/path-extraction.ts`、`cli/src/deep/session.ts` 和 `cli/src/commands/graph-add.ts` 定义。

## In Scope

路径生产接入、幂等、缺失节点错误及对应集成验证。

## Out of Scope

新的路径搜索算法、插件机制或无来源语义数据。

## Risks / Deferred Items

路径提取的搜索成本随图规模上升；需要查看已有基准并避免对完全无变化的重试反复追加节点。路径节点可能引用由后续来源失效清理删除的实体，读取时不能崩溃。

## Open Questions

用户确认 graph-add 后持久化并在缺失实体时返回结构化错误。
