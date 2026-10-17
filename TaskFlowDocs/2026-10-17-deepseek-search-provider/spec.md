# Spec — DeepSeek Search API 接入为搜索 provider

> Task version: v1

## Objective and Success Criteria

在既有 provider 模式内加入第三个搜索后端，不引入新抽象。成功标准即 PRD 的 AC1–AC7：路由正确、失败可见、既有路径行为不变、构建与测试通过。

## Architecture Boundaries and Responsibilities

三层职责，与现有实现一致，不新增层：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 传输 + 映射 | `cli/src/deepseek-service.ts`（新） | 只做 HTTP 调用和 DeepSeek → `SearchResponse` 字段映射。不含路由、不含重试、不含降级。 |
| 路由 + 合并 | `cli/src/runCli.ts` 两处分支 | 决定用哪些 provider、如何合并结果、如何归因 origin。 |
| 配置 | `cli/src/config.ts` | 读 key，供路由判断 provider 是否可用。 |

`cli/src/service.ts` 的 `SearchResult` / `SearchResponse` 是唯一契约，**不改动**。

## Project Structure / Affected Files

**新增**

- `cli/src/deepseek-service.ts` — provider 实现（约 65 行，与 `ollama-service.ts` 同级体量）。
- `cli/test/unit/deepseek-service.test.ts` — 映射与错误语义的单测。

**修改**

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `cli/src/config.ts` | 15-27 | `SearXNGConfig` 加 `deepseekApiKey: string;` |
| | 29-41 | `DEFAULT_CONFIG` 加 `deepseekApiKey: ''` |
| | 99-113 | 文件合并加 `if (fileConfig.deepseekApiKey !== undefined) ...` |
| | 159-160 之后 | env 读取 `DEEPSEEK_API_KEY` |
| `cli/src/runCli.ts` | 15 附近 | import `DeepSeekService` |
| | 545-567 | 单查询路径路由 |
| | 631-655 | 多查询路径路由 + 守卫泛化（R7） |
| | 573 | origin 归因 |
| | 753 | origin 归因 |
| | 820 | `-e` 帮助文案 |
| | 1600 | `--engines-list` 追加 |
| `cli/sxng.config.example.json` | — | 加 `"deepseekApiKey": ""` |
| `README.md` | env 表（982-984 附近） | 加 `DEEPSEEK_API_KEY` 一行 |

## Interfaces, Data Flow, and Contracts

**新 class 契约（R1）**

```ts
export interface DeepSeekServiceOptions {
  apiKey: string;
  baseUrl?: string;   // 默认 'https://api.deepseek.com'
  timeout?: number;   // 默认 15000，与 OllamaService 一致
}

export class DeepSeekService {
  constructor(opts: DeepSeekServiceOptions);
  search(options: { query: string; limit?: number }): Promise<SearchResponse>;
}
```

`baseUrl` 保留是为了可测——单测可将 axios 指向本地 stub。这不是"为将来扩展"的抽象，是测试缝。

**请求映射**

| 入参 | 请求字段 | 说明 |
| --- | --- | --- |
| `options.query` | `query` | 直接透传。**不截断**：超 128 字符由服务端报错，本地截断会静默改变用户查询语义。 |
| `options.limit` | `count` | `Math.min(limit ?? 10, 50)`。上限 50 来自文档。默认 10 亦取文档值，**不取** Ollama 适配器里的 5。 |

`need_content` 不下发（默认 false）。`ori_question` / `localization` 不下发。

**响应映射**

| `SearchResult` 字段 | 来源 |
| --- | --- |
| `title` | `item.title \|\| ''` |
| `url` | `item.url \|\| ''` |
| `content` | `item.summary \|\| item.snippet \|\| ''`（R8） |
| `engine` | 常量 `'deepseek'` |
| `category` | 常量 `'general'`（与 Ollama 适配器一致） |
| `publishedDate` | `item.date ?? undefined`（RFC 3339 字符串，null → undefined） |
| `retrievedAt` | 映射前取一次 `Date.now()`，全部结果共用 |
| `rank` | `index + 1` |

`rerank_score` / `authority` / `site_name` / `site_icon` **不映射**：`SearchResult` 无对应字段（`score` 在 `runCli.ts:63` 被渲染成 `[Source score: N]`，直接放 `rerank_score` 会以 0–3 的尺度混入现有 0–1 语义，属误导）。保留原始数据给未来的排序决策，不在本任务伪装成已有语义。

固定字段与 Ollama 适配器对齐：`suggestions` / `answers` / `corrections` / `infoboxes` / `unresponsiveEngines` 全部返回空数组，`numberOfResults` 取 `results.length`。

## Invariants and Compatibility

- **I1** 未选 `deepseek` 时不发起任何 DeepSeek 请求（AC4）。
- **I2** 选了 `deepseek` 但 key 缺失时报错，不回退（R6）。
- **I3** `SearchResponse` / `SearchResult` 类型定义不变；新增 provider 不改变任何既有字段语义。
- **I4** SearXNG 单独使用时的行为与改动前逐字节一致。
- **I5** provider 路由只认 `--engines` 里的魔法词，不引入新 flag。

## Validation and Error Semantics

`search()` 三类失败必须抛错，绝不返回空 `results`（AC6）：

| 情形 | 错误信息 |
| --- | --- |
| HTTP 非 2xx | `DeepSeek search failed: HTTP <status> <statusText>` |
| 网络/超时 | `DeepSeek search failed: <message>` |
| 响应体缺 `results` 数组 | `DeepSeek search returned an unexpected response body` |

与 `SearXNGService.search` 的风格一致（`service.ts:170-175` 用 `Search failed: ...`）。错误在 `runSearch` 里被既有的顶层 catch 转成 `CliEnvelope`，**不新增错误包装**。

`PROVIDER_NOT_CONFIGURED` 是唯一新增错误码，在路由层产生（不是 provider 内），因为这是配置问题而非接口问题：

```
code: 'PROVIDER_NOT_CONFIGURED'
message: 'DeepSeek provider selected but no API key configured'
hint: 'Set DEEPSEEK_API_KEY or add "deepseekApiKey" to sxng.config.json'
```

## Code and Test Constraints

- ESM，`import ... from './x.js'` 带扩展名（现有惯例）。
- axios 已是依赖，不新增依赖。
- 不使用 `console.log` 做调试输出；错误经结构化 envelope 返回（项目 CLAUDE.md 约定）。
- 单测零 HTTP mock 框架：直接 `vi.mock('axios')`，或构造时传 `baseUrl` 指向本地 stub server。**优先前者**——项目现有测试不含任何 HTTP 层，引入 stub server 是新模式。测试文件与其它 `test/unit/*.test.ts` 同风格。
- 不写兼容性代码（用户全局规则）。

## Design Decisions and Alternatives

**D1 复用 `SearchResponse` 而非新类型。** 备选是为 DeepSeek 定义独立响应类型。否决：所有下游（`dedupe`、`rrf`、session、graph）都消费 `SearchResponse`，新类型会强制在路由层做转换，纯增代码。

**D2 不引入 provider 接口。** 备选是照 `deepseek-harness` 的 `ctx.web` 建 capability seam。否决：那是插件框架支持任意后端热插拔的必要设计；此处只有三个实现且全是"拿 query 换 `SearchResponse`"，接口只有一个形状，是典型的单实现抽象。第 65 行的实现就是它的抽象。

**D3 `-e deepseek` 而非 `--deepseek`。** 备选是独立布尔 flag。否决：`-e` 已支持并列与合并语义（`-e ollama,google`），新 flag 需要重新定义与 `-e` 的组合规则。魔法词与 Ollama 先例一致。

**D4 key 缺失时硬失败（R6）。** 有意偏离 Ollama 先例。理由：静默回退使用户无法判断 provider 是否生效，是 Ollama 现有的真实缺陷（其 `init.ts:151` 与 README 声称会自动降级，实际不会）。复制缺陷无收益。Ollama 的修复另立任务，不在本版本扩大范围。

**D5 `content = summary`。（已在前序讨论收敛）** `need_content` 开启会让每条结果触发服务端抓页，与 `extract` 管线重复抓取同一 URL 并挤占 5 QPS。`summary` 是文档标注面向模型的字段，语义对齐 Ollama `content`。

**D6 不接 `/v1/tools/fetch`。（已在前序讨论收敛）** 与 `extractor.ts` 现有三层同档，其抓取质量未在文档中说明，无测量支撑不押注。

## Open Questions

- **Q1** 本机是否有可用于验证的 DeepSeek API key（同 PRD Q1）。影响 AC1/AC3 能否端到端验证，不影响实现。
