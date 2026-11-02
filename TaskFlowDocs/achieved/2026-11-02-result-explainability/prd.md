# 融合结果可解释化：暴露 votes 分解与约束失效标记
> Task version: v1
> Status: completed

## Goal

`dg` 的融合结果对调用者是个黑盒：`fusionScore` 是一个裸的 RRF 数值（实测 `0.01639344262295082`），既不说明「有几家引擎返回了这条」，也不说明「某家引擎排第几」。同时，**用户要求的搜索引擎没响应、或者用户要求的过滤条件可能没生效**，输出里都没有任何提示。

两件事一起修，因为它们都在回答同一个问题：**这个结果集在多大程度上是用户要的那个结果集？**

## Background / Confirmed Facts

全部在 2026-11-02 对本机 SearXNG (`http://localhost:3668`) 实测。

### 事实 1：SearXNG 已经返回了分解所需的一切，`service.ts` 把它们丢了

原始响应里每条结果都带 `engines` 和 `positions` 两个数组：

```json
{"engine":"bing", "engines":["bing","brave"], "positions":[1,2], "score":1}
{"engine":"bing", "engines":["bing","brave"], "positions":[3,6], "score":0.5}
{"engine":"bing", "engines":["bing","brave"], "positions":[10,9], "score":0.333}
```

`engines` 与 `positions` **等长对齐** —— 第 i 个引擎在第 i 个名次。

而 `service.ts:147-156` 的映射只取了 `item.engine`（单值），`engines` / `positions` 被丢弃：

```ts
const results: SearchResult[] = (data.results || []).map((item: any) => ({
    ...
    engine: item.engine || 'unknown',
    ...
}));
```

**这意味着分解不需要自己重算 RRF —— 数据源已经算好了。** 这是本任务最大的简化：不必改 `rrf.ts` 的算法，只需要把已有的事实透传出去。

### 事实 2：多引擎命中是少数情况，但正是要解释的那种

`q=python+tutorial&engines=bing,brave,mojeek`：32 条结果，`engines` 长度分布 `{1: 29, 2: 3}` —— 29 条单引擎，3 条双引擎。

`q=rust+async+runtime&engines=bing,brave,mojeek`：36 条结果，**0 条**多引擎命中。

所以「几家返回」这个字段多数时候是 1。它的价值在于标出那少数几条 —— 一条被两家独立引擎同时排进前列的结果，和被一家排进去的，可信度不同。

### 事实 3：未响应的引擎带原因，且格式是有序对

```json
"unresponsive_engines": [["duckduckgo","CAPTCHA"],["google","Suspended: access denied"]]
```

`search()` 已经把它映射进 `SearchResponse.unresponsiveEngines`（取了 `item[0]`），但**只保留引擎名，把原因丢了**，而且打印层完全不展示它。

### 事实 4：过滤条件是「全局请求参数」，但引擎支持不一

`--time` / `--lang` 是发给 SearXNG 的全局参数（`service.ts:130-136`），由 SearXNG 决定转给哪些引擎。不同引擎对 `time_range` 的支持并不一致，而当前输出**不标记任何一个结果是否真的遵守了该约束**。

实测：`-e google,bing,duckduckgo -l 5` 时 google 和 duckduckgo 均 unresponsive，只剩 bing 的结果 —— 用户设的引擎限制实际上只生效了三分之一，输出却看不出这点。

## Requirements

- R1 — 每条结果能回答「有几家引擎返回了它、分别排第几」，且这个信息来自 SearXNG 的 `engines`/`positions`，不另算。
- R2 — 未被任何引擎响应的引擎名与原因要出现在输出里，而不是只留在 `SearchResponse` 内部。
- R3 — 用户请求了 `--time` 或 `--lang` 时，输出要能指出「该约束可能未被所有来源遵守」，而不是静默当作已生效。
- R4 — 现有 `fusionScore` 保留（它是排序依据），新增字段是**附加**的，不改变现有字段语义。
- R5 — `-f md` 与 `-f json` 两种格式都要能看到这些信息；md 要简洁，json 要完整。

## Acceptance Criteria

- AC1 — `SearchResult` 新增可选 `votes?: Array<{engine: string; position: number}>`，由 `service.ts` 从原始 `engines`/`positions` 映射而来。
- AC2 — `engines` 与 `positions` 长度不一致时不猜测：整条 `votes` 省略，不填半个。
- AC3 — `SearchResponse` 的未响应引擎保留原因，例如 `unresponsiveEngines: Array<{engine: string; reason: string}>`；若改变既有类型，需同步全部调用点。
- AC4 — JSON 输出中每条结果含 `votes`（当且仅当有数据），顶层含未响应引擎及其原因。
- AC5 — Markdown 输出中，被两家及以上引擎返回的结果标注出来（例如 `[2 engines: bing #1, brave #2]`），未响应的引擎列在结果区之外。
- AC6 — 存在 `--time` 或 `--lang` 时，输出中有一条明确说明该约束的适用范围未经各引擎确认。
- AC7 — 全部现有测试通过；新增测试覆盖：多引擎命中、单引擎命中、`engines`/`positions` 不等长、未响应引擎含原因。

## In Scope

- `cli/src/service.ts` — 映射 `engines`/`positions`，保留未响应原因
- `cli/src/deep/fuse.ts` — 融合时保留 `votes`（当前 `{...original}` 会带上，需验证）
- `cli/src/runCli.ts` — JSON 与 Markdown 两个输出路径
- `cli/test/` — 对应测试

## Out of Scope

- **改 RRF 算法本身。** `rrf.ts` 不动。SearXNG 已经给了名次，没有理由再算一遍，更没有理由算两套并存。
- **按引擎质量做路由。** 那是 treg 借鉴清单里的「低优先级」项，需要长期统计数据，本任务不做。
- **给不同引擎的 `positions` 赋予不同权重。** 目前所有引擎等权。引入权重需要先有依据，现在没有。
- **`ignored_filters` 的完整实现。** SearXNG 并不逐条返回「哪个引擎忽略了我的哪个过滤条件」；本任务只做**保守的提示**（R3），不假装知道具体哪条被忽略。

## Risks / Deferred Items

- **风险：`votes` 会让输出变大。** 每条结果最多 N 个引擎，通常 N=1。JSON 增加约 40 字节/条。加一个「只有多于一个引擎时才输出」的门槛可以避免噪音 —— 但那会让单引擎情况下的信息丢失。取舍见 Step 1。
- **风险：`unresponsiveEngines` 改类型是破坏性变更。** 它目前是 `string[]`，改成对象数组会影响所有读取点。备选是新增 `unresponsiveDetails` 而保留 `unresponsiveEngines`，但这会留下两个真相来源。倾向直接改，调用点有限。
- **延后：过滤条件的逐引擎归因。** 需要 SearXNG 暴露更多信息，或自己按引擎发请求，成本高。先做保守提示。

## Open Questions

无。用户已确认做这两个方向，其余不做。
