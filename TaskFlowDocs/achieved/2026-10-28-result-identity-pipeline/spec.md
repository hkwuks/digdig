# Spec — 统一搜索结果身份与排序流转

> Task version: v1
> Status: ready

## 1. 边界与职责

改动落在三层，每层只有一个负责人：

| 层 | 现有位置 | 承担 | 不承担 |
|---|---|---|---|
| 身份 | `deep/dedupe.ts` | 把任意结果折叠成可比较的 key | 不知道 provider、不知道轮次、不知道状态 |
| 流水线 | `runCli.ts` 内新函数 | 把 N 份响应变成一份有序结果 | 不知道 provider 的 HTTP 细节、不写格式化 |
| 存储 | `deep/session.ts` | 落库、合轮、去重写入 | 不知道响应来自哪个 provider 组合 |

现状的问题是这三层的边界被穿透：`runCli.ts` 自己在三处做 URL 规范化（`:692-699` 用 `resultUrlKey`，`:755,770,826,847,855` 用 `normalizeUrl`），`service.ts` 里也有一份 `dedupe` 调用，而 `session.ts` 的 `needsRound` 实际上在决定"什么算一轮"。

## 2. 身份层

### 2.1 唯一入口

`dedupe.ts` 保持为唯一身份模块，对外只暴露一个用于结果 identity 的函数：

```ts
export function resultUrlKey(result: { url: string; source?: string }): string
```

`normalizeUrl` 降级为模块内部实现（不再被 `runCli.ts` 引用，不再从 `deep/index.ts` 桶导出）。它承载的两条规则不变：

- 非本地 URL：去掉 fragment、去尾斜杠、排序 query 参数
- 本地文档（`source === 'local'` 或 `file:` 协议）：保留 fragment（`#chunk-N`）

**本任务不新增归一化规则**（不折叠 http/https、`www.`、`utm_*`、`/amp/`、`m.`）。理由见 PRD 风险段：新增折叠会改变已有 session 的 `resultId`，使旧 `graph.json` 节点不再匹配。扩展归一化是跟进项，不是本任务。

### 2.2 全部切换点

| 位置 | 现在 | 改为 |
|---|---|---|
| `dedupe.ts:36 dedupeByUrl` | `normalizeUrl(item.url)` | `resultUrlKey(item)` |
| `runCli.ts:755` | `normalizeUrl(r.url)` | `resultUrlKey(r)` |
| `runCli.ts:770` | `normalizeUrl(r.url)` | `resultUrlKey(r)` |
| `runCli.ts:826` | `normalizeUrl(r.url)` | `resultUrlKey(r)` |
| `runCli.ts:847` | `normalizeUrl(result.url)` | `resultUrlKey(result)` |
| `runCli.ts:855` | `normalizeUrl(result.url)` | `resultUrlKey(result)` |

`dedupeByUrl` 改用 `resultUrlKey` 后，`dedupe()` 对其三个调用方的行为一并改变：`service.ts:161`（SearXNG，只处理 http 结果，无影响）与 `commands/extract.ts:55`（抽取正文去重，见 2.4）。

### 2.4 `commands/extract.ts` 另有第三套身份

`extract.ts` 不经过任何 identity 函数，用裸 URL 字符串做三次相等判断：

- `:33` `new Set(loadSessionResults(...).map(r => r.url))` — 判断 `--urls` 是否都是本 session 的结果
- `:56` `new Set(extracted.map(r => r.url))` — 判断哪些抽取正文被保留
- `:57` `retained.has(response.url)` — 同上

后果：`https://x.com/a/`（存进 session 时的形式）与 `https://x.com/a`（`--urls` 传入的形式）会被判为"不是本 session 的结果"，报 `UNKNOWN_SESSION_URL`。而 `appendSessionResults` 用的是 `resultUrlKey`，两者本来认作同一条。

改为：三处都用 `resultUrlKey`。这是本任务"一个身份"承诺的一部分 —— 否则 `extract` 仍是一处外部可观察的不一致。

`:55` 的 `dedupe(valid)` 保留（它是内容去重，不是身份去重），但它对 `file:` 结果的 chunk 语义随 2.2 一并修正。

### 2.5 `resultId` 少传 `source`

`graph.ts:81-82` 是 `resultUrlKey({ url })`，**没有传 `source`**。所以 `resultUrlKey` 里 `result.source === 'local'` 那一支从 `resultId` 永远进不去，只剩 `file:` 前缀这一支在兜底。

当前不出问题纯属巧合：本地文档的 URL 恰好是 `file://`。只要有任何一处用 `source: 'local'` 配非 `file:` URL，`resultId` 就会丢 fragment 而 `session.ts` 不丢，两边 id 分叉。

本任务不改 `resultId` 的签名（调用点都在图侧，改动会扩散），但把这一支记入 Follow-ups：要么删掉 `source` 分支（承认身份只看 `file:` 协议），要么让 `resultId` 接受完整结果对象。二选一需要一次显式决定。

### 2.3 不变量

- 对任意 `{url}`，`resultUrlKey` 是纯函数，幂等：`key(key(x)) === key(x)`。
- 对非 `file:`/`local` 结果，fragment 不参与身份。
- 对 `file:`/`local` 结果，fragment 参与身份。

## 3. 排序流水线

### 3.1 单一函数

`runCli.ts` 新增一个模块级函数，**两条搜索路径都只调用它**：

```ts
interface PipelineInput {
    responses: Array<{ query: string; provider: string; results: SearchResult[] }>;
    extraRankings?: Array<Array<{ id: string }>>;   // --merge 文件
    sessionDir?: string;
    limit: number;
}

interface PipelineOutput {
    display: SearchResult[];        // 要打印的
    fused: Array<{ id: string; score: number }>;
    byKey: Map<string, SearchResult>;
    currentKeys: Set<string>;
}

function fuseResults(input: PipelineInput): PipelineOutput
```

`queries.length === 1` 只是 `responses` 长度为 1..N 的特例，不再有第二条分支。

### 3.2 步骤

按顺序，不可调换：

1. **份内去重**（R3）。每份 `response.results` 按 `resultUrlKey` 去重，保留首次出现者与其原始下标。这一步保证"每份 ranking 内 id 唯一"，是 RRF 正确性的前提（`rrf.ts:24-31` 不做这个检查）。
2. **建 ranking**。每份去重后的响应变成一份 `[{id: resultUrlKey(r), ...r}]`。`--merge` 的历史结果作为额外一份。
3. **读历史**（R4 的关键）。若给了 `sessionDir`，在**任何写入之前** `loadSessionResults`，作为最后一份 ranking。
4. **融合**。`rrf(rankings)`。同一个 id 出现在多份 ranking 中会被累加 —— 这正是"被多个 provider / 被历史印证"的正确表达，跨 provider 去重由此自然完成，不需要额外的合并策略。
5. **建查找表**。先放历史，再放本轮，本轮覆盖历史（本轮内容更新）。key 仍是 `resultUrlKey`。
6. **显示集**。带 `--session` 时，`display = fused.filter(x => currentKeys.has(x.id))`；不带时 `display = fused`。截断到 `limit` **在这之后**，且只截一次。
7. **落库**（R4）。带 `--session` 时，只 `appendSessionResults` 一次，输入是 `display`（已带 `fusionScore`），每个条目附上它在所有响应中的 origins。

第 3 步在第 7 步之前，是 R4 的全部内容：历史快照不含本轮，本轮不会给自己投票。

### 3.3 origins 归并

现在多查询路径用 `normalizeUrl` 建 `originsByUrl`（`:844-852`），单查询路径只给单一 query 的单一 origin（`:676`）。统一后：扫一遍所有 `responses`，按 `resultUrlKey` 累积 `{tool, engine, query}`，查询取该响应自己的 `query`。单查询只是响应数少，逻辑不分叉。

### 3.4 元数据

`suggestions` / `answers` / `unresponsiveEngines` 不属于排序，保留现有 `mergeResponses` 的合并方式（SearXNG 优先作为 base，其余累加去重）。`mergeResponses` 的 `results` 字段不再被任何人使用 —— 它的结果合并职责移交给流水线。

### 3.5 `rank` 在融合后失效

`session.ts:456-460` 在合并时按 last-writer-wins 覆写 `score / fusionScore / retrievedAt / rank / publishedDate`，而 **`rank` 从不因融合而重算**。结果是一条 session 记录的 `rank` 可能仍是 provider 的原始位次，而它的 `fusionScore` 是 RRF 分 —— 两个字段描述不同的顺序。

`graph.ts:166` 又用 `rank: r.rank ?? i + 1` 把它写进图节点，`graph.ts:175` 用 `weight = 1/(i+1)` 按**融合后的数组位置**给边加权。于是同一个"排名"在图里有两个来源：节点属性来自 provider，边权来自融合位置。

本任务的流水线在写库前统一设定 `rank`：融合后的位次即 `rank`，与 `fusionScore` 同源、同序。这样 `session.ts` 的覆写行为不再是"可能覆盖成另一个坐标系的数"，`graph.ts:166` 的 fallback 也只在图由非流水线路径构建时生效。

### 3.6 `totalResults` 在融合前后不一致

`runCli.ts:711`（单查询）用 `results.numberOfResults`，这是 `mergeResponses` 对**各 provider 自报数量**求和，包含被去重掉的那些；`:871`（多查询）用 `allResults.length`，是**去重前**的数组长度。两者的共同点是都不等于实际输出的条数。

流水线统一后，`totalResults` 定义为 `fused.length`（去重后的候选总数），`returnedResults` 保持 `display.length`（截断后实际输出）。两者语义分离且各自可解释。

## 4. 轮次语义

### 4.1 只有搜索开新轮

`session.ts:185 needsRound` 改为：**输入是搜索类结果，且带有非直接来源（agent/工具）的、尚未指定 round 的 origin** 时才为真。

```ts
function needsRound(result: SessionResultInput): boolean {
    if (inferredContentType(result) !== 'search') return false;
    return (result.origins ?? []).some(origin => !isDirectOrigin(origin) && origin.round === undefined);
}
```

抽取正文（`contentType: 'extracted'`）、本地文档导入都不再开新轮。

### 4.2 非搜索输入的 round 归属

`appendSessionResults` 现在的 `importRound` 只在 `needsRound` 为真时赋值，否则 `undefined`（`:394`）。`undefined` 的 origin 会被三处消费方以三种不同方式解释，这正是 `recovery-analysis.ts:61` 把它算第 0 轮、`query-suggest.ts:146` 算第 2 轮的原因。

改为：**importRound 总是有值** —— `Math.max(1, round)`。搜索输入拿到的是递增后的新轮；抽取输入拿到的是当前轮，即"补全第 N 轮的正文"。

这样 `origin.round` 永不为 `undefined`，三处消费方不再需要各自的兜底，`recovery-analysis.ts:61` 的 `?? 0` 与 `query-suggest.ts:146` 的 `?? entries.length + 1` 成为死分支，可一并删除。

### 4.3 移除 `skipRoundIncrement`

`schema.ts:378` 的 `options?.skipRoundIncrement` 只有一个调用者（`local-doc/searcher.ts:211`），用途是"本地文档不新增一轮"。新语义下本地文档是 `extracted`，本来就不开新轮，flag 失效。删除该选项与该调用点。

## 5. 覆盖度事实

### 5.1 为什么不是进度计数

轮次数、待审批条数、域名数是**运行状态**，它们回答"跑了多少"，不回答"查到了哪些方面"。后者是决策需要的信号，前者对"下一个查什么"没有指导作用。

也**不由命令行算法推导**。第 3.4 节（已写入 `docs/agent_search_integrated_report_2026-10-27.md`）记录了实测结论：词袋无法把同一方面的不同措辞归为一组（同方面余弦 0.102、跨方面 0.012、cos≥0.3 时全部散成单点簇），而引入 embedding 才能解决——代价是模型与索引。因此方面与缺口的判断交给调用方，CLI 只交付计数。

同样**不读图谱**。图的结构层由已批准结果构建，在决策尚未作出时为空；实测三轮搜索、未审批的 session 根本没有 `graph.json`。

### 5.2 新模块

`deep/coverage.ts`，一个纯函数：

```ts
export interface RoundFacts {
    round: number;
    queries: string[];
    engines: string[];
    /** 本轮首次见到结果数 */
    newResults: number;
    /** 本轮结果中被更早轮次已见过的条数 */
    repeatedFromEarlier: number;
    titles: string[];
}

export interface CoverageReport {
    rounds: number;
    uniqueResults: number;
    byRound: RoundFacts[];
    /** 出现在多于一轮的 URL */
    repeated: Array<{ url: string; rounds: number[] }>;
    /** 只出现在一轮内、且至少两条结果共用的词 */
    distinctiveTerms: Array<{ term: string; round: number; docFreq: number }>;
}

export function buildCoverage(
    results: SessionResult[],
    rounds: number,
    options?: { titlesPerRound?: number; maxTerms?: number }
): CoverageReport
```

输入只有已加载的 `SessionResult[]` 与轮数。不读文件、不读图、不写任何东西。

### 5.3 归属规则

- **一条结果只属于首次见到它的轮次**。同一 URL 被两轮都返回时，`newResults` 只在首轮计一次；后续轮次把它计入 `repeatedFromEarlier`。这是"重跑一遍看起来很有产出"与"实际没有新信息"的唯一区分点。
- **即使一轮的结果全部是旧的，该轮仍出现在 `byRound` 里**，并带着它自己的查询。整轮零新增正是饱和的信号，不能因为 `newResults === 0` 就把它丢掉。
- **`distinctiveTerms` 的判据是"跨轮排他"而非"词频高低"**：一个词若在多于一轮中出现，它属于会话主题（`tokio`、`async`），不属于任何单一轮次；只在某一轮内出现、且至少被该轮两条结果共用的词，才是那一轮真正看的对象。这修正了 `tfidf.ts` 按 `tfSum × idf` 排序导致的"越普遍越靠前"。
- **正文来源是 `result.content || result.excerpt`**。零抽取时 `content` 为空，搜索返回的正文片段只在 `excerpt` 里；只读 `content` 会让词表在真实零抽取 session 上恒为空。
- **域名统计按 `URL.hostname` 去 `www.` 前缀并小写化**。`file:` 结果没有 host，不参与统计，也不被计入空名桶。`untouchedSpecialized` 从固定的信息源清单里减去实际命中过的域名求得 —— 清单是硬编码的，因为"某个 host 对这个问题算不算一手来源"不是 hostname 能回答的。

### 5.4 出口

独立子命令 `dg coverage <session>`，`--format json`（默认）或 `md`。

**不并入搜索输出。** 搜索输出已按 R6 收敛为"仅本轮结果"，把跨轮统计塞回同一响应会把刚消除的耦合重新引入。

### 5.5 与现有命令的关系

`suggest-queries` 的 `unexploredDomains` 并入本命令（`untouchedSpecialized`），因为它是唯一一个不依赖图谱、且实测有效的字段。其余两个字段不再被本命令替代，而是留给 `suggest-queries` 自身的存废决定：

- `topEntities` 实测全为 `degree: 0, frequency: 1` —— 没有边就没有度数，`degree × frequency` 排序退化成只按 frequency，"哪个实体更有前途"这个信号不存在。
- `roundHistory[].resultCount` 数的是图里的 result 节点，而图只含已审批结果（实测 4/10）。它还收进了 `results-add --query` 传入的导入标签（实测 `probe` 混进第 2 轮）。

`suggest-queries` 的删除依赖任务 C 先行：它的 `qualityLastRound` 来自 `assessLatestResultQuality` 的 verdict，而任务 C 要删掉 verdict。本任务只搬运域名事实。

## 6. 兼容性

- **输出契约**：`session.overview` 是纯新增字段。`results` 数组的**内容**改变 —— 从"整库融合后"变成"本轮融合后"。这是 R6 的既定决策，不是兼容性缺陷。
- **磁盘格式**：`results.json` 结构不变。`origins[].round` 从"可能缺失"变成"总是存在"；旧数据仍可读，`?? 0` 兜底在删除前对其无影响。
- **id 稳定性**：`resultId` 的输出在本任务前后完全一致（规范化规则未变，只是调用点统一）。不需要迁移。
- **配置**：不新增环境变量、不新增配置文件字段。

## 7. 错误语义

- 任一 provider 抛错：保持现有行为，整体失败进 `runCli.ts:880` 的 catch。本任务不改变错误分类（那是 F5 的范围）。
- `--merge` 文件不可读：现有 `MERGE_FILE_FAILED` 信封保留，但在流水线之前返回，不产生半写入。
- 空响应：`fuseResults` 在 `responses` 全空时返回空 `display`，`appendSessionResults` 不被调用（不产生空轮）。

## 8. 测试约束

| 层 | 测试类型 | 位置 |
|---|---|---|
| 身份 | 单元 | `test/unit/deep/dedupe.test.ts`（扩充：chunk 保留、fragment 丢弃、幂等、dedupeByUrl 用新 key） |
| 融合 | 单元 | `test/unit/deep/rrf.test.ts`（扩充：份内重复 id 不再双计） |
| 轮次 | 集成 | 新增：搜索→抽取→rounds 不变、verdict 不变 |
| 流水线 | 集成 | 新增：单/多查询等价、只显示本轮、`--merge` 参与排序、`fusionScore` 落库 |
| 概况 | 单元 | 新增 `test/unit/deep/session-overview.test.ts`：零审批、多轮合一、被多轮引用只计首次 |

集成测试用现有桩服务模式（见 `test/integration/`），不依赖真实 SearXNG 与 API key。

## 9. 设计取舍

**为什么不把身份模块改名成 `identity.ts`。** `dedupe.ts` 已经是它，文件改名会让所有 import 与 `deep/index.ts` 桶、测试路径一起动，收益只是名字更准。R1 要求的是"只有一个答案"，不是"换个文件名"。

**为什么 RRF 不做跨 provider 合并。** 同一个 URL 被两个 provider 返回，用 RRF 累加就能表达"被两方印证"，不需要先合并成一条再给加权。先合并反而要求决定"两个 provider 的分数怎么合"，而 `score` 在不同 provider 之间不可比（0–1 / 0–3）。让它们各自占一个位次、由 RRF 加和，是不需要跨 provider 标定的唯一做法。

**为什么 overview 不读图。** 见 PRD：图只在审批后存在，恰恰缺失"还没处理的"。overview 的原料全部在 `results.json`。

**为什么显示集截断只做一次。** 现在 `service.ts:163`、`runCli.ts:706`、`runCli.ts:839` 三处截断，语义分别是"provider 侧上限""显示上限""融合后上限"，第三个才是用户可见的 `--limit`。前两个保留（provider 侧确有 API 上限），但融合后的截断在流水线里只出现一次。

**为什么保留 `Math.min(limit ?? N, cap)` 的 provider 上限。** 那是 provider 的 API 约束（Ollama 10、DeepSeek 50），不是显示策略。但它现在会静默地把 `--limit 20 -e ollama` 变成 10 —— 本任务不改这个数值，只在 spec 中记录它是已知的静默截断。

## 10. 实施顺序

1. 身份层切换（2.2 的六处）—— 独立可验证，先做
2. 轮次语义（第 4 节）—— 依赖 1 的 key 一致，但代码上独立
3. 流水线（第 3 节）—— 依赖 1、2
4. 进度概况（第 5 节）—— 依赖 2（round 总是存在才能可靠分组），与 3 独立
5. 文档与死分支清理（4.2 末尾、`CLAUDE.md`）
