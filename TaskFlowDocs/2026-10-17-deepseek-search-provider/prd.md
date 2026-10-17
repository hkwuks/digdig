# DeepSeek Search API 接入为搜索 provider

> Task version: v1
> Status: in_progress

## Goal

让 sxng-cli 多一个搜索后端：把 DeepSeek 2026-10-17 上线的独立 REST Search 接口接成 `-e deepseek`，与现有的 SearXNG、Ollama 并列。用户价值是搜索源不再受限于 SearXNG 单个实例和 Ollama 一家——尤其当 SearXNG 实例质量波动时，多一个独立索引可用。

## Background / Confirmed Facts

**DeepSeek Search 接口（已核对官方文档）**

- `POST https://api.deepseek.com/v1/tools/search`，`Authorization: Bearer $DEEPSEEK_API_KEY`。
- 入参：`query`（必填，≤128 Unicode 字符，支持 `site:` / `-site:` / 引号短语）、`count`（1–50，默认 10）、`ori_question`（可选，≤128 字符，提升查询理解）、`localization`（可选，IP 字符串）、`need_content`（可选，默认 `false`；为 `false` 时 `content` 恒为空串）。
- 出参 `results[]`，每项含：`rerank_score`（0–3，≥1.5 视为高质量）、`title`、`url`、`snippet`（100–200 字，面向 UI）、`summary`（600–800 字，面向模型）、`content`（页面正文，需 `need_content`）、`site_name`、`site_icon`、`date`（RFC 3339 或 null）、`authority`（0–4，`-1` 未知，≥3 为高权威）。
- 限流：Search 与 Fetch 各 5 QPS/账号，独立计数。计费 ¥5/千次成功请求；失败、空结果、超时不计费。结果条数不影响计费。
- 另有 `POST /v1/tools/fetch`（`{url}` → `{title, content}`），本次不接。

**代码侧现状（已核对）**

- `SearchResult` / `SearchResponse` 定义在 `cli/src/service.ts:21-48`，是全局唯一的搜索结果契约。
- `cli/src/ollama-service.ts`（65 行）是唯一的另一 provider：class + `search({query, limit}): Promise<SearchResponse>`，打 `https://ollama.com/api/web_search`。
- provider 路由靠 `--engines` 里的魔法词，在 `runCli.ts:547` 与 `633` 两处重复：`const useOllama = engines.includes('ollama') && config.ollamaApiKey`。
- origin 归因在 `runCli.ts:573` 与 `753`：`tool: result.engine === 'ollama' ? 'ollama' : 'sxng'`。
- `runCli.ts:1600` 在 `--engines-list` 时把 `ollama` 追加进列表。
- `config.ts` 加一个 key 的改动面是固定的四处：接口字段（15-27）、`DEFAULT_CONFIG`（29-41）、文件合并（99-113）、env 读取（159-160）。
- `runCli.ts:410` 用 `config.allowedEngines` 校验 `-e` 的取值，非空时未列出的引擎直接报 `INVALID_ENGINES`。**这意味着真实可用性还取决于用户 config 里的 `allowedEngines`。**

**本任务开始前已确认并否决的选项**

- `need_content` 不启用：开它等于每条搜索结果都触发服务端抓页，而 sxng 的搜索结果是"指针"（标题+URL+摘要），正文由 `extract` 按需获取；开启会造成同一 URL 被抓两次（DeepSeek 一次、extract 一次），并挤占 5 QPS 配额。`summary` 本就是 DeepSeek 标注给模型读的字段，语义对齐 Ollama 的 `content`（官方描述 "relevant content snippet from the web page"）。决定只花一行，随时可逆。
- Fetch 不接入 `extract`：`extractor.ts` 已有 Defuddle → Obscura → Jina 三层，Fetch 属同一档（远程、无头、转 Markdown），挤不进任何一层。其抓取质量**未知**（此前把 harness 的 `web-fetch-http` provider 误当作该接口，已更正；官方文档未说明是否渲染 JS）——未知本身即是不押注的理由。

## Requirements

**R1** 新增 `cli/src/deepseek-service.ts`，导出 class，构造签名 `{apiKey, baseUrl?, timeout?}`，方法 `search({query, limit}): Promise<SearchResponse>`，与 `OllamaService` 同形。

**R2** 路由：`-e` 中含 `deepseek` 时走 DeepSeek。单查询路径（`runCli.ts:534` 起）与多查询路径（`runCli.ts:631` 起）**两处都要接**。

**R3** 可与其他引擎并列：`-e deepseek,google` 同时取两者结果并合并，与现有 Ollama 合并行为一致。

**R4** origin 归因正确：DeepSeek 来源的结果在 session 里 `origins[].tool === 'deepseek'`，其余仍为 `'sxng'`。两处归因点（573、753）都要覆盖。

**R5** 配置：`config.deepseekApiKey`，来源为 env `DEEPSEEK_API_KEY` 与 config 文件的 `deepseekApiKey`；`--engines-list` 在 key 存在时列出 `deepseek`。同步更新 `cli/sxng.config.example.json`。

**R6** `-e deepseek` 但未配置 key 时，**输出结构化错误**（新错误码 `PROVIDER_NOT_CONFIGURED`），不得静默回退到 SearXNG。这是有意与 Ollama 现状不同：Ollama 在该情形下静默跳过、用户无法察觉 provider 未生效；DeepSeek 不复制这个缺陷。

> **实施偏差（v1，2026-10-17）**：R6 的"仅对 DeepSeek 生效"边界与 R7 的"消除重复"不可兼得——路由 helper 同时服务两个 provider，为 DeepSeek 单独报错需要一份特例分支。选择满足 R7，`PROVIDER_NOT_CONFIGURED` 因此对两个 provider 一致生效，Ollama 的静默跳过缺陷一并修复。实测确认改动前该路径是"用 SearXNG 全量结果冒充 Ollama"（SearXNG 静默忽略不认识的引擎名）。**这是本任务唯一的既有路径行为变更**，见 `plan.md` 的 Verification 节。R6 原有的"Ollama 缺陷不在本任务范围内"一句据此作废。

**R7** 多查询路径现有守卫 `sxngEngines.length > 0 || !useOllama` 是按"只有一个外部 provider"写的；加入第二个 provider 后必须泛化，否则只选 DeepSeek 时会额外再跑一遍 SearXNG。

**R8** `content` 映射为 `summary || snippet || ''`。

## Acceptance Criteria

- **AC1** 配置了 key 时，`sxng "query" -e deepseek --format json` 返回的结果集来源为 DeepSeek。可观测证据：每条 `engine === 'deepseek'`；`retrievedAt` 为本次时间戳；`rank` 从 1 连续。
- **AC2** 未配置 key 时，`sxng "query" -e deepseek` 返回 `status: 'error'`、`error.code === 'PROVIDER_NOT_CONFIGURED'`，进程退出码非 0，且**没有** SearXNG 结果被返回。
- **AC3** `sxng "query" -e deepseek,google` 的结果同时含 `engine === 'deepseek'` 与 SearXNG 来源的结果。
- **AC4** `sxng "query" -e google`（未选 deepseek）不产生任何 DeepSeek 请求。可观测证据：把 `DEEPSEEK_API_KEY` 设为一个必然失败的假值时，该命令仍成功返回 SearXNG 结果。
- **AC5** DeepSeek 结果的 `content` 等于接口返回的 `summary`；`summary` 为空串时等于 `snippet`。
- **AC6** 三类失败（HTTP 非 2xx、网络异常、响应体不含 `results`）均产生可读错误信息，不静默返回空结果。
- **AC7** `cd cli && npm run build` 通过；`cd cli && npm test` 通过（含新增单元测试）。

## In Scope

- 新增 provider 实现与配置接线。
- 两条搜索路径的路由、合并、origin 归因、`--engines-list`。
- provider 必需的 5 处周边改动：`.option('-e, ...')` 帮助文案（`runCli.ts:820`）、`config.ts` 四处、`runCli.ts:1600`、`cli/sxng.config.example.json`、根 `README.md` 的 env 表。
- 新增单元测试。
- 本次任务的三份核心文档。

## Out of Scope

- `/v1/tools/fetch` 接入 `extract`（已否决）。
- `need_content` / `--deepseek-content` 开关（无测量支撑，已否决）。
- `rerank_score` / `authority` 接入 `quality-assess` 或 RRF 排序（新能力，需单独决策）。
- 修复 Ollama 的静默跳过缺陷（R6 已记录缘由，另立任务）。
- `sxng init` 交互式加问 DeepSeek key（`init.ts` 不改，本任务不碰）。
- 任何 provider 抽象层（接口/工厂/注册表）。现有先例是"class 返回 `SearchResponse` + `--engines` 魔法词"，两个实现不足以支撑抽象。
- `cli/src/` 之外的任何重构。

## Risks / Deferred Items

- **R-1 无法端到端验证。** 本机无 `DEEPSEEK_API_KEY`，且测试布局不含 HTTP mock。因此真实调用路径只能靠单元测试覆盖映射与分支逻辑（stub axios），真实接口行为需用户手动跑一次。这是本任务最大的验证缺口，必须显式声明。
- **R-2 字段理解偏差。** `summary` 与 `snippet` 的实际长度/形态若与文档不符，映射可能需微调。影响面仅一行。
- **R-3 `allowedEngines` 交互。** 用户 config 若设置了白名单且不含 `deepseek`，`-e deepseek` 会被 `INVALID_ENGINES` 拦下。这是既有设计，不属缺陷，但会让人误以为接入失败。
- **R-4 计费。** 每次成功搜索 ¥0.005。sxng 的多查询与重试会累加。不属本任务处理范围，但 README 应提及。

## Open Questions

- **Q1** 本机是否已有可用的 DeepSeek API key？若有，AC1/AC3 可升级为端到端验证。若无可用于测试的 key，R-1 的缺口保持，需用户手动验收。

（无阻塞性未决问题。Q1 影响验证强度，不影响实现。）

## Version History

- v1 — 初始版本。基于 2026-10-17 官方文档与代码勘察；此前讨论已收敛入口形态、`content` 映射与 Fetch 三项决策。
