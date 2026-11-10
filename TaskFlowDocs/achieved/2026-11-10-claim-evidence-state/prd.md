# C6 — 跳过最后来源使 claim 永久卡在 verifying
> Task version: v1
> Status: completed

## Goal

跳过最后一个来源会让 claim 永久卡在 verifying：session.ts:539-545 令证据失效并删掉 review，policy-aggregate 随后报 No claims with verdicts to aggregate 且 exit 0，没有路径把 claim 复位

## Task Kind

- Kind: defect

## Background / Confirmed Facts

`repairInvalidDependents` 把失效证据保留下来、删除相关 review，但无条件将关联 claim 设为 verifying。`policy-aggregate` 忽略失效证据，没有有效 verdict 时不会推进状态。重复修复还会重新处理已经失效的证据，可能撤销新建立的 review，须一并验证。

## Requirements

- 最后一条有效证据失效时设置 claim 为 pending；仍有有效证据时回到 verifying，等待重新聚合。
- 失效证据、历史 verdict 保留供审计；受影响的旧 review 失效。重新验证后产生的新 review 不应被重复修复错误撤销。
- 处理跳过来源和正文变更两种现有失效路径，保持会话锁及损坏数据处理。

## Acceptance Criteria

- 跳过唯一来源后 claim 为 pending，失效证据及原因仍可读取，旧 review 被清除。
- 存在另一条有效证据时 claim 为 verifying；再次验证和聚合后，多次读取不会撤销新 review。
- 原子写入、中断恢复和已损坏 claim 文件的原有保障不降低。

## External Facts

- Depends on external facts: no
- Why not: 状态及失效逻辑定义于 `cli/src/deep/session.ts`、`cli/src/claims/types.ts` 和 `cli/src/commands/evidence.ts`。

## In Scope

会话依赖修复、相关 claim 状态和集成回归测试。

## Out of Scope

删除历史证据或 verdict；重设来源聚类及其他 claim 数据模型。

## Risks / Deferred Items

失效标记、claim、review 分别保存；必须覆盖重复调用与部分写入恢复，不得仅跳过已失效证据而遗漏恢复。

## Open Questions

用户已确认最后有效证据失效时回到 pending，保留失效证据。
