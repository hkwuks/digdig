# C7 graph-add 实体 ID 覆盖结构节点

> Task version: v1
> Status: completed

## Goal

检测所有实体 ID，如命中非实体节点，整批返回 GRAPH_NODE_ID_CONFLICT，保留实体和边；既有实体仍可更新。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

graph-add 将指定 ID 直接与已有节点合并，未核验类型；结果节点因此被改名。

## Requirements

- 检测所有实体 ID，如命中非实体节点，整批返回 GRAPH_NODE_ID_CONFLICT，保留实体和边；既有实体仍可更新。
- 不改变其他待办的行为。

## Acceptance Criteria

- 先红后绿，断言冲突错误、图数据不变及既有实体更新。
- 类型检查通过；全量测试的失败与基线比较并记录。

## External Facts

- Depends on external facts: no
- Why not: 行为与测试均由 `cli/src/commands/graph-add.ts` 和 `cli/test/integration/graph-add.test.ts` 定义。

## In Scope

相关实现、回归测试及验证。

## Out of Scope

其他待办及全量测试中已复现的基线失败。

## Risks / Deferred Items

TaskFlow 初版草稿未按阶段调用能力，且代码在完整计划审核前已开始；如实记录，不将阶段门禁称为事前通过。

## Open Questions

无。
