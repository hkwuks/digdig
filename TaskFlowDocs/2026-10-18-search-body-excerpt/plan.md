# Plan — 搜索期的正文不再被丢弃：`snippet` 显示位 + 正文落入 `excerpt`

> Task version: v1
> Status: ready

No spec required — small, self-contained task（4 个文件、两条已定位的写入链）。

## Spec Pointers

- 无 `spec.md`。契约形状由 `prd.md` 的 Requirements 节直接确定，改动面小到无需单独 Spec。

## Reference Pointers

- 上游待办：`TaskFlowDocs/todo.md` → `TF-20261017-d8f7b3`（含全部实测数据、字段映射表、层级决策与理由）。
- 拆出的姊妹待办：`TaskFlowDocs/todo.md` → `TF-20261018-282836`。

## Related Tasks

- Parent: `None`
- Children: `None`
- Depends on: `None`
- Blocks: `TF-20261018-282836`（`process.exit` 那项会改变同一段 md 输出的长度；见 `prd.md` R-2，两者须分次改动、分次验收）
- Related: `TF-20261018-282836`（同一次调研拆出的另一半）

## Skills / Tools Used

- [PRD] `agent-skills:api-and-interface-design` — purpose: 复核 `snippet?` 这个增量字段的接口形状是否符合既有契约，以及"显示/分析两位分开"是否属于破坏性变更；outcome: succeeded；incorporated: 确认新增**可选**字段属 `Prefer Addition Over Modification`（`snippet?` 不改动、不移除任何既有字段，`content` 语义不动）；据此确定 R1/R3——SearXNG 与 Ollama 不填 `snippet`，回退责任落在读取方而非每个写入方；并把"第三方响应按不可信数据处理"落实为 R2 的 `item.summary || item.snippet || ''` 显式回退（而非直接透传）。
- [Plan] `agent-skills:planning-and-task-breakdown` — purpose: 把改动拆成可独立验证的步骤并排出依赖顺序；outcome: succeeded；incorporated: 按依赖自下而上排为"契约字段 → 写入端 → 读取端 → 测试"，识别出 `appendSessionResults` 的创建分支与更新分支是**两条**都要覆盖的路径（原待办只写了 `makeResult` 一处），并把 R-2 的互相掩盖风险提升为一个显式验收顺序约束（先落本任务、再动 `process.exit`）。

## Preconditions

- [x] 已读 `TaskFlowDocs/repository-docs/index.md` 并按相位取源：本任务为 code + commit/PR 相位。该索引中 `CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md` 均为 `missing`，`LICENSE`（MIT）为 `ready`。**结论：仓库未提供代码风格、提交规范或 PR 模板，因此不存在可冲突的仓库规则**；`prd.md` 的 In Scope 不含治理文档的创建（那属 `TF-20261017-bfc96d`）。个人规则 `personal.md` 在本 clone 中**不存在**。
- [x] 无远程/fork/PR 目标待定：本仓库 `origin` = `https://github.com/hkwuks/sxng-cli`，base = `main`，任务分支 `feat/search-body-excerpt` 自 `main`（`2f8085f`）切出。PR 模板不存在，故无必填字段映射可做——这一点在 PR 创建时按 `SKILL.md` 的"缺失必填项即阻塞"规则复核。
- [x] 无缺失治理草案待批：本任务不创建任何仓库级治理文档。
- [ ] 用户批准 v1 后方可实施（`ready` 不等于批准）。

## Approval

- Status: requested
- Approved by: pending
- Approved at: pending
- Approved version: pending
- Approved scope: pending

## Steps

### Step 1 — 搜索层契约：`SearchResult.snippet` 与 DeepSeek 映射

- Goal: 让"provider 给的短显示文本"在搜索层有名字，并让 DeepSeek 把它填进去；SearXNG/Ollama 明确保持不变。
- Dependencies: 无
- Files: `cli/src/service.ts`、`cli/src/deepseek-service.ts`、`cli/test/unit/deepseek-service.test.ts`
- Implementation checklist:
  - [ ] `SearchResult` 增加 `snippet?: string`（放在 `content` 之后，注释说明它是显示位、`content` 是分析位）。
  - [ ] `DeepSeekService` 映射：`snippet: item.snippet`、`content: item.summary || item.snippet || ''`；`DeepSeekSearchItem` 若已含 `snippet` 则复用其类型。
  - [ ] 确认 `SearXNGService`（`service.ts:138`）与 `OllamaService` 的映射零改动——不写 `snippet`。
  - [ ] 更新/新增单元测试：`summary` 有值时 `snippet === 接口 snippet` 且 `content === summary`；`summary` 为空串时 `content === snippet`；`snippet` 缺失时为 `undefined`、`content` 回退为空串。
- Acceptance: AC1、AC2
- Verification: `cd cli && npx vitest run test/unit/deepseek-service.test.ts`
- Rollback: 还原三个文件；`snippet` 为可选字段，无落盘影响，回滚无数据迁移。
- Status: pending

### Step 2 — Session 层：正文落 `excerpt`，`snippet` 不留存

- Goal: 搜索结果进入 session 时，正文写入 `excerpt` 而不是被删除；落盘对象上不出现 `snippet`。
- Dependencies: Step 1（`snippet` 必须先存在于输入契约，Step 2 才有"要删"的东西）
- Files: `cli/src/deep/session.ts`、`cli/test/integration/session.test.ts`
- Implementation checklist:
  - [ ] `makeResult` 创建分支：`search` 类型仍删 `content`/`extractor`/`extractedAt`，同时删除 `snippet`，并让 `excerpt` 从输入的 `snippet ?? content` 取值（`content` 即 provider 正文）。
  - [ ] `appendSessionResults` 更新分支：`session.ts:420-421` 现有 `excerpt` 写入处同时接收 `snippet ?? content`，并删除 `snippet`；保证 `changed` 判定正确（值变化才 `touch`）。
  - [ ] 不改 `hasVerifiedContent`（`session.ts:300-309`）、不改 `contentType` 推断（`session.ts:182-185`）。
  - [ ] 测试：`appendSessionResults` 一条带 `content`+`snippet` 的搜索输入后，落盘对象 `contentType === 'search'`、`content === undefined`、`excerpt === content 原值`、无 `snippet` 键；同 URL 二次追加仍然只更新、不新增。
- Acceptance: AC3、AC6
- Verification: `cd cli && npx vitest run test/integration/session.test.ts`
- Rollback: 还原两个文件。已落盘的旧 session 不受影响（本次不写迁移）。
- Status: pending

### Step 3 — 显示层：`snippet ?? excerpt ?? content` 回退链

- Goal: 显示口只读短文本，回退链只有一份实现。
- Dependencies: Step 1、Step 2（读取方要能拿到 `snippet`，也要能拿到 `excerpt`）
- Files: `cli/src/runCli.ts`、`cli/test/unit/cli.test.ts`
- Implementation checklist:
  - [ ] 加一个模块内 helper（如 `displayText(r)`）返回 `r.snippet ?? r.excerpt ?? r.content`，`formatAsMarkdown`（`runCli.ts:70`）与 pending 预览（`runCli.ts:1644`）都用它；不得各写一份表达式。
  - [ ] pending 预览的 `contentLength` 若继续基于 `r.content?.length`，需确认它不因本次改动而撒谎（预览文本与长度须来自同一个字段）。
  - [ ] 不截断任何正文（用户决策：不改变现有长度）。
  - [ ] 测试：有 `snippet` 时 md 输出显示 `snippet`；只有 `excerpt` 时显示 `excerpt`；都没有时显示 `content`。
- Acceptance: AC4、AC5
- Verification: `cd cli && npx vitest run test/unit/cli.test.ts`
- Rollback: 还原两个文件，输出回到改动前。
- Status: pending

### Step 4 — 全量验证与验收记录

- Goal: AC1–AC7 逐条有证据，且证明 SearXNG/Ollama 输出未变。
- Dependencies: Step 1、2、3
- Files: `TaskFlowDocs/2026-10-18-search-body-excerpt/plan.md`
- Implementation checklist:
  - [ ] `cd cli && npm run build` 通过。
  - [ ] `cd cli && npm test` 全量通过。
  - [ ] 对真实 SearXNG 跑一次 `--session`（本机已有配置），核对 AC3 的落盘对象。
  - [ ] 用固定响应夹具覆盖 AC1 的接口侧（真实 DeepSeek 需 key，用户上一次的临时 key 已注销——见 `prd.md` R-4）。
  - [ ] 与改动前的 md 输出逐字节对比 SearXNG/Ollama（AC4 的"零变化"半句）。
  - [ ] 把结果写入本节的 Verification / Review。
- Acceptance: AC1–AC7
- Verification: 上述命令输出，逐条贴入 Verification / Review
- Rollback: 分支整体丢弃即可；无迁移、无外部副作用。
- Status: pending

## Checkpoints

- 每步结束后运行该步的聚焦测试；三步全绿后再进 Step 4 的全量验证。
- Step 3 结束时对照 `prd.md` R-2 复核：本次改动**不得**包含任何限制输出长度或改动 `process.exit` 的内容。

## Verification / Review

（Step 4 完成后填写。）

## Change Log

- 2026-10-18 v1 — 由 `TF-20261017-d8f7b3` 提升并拆出 `TF-20261018-282836`，形成初始 v1；affects `prd.md`、`plan.md`、`TaskFlowDocs/todo.md`。

## Follow-ups

- `TF-20261018-282836` — `process.exit()` 截断管道 stdout；本任务合并且 md 输出确认稳定后再动，否则两个效果无法分辨。
- `TF-20261017-83df6c` — 把 `-e deepseek` 与新的 `snippet` 语义同步进 `skills/sxng`。
- `TF-20261017-25e067` — DeepSeek `rerank_score` / `authority` 是否作为排序信号（需 key 实测）。

## Version History

- v1 — 初始版本；planning。
