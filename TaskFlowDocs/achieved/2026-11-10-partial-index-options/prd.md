# D5 部分索引重建丢失扩展名

> Task version: v1
> Status: completed

## Goal

重建使用来源中记录的扩展名和当前内存预算；没有来源元数据时继续使用默认扩展名。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

refreshIndex 的 partial 分支未传来源扩展名与扫描预算，回退到 md/txt。

## Requirements

- 重建使用来源中记录的扩展名和当前内存预算；没有来源元数据时继续使用默认扩展名。
- 不改变其他待办的行为。

## Acceptance Criteria

- 先红后绿，验证 JSON 元数据、文件清单和实际检索结果。
- 类型检查通过；全量测试的失败与基线比较并记录。

## External Facts

- Depends on external facts: no
- Why not: 行为与测试均由 `cli/src/deep/local-doc/indexer.ts` 和 `cli/test/unit/deep/local-doc.test.ts` 定义。

## In Scope

相关实现、回归测试及验证。

## Out of Scope

其他待办及全量测试中已复现的基线失败。

## Risks / Deferred Items

TaskFlow 初版草稿未按阶段调用能力，且代码在完整计划审核前已开始；如实记录，不将阶段门禁称为事前通过。

## Open Questions

无。
