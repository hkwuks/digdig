# 统一搜索结果身份与排序流转

> Task version: v1
> Status: completed

## Goal

让"哪些结果是同一条"和"结果按什么顺序出来"这两件事在整个系统里只有一个答案，并让 `--session` 搜索的输出重新变得可读。

具体交付：URL 身份收拢到单一函数并被 dedupe / session / graph / RRF 共用；抽取正文不再被当作新一轮；RRF 在融合前对每份 ranking 去重，且 session 落库发生在融合之后；单查询与多查询走同一条排序流水线；搜索结果只显示本轮结果，历史仅参与打分；session 输出附带一份从 `results.json` 派生的全量进度概况。

## Background / Confirmed Facts

以下事实全部在 `main`（328c1fa）上用真实构建产物加本地桩 SearXNG 复现过。

**身份函数有两套语义。** `deep/dedupe.ts:11 normalizeUrl` 去掉 fragment；`deep/dedupe.ts:25 resultUrlKey` 为本地文档保留 fragment。多查询路径（`runCli.ts:755,770,826,847,855`）用 `normalizeUrl` 作 key，于是 `file:///docs/a.md#chunk-0` 与 `#chunk-7` 塌成同一条 —— 恰好是 `resultUrlKey` 存在的理由。单查询路径（`runCli.ts:692-699`）用 `resultUrlKey`。同一次搜索，两条路径对"是不是同一条"给出不同答案。

**单查询 RRF 把当前批次数了两次。** `runCli.ts:674` 先把当前批次 `appendSessionResults` 进库，`:690` 再把整个 session 读回来当第二份 ranking，`:695` 融合。当前批次因此同时出现在两份 ranking 里，且下标不同。实测分数 `2/61 = 0.032787` 对 `1/61`，逐位吻合。

**单查询显示整个 session，多查询只显示本轮。** `:690-706` 把整库当一份 ranking 融合后全部显示；`:784` 的多查询路径从不融合历史。同一条命令，输出语义不同。

**多查询落库发生在融合之后，单查询在融合之前。** 因此 `fusionScore` 只在多查询路径写进 session（`:853`），单查询路径不写（`:674`）。

**RRF 不保证每份 ranking 内 id 唯一。** `deep/rrf.ts:24-31` 直接按数组下标累加。实测 `rrf([{X},{A},{X}])` 得 `X=0.032266, A=0.016129`，X 被计两次。`mergeResponses`（`runCli.ts:461-477`）是裸 `flatMap`，既不跨 provider 去重，也不重排。

**只有 SearXNG 做过滤与去重。** `service.ts:157-165` 走 `filterEmptyResults` + `dedupe`；`ollama-service.ts:44` 与 `deepseek-service.ts:71` 直接 `map`。实测同样 3 条输入（含一条空正文），provider 路径 3 条全出，SearXNG 路径 2 条。

**抽取正文会开启新一轮。** `session.ts:185-187 needsRound` 对任何带 origin 且 `round === undefined` 的输入返回 true，`results-add --kind extracted`（`commands/results-add.ts:82`）正是这种输入。实测：搜索后 `rounds: 1`，导入 5 条抽取正文后 `rounds: 2`，而 `appendSessionResults` 返回 `added: 0, updated: 5` —— 一条新结果都没有，却记了一轮。

**这会直接拉低质量判定。** `assessLatestResultQuality`（`quality-assess.ts:120-143`）只看最后一轮。实测同一批 URL：搜索轮 `contentDepth 0 / sourceDiversity 3 → acceptable`，抽取轮 `contentDepth 141.5 / sourceDiversity 1 → poor`。抽取让质量变差了，因为第二轮只剩 2 条且同域。

**图谱不适合承担进度视图（本轮已实测）。** 零审批时 `graph.json` 根本不创建（`session.ts:714-718` 在无 verified 结果时直接 return）；有审批时图只含已批准部分（`session.ts:683-695` 只遍历 `approved`）；同一条非搜索 origin 在 `recovery-analysis.ts:61` 算第 0 轮、在 `query-suggest.ts:146` 算第 2 轮。raw graph JSON 实测 30 节点 21,303 字节（710 B/节点），而 results.json 派生的完整进度概览是 645 字节。用户决定：进度概况从 results.json 派生，图谱结构本任务不动。

**进度概况的原料已经齐了。** 实测从 `results.json` 单文件可派生：总轮数、去重结果数、每轮查询/引擎/新增数/状态分布、域名数，25 条结果时 645 字节。所需字段 `origins[].round`、`origins[].query`、`origins[].engine`、`status`、`contentType`、`url` 全部已在 `SessionResult` 上。

## Requirements

**R1 — 单一身份。** 一个模块同时提供 URL 规范化与结果 key，全系统只此一处；`dedupe`、`session`、`graph`、`runCli` 两条搜索路径都复用它。本地文档的 chunk fragment 必须被保留，非本地 URL 的 fragment 必须被丢弃，这一区分只能存在于该模块内。

**R2 — 抽取不开启新一轮。** 补全正文、导入抽取结果都不改变 session 的 `rounds`；只有搜索调用开启新轮。修复后，对已搜索 URL 做抽取不得让 `--quality` 的 verdict 变差——它评估的是同一个轮次，写正文只会抬高 `contentDepth`。

**R3 — 融合前置去重。** RRF 输入必须满足"每份 ranking 内 id 唯一"；结果合并处按同一身份 key 跨 provider 去重。

**R4 — 落库在融合之后。** 一次搜索调用只 `appendSessionResults` 一次，且发生在融合之后，`fusionScore` 对两条路径一致地写入。

**R5 — 两条路径同构。** 单查询、多查询、带/不带 `--session`、带/不带 provider 都走同一条排序流水线；`--queries` 只是"一次调用里有 N 个查询"的特例。

**R6 — 只显示本轮。** 带 `--session` 时，输出结果集是本轮产生的结果按融合分排序后的前 `--limit` 条；历史结果不进入显示集，但作为一份 ranking 参与打分。

**R7 — 覆盖度事实。** 提供一个命令，报告本会话**已经查过什么**，形式是可数的事实而非判断：按轮次分组的查询与引擎、每轮新增结果数、每轮被更早已见过的结果数、每轮的标题清单、跨轮重复出现的 URL、**只出现在单轮内且重复出现的词**、**实际用到的域名**，以及**尚未接触过的专业信息源**。该命令只读 `results.json`，在零审批、零抽取的状态下同样可用。

不产出"覆盖了哪几个方面""还缺什么"这类结论——那是模型的判断，不是 CLI 的。
**R8 — F6 并入。** `-e deepseek,google` 这类纯 provider 组合也走 R3/R5 的流水线，不再按 provider 顺序拼接。

**R9 — 报告数字自洽。** `totalResults` 与 `returnedResults` 各自有明确且互不重叠的定义；`rank` 与 `fusionScore` 描述同一顺序，不出现两个坐标系的排名并存。

## Acceptance Criteria

**AC1** — `file:///docs/a.md#chunk-0` 与 `#chunk-7` 在任何搜索路径下都保持为两条结果；`https://x.com/a#s` 与 `https://x.com/a#t` 合并为一条。两条路径结果一致。

**AC2** — 同一份输入，`dg --session s "q"` 连跑两次与 `dg --session s "q1,q2"` 跑一次，在"结果 key 集合"上一致（顺序可因融合不同）。

**AC3** — 单查询路径中，本轮结果的融合分不再包含"自身作为历史"的那一次重复计数：把本轮结果与仅含历史的 ranking 融合时，每个 id 在每份 ranking 中最多出现一次。

**AC4** — 对某 URL 执行抽取正文后，`rounds` 不变，且 `--quality` 的 verdict 不因这次抽取而变差（`poor < acceptable < good`）。

不要求"完全相同"：抽取把正文写进结果，`contentDepth` 会真实上升，verdict 从 `acceptable` 升到 `good` 是正确行为而不是回归。要杜绝的是反方向——抽取被记成新一轮、评估集塌缩成刚抽的那几条，于是"抽完反而变差"。实测：修复前搜索轮 `contentDepth 0 / sourceDiversity 3 → acceptable`，抽取轮 `contentDepth 141.5 / sourceDiversity 1 → poor`；修复后抽取不改变评估集，只可能升不可能降。

**AC5** — `-e deepseek,google` 的结果按融合分排序，`fusionScore` 出现在输出中，不再是 provider 块状拼接。

**AC6** — 带 `--session` 搜索时，输出结果全部来自本轮；第二轮搜索不再把第一轮的结果排出。

**AC7** — 在一个刚创建、零审批、零抽取、跑过 ≥3 轮的 session 上，覆盖度命令能报出：正确的轮次数、每轮的查询、每轮新增结果数、至少一组只属于某一轮的词、实际用到的域名，以及尚未接触过的专业信息源列表。`tokio` 这类跨轮主题词不得出现在单轮词列表里。

**AC8** — 现有测试全部通过；上述每条 AC 至少有一个自动化测试覆盖。

**AC9** — `totalResults` 等于去重后的候选总数（`fused.length`），`returnedResults` 等于截断后实际输出条数，且满足 `totalResults >= returnedResults`。对同一 URL 在两轮中出现的情况，`rank` 与 `fusionScore` 表达同一顺序（融合位次），不再一个来自 provider、一个来自 RRF。

## In Scope

- 身份模块收拢与全部调用点切换（`deep/dedupe.ts`、`deep/graph.ts`、`deep/session.ts`、`runCli.ts` 两条搜索路径）
- `needsRound` 语义修正与受影响的 round 流转
- RRF 前置去重、跨 provider 去重、落库时机
- 两条搜索路径合并为一条流水线
- 搜索输出中 session 块的进度概况（新增派生函数与其测试）
- 文档同步：`CLAUDE.md` 中与本变更矛盾的部分

## Out of Scope

- 图谱结构、节点 id、`graph-explore` / `graph-drill` / `graph-search` 的语义与输出
- `recovery-analysis` 的 round 归属不一致、`growthRate` 恒为 1、`entityRichness`、`p:` 节点不可达 —— 这些是图谱侧问题，本任务只记录不修
- 阈值数值本身（集中在任务 B；本任务不改任何阈值）
- provider 端是否补过滤/去重（R3 在合并处统一处理，不在三个 provider 里各写一遍）
- SimHash 死代码清理

## Risks / Deferred Items

**风险：R6 改变输出契约。** 依赖"搜索输出含全量 session"的外部用法会行为变化。缓解：进度概况（R7）同时补齐整体视野，且 `--limit` 语义不变。

**风险：R2 影响已有 session。** 修正后旧 session 的 `rounds` 计数含义与历史数据不一致（历史上抽取被记了轮）。决定：不迁移旧 session 数据，新行为只对修正后的写入生效；`rounds` 只用于显示与统计，不参与身份。

**风险：R1 可能改变已有 session 的 id。** `resultId` 若随规范化逻辑变化，旧图节点将不再匹配。决定：规范化逻辑的**外部行为**在本任务内保持不变（只合并两套实现，不新增 http/https、www、utm 的折叠），避免 id 漂移。扩展归一化另记跟进项。

**延后：** 扩展 URL 归一化（协议、www、utm、amp）。它会改变已有结果的 key，需要一次显式迁移决策。

**延后：** 进度概况是否也应在 `--quality` 输出里出现。

## Open Questions

无阻塞问题。用户已在本次会话确认：显示范围取"只显示本轮、历史只参与打分"；F6 并入本任务并标记 superseded；阈值任务只集中化不改数值；进度概况进本任务、图谱不动。
