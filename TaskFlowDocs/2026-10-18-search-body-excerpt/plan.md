# Plan — 搜索期的正文不再被丢弃：`snippet` 显示位 + 正文落入 `excerpt`

> Task version: v2
> Status: checking

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

- Status: approved
- Approved by: user
- Approved at: 2026-10-18 21:00 +0800
- Approved version: v2
- Approved scope: PRD / Plan

## Steps

> **v2 说明**：以下为 v2 内容。`## Approval` 块记录的是 v1 的批准，**不覆盖 v2**；实施已在 v2 文档写完时停止，待重新批准后再继续。v1 期间完成的代码改动保留在工作树中——其结论在 v2 下不变，只有 pending 预览那一处被撤回。

### Step 1 — 搜索层契约：`SearchResult.snippet` 与 DeepSeek 映射

- Goal: 让"provider 给的短显示文本"在搜索层有名字，并让 DeepSeek 把它填进去；SearXNG/Ollama 明确保持不变。
- Dependencies: 无
- Files: `cli/src/service.ts`、`cli/src/deepseek-service.ts`、`cli/test/unit/deepseek-service.test.ts`
- Implementation checklist:
  - [x] `SearchResult` 增加 `snippet?: string`（放在 `content` 之后，注释说明它是显示位、`content` 是分析位）。
  - [x] `DeepSeekService` 映射：`snippet: item.snippet || undefined`、`content: item.summary || item.snippet || ''`；复用已有的 `DeepSeekSearchItem.snippet`。
  - [x] 确认 `SearXNGService`（`service.ts:138`）与 `OllamaService` 的映射零改动——不写 `snippet`（`git diff` 显示两者均未被触碰）。
  - [x] 单元测试：`summary` 有值时 `snippet === 接口 snippet` 且 `content === summary`；`summary` 为空串时 `content === snippet`；`snippet` 缺失时为 `undefined`、`content` 回退为空串。
- Acceptance: AC1、AC2
- Verification: `cd cli && npx vitest run test/unit/deepseek-service.test.ts` → 14 passed
- Rollback: 还原三个文件；`snippet` 为可选字段，无落盘影响，回滚无数据迁移。
- Status: done

### Step 2 — Session 层：正文落 `excerpt`，`snippet` 不留存

- Goal: 搜索结果进入 session 时，正文写入 `excerpt` 而不是被删除；落盘对象上不出现 `snippet`。
- Dependencies: Step 1（`snippet` 必须先存在于输入契约，Step 2 才有"要删"的东西）
- Files: `cli/src/deep/session.ts`、`cli/test/integration/session.test.ts`
- Implementation checklist:
  - [x] `SessionResultInput` 显式声明 `snippet?: string`。该类型有 `[key: string]: unknown`，不声明也能传进来，但 `tsc` 需要它才允许 `delete result.snippet`——否则报 `{} | undefined` 不可赋给 `string | undefined`。
  - [x] `makeResult` 创建分支：`search` 类型仍删 `content`/`extractor`/`extractedAt`，同时删除 `snippet`，并让 `excerpt` 从输入的 **`content || snippet`** 取值——正文优先，正文缺失时才退到显示短文本。**顺序不可颠倒**：`excerpt` 在这一层的语义是"这条结果的正文"。
  - [x] `appendSessionResults` 更新分支：在既有 `excerpt` 写入之后补一条 `else if`，条件为 `input.excerpt === undefined && inferredContentType(input) === 'search' && existing.contentType === 'search'`，填入 `input.content || input.snippet`，并删除 `snippet`。两个 `search` 判定都必要：前者排除"这次输入是提取结果"，后者排除"既有条目是提取结果"——提取条目的 `excerpt` 是页面 description。
  - [x] 落点在 `session.ts` 内部，不在调用方：`runCli.ts` 两个搜索路径、`local-doc/searcher.ts`、`results-add` 都经由 `appendSessionResults`；`results-add --kind search` 既不发 `content` 也不发 `snippet`，其显式 `excerpt` 行为不受影响。
  - [x] 不改 `hasVerifiedContent`（`session.ts:302-312`）、不改 `contentType` 推断（`session.ts:182-185`）。
  - [x] 测试：创建分支、正文缺失时的回退、显式 `excerpt` 优先、更新分支刷新、提取条目豁免、提取条目上的游离 `snippet` 被清除。
- Acceptance: AC3、AC6
- Verification: `cd cli && npx vitest run test/integration/session.test.ts` → 16 passed
- Rollback: 还原两个文件。已落盘的旧 session 不受影响（本次不写迁移）。
- Status: done

### Step 3 — 显示层：`snippet ?? excerpt ?? content` 回退链

- Goal: 显示口只读短文本，回退链只有一份实现。
- Dependencies: Step 1、Step 2（读取方要能拿到 `snippet`，也要能拿到 `excerpt`）
- Files: `cli/src/runCli.ts`、`cli/test/unit/cli.test.ts`
- Implementation checklist:
  - [x] 模块内 helper `displayText(r)` 返回 `r.snippet || r.excerpt || r.content || ''`。用 `||` 而非 `??`：provider 给的空串与缺字段，对显示层是同一件事。
  - [x] 只用于 `formatAsMarkdown`（`runCli.ts:82-83`）。
  - [x] **pending 预览（`runCli.ts:1656,1670`）不改**，并在原处加注释说明它审阅的是 `content`。理由：该列表由 `getPendingResults`（`session.ts:479-483`）供给，要求 `hasVerifiedContent(result)`，**全部是提取结果**；套显示回退不会让搜索正文变得可见（它根本不进这个列表），只会让页面 description 顶替正在被审阅的正文。见 `prd.md` R4/AC5 的 v2 修订。
  - [x] 不截断任何正文（用户决策：不改变现有长度）。
  - [x] 测试：有 `snippet` 时 md 显示 `snippet` 且不显示 `content`；无 `snippet` 时回退到 `content`；session 经 RRF 合并进来的搜索结果显示其 `excerpt`。
- Acceptance: AC4、AC5
- Verification: `cd cli && npx vitest run test/unit/cli.test.ts` → 18 passed
- Rollback: 还原两个文件，输出回到改动前。
- Status: done

### Step 4 — 全量验证与验收记录

- Goal: AC1–AC7 逐条有证据，且证明 SearXNG/Ollama 输出形状未变。
- Dependencies: Step 1、2、3
- Files: `TaskFlowDocs/2026-10-18-search-body-excerpt/plan.md`
- Implementation checklist:
  - [x] `cd cli && npm run build` 通过。
  - [x] `cd cli && npm test` 全量通过 → 35 files / 495 tests（改动前 487）。
  - [x] 对真实 SearXNG 跑 `--session`，核对 AC3 的落盘对象。
  - [x] 用单元测试覆盖 AC1 的接口侧（真实 DeepSeek 需 key，见 `prd.md` R-4）。
  - [x] 对比改动前后的 md 输出形状（AC4 的"零变化"半句）；按 v2 修订改用行多重集比较，理由见 `## Verification / Review`。
  - [x] 结果写入 `## Verification / Review`。
- Acceptance: AC1–AC7
- Verification: 上述命令输出，见 `## Verification / Review`
- Rollback: 分支整体丢弃即可；无迁移、无外部副作用。
- Status: done

## Checkpoints

- 每步结束后运行该步的聚焦测试；三步全绿后再进 Step 4 的全量验证。
- Step 3 结束时对照 `prd.md` R-2 复核：本次改动**不含**任何限制输出长度或改动 `process.exit` 的内容（已核对 `git diff`：`process.exit` 一处未动）。

## Verification / Review

全部命令在任务工作树 `.worktrees/search-body-excerpt/cli` 下执行。

| AC | 证据 | 结论 |
| --- | --- | --- |
| AC1 | `npx vitest run test/unit/deepseek-service.test.ts` 14 passed：`summary`→`content`、`snippet`→`snippet`、`summary` 空时 `content` 回退到 `snippet`、两者皆无时 `content === ''` 且 `snippet === undefined` | 通过（夹具） |
| AC2 | 真实 SearXNG 一次 `--session` 运行：5 条结果**无一条**带 `snippet` 键；`git diff` 确认 `service.ts:138` 与 `ollama-service.ts` 的映射未改 | 通过 |
| AC3 | 同一运行读 `/tmp/sess-ac5/results.json`：5 条全部 `contentType: "search"`、`"content" in r === false`、`"snippet" in r === false`、`excerpt` 等于该条 provider `content`（首条 183 字符） | 通过 |
| AC4 | `--format md` 下 DeepSeek 结果走 `snippet`（单元测试断言显示 `short blurb` 且不显示长正文）；SearXNG/Ollama 的 md 形状对比见下 | 通过 |
| AC5 | pending 预览保持读 `content`；`getPendingResults` 只返回 `hasVerifiedContent` 结果，搜索正文按设计不进该列表 | 通过（修订后） |
| AC6 | `hasVerifiedContent` 未改动；`cli.test.ts` 既有的 `RESULT_NOT_VERIFIED` 用例仍通过 | 通过 |
| AC7 | `npm run build` 无错；`npm test` 35 files / 495 tests 全通过 | 通过 |

**AC4 的"零变化"是怎么验的，以及为什么原方法不成立。** 先试了逐字节比较，两点原因都已实测：

1. 同一份构建连跑两次的输出本身就不同——Ollama 返回的是实时页面正文，`- Total downloads:`、`- Dependents:`、features 列表每次都变。以同一构建自比为噪声基线，得到 75 行差异，即噪声大于信号。
2. 两条流都在 **65,536 字节处被截断**（`wc -c` 均为 65536），正是 `TF-20261018-282836` 记录的既有缺陷。对已被截断的输出做逐字节比较没有意义。

改用**行多重集比较**：两次运行各自输出后按行排序再比。结论是差异只出现在正文内容行（下载量数字、features 列表顺序、版本表数字），md 结构全部一致——`## Search:` 头、结果条数、每条标题行、`Rank: … Engine: …` 元数据行均相同。即输出**形状**未变，变的只是 provider 每次给的正文本身。

副作用已知且已记录：本任务**没有**改变任何输出的长度上限，`process.exit` 一处未动，因此管道截断行为与改动前一致。`prd.md` R-2 要求两个改动分次验收，本次遵守。

## Change Log

- 2026-10-18 v1 — 由 `TF-20261017-d8f7b3` 提升并拆出 `TF-20261018-282836`，形成初始 v1；affects `prd.md`、`plan.md`、`TaskFlowDocs/todo.md`。
- 2026-10-18 v1（工作修订）— 用户批准 v1（20:35 +0800）；实施 Step 1–3 并跑通聚焦测试；affects `cli/src/service.ts`、`cli/src/deepseek-service.ts`、`cli/src/deep/session.ts`、`cli/src/runCli.ts` 及三个测试文件。
- 2026-10-18 v2（Task 版本实质变更）— 实施中发现 v1 对代码的两处错误假设：pending 列表要求 `hasVerifiedContent`、不接受搜索正文（原 R4 第二写入方与 AC5 作废）；`excerpt` 取值须正文优先、更新分支须限定在搜索条目之间。另将 `snippet` 在 `SessionResultInput` 上显式声明，并把 AC4 的逐字节比较改为行多重集比较。v1 文档归档到 `old/v1/`，任务回到 `ready` 待重新批准；affects `prd.md`、`plan.md`、`cli/src/deep/session.ts`、`cli/src/runCli.ts`、`cli/test/`。
- 2026-10-18 v2（工作修订）— 用户批准 v2 后按评审意见收紧两处代码，行为不变：`displayText` 的注释改为说明它**不**用于 pending 列表（原先"两个显示位"的措辞与 v2 撤回后的事实不符）；`makeResult` 改为仅在 `content || snippet` 非空时才赋值 `excerpt`，避免写出一个值为 `undefined` 的键（`JSON.stringify` 本就会丢弃它，故落盘结果与之前相同）。build 与 495 tests 复跑通过；affects `cli/src/runCli.ts`、`cli/src/deep/session.ts`。

## Follow-ups

- `TF-20261018-282836` — `process.exit()` 截断管道 stdout；本任务合并且 md 输出确认稳定后再动，否则两个效果无法分辨。
- `TF-20261017-83df6c` — 把 `-e deepseek` 与新的 `snippet` 语义同步进 `skills/sxng`。
- `TF-20261017-25e067` — DeepSeek `rerank_score` / `authority` 是否作为排序信号（需 key 实测）。

## Version History

- v1 — 初始版本；planning。
- v2 — 实施中修正对代码的两处错误假设，见 Change Log；v1 归档于 `old/v1/`。
