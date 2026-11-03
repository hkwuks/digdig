# D1 — 重复导入正文降级已批准结果并剪掉语义图
> Task version: v1
> Status: completed

## Goal

重复导入一份**逐字节相同**的抽取正文，不应撤销既有的批准决定。当前实现会把已批准结果降级为 `pending`，并因此永久剪掉它的语义图节点与边。

## Background / Confirmed Facts

以下每条都在 2026-11-03 实测于 `/tmp/d1`（CLI `0.0.4`，`results-add` → `--quality --approve-file` → `graph-add` → 再次 `results-add`）：

1. `cli/src/deep/session.ts:441-444` 在 `inferredContentType(input) === 'extracted'` 分支内无条件执行 `existing.status = 'pending'`，没有任何前置条件。同一函数中它上下相邻的五处写入全部带守卫（`content`、`extractor`、`extractedAt`、`skippedAt`、`failure*`）。
2. 同文件另一条抽取写入路径 `recordExtractionOutcome:659` 对同一语义写的是 `if ((changedBody || wasSkipped) && result.status === 'approved')`。两处口径不一致，且带守卫的那处有注释说明意图。
3. 该赋值使 `changed = true` → `touch()` 令 `revision` 自增 → `:481` 的 `repairInvalidDependents` 把该结果计入 `invalidReasons`（理由 `contentChanged`）。
4. `repairInvalidDependents` 随后调用 `:539 pruneGraphProvenance(graph, resultId)`，把 `sourceResultIds` 含该 id 的节点与边**物理删除**（`:249-275`），并删掉 result 节点自身（`:277`）。graph.json 原子写回，无 tombstone、无备份。
5. 实测序列：approved（rev 2，图 5 节点 3 边，含 `e:tokio` / `e:rust`）→ 重复导入相同正文 → pending（rev 4，图 **0 节点 0 边**）→ 重新 approve → 3 节点 2 边，只剩结构性 `q:`/`r:`/`d:`，语义实体与 `tokio --written_in--> rust` 不恢复。
6. 触发入口有两个：`commands/results-add.ts:82`（`--kind extracted`）与 `deep/local-doc/searcher.ts:212`（`doc-search`，硬编码 `contentType: 'extracted'`）。`doc-search` 每次检索都会重新灌入命中文档，索引未变时正文与 `extractedAt` 都不变，因此**常规检索即可触发**。

## Requirements

- R1：`appendSessionResults` 仅在正文确实变化（`bodyChanged`）或该结果此前被 skip（`wasSkipped`）时，才把 `approved` 降级为 `pending`。
- R2：判据与 `recordExtractionOutcome` 保持一致——`extractor` 与 `extractedAt` 的变化不单独构成降级理由。
- R3：`skippedAt` 的清除与 failure 计数的清除行为不变（仍然无条件执行）。
- R4：语义图的剪除逻辑本身不改。本任务只消除误触发的降级，不改变"正文真的变了就剪图"的既有设计。

## Acceptance Criteria

- AC1：对一份已批准结果重复导入逐字节相同的正文后，`status` 仍为 `approved`，`revision` 不变。
- AC2：同一场景下 graph.json 的节点数与边数不变，语义实体（如 `e:tokio`）仍在。
- AC3：正文**确实不同**时，结果仍然降级为 `pending`，且有证据/图剪除仍照常发生（由既有测试 `repairs prior evidence, reviews, and graph data after an imported body changes` 覆盖）。
- AC4：新增回归测试在回退该修复后失败。
- AC5：`npm test` 全量通过（当前基线 566 用例 / 42 文件）。

## External Facts

- Depends on external facts: no
- Why not: 结论全部来自本仓库源码与本地实测：缺陷在 `cli/src/deep/session.ts:441-450`，正确写法对照在 `cli/src/deep/session.ts:659`，剪图下游在 `cli/src/deep/session.ts:514-559`，触发调用点在 `cli/src/commands/results-add.ts:82` 与 `cli/src/deep/local-doc/searcher.ts:212`。不依赖任何外部版本、规范或第三方行为。

## In Scope

- `cli/src/deep/session.ts` 的 `appendSessionResults` 降级判据。
- `cli/test/integration/session.test.ts` 的回归测试。

## Out of Scope

- 语义图剪除策略本身（是否应改为标记 stale 而非物理删除）——这是独立的设计问题，不属于本任务。
- `--quality` 的 `source` 字段恒为 `digdig`（P9）。
- `round` 盖成当前轮（D2）。
- 其余 P/C/D 条目。

## Risks / Deferred Items

- 风险：若某条可用的导入路径**依赖**每次导入都刷新批准状态（例如外部工具借此触发复核），本修复会改变其行为。已核对两个调用点（`results-add`、`doc-search`）均无此依赖。
- 已暂缓：正文真变时仍物理剪图，agent 无法预知也无法挽回。见 Out of Scope。

## Open Questions

无。
