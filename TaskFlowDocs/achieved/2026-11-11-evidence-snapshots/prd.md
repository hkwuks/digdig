# SessionResult 没有 snapshot 概念，证据定位无法在重抽取后重新对齐
> Task version: v1
> Status: completed

## Goal

`SessionResult.content` 是裸字符串，没有 `normalized_text_hash`，没有 `extraction_version`。`EvidenceSpan`（`cli/src/claims/types.ts:46`）的 `charStart`/`charEnd` 是 UTF-16 偏移，正文重新抽取后偏移失效；现在只能靠 `contentHash` 校验失败来发现，**没有版本化的重定位机制**。`docs/agent_search_integrated_report_2026-10-27.md` 4.3 明确要求「重抽取或正文标准化版本变化时，应重新定位，不能沿用旧偏移」，并把 `Snapshot(id, url, final_url, mime, normalized_text_hash, extraction_version, access_level)` 列为一个独立实体。次要缺口：locator 只有文本偏移一种，报告还要求 PDF 页码/区域、表格行列、代码 commit+文件+行号、视频时间戳——「不应假装所有证据都能被表示为 UTF-8 文本中的一对 start/end」。

## Task Kind

- Kind: capability

## Background / Confirmed Facts

- SQLite v1 的 `body_snapshots` 按结果覆盖，证据仅含片段哈希和 UTF-16 偏移；历史正文无法从数据库恢复。
- 状态修复当前合并了采信与内容有效性，会删除审核并裁剪图；审核表每个 claim 仅一条。
- 关联 TF-20261107-23d219；SQLite 基础由 PR #56 合并。两项由用户决定联合设计。

## Requirements

1. 不同正文保存为不可变快照；相同正文复用快照并另记最新抽取信息。被证据引用的旧快照保留；未引用快照的清理由后续策略决定。
2. 证据绑定快照。正文变化后先待重新定位，唯一准确匹配可更新位置，零次或多次匹配交由 Agent 或人工处理；新正文待采信，未采信时证据不能参与审核。
3. 原审核保留供审计并标记不再是当前有效审核；重新定位后仍需重新审核。依赖旧正文的语义图实体和关系保留并标为待重新确认，不能当作已确认知识。
4. SQLite v1 升级时保留原证据；无法与当前正文准确对应的标待核对，不伪造历史快照；升级全有或全无。
5. 拆分结果采信、正文版本、证据定位、审核和图确认状态；明确 skip 语义，避免仅凭结果 status 统一级联。

## Acceptance Criteria

- 同正文重抽取不新增正文版本、不撤销采信；正文变化后旧引用保留，新正文待采信。
- 唯一、零次、多次匹配及 Unicode、旧证据不匹配、多次变化均有真实持久化测试；待确认数据不冒充当前有效结论。
- SQLite v1、旧 JSON 升级，以及故障回滚、并发和重试不丢数据；受影响 CLI 和项目内 skill 同步更新。
- 审核与图数据变化后仍可审计；图有多个来源时不误伤仍有效的来源；重新采信正文不自动重新确认图事实。

## External Facts

- Depends on external facts: no
- Why not: 本任务延续 `cli/src/deep/session-db.ts` 的内置 SQLite 连接与事务方式；Node 24.15 及 SQLite 事务资料已记录于 `TaskFlowDocs/achieved/2026-11-10-sqlite-session/prd.md`，新 API 使用前另行核实。

## In Scope

单会话 schema 升级、快照、证据定位、审核历史、图确认状态及相关 CLI、测试和文档。

## Out of Scope

快照自动清理和 TTL、PDF/代码等其他 locator、跨会话关系、语义相似定位、来源独立性和发版。

## Risks / Deferred Items

不可恢复未保存的历史正文；重复引用或旧偏移不匹配不能推断来源。图可能有多个来源，需按来源和正文版本处理确认状态。

## Open Questions

完整计划待用户审核批准，具体字段与确认入口不得降低以上审计和隔离要求。
