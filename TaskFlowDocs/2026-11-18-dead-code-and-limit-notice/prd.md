# PRD — 删除 SimHash 死代码与 deep 桶文件、让 provider 上限降级可见、为 README 命令表加校验
> Task version: v1
> Status: planning

## Goal

三件同属「搜索结果层、零行为风险」的收尾工作，一次交付：

1. 删除 `cli/src/deep/simhash.ts`、`cli/src/deep/index.ts` 与随之失去调用方的 `mergeExtractedContent`。
2. 当 `--limit` 超过 provider 的真实上限时，在输出里说明这次请求被降级到多少，不改取数行为。
3. 补齐 `README.md` / `README.zh-CN.md` 命令表缺失的行，并让已有的命令表校验覆盖这两个文件。

## Task Kind

- Kind: internal

## Background / Confirmed Facts

全部在 0.0.13（`58a560d`，与 `origin/main` 同一提交）上实测。

### 一、SimHash 与 deep 桶文件

1. **`simhash.ts` 的全部引用**只有两处：`cli/src/deep/index.ts:6` 的再导出，以及它自己的测试 `cli/test/unit/deep/simhash.test.ts`。生产代码零调用。
2. **`deep/index.ts` 零消费者。** `git grep deep/index` 在 `cli/src`、`cli/test` 均无匹配；`cli/src` 里唯一的 `from './index...'` 是 `cli/src/deep/local-doc/searcher.ts:20`，指向 `indexer.js`，不是这个桶文件。
3. **桶文件不是对外入口。** `cli/package.json` 的 `main` 是 `dist/index.js`（对应 `cli/src/index.ts`，只有 `main()` 一行调用），`types` 是 `dist/index.d.ts`，没有 `exports` 字段，`files` 只发 `dist/`。外部无法 import 到 `deep/index.ts`。
4. **死因可追溯。** `bee5b97`（2026-07-24）用 Jaccard 取代 SimHash 做内容去重，改动删掉了所有生产调用方，只把 `export { SimHash }` 留在桶文件里。此后四个月无人引用。
5. **`mergeExtractedContent` 同样只剩桶文件里的导出。** `cli/src/deep/session.ts:806` 定义，注释自称 "Compatibility name for callers that already provide extraction output"，但 `grep -rn mergeExtractedContent cli/src cli/test` 除定义外只有 `cli/src/claims/types.ts:77` 的一句注释提到它，没有任何调用。
6. **先例一致。** `e113695` 删除 `quality-assess.ts` / `recovery-analysis.ts` / `calibrate-thresholds.ts` 的理由就是「没有调用者」，提交正文逐条写明。本次沿用同一判断标准。

### 二、`--limit` 超过 provider 上限

7. **两处上限是真实的、代码是对的。** `cli/src/ollama-service.ts:32` `Math.min(options.limit ?? 5, 10)` 对应 Ollama 文档的 `max_results ... (default 5, max 10)`；`cli/src/deepseek-service.ts:43` `Math.min(options.limit ?? 10, 50)` 对应 DeepSeek 文档的 `count ... between 1 and 50`。缺陷只是**静默**：`-l 20 -e ollama` 得 10 条，输出里没有任何说明。
8. **`?? 5` 与 `?? 10` 这两个默认值从 CLI 走不到。** `cli/src/runCli.ts:507` `options.limit ?? config.defaultLimit`（默认 10）→ `searchOneQuery(..., limit)` → `PROVIDER_IMPLS[p].search(query, limit)`，`limit` 永远是数字。所以实际可见的降级只有「显式 limit 超过上限」这一种。
9. **降级事实已经在手边，只是没有出口。** `searchOneQuery`（`cli/src/runCli.ts:386-403`）同时持有请求的 `limit` 与 `response.results.length`，两者目前只进 `feedback-log`（`feedbackLog('provider', 'ok', { ..., count })`），不进输出。
10. **输出层已有同类先例。** `unresponsiveEngines` 就是「一个关于本次请求的事实」，在 JSON 里是 `data.unresponsiveEngines`，在 md 里渲染成 `*Unresponsive: google (Suspended: access denied)*`（`runCli.ts:138-147`）。provider 上限说明放在同一位置、同一形式。

### 三、README 命令表漂移

11. **仓库内已有一份等价校验，且通过。** `cli/test/unit/skill-command-table.test.ts` 从 `createProgram()` 取注册集合、从 `skills/digdig/SKILL.md` 解析文档集合，允许一份带理由的 `EXEMPT` 清单（目前只有 `query-graph`）。实测 4/4 通过：注册 29 个，`SKILL.md` 文档 29 个。
12. **漂移在实际被跟踪的 README 里。** 同一份对照跑在 README 上：`README.md` 文档 27 个、缺 `graph-pending` 与 `query-graph`；`README.zh-CN.md` 文档 26 个、缺这两个再加 `source-relations`。
13. **`graph-pending` 的漏法是 `doc-index`/`doc-search` 的翻版。** 两个 README 的**正文**都提到了它（`README.md:1123`、`README.zh-CN.md:1098`），只是没进命令表 —— 正是当年催生 `skill-command-table.test.ts` 的同一类缺口。
14. **`query-graph` 属于应当豁免，不是应当补。** `runCli.ts` 已把它标为 deprecated，`SKILL.md` 的 `EXEMPT` 也只为它开了口子。

## Requirements

- **R1 — 纯删除，不留兼容层。** 删掉 `simhash.ts`、`deep/index.ts`、`simhash.test.ts`、`mergeExtractedContent`；不保留再导出、不写 `@deprecated` 占位。
- **R2 — 上限常量单一来源。** 每个 provider 的上限只在一处定义，服务内部使用与对外报告必须读同一个常量；不允许在路由表里另抄一份 10 / 50。
- **R3 — 只报告事实，不做判断。** 输出只说「请求了 N，该 provider 上限是 M」，不说结果质量、不说建议怎么做。
- **R4 — 不改变取数行为。** 发出的请求参数、返回结果集、`totalResults` / `returnedResults` 的语义全部不变。
- **R5 — md 与 json 口径一致。** 两个格式都能看到同一事实，措辞不同、数据相同。
- **R6 — 校验覆盖被跟踪文档。** README 命令表纳入现有 guard 测试，不再靠手抄；`query-graph` 复用同一份 `EXEMPT`。

## Acceptance Criteria

- **AC1** — `cli/src/deep/simhash.ts`、`cli/src/deep/index.ts`、`cli/test/unit/deep/simhash.test.ts` 不存在；`git grep -n simhash -- cli` 无匹配。
- **AC2** — `git grep -n mergeExtractedContent -- cli` 无匹配。
- **AC3** — `-l 20 -e ollama` 的 JSON 输出含一个说明该项被降到 10 的字段；`-l 5 -e ollama` 的输出里没有这个字段。
- **AC4** — `-l 80 -e deepseek` 同理，上限 50。
- **AC5** — 同一次请求里多个 provider 都被降级时，两个都被列出。
- **AC6** — md 格式在同一条件下输出一行说明，JSON 下不出现该行。
- **AC7** — 不降级时 `data` 的形状与现在逐字节一致（现有测试不改即通过）。
- **AC8** — 扩展后的命令表测试能对 `README.md` 与 `README.zh-CN.md` 报出缺失命令；补行后通过。
- **AC9** — `npx tsc --noEmit` 为 0；`npm test` 全绿。

## External Facts

- Depends on external facts: no
- Why not: provider 上限已由官方文档确认并写进 0.0.13 的既有代码，本次不新增对上游行为的假设；测试用 `vi.mock` 替掉 axios，不访问网络。

## In Scope

- 删除 `cli/src/deep/simhash.ts`、`cli/src/deep/index.ts`、`cli/test/unit/deep/simhash.test.ts`。
- 删除 `cli/src/deep/session.ts` 的 `mergeExtractedContent`。
- 各 provider 模块导出自己的上限常量，`PROVIDER_IMPLS` 引用同一常量。
- `searchOneQuery` 收集降级事实，搜索输出（json + md）显示它。
- 补齐两个 README 命令表的缺失行。
- 扩展 `cli/test/unit/skill-command-table.test.ts` 覆盖两个 README。

## Out of Scope

- **SearXNG 翻页补齐**（`TF-20261116-f8776d` 的方向 ②）。要发第二次请求、有延时代价，需要单独的成本判断，不在本次。
- **阈值集中化**（`TF-20261116-e1c513`）。复核结论是不做：`co-occurrence` 与 `search-strategy` 的阈值早有 CLI 入口，而 `e113695` 刚刚把「阈值可配置」这一层删掉，`cli.test.ts:77` 有一条测试钉住 `--threshold-override` 必须不存在。
- **CLAUDE.md**。它是本机未跟踪文件，不在仓库交付面内。
- **会话锁边界**（`TF-20261116-273731`）。跨版本并发访问同一会话已被 `2026-11-10-sqlite-session` 的 PRD 明确划为不支持，剩下的问题是迁移期决策，不是顺手能改的。

## Risks / Deferred Items

- 删除 `deep/index.ts` 后，若将来有人想以桶文件形式暴露 `deep/`，需要重新建立并对齐 `package.json`。当前没有这种需要，而且各模块都有直接导入者，重建成本很低。
- 降级说明是输出的新字段。对严格校验响应形状的调用方来说这是增量变化；按 `R4` 不动既有字段，属向后兼容的追加。

## Open Questions

- 无。三件事的范围与判断标准都已在 2026-11-18 的复核中确定。
