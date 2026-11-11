# PRD — 真实抽取方法与正文保留
> Task version: v1
> Status: in_progress

## Goal

修复 C14 以及 D11 中正文抽取相关的摘要覆盖、短正文丢失和长度口径问题；保留 D11 的其他未处理子项。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

- `commands/extract.ts` 根据命令选项写 `extractor`，覆盖 `ExtractedContent.method`，默认和回退路径可能记错。
- `ContentExtractor.extract` 将不足 100 代码单元的非空结果标记失败，命令层短正文测试使用模拟结果，未覆盖真实抽取器；当前不到 50 时在启用 Obscura 时才尝试回退。
- `recordExtractionOutcome` 接受空摘要并覆盖已有搜索摘要；Defuddle `length` 可能是词数，而其他抽取器是字符数。
- D11 原有图写入已在 PR #56 修复；本次仅覆盖抽取相关三项，其他内容保留待复核。

## Requirements

- 采集到的实际 `method` 应进入当前会话 result 的 `extractor`；默认与显式调用不能误报回退结果。方法确实未知时标明未知，不猜测。
- 保留现有回退条件；在没有更好结果时，非空正文不只因长度而失败。空正文、网络错误和真正工具错误仍按现有失败规则处理。
- 空串或纯空白摘要不覆盖已有摘要；非空摘要可更新。
- 新抽取正文的 `length` 和写入的 `contentLength` 使用正文的 JavaScript 字符串长度（UTF-16 代码单元）；不批量重写历史记录。

## Acceptance Criteria

- 真实默认 Defuddle 和启用 Obscura 回退路径的方法能够在命令输出和 SQLite 会话读回时正确对应；Jina 与显式模式也覆盖。
- 真实短正文与回退不可用场景成功保留；空白正文、网络和工具错误不被伪报成功。
- 空白摘要保留原摘要；非空摘要更新；中文及 emoji 下长度口径一致。
- 旧会话不批量改写；相关 CLI、持久化、完整测试、类型检查、构建及 CI 通过。

## External Facts

- Depends on external facts: no
- Why not: 现有实现和测试在 `cli/src/deep/extractor.ts`、`cli/src/commands/extract.ts`、`cli/src/deep/session.ts`，行为可由隔离测试直接验证。

## In Scope

C14、D11 的抽取摘要/短正文/长度子项及必要调用方、测试、说明和待办状态；保持既有会话存储设计。

## Out of Scope

抽取优先级或插件方案研究、改动网络访问边界、历史数据批量修复、D11 图采样/图来源计数/本地文档标题、发版。

## Risks / Deferred Items

短正文可能并非完整内容，成功只表示取得非空正文，采信由 Agent 决定；旧数据中来源和长度错误无法无依据恢复。

## Open Questions

若现有实现不能无损满足用户确认的回退或长度语义，应先停下核对。
