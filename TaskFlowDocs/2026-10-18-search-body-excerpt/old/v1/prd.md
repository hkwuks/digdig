# 搜索期的正文不再被丢弃：`snippet` 显示位 + 正文落入 `excerpt`

> Task version: v1
> Status: in_progress

## Goal

一次搜索拿到的正文，今天在进入 session 的那一刻被删除，Agent 再也看不到它。本任务让它在两层各有一个明确的落点：

1. **搜索层**：`SearchResult` 增加可选 `snippet?: string`，承载"provider 给的、面向显示的一句话"。
2. **Session 层**：`content` 仍然是"provider 能给的最长正文样本"，写入既有的 `excerpt`，并让显示层成为它的读取方。

用户价值：搜索命中后不必先跑一遍 `extract` 才能看到摘要；而且 `excerpt` 一旦有人读，这次改动才不是"把丢弃改个名字"。

## Background / Confirmed Facts

**`SearchResult.content` 事实上是"正文样本"，不是摘要**（实测，10 条结果）

| Provider | 喂给 `content` 的字段 | 实测长度 |
| --- | --- | --- |
| SearXNG | `content` | 101–180 字符（短，与查询相关） |
| Ollama | `content` | **835–25,804**（中位 8,606），整页正文，占 stdout 94% |
| DeepSeek | `summary` | 3,171–5,075 字符（全文摘要，与查询无关） |

两个数量级的差异已经存在，只是没人分开对待。消费者却分成不兼容的两派：

| 想要 | 消费者 |
| --- | --- |
| 短、面向显示 | `formatAsMarkdown`（`cli/src/runCli.ts:70`）、pending 预览（`cli/src/runCli.ts:1644`） |
| 长、用于分析 | `tfidf.ts:71`、`co-occurrence.ts:42,109`、novelty（`quality-assess.ts:106`）、`dedupe.ts:91` |

**正文今天在进入 session 时被丢弃**（已核对源码）

`inferredContentType`（`cli/src/deep/session.ts:182-185`）只在 `content` 是字符串**且** `extractedAt` 是数字时判为 `'extracted'`；搜索 provider 的结果两者都没有，于是判为 `'search'`，随后 `makeResult`（`session.ts:200-203`）`delete` 掉 `content`、`extractor`、`extractedAt`。

2026-10-18 对真实 SearXNG 实测：`node dist/index.js "rust async runtime tokio" -e 360search --session /tmp/sess-probe` 存下 5 条，每条 `contentType: search`，`content` 与 `excerpt` 均**不存在**（不是空串）。provider 侧 `content` 确有 101–180 字符，是被 `makeResult` 删掉的。

**`excerpt` 今天没有任何读取方**（已核对 `cli/src/`）：每一处 `excerpt` 引用都是声明或写入 —— `results-add.ts:54,75`、`session.ts:36,62,420-421,599`、`extractor.ts` 的内层结构。`runCli.ts` 与任何输出路径都不读它。所以只写不读，等于把丢弃改个名字。

**`excerpt` 已是导入路径的既有约定**：`results-add --kind search` 用导入项的 `excerpt` 填写（`commands/results-add.ts:54`），并刻意把正文挡在 `content` 之外；`extractor.ts:158,172` 对提取结果用页面 description 填 `excerpt`。本任务是把原生搜索路径对齐到这条既有约定，不是新造槽位。

**不能提升到 extracted 层**（已核对源码）

`hasVerifiedContent`（`session.ts:300-309`）要求 `contentType === 'extracted'` **且** `extractor` 非空字符串。搜索 provider 结果要进这个集合，只能谎称一个不存在的 extractor。而这个集合不只是分析池：evidence 声明按**字符偏移**引用 `result.content` 并复核引文（`commands/evidence.ts:117-128` 的 `RESULT_NOT_APPROVED`、`OFFSET_OUT_OF_RANGE`、`QUOTE_MISMATCH`、`HASH_MISMATCH`），`resolveApprovedContent`（`claims/deterministic-checks.ts:43-52`）用同样方式解析来源。把 provider 摘要放进那一层，会给"不是它所指的那个页面"的文本盖上哈希校验过的引文。

**字段映射**（2026-10-18 用户决策，未实现）

| sxng 字段 | 角色 | DeepSeek | SearXNG | Ollama |
| --- | --- | --- | --- | --- |
| `snippet?`（新增，可选） | 显示：一句与查询相关的短文本 | `snippet` | 不填（`content` 本已 101–180） | 不填（由显示层截断） |
| `content` | 分析：能拿到的最长正文 | `summary` | `content`（同值） | `content` |
| `publishedDate` | | `date` | `publishedDate` | — |
| `score`（0–1） | | 不映射 | `score` | — |

DeepSeek 的 `snippet` **不得**映射进 `content`：那会白白扔掉免费拿到的正文，并让 DeepSeek 比 SearXNG 更嘈杂而不是更好。DeepSeek 的 `summary` 不需要 `need_content`，默认返回，`need_content` 只是在它之上再加一段更长的全文。

**刻意不映射的 DeepSeek 字段**：`rerank_score`（0–3）与 `authority`（0–4）——与既有 `score`（0–1）不同尺度，接入排序是另一项需单独决策的能力；`site_name`、`site_icon`。

## Requirements

**R1** `SearchResult`（`cli/src/service.ts:21-33`）增加可选字段 `snippet?: string`。纯增量、可选，不改变任何现有字段的类型或存在性。

**R2** `DeepSeekService` 的映射改为：`snippet: item.snippet`（缺省则 `undefined`），`content: item.summary || item.snippet || ''`（保持现有回退）。`publishedDate` 仍取 `item.date`。

**R3** `SearXNGService` 与 `OllamaService` 的映射**不变**：两者都不写 `snippet`，`content` 语义不动。

**R4** 显示层读 `snippet ?? excerpt ?? content`。两处写入方都要改：`formatAsMarkdown`（`runCli.ts:70`）与 pending 列表预览（`runCli.ts:1644`）。回退链必须是同一个表达式/同一个 helper，不得各写一份。

**R5** 搜索结果的正文在进入 session 时落进 `excerpt`，而不是被删除。落点在两层唯一的交界处 `appendSessionResults`：创建分支（`makeResult`）与更新分支（`session.ts:420-421` 现有 `excerpt` 写入处）都要覆盖，因为两条路径都会遇到 `snippet`。

**R6** `makeResult` 对 `search` 类型仍删除 `content`/`extractor`/`extractedAt`，且**不得**把 `snippet` 留在落盘的 `SessionResult` 上——session 层这一位字段的名字是 `excerpt`，两个名字同时存在就是同一件事两个名。

**R7** `hasVerifiedContent`、`contentType` 的语义、evidence 的偏移引用全部不动。搜索结果的正文是"provider 说的"，不是"校验过的"。

**R8** `excerpt` 的读取方在本任务中只有显示层。不新增 `graph-preprocess` / `quality-assess` / TF-IDF 的消费——那会绕过 `hasVerifiedContent` 的验证边界。

**R9** `cli/sxng.config.example.json`、README、`--engines-list`、provider 路由、错误语义均不在本次改动面内。

## Acceptance Criteria

- **AC1** `sxng "<query>" -e deepseek --format json` 中每条结果 `snippet` 等于接口的 `snippet`，`content` 等于接口的 `summary`；`summary` 为空串时 `content` 等于 `snippet`。可观测证据：单元测试断言映射；真实接口（需 key）or 固定响应夹具。
- **AC2** 未配 key 或未选 deepseek 时，任何 provider 的结果都不带 `snippet` 键（SearXNG/Ollama 行为零变化的证据）。
- **AC3** `sxng "<query>" --session <name> --format json` 之后，每条搜索结果的落盘对象 `contentType === 'search'`、`content === undefined`、`excerpt` 为非空字符串且等于 provider 给该条的 `content`；对象上**没有** `snippet` 键。
- **AC4** DeepSeek 结果在 `--format md` 下显示的是短 `snippet`，不是 3,171–5,075 字符的 `summary`；SearXNG/Ollama 的 md 输出与本改动前逐字节相同（它们没有 `snippet`，回退到 `content`）。
- **AC5** `--quality` 的 pending 预览对搜索结果显示该正文（此前为空），且 `verified: false`。
- **AC6** 搜索结果仍进不了 evidence 引用：`hasVerifiedContent` 为 false，approve/引用路径抛既有错误码。
- **AC7** `cd cli && npm run build` 通过；`cd cli && npm test` 通过（含新增/更新的单元测试）。

## In Scope

- `SearchResult.snippet` 字段与三个 provider 的映射（DeepSeek 改，SearXNG/Ollama 明确不改）。
- `session.ts` 内 `makeResult` 与更新分支的 `excerpt` 落点。
- 显示层回退链的两处写入方（`runCli.ts:70`、`runCli.ts:1644`）。
- 对应的单元/集成测试。
- 本任务的三份核心文档。

## Out of Scope

- **`process.exit()` 截断管道 stdout** —— 已按用户决策拆出为 `TF-20261018-282836`，见 `plan.md` 的 Related Tasks。
- 限制 md 输出的正文长度。用户决策：不改变现有长度；限流与 `process.exit` 一并留待独立任务。
- `rerank_score` / `authority` 接入 quality-assess 或 RRF 排序（需 key 实测，且是新能力）。
- 让搜索正文参与 TF-IDF / co-occurrence / novelty（会绕过 `hasVerifiedContent`）。
- 任何 provider 抽象层（接口/工厂/注册表）。
- `hasVerifiedContent`、`contentType`、evidence 偏移校验的任何修改。
- README / skill / config 示例的文档同步（`TF-20261017-83df6c` 另立）。

## Risks / Deferred Items

- **R-1 `excerpt` 的读者只有显示层。** 若后续有别的消费者要读，`excerpt` 已在落盘对象上，不必再改写入端。这是"只写不读"风险的缓解，不是消除：显示层是本任务唯一被要求的读取方。
- **R-2 与 `TF-20261018-282836` 的观测互相掩盖。** 本任务会加长 md 输出（Ollama 的 835–25,804 字符今日在 65,536 处被截断，改后完整输出），而那项任务也会改变同一段输出。两者必须分两次改动、分两次验收，否则无法判断是哪一个造成了输出变化。
- **R-3 回退链引入 `snippet` 后 md 输出变化。** DeepSeek 的 md 正文会从 3,171–5,075 字符降到 100–200 字符。这是本任务的目的，但属可观测行为变更，应在 PR 描述中写明。
- **R-4 真实 DeepSeek 接口验证依赖 key。** 上次的临时 key 已由用户注销。AC1 的接口侧验证因此以固定响应夹具为准；若要真实端到端，需要用户再次提供 key。
- **R-5 `SessionResultInput` 的索引签名。** 该类有 `[key: string]: unknown`，`snippet` 不经显式声明也能传进来。R6 要求显式删除，否则会静默落盘。

## Open Questions

- 无阻塞性未决问题。字段形状、层级归属与唯一读取方均已在 2026-10-18 决策完毕。

## Version History

- v1 — 初始版本。由 `TF-20261017-d8f7b3` 提升而来；Defect 2 已拆出为 `TF-20261018-282836`。
