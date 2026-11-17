# PRD — 搜索结果的空项过滤与内容去重收拢到统一入口
> Task version: v1
> Status: completed

## Goal

三个 provider 返回的搜索结果必须经过同一套卫生处理：丢掉标题或正文为空的条目，再按 URL 与内容相似度去重。目前只有 SearXNG 这一条路径做（`cli/src/service.ts:241` `filterEmptyResults` + `:245` `dedupe`），`OllamaService` 与 `DeepSeekService` 原样返回，空标题项与近重复正文直接进入融合、显示与会话存储。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

1. **SearXNG 路径已做卫生处理。** `cli/src/service.ts:86-88` 的 `filterEmptyResults` 丢掉 `title.trim()` 或 `content.trim()` 为空的条目；`:241` 过滤，`:245` 走 `dedupe()`（URL 归一化去重 + 5-gram Jaccard 内容去重，阈值 0.92）。

2. **两个 provider 完全不做。** `cli/src/ollama-service.ts:64-72` 与 `cli/src/deepseek-service.ts:79-96` 都是 `raw.map(...)` 直接构造 `results`，`grep -n "filterEmptyResults\|dedupe" ` 在两个文件里 **零命中**。

3. **下游也没有兜底。** `cli/src/deep/fuse.ts` 的 `toRanking` 只按 `resultUrlKey` 做 **URL** 去重（`:53-65`），不看去重内容、不看标题正文是否为空；`projected` 阶段（`:111-118`）只是把融合结果映射回原对象。`cli/src/runCli.ts` 的显示路径（`:677-678`）直接吐 `fusion.display`，没有任何 `.filter()`。

4. **实测（v0.0.10 发布的 dist，桩服务替掉 axios）：**

   ```
   OLLAMA limit=20 -> 3 rows
      ""|https://empty.example/a          ← 空标题、空正文
      "Same"|https://a.example/x
      "Same again"|https://b.example/y    ← 正文逐字相同
   DEEPSEEK -> 1 rows: ""|https://empty.example/b
   ```

   同样输入走 SearXNG 路径时，空标题项被 `filterEmptyResults` 丢掉、逐字相同的两条被 `dedupe` 合成一条。

5. **`dedupe` 的调用顺序有意义。** `jaccardSimilarity('', '')` 返回 `1`，所以 `dedupe` 单独作用在正文全空的结果集合上会把它们全部合成一条（实测 3 条空正文 → 1 条）。必须先过滤再 dedupe，与 `service.ts:241-245` 的现有顺序一致。

6. **`filterEmptyResults` 目前是 `service.ts` 的模块内私有函数**（`:86`，无 `export`），`dedupe` 在 `cli/src/deep/dedupe.ts`，两者都不在 provider 能顺手复用的位置。

7. **归档任务已记过这条但没进 todo。** `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/plan.md` 的 Follow-ups 写「providers 自身不过滤：`ollama-service.ts` / `deepseek-service.ts` 不过滤空结果」，`prd.md` 的 Out of Scope 又写「provider 端是否补过滤/去重（R3 在合并处统一处理）」。实际合并处（`fuse.ts`）只做了 URL 级去重，正文级去重和空项过滤并没有补上。

## Requirements

- **R1 — 单一卫生入口。** 所有 provider 的结果在进入融合前经过同一处过滤 + 去重，不在三个 provider 里各写一遍。
- **R2 — 顺序固定。** 先丢空项，再做内容去重；不允许 dedupe 先于过滤。
- **R3 — 与 SearXNG 语义一致。** 判定规则沿用现有实现：标题与正文都非空才保留；URL 归一化用 `resultUrlKey`，内容相似度用 5-gram Jaccard 阈值 0.92。
- **R4 — 不改 provider 协议。** `SearchResponse` 的形状、`numberOfResults` 字段、错误分类与 `--limit` 行为（含各 provider 的上限）都不动。

## Acceptance Criteria

- **AC1** — 桩服务返回空标题/空正文条目时，`dg -e ollama` 与 `dg -e deepseek` 的显示结果里不含该条目。
- **AC2** — 桩服务返回两条正文逐字相同、URL 不同的条目时，只保留一条。
- **AC3** — 正文为空的多条结果全部被丢弃，一条也不保留。
- **AC4** — SearXNG 路径行为不变：现有 `dedupe-results.test.ts`、`service` 相关测试全绿。
- **AC5** — `--limit` 在当前达到上限前仍然生效；`totalResults` 等于过滤去重后的候选总数。

## External Facts

- Depends on external facts: no
- Why not: 全部是仓库内的映射与融合逻辑，`axios` 已被既有测试以 `vi.mock` 替换，可在本仓库完全复现；不需要真实 API key。

## In Scope

`OllamaService` 与 `DeepSeekService` 返回结果的空项过滤与内容去重，以及承载它的统一入口。

## Out of Scope

- `--limit` 在 provider 侧的上限截断（`ollama-service.ts:32` 的 10、`deepseek-service.ts:43` 的 50）—— 独立条目 `TF-20261116-f8776d`。
- `--merge` 导入结果的卫生处理（它们来自用户文件，语义不同）。
- 抽取路径（`commands/extract.ts`）已有的 `dedupe(valid)` 调用。
- 阈值集中化（`TF-20261116-e1c513`）。

## Risks / Deferred Items

- **风险：正文级去重会合并跨 URL 的转载稿。** SearXNG 路径今天已经这样，但对 Ollama/DeepSeek 是新行为：两个不同 URL 若正文相似度 ≥ 0.92，只保留先出现的一条。缓解：阈值 0.92 是 5-gram Jaccard，只有近乎逐字相同的正文才会命中；且被合并的 URL 在 `fuse.ts` 里按响应入口就被丢掉，不会留下「有 origin 无结果」的悬空记录。
- **风险：只丢 `title` 或 `content` 缺一的条目会减少结果数。** 沿用现有 SearXNG 规则（用户已确认），标题有正文无的条目会被丢掉。若日后 Ollama/DeepSeek 确有大量纯链接结果，可再放宽为「标题非空即可」。
- **延后：** provider 侧 `--limit` 上限截断的可见性。

## Open Questions

无。用户 2026-11-17 已决定两个落点问题：

- **落点 = `fuse.ts`。** 两个 provider 只有 `runCli.ts:352,356` 一处调用点，且结果必经 `fuseResults`，因此今天两种方案覆盖率等价；选 `fuse.ts` 是因为新增 provider 时自动获得过滤，不需要记得再调一次。`service.ts` 现有的过滤保留（它对 `SearXNGService.search()` 的直接调用者是既有契约），但改为复用同一份实现，不再各写一遍。
- **空项规则 = 标题与正文都非空。** 与 `service.ts:86-88` 一字不差，三条路径行为统一。
