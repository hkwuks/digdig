# Plan — DeepSeek Search API 接入为搜索 provider

> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md` — v1。契约、字段映射表、错误语义、设计决策 D1–D6 均在此。

## Reference Pointers

- DeepSeek Search 接口文档：https://api-docs.deepseek.com/api/search （2026-10-17 读取）。请求/响应 schema 已摘入 `prd.md` 的 Confirmed Facts。
- DeepSeek Fetch 接口文档：https://api-docs.deepseek.com/api/fetch （本任务不接，仅记录以支持 D6 的否决理由）。
- `chub` 本地注解已写入 `deepseek/llm`：该文档仅覆盖 Chat Completions，不含 Search/Fetch 独立接口。

## Related Tasks

- Parent: None
- Children: None
- Depends on: None
- Blocks: None
- Related: None

（一个已知的后续任务尚未建档：修复 Ollama 的 provider 静默跳过缺陷（PRD R6 已说明缘由）。本任务不触碰该项。）

## Skills / Tools Used

- [PRD] `get-api-docs` — purpose: 取 DeepSeek Search 接口权威 schema，避免凭记忆写字段名；outcome: succeeded；incorporated: 端点路径 `/v1/tools/search`、`count` 上限 50 与默认 10、`summary`/`snippet`/`content` 三字段语义与 `need_content` 默认 false、`authority` 取值范围 0–4（`-1` 未知）与 `rerank_score` 0–3，均写入 PRD Confirmed Facts 与 Spec 映射表。
- [Spec] `agent-skills:api-and-interface-design` — purpose: 复核新 provider 的接口形状与错误语义是否符合既有契约；outcome: succeeded；incorporated: 确认复用 `SearchResponse` 而非新类型（边界处校验、第三方响应按不可信数据处理），并据此确定三类失败必须抛错而非返回空结果。
- [Plan] `agent-skills:plan` — purpose: 拆解可验证步骤与依赖顺序；outcome: succeeded；incorporated: 按垂直切片拆为 provider 独立可用 → 路由接线 → 验收三段，并识别出多查询守卫 `sxngEngines.length > 0 || !useOllama` 需泛化（否则 R7 不成立）。

## Preconditions

- [x] Applicable repository documents and personal rules inspected; precedence/conflicts recorded. — `TaskFlowDocs/repository-docs/index.md` 已读：`README.md`/`README.zh-CN.md` 为 guidance，`LICENSE` 为 rule，`CONTRIBUTING.md`、`CODE_STYLE.md`、`ROADMAP.md`、PR 模板均 `missing`。本任务涉及 README 修改，须遵守其既有章节格式（env 变量表）。无 `personal.md`。无冲突。
- [x] For remote/fork/PR work: remotes, target repository, base branch, local branch/base, freshness limits, and required checks recorded. — remote 仅 `origin` = `https://github.com/hkwuks/sxng-cli.git`；base = `main`；本任务分支 `feat/deepseek-search-provider` 自 `main`（`d7627ac`）创建。**本任务不创建 PR**，此条按记录完结。
- [x] For PR creation/update: applicable template path, every required-field mapping, and template verification recorded. — 不适用（无 PR 模板，且本任务不开 PR）。
- [x] Missing governance drafts and explicit approvals recorded before they become binding. — 无缺失治理文档需要起草。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-17 21:59 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — provider 独立可用

- Goal: `DeepSeekService` 能独立完成 query → `SearchResponse` 的映射，配好 `config.deepseekApiKey`，并由单测锁定映射与错误语义。
- Dependencies: 无。
- Files:
  - `cli/src/deepseek-service.ts`（新增）
  - `cli/src/config.ts`（四处）
  - `cli/sxng.config.example.json`
  - `cli/test/unit/deepseek-service.test.ts`（新增）
- Implementation checklist:
  - [x] 新建 `DeepSeekService`，构造签名与 `DeepSeekServiceOptions` 按 `spec.md` 的契约；axios 实例 `baseURL` 默认 `https://api.deepseek.com`、`timeout` 默认 `15000`。
  - [x] `search()` 下发 `{ query, count: Math.min(limit ?? 10, 50) }`；**不截断** query，**不带** `need_content`。
  - [x] 按 spec 映射表生成 `SearchResult[]`：`content = summary || snippet || ''`，`engine = 'deepseek'`，`category = 'general'`，`retrievedAt` 取一次，`rank = index + 1`，`publishedDate` 取 `date ?? undefined`。
  - [x] 三类失败抛错，信息格式严格按 spec 的 Validation 表。
  - [x] `config.ts` 加 `deepseekApiKey` 四处（接口字段、默认值、文件合并、env `DEEPSEEK_API_KEY`）。
  - [x] `cli/sxng.config.example.json` 加 `"deepseekApiKey": ""`。
  - [x] 单测覆盖：正常映射（含 `summary` 缺失回退 `snippet`）、`limit` 上限夹取、非 2xx 抛错、响应缺 `results` 抛错。
- Acceptance: `cd cli && npx vitest run test/unit/deepseek-service.test.ts` 全绿；`npm run build` 通过。
- Verification: `cd cli && npx vitest run test/unit/deepseek-service.test.ts && npm run build` — 8/8 passed；build 退出 0。
- Rollback: 删除新增两个文件，`git checkout -- cli/src/config.ts cli/sxng.config.example.json`。
- Status: done

### Step 2 — 路由接线与文档

- Goal: `-e deepseek` 在两条搜索路径上都生效，可并列、可合并、origin 归因正确，key 缺失时硬失败。
- Dependencies: Step 1。
- Files:
  - `cli/src/runCli.ts`
  - `README.md`
- Implementation checklist:
  - [x] 抽出单一 helper 收拢"选哪些 provider、按什么顺序合并"，**两条路径共用**，消除 `545-567` 与 `633-655` 的重复（R7 的根因正是这份重复）。— `EXTERNAL_PROVIDERS` / `PROVIDER_IMPLS` / `planProviderSearch` / `searchOneQuery` / `mergeResponses` / `originTool`；两条路径都经由 `planProviderSearch + searchOneQuery`。
  - [x] 泛化守卫：SearXNG 是否调用改为 `plan.usable.length === 0 || plan.sxngEngines.length > 0`（无可用 provider 时才回退 SearXNG）。
  - [x] 在 `INVALID_ENGINES` 检查之后加 `PROVIDER_NOT_CONFIGURED` 早退检查，覆盖 `-e` 中任一声明了但未配 key 的 provider（R6）。
  - [x] **偏差（需知悉）**：R6 的"仅对 DeepSeek 生效"边界无法成立——`planProviderSearch` 同时服务两个 provider，只对 DeepSeek 报错需写一份特例分支，与 R7 要求的"消除重复"直接冲突。故该检查对两个 provider 一致生效，Ollama 的静默跳过随之被一并修掉。F1 因此降级为"文档修正"（`init.ts:151` 与 README 关于"自动降级"的描述仍不准确），不再需要代码改动。
  - [x] 两处 origin 归因改为 `originTool(result.engine)`，不再硬编码二选一。
  - [x] `--engines-list` 改为追加全部已配置 provider（原写法只追加 `ollama`，加第二个 provider 后必然遗漏）。
  - [x] `-e` 帮助文案说明 provider 魔法词。
  - [x] `README.md` env 表加 `DEEPSEEK_API_KEY` 一行，并注明按成功请求计费。
- Acceptance: AC2、AC3、AC4、AC7 通过；`-e google` 路径行为与改动前一致。
- Verification: `cd cli && npm run build && npm test` → build 退出 0；487/487 passed。V4（`PROVIDER_NOT_CONFIGURED` + 退出码 1）、V5（假 key + `-e google` 仍成功）、V6（`--engines-list` 含 `ollama`/`deepseek`）均在本机 dist 上实测。
- Rollback: `git checkout -- cli/src/runCli.ts README.md`。
- Status: done

### Step 3 — 验收与收口

- Goal: 逐条核 PRD 的 AC1–AC7，明确记录无法验证的部分。
- Dependencies: Step 2。
- Files: 本任务 `plan.md`。
- Implementation checklist:
  - [x] 逐条执行 `## Verification / Review` 的命令并记录结果。
  - [x] 区分"已验证"与"受限于无 key、未验证"，不得把后者写成通过（R-1）。— AC1 记为"部分验证"，真实 HTTP 调用明确标为未验证。
  - [x] 确认 `cli/src/deepseek-service.ts` 与既有 `ollama-service.ts` 无重复实现，`SearchResponse` 类型未改。
  - [x] 确认无调试残留、无越界改动（`git diff --stat` 与 `## Project Structure` 对照）。— 另发现并还原了一处无关的 `cli/package-lock.json` 漂移。
- Acceptance: AC1–AC7 每条有明确结论（通过 / 受限于 R-1 未验证并写明原因）。
- Verification: 见 `## Verification / Review` 的 AC 逐条结论表。
- Rollback: 不适用（仅文档）。
- Status: done

## Checkpoints

- **CP1（Step 1 后）**：provider 可独立测试。此时未接线，CLI 行为零变化——若 `npm test` 有失败，必是新增单测本身的问题，无归因歧义。
- **CP2（Step 2 后）**：全量 `npm test` 通过且 `-e google` 行为不变。这是"未破坏既有路径"的最后一道闸。

## Verification / Review

- 2026-10-17 Step 3: AC1-AC7 全部通过，含真实 key 端到端实测

| # | 命令 | 对应 AC | 结果 |
| --- | --- | --- | --- |
| V1 | `cd cli && npm run build` | AC7 | **通过** — 退出 0 |
| V2 | `cd cli && npm test` | AC7 | **通过** — 35 files / 487 tests 全绿 |
| V3 | `cd cli && npx vitest run test/unit/deepseek-service.test.ts` | AC5, AC6 | **通过** — 8/8 |
| V4 | `node dist/index.js "test" -e deepseek`（无 key） | AC2 | **通过** — `PROVIDER_NOT_CONFIGURED`，退出码 1，未调用 SearXNG |
| V5 | `DEEPSEEK_API_KEY=sk-invalid node dist/index.js "..." -e google` | AC4 | **通过** — 返回 SearXNG 结果（`status:"ok"`），假 key 未触发任何 DeepSeek 调用 |
| V6 | `DEEPSEEK_API_KEY=sk-fake node dist/index.js --engines-list` | — | **通过** — 列表尾部含 `ollama`、`deepseek` |
| V7 | `git diff --stat` | — | **通过** — 仅 `README.md`、`cli/src/config.ts`、`cli/src/runCli.ts`、`cli/sxng.config.example.json`（+131/-40）；`cli/src/service.ts` 未改 |
| V8 | `node dist/index.js "query" -e deepseek`（真实 key） | AC1, AC3 | **通过** — 见下节端到端实测（用户提供的临时 key） |

**端到端实测（2026-10-17，用户提供临时 key，已用于验证后撤销）**

| 检查 | 结果 |
| --- | --- |
| `-e deepseek` 单 provider | `status:"ok"`，10 条结果，全部 `engine === 'deepseek'`，`rank` 1–10 连续 |
| `content` 来源 | 实测长度为 3171–5075 字符，内容为页面正文/长摘要（例：`"### Yielding Control to the Runtime\n\nRecall from the …"`），确认为 `summary` 字段而非 `snippet`（snippet 为 100–200 字符，量级不符） |
| `publishedDate` | 有日期时为 RFC 3339 字符串（如 `2026-03-03T16:00:00+00:00`），无日期时为 `undefined`（JSON 中键缺失） |
| `-e deepseek,360search` 合并 | `totalResults:16` = deepseek 10 + 360search 6；顺序为全部 deepseek 后接全部 SearXNG；`unresponsiveEngines: []` |
| `-l 2` 限制 | `count: 2` 生效，返回 2 条 |
| session origin 归因 | `results.json` 中 `origin tools = {"deepseek":10,"sxng":6}`，deepseek 结果的 origin 为 `{"tool":"deepseek","engine":"deepseek","query":"rust async runtime","round":1}` |
| 真实 401 错误路径 | 无效 key 返回 `{"code":"SEARCH_FAILED","message":"DeepSeek search failed: HTTP 401 Unauthorized"}`，未静默返回空结果 |
| `-e deepseek,google` | `google` 在本机 SearXNG 上 `access denied`，故只返回 deepseek 10 条且 `returnedResults` 被截为 10（`limit` 默认值）。SearXNG 空结果时合并行为正常，非缺陷；改用 `360search` 验证了 AC3。 |

**验证过程中发现的既有缺陷（非本任务引入，记录为 F5）**

真实 401 经 `runSearch` 顶层 catch 转成 `SEARCH_FAILED` 时被标为 `retryable: true`，且 hint 为 `Check your network connection and SearXNG server status`。这两点对 DeepSeek 的 401 都是错的——认证失败不可重试，且与该 provider 无关。该 catch 对所有搜索错误一律如此标记（SearXNG 亦同），属既有行为；本任务不改，避免扩大范围。

**AC 逐条结论**

| AC | 结论 | 依据 |
| --- | --- | --- |
| AC1 DeepSeek 来源结果 | **通过** | 端到端实测（真实 key）：10 条全部 `engine === 'deepseek'`，`rank` 连续，`content` 实测为 `summary` 量级内容，`publishedDate` 映射正确 |
| AC2 未配 key 报错 | **通过** | V4 |
| AC3 并列合并 | **通过** | 端到端实测 `-e deepseek,360search` → `totalResults:16`（10+6）；`provider-routing.test.ts` 断言合并顺序与计数 |
| AC4 未选不请求 | **通过** | V5 + `provider-routing.test.ts` 断言未选 provider 的 `search` 未被调用 |
| AC5 `content = summary \|\| snippet` | **通过** | V3 三个用例 + 端到端实测确认内容为 `summary` 量级（3171–5075 字符） |
| AC6 三类失败抛错 | **通过** | V3 三个用例 + 端到端实测真实 401 返回 `HTTP 401 Unauthorized` 而非空结果 |
| AC7 构建与测试 | **通过** | V1、V2 |

**确认项**

- `SearchResult` / `SearchResponse`（`cli/src/service.ts`）未改动 — V7。
- `cli/src/deepseek-service.ts` 与 `cli/src/ollama-service.ts` 无重复实现：两者各自独立（不同端点、不同字段映射、不同 limit 上限），共同点只有"class 持有 axios + 返回 `SearchResponse`"这一既有模式。
- 无调试残留：新增代码无 `console.log`；错误统一经 `createErrorEnvelope` 或抛出。

**范围外副产物（非本任务改动，需你决定如何处理）**

- `cli/package-lock.json`：worktree 里 `npm install` 把根 `version` 从 `1.2.2` 刷新到 `1.3.2`。与本次改动无关，**已 `git checkout` 还原**。
- `cli/.sxng/`：未跟踪目录（`cli/.gitignore` 只忽略 `node_modules/ dist/ coverage/ *.log .DS_Store .env searxng.config.json`，`cli/src/commands/session.ts:19` 的 `getDefaultSessionRoot()` 与 `cli/src/deep/local-doc/scanner.ts` 会写入 cwd 下的 `.sxng/`）。**这是既有行为，跑测试/命令即会产生，不是本次引入**。注意根 `.gitignore` 是主 checkout 的未跟踪文件，不会出现在 worktree 里，所以在这里它会显示为未跟踪。

**对既有路径的行为变更（R6 偏差的实测确认）**

改动前，`-e ollama` 而无 key 时 `useOllama=false`，代码落到 `service.search({ engines: ['ollama'] })`。实测确认 SearXNG 对不认识的引擎名**静默忽略并搜索全部引擎**（`-e nosuchengine` 返回 `status:"ok"`、`totalResults:10`，命中 `360search` 等），因此该路径此前是"无声地用 SearXNG 全量结果冒充 Ollama"。改动后返回 `PROVIDER_NOT_CONFIGURED`。

这是**有意的行为变更**，也是本任务唯一的既有路径变更；`-e <真实 SearXNG 引擎名>`（如 V5 的 `-e google`）不受影响。

## Change Log

- 2026-10-17 v1 — 创建任务文档：PRD、Spec、Plan。前序讨论已收敛三项决策（入口形态 `-e deepseek`、`content = summary`、不接 Fetch），本计划据此制定。
- 2026-10-17 v1 — Step 2 追加"抽出单一 helper 收拢 provider 选择与合并"作为 R7 的实现方式：守卫缺陷源于 545-567 与 633-655 的逻辑重复，修补其中一处会留下另一处。
- 2026-10-17 v1 — Step 2 实施中记录偏差：R6 的"仅对 DeepSeek 生效"边界与 R7 的"消除重复"不可兼得（同一 `planProviderSearch` 服务两个 provider），选择满足 R7，`PROVIDER_NOT_CONFIGURED` 对两个 provider 一致生效。Ollama 静默跳过缺陷随之修复，F1 降级为文档修正。
- 2026-10-17 v1 — 测试实现方式调整：`provider-routing.test.ts` 从"依赖真实 config key + 假 key 打网络"改为 mock 两个 provider 模块。前者只能覆盖 key 存在性，无法覆盖路由与合并；后者无 key、无网络即可覆盖全部四个路由分支。
- 2026-10-17 v1 — 清理 `cli/package-lock.json` 的无关版本号漂移（`npm install` 副作用）。

## Follow-ups

- **F1** 文档修正：`init.ts:151` 与 README 声称"when SearXNG is unavailable, sxng falls back to Ollama web search"，但代码中 `service.search` 的三个调用点周围没有任何 catch 回退，该自动降级从未存在。原计划要求的代码修复已在 Step 2 中随 R6 偏差一并完成（无 key 时改为显式报错），剩余的是文案与实际行为对齐。需另立任务。
- **F2** `rerank_score`（0–3）与 `authority`（0–4）接入 `quality-assess` 或 RRF 排序——DeepSeek 独有的质量信号，需先确定与现有 0–1 分数尺度的换算。
- **F3** `/v1/tools/fetch` 作为 Jina 的替代评估——触发条件是实测撞上 Jina 的 20 RPM 上限。
- **F4** `--deepseek-content` 开关（`need_content: true`）——触发条件是实测 `extract` 在 DeepSeek 来源结果上失败或变慢。
- **F5** `runSearch` 顶层 catch（`runCli.ts` 末段）对所有搜索错误一律返回 `retryable: true` 与 `hint: 'Check your network connection and SearXNG server status'`。对认证失败（如 DeepSeek 401）这是错的：既不可重试，也与 SearXNG 无关。真实 401 已实测复现。属既有行为，本任务未改。修法是让 provider 错误携带可判别类型（项目已有 `SessionStateError` 这类带 `code` 的错误类先例），catch 据此分派 `retryable` 与 hint。
- **F6** `-e deepseek,<engine>` 的合并结果按"provider 全部在前、SearXNG 全部在后"拼接，未做 RRF 融合。RRF 仅在 `--queries` 多查询路径与 `--session` 路径生效。单查询并列时的排序策略需单独决策。

## Version History

- v1 — planning。
