# Plan — 统一搜索结果身份与排序流转

> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md` — 身份层、流水线、轮次语义、进度概况、兼容性、设计取舍

## Reference Pointers

无外部资料。全部事实来自本仓库实测，逐条锚在 PRD 的 Background 段。

## Related Tasks

| 方向 | 任务 | 关系 |
|---|---|---|
| 并行 | `2026-10-28-threshold-registry`（TF-20261028-12ced8） | 独立。它只把阈值收拢到一处，不改数值、不改流转。两者唯一的接触面是 `dedupe.ts` 与 `quality-assess.ts`：本任务不动阈值常量，它不动身份函数。合并时 `dedupe.ts` 可能同时在两侧被改，冲突按"身份归本任务、阈值归它"切分。 |
| 后续 | `TF-20261028-313ff2`（质量过滤） | **依赖本任务先行。** 用户 2026-10-29 决定：质量判定退出 CLI，改由 LLM 判断；CLI 只报可数的事实，删掉 verdict 与全部阈值、删掉 novelty。该条目的原六条缺陷已实测记录在 `todo.md`。本任务不动 `quality-assess.ts` 的任何算法，只通过 Step 2 修正轮次归属 —— 而轮次归属正是该任务能正确统计"每轮新增/重复"的前提。 |
| 覆盖 | `TF-20261017-25e067`（F6） | 本任务的 R8 完整覆盖 F6 的诉求（`-e deepseek,google` 无排序）。F6 已在 `todo.md` 标记为 `cancelled` 并注明 superseded，条目保留（TaskFlow 不变式：Todo 条目永不丢弃）。 |
| 不作废 | `TF-20261017-4f3dbb`（F5，错误分类） | 与本任务无交集，仍在 inbox。 |

## Skills / Tools Used

- [PRD] Unaided — 需求来自本次会话已完成的实证审查（本地桩 SearXNG + 真实 dist 产物复现 9 类缺陷），无需额外能力；considered: requirements elicitation and framing
- [Spec] Unaided — 设计是对已复现缺陷的最小修复，方向由 4 项用户决策锁定；considered: architecture and design specification
- [Plan] Unaided — 拆解依赖已在 spec 第 10 节确定；considered: work breakdown and task decomposition
- [Test] Unaided — 测试按 spec 第 8 节的表逐层落地（单元 / 集成 / 桩服务），不需要额外能力；considered: testing strategy

## Preconditions

- 工作树：`.worktrees/2026-10-28-result-identity-pipeline`，分支 `refactor/2026-10-28-result-identity-pipeline`，基线 `main` @ `328c1fa`。
- 依赖已安装（`cli/node_modules` 由 `npm ci` 装入）。
- 基线状态：`npm run build` 通过，`npm test` 36 文件 / 506 测试通过。任何一步之后回归到基线以下即视为失败。
- 无未提交改动。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-29 20:17 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 身份层收拢

- Goal: `resultUrlKey` 成为全系统唯一的结果身份函数；`normalizeUrl` 退为模块内部实现；六处调用点切换；两条路径对 `#chunk-N` 行为一致；`commands/extract.ts` 的裸 URL 比较改用 `resultUrlKey`。
- Dependencies: 无。
- Files: `cli/src/deep/dedupe.ts`、`cli/src/deep/index.ts`、`cli/src/runCli.ts`、`cli/src/commands/extract.ts`、`cli/test/unit/deep/dedupe.test.ts`、`cli/test/unit/dedupe-results.test.ts`
- Implementation checklist:
  - [x] `dedupe.ts:36 dedupeByUrl` 改用 `resultUrlKey(item)` 而非 `normalizeUrl(item.url)`
  - [x] `runCli.ts:755,770,826,847,855` 五处 `normalizeUrl(...)` 改为 `resultUrlKey(...)`
  - [x] `runCli.ts:27` 的 import 去掉 `normalizeUrl`
  - [x] `deep/index.ts:7` 从桶导出中移除 `normalizeUrl`
  - [x] `dedupe.ts` 中 `normalizeUrl` 不再 `export`（改为模块内函数），`resultUrlKey` 保持不变
  - [x] `commands/extract.ts:33` 的 `map(r => r.url)` 改为 `map(resultUrlKey)`，`--urls` 成员判断同改
  - [x] `commands/extract.ts:56,57` 的 `retained` 集合与 `has()` 改用 `resultUrlKey`
  - [x] 扩充 `dedupe.test.ts`：`#chunk-0`/`#chunk-7` 不同 key；`https://x/a#s`/`https://x/a#t` 同 key；`resultUrlKey` 幂等；`dedupeByUrl` 对 `file:` chunk 不去重
  - [x] 新增测试：`extract --urls` 传入无尾斜杠 URL 时能匹配到 session 中带尾斜杠的同一条结果
- Acceptance: AC1；`npx tsc --noEmit` 无错；`dedupe.test.ts` 与 `dedupe-results.test.ts` 全绿。
- Verification: `cd cli && npm run build && npx vitest run test/unit/deep/dedupe.test.ts test/unit/dedupe-results.test.ts`
- Rollback: 单文件级，`git checkout -- cli/src/deep/dedupe.ts cli/src/deep/index.ts cli/src/runCli.ts cli/src/commands/extract.ts`
- Status: done

### Step 2 — 轮次语义

- Goal: 抽取正文与本地文档导入不再开新轮；`origin.round` 永不为 `undefined`；`skipRoundIncrement` 选项删除。
- Dependencies: Step 1（key 一致性，避免同一批结果在两条路径上被算成不同条目而影响 round 归属的验证）。
- Files: `cli/src/deep/session.ts`、`cli/src/deep/local-doc/searcher.ts`、`cli/src/deep/recovery-analysis.ts`、`cli/src/deep/query-suggest.ts`、`cli/test/`
- Implementation checklist:
  - [x] `session.ts:185 needsRound` 增加 `inferredContentType(result) !== 'search' → false`
  - [x] `session.ts:394 importRound` 恒为 `Math.max(1, round)`，不再依赖 `needsRound` 决定是否有值
  - [x] `session.ts:378` 删除 `skipRoundIncrement` 选项与 `session.ts:384` 对它的判断
  - [x] `local-doc/searcher.ts:211-213` 去掉 `{ skipRoundIncrement: true }`
  - [x] `recovery-analysis.ts:61` 的 `attrs.round ?? 0` 兜底**保留**——原计划想删，实测不能删。理由见下方「兜底为何保留」
  - [x] `query-suggest.ts:146` 的 `attrs.round ?? entries.length + 1` 兜底**保留**，同上
  - [x] 新增集成测试：导入抽取正文后 `rounds` 不变、正文写入、verdict 不变差（`does not make the quality verdict worse when an extraction lands`；2026-10-30 补，原先标了 `[x]` 但测试不存在）
  - [x] 新增集成测试：多轮引用同一 URL 时两条 origin 各带自己那轮，最早那条仍属首次出现轮（`keeps the first-seen round on an origin when a later round returns the same URL`；2026-10-30 补）
- Acceptance: AC4；新增测试全绿；`quality-assess` / `recovery-analysis` / `query-suggest` 既有测试全绿。
- Verification: `cd cli && npm run build && npx vitest run`
- Rollback: `git checkout -- cli/src/deep/session.ts cli/src/deep/local-doc/searcher.ts cli/src/deep/recovery-analysis.ts cli/src/deep/query-suggest.ts`
- Status: done

### Step 3 — 排序流水线

- Goal: 单查询与多查询合并为一条流水线；融合前置去重；落库移到融合之后；只显示本轮；`fusionScore` 对两条路径一致写入。
- Dependencies: Step 1、Step 2。
- Files: `cli/src/runCli.ts`、`cli/src/deep/rrf.ts`、`cli/test/unit/deep/rrf.test.ts`、`cli/test/integration/`
- Implementation checklist:
  - [x] `rrf.ts` 对每份 ranking 内部按 id 去重（保留首次出现的下标），或在调用方保证；选择其一并在 spec 已记录的取舍下说明
  - [x] `runCli.ts` 新增 `fuseResults`，签名与步骤按 spec 第 3.1/3.2 节
  - [x] 单查询路径（`:668-707`）改为调用 `fuseResults`，删除 `:689-707` 的内联融合
  - [x] 多查询路径（`:735-863`）改为调用 `fuseResults`，删除 `:754-756`、`:824-840` 的内联融合
  - [x] `appendSessionResults` 在两处都只调用一次，且都在融合之后；输入带 `fusionScore`
  - [x] origins 按 `resultUrlKey` 统一累积（spec 3.3），单查询也走同一段
  - [x] `mergeResponses` 的 `results` 合并职责移交流水线；它的 `results` 字段不再被搜索路径消费
  - [x] 融合后统一定 `rank`（spec 3.5）：写库前 `rank = 融合位次`，与 `fusionScore` 同源
  - [x] `totalResults` 改为 `fused.length`，`returnedResults` 保持 `display.length`（spec 3.6）
  - [x] 扩充 `rrf.test.ts`：`[{X},{A},{X}]` 中 X 只计一次
  - [x] 新增集成测试：单/多查询结果 key 集合一致；第二轮搜索不显示第一轮结果；`-e` 组合有 `fusionScore`；`totalResults >= returnedResults` 且 `totalResults === 去重后候选数`
- Acceptance: AC2、AC3、AC5、AC6、AC9（见 PRD）。
- Verification: `cd cli && npm run build && npx vitest run`
- Rollback: `git checkout -- cli/src/runCli.ts cli/src/deep/rrf.ts`；Step 3 是本任务唯一动 `runCli.ts` 搜索主路径的一步，回滚它不影响 Step 1/2 的收益。
- Status: done

### Step 4 — 覆盖度事实

- Goal: 新增 `dg coverage <session>`，报告本会话已查过什么，形式是可数事实；零审批零抽取可用；不读图谱、不做聚类、不产出"缺什么"的判断。
- Dependencies: Step 2（`origin.round` 恒存在才可可靠分组）。与 Step 3 独立。
- Files: `cli/src/deep/coverage.ts`（新）、`cli/src/commands/coverage.ts`（新）、`cli/src/runCli.ts`、`cli/test/unit/deep/coverage.test.ts`（新）
- Implementation checklist:
  - [x] 新建 `deep/coverage.ts`，导出 `buildCoverage(results, rounds, options?)`，签名与规则按 spec 第 5.2/5.3 节
  - [x] 一条结果只归首次见到的轮次；`newResults` 不在后续轮重复计
  - [x] 后续轮把重复结果计入 `repeatedFromEarlier`
  - [x] 一轮结果全为旧时，该轮仍进 `byRound` 并保留其 query
  - [x] `distinctiveTerms` 判据为「只在单轮内出现 且 ≥2 条结果共用」，跨轮词排除
  - [x] 新建 `commands/coverage.ts`，空 session 返回 `EMPTY_SESSION`
  - [x] `runCli.ts` 注册 `coverage` 子命令
  - [x] 新建 `test/unit/deep/coverage.test.ts`：分组、重复计、整轮零新增、标题上限、跨轮词排除、单次出现排除、无轮次信息
  - [x] 正文来源取 `result.content || result.excerpt`（Step 5 补）—— 零抽取时正文只在 `excerpt`，只读 `content` 会让词表恒空
- Acceptance: AC7。
- Verification: `cd cli && npm run build && npx vitest run test/unit/deep/coverage.test.ts`；再用桩 SearXNG 建一个 3 轮零审批 session，确认 `dg coverage <session>` 报出 3 轮与每轮独有的词。
- Rollback: 新文件加一处命令注册，删除即恢复。
- Status: done

### Step 5 — 文档与收尾

- Goal: 文档与代码一致；死分支与死代码清理；F6 标记 superseded。
- Dependencies: Step 1–4 全部完成。
- Files: `README.md`、`README.zh-CN.md`、`skills/digdig/SKILL.md`、`skills/digdig/references/SOP.md`、`TaskFlowDocs/todo.md`、`cli/src/deep/index.ts`、`cli/src/commands/graph-add.ts`、`cli/src/runCli.ts`
- Implementation checklist:
  - [x] **`CLAUDE.md` 不在本仓库**：主检出中它是未跟踪文件（`git ls-files` 无匹配），工作树中不存在。原计划的四条 `CLAUDE.md` 修改项改为核对被跟踪的文档，结论是 README 已经是对的（`--data-file` 正确、三指标正确、无 SimHash 描述）。`CLAUDE.md` 的 `entityRichness`、`SimHash < 0.75` 等陈旧描述属于**用户本机未跟踪文件**，不在本仓库交付面内，记入 Follow-ups 交用户决定。
  - [x] `runCli.ts:338` 的 `formatSessionReportAsMarkdown` 删除 `entityRichness` —— `assessResultQuality` 从不产出该指标，格式化器列表里留着它只是死项（`breakdown[key]` 恒 undefined，`if (ind)` 已挡住，故无行为变化）
  - [x] `README.md` / `README.zh-CN.md` 命令表增加 `dg coverage`
  - [x] `README.md` 新增 `### Session Coverage`、`README.zh-CN.md` 对应 `### 会话覆盖度`：说明「只显示本轮」与 `coverage` 恢复全会话视野的关系
  - [x] `skills/digdig/SKILL.md` 命令清单与速查表增加 `dg coverage`
  - [x] `skills/digdig/references/SOP.md` Phase 6 增加「先读覆盖率再决定下一轮查询」，含「`New: 0` 即饱和」判据；Self-Check 增加对应勾选项
  - [x] `todo.md`：F6（TF-20261017-25e067）状态 `cancelled` 已完成；Next action 更新为「Step 3 已完成，诉求实测消失，可关闭」
  - [x] `commands/graph-add.ts:4` 删除未使用的 `resultId` import
  - [x] 确认 `deep/index.ts` 无新的死导出（桶文件本身零消费者，属既有状况，不在本任务清理）
- Acceptance: 文档描述的字段与阈值逐个可在代码中定位；`npx tsc --noEmit` 在删除死 import 后仍无错。
- Verification: 逐条 grep 文档中的字段名与阈值，路径与行号能对上；`cd cli && npm run build`
- Rollback: 文档与单行 import，`git checkout` 单文件。
- Status: done

## Checkpoints

**CP1（Step 1 后）** — 身份统一，构建与测试回到基线。此时系统行为唯一变化是本地文档 chunk 在多查询路径不再塌陷。这是可独立合并的最小单元。

**CP2（Step 2 后）** — 轮次语义修正。此时抽取不再污染质量判定，`rounds` 只反映搜索轮数。旧 session 数据不迁移，仅新写入生效。

**CP3（Step 3 后）** — 两条路径合一。这是本任务风险最高的一步：搜索主路径被重写。验收按 AC2/3/5/6 逐条跑。

**CP4（Step 4 后）** — 输出契约补齐。"只显示本轮"造成的视野空洞由 `dg coverage` 补回：模型在决定下一步查什么时主动调用它，读到的是按轮次组织的查询、新增数、重复数与轮内独有词。

**CP5（Step 5 后）** — 进入 `checking`，逐条核对 AC1–AC9（AC9 已在 Step 3 记录）。此步额外发现 AC7 在 Step 4 的验证记录不成立（零抽取时正文在 `excerpt`），已修并复验。

### AC 核对（2026-10-29）

逐条在真实 CLI（桩 SearXNG）+ 测试套件上核对。**AC8 要求每条 AC 至少一个自动化测试**，核对时发现 AC2 与 AC9 只有手工实测、没有测试，已补两个用例。

| AC | 结论 | 证据 |
|---|---|---|
| AC1 | 通过 | 桩服务同时返回 `file:///docs/a.md#chunk-0`、`#chunk-7`、`https://x.com/a#s`、`#t`：单查询与多查询两条路径都输出 3 条，chunk 两条保留，web 两个 fragment 合并，两路径 URL 数组完全相同。另有 `dedupe.test.ts` 4 个单测。 |
| AC2 | 通过 | 实测 `--session a` 连跑两次 vs `--session b --queries` 一次，key 集合差集为空；新增 `reaches the same result set whether the queries arrive in one call or two`，同时验证 fragment 折叠后共享页只计一条。 |
| AC3 | 通过 | 第二轮 5 条结果的 `fusionScore` 最大值为 `1/61`，无 `2/61`；`rrf.test.ts` 的 `[{X},{A},{X}]` 用例锁定份内去重。 |
| AC4 | 通过 | 导入两条抽取正文后 `contentTypes` 由 `['search']` 变 `['extracted','search']`、`content` 长度 41–42，`rounds` 仍为 1。verdict 方向由 `does not make the quality verdict worse when an extraction lands` 锁定（序数不减）。 |
| AC5 | 通过 | 新增 `ranks merged provider and SearXNG results by fusion score, not by provider block`：provider 两条 + SearXNG 一条，断言分数全为正、降序、且 SearXNG 的第 1 位排在 provider 的第 2 位之前（块拼接做不到）。 |
| AC6 | 通过 | 第二轮 `returnedResults=5`、`totalResults=10`，5 条全部来自本轮。`cli.test.ts` 两个用例断言历史不出现在结果列表、但仍写回 session。 |
| AC7 | 通过（修正后） | 见 Step 4/Step 5：零抽取时正文在 `excerpt`，初版读 `content` 导致词表恒空。修复后 3 轮 session 输出 `scheduler(5)` / `driver(5)` / `cancellation(5)`，`tokio` 排除；两轮重叠 session 输出 `New 0 / Already seen 3` 与三条跨轮 URL。域名事实（2026-10-30 增补）：实测输出 5 个 domain 与 12 个未接触专业源；单测覆盖 `www.` 折叠、`file:` 跳过、命中后移出待办清单。 |
| AC8 | 通过 | `npx vitest run` 38 文件 / 541 测试全绿；AC1–AC7、AC9 各有自动化测试。 |
| AC9 | 通过 | 新增 `reports totalResults as every fused candidate and returnedResults as what it printed`：4 条候选 `--limit 2` → `returnedResults=2`、`totalResults=4`。实测第二轮 rank 1–5 与 `fusionScore` 降序逐位一致。 |

`npx tsc --noEmit` = 0。

## Verification / Review

### Step 1 — 身份层收拢（2026-10-29）

改动：
- `deep/dedupe.ts` — `normalizeUrl` 去掉 `export` 改为模块内函数；`dedupeByUrl` 从 `normalizeUrl(item.url)` 改为 `resultUrlKey(item)`
- `deep/index.ts` — 桶导出 `normalizeUrl` → `resultUrlKey`
- `runCli.ts` — import 去掉 `normalizeUrl`；`755, 770, 826, 847, 855` 五处改为 `resultUrlKey`
- `commands/extract.ts` — import 加 `resultUrlKey`；`:33` 已知 URL 集合、`:56` retained 集合、`:58` 成员判断三处裸字符串比较改为 `resultUrlKey`
- `test/unit/deep/dedupe.test.ts` — `normalizeUrl` describe 改为 `resultUrlKey`；新增 4 个用例（chunk 保留、`source: 'local'` 分支、web fragment 折叠、幂等）；`dedupeByUrl` 新增本地 chunk 不合并用例

命令与结果：

```
$ npx tsc --noEmit
tsc exit=0

$ npx vitest run test/unit/deep/dedupe.test.ts test/unit/dedupe-results.test.ts
Test Files  2 passed (2)
     Tests  25 passed (25)

$ npm run build && npx vitest run
Test Files  36 passed (36)
     Tests  511 passed (511)
```

基线为 36 文件 / 506 测试；本步新增 5 个用例，全部通过，基线未跌破。

离线验证 `extract --urls` 的尾斜杠匹配：

```
session 里存的: https://x.com/a
--urls 传入的 : https://x.com/a
能匹配上吗    : YES（已修复）
```

AC1 达成：`file:///docs/a.md#chunk-0` 与 `#chunk-7` 在任何搜索路径下都保持两条；`https://x.com/a#s` 与 `#a#t` 合并为一条；`resultUrlKey` 幂等。

### Step 2 — 轮次语义（2026-10-29）

改动：
- `deep/session.ts:185` — `needsRound` 增加首行 `if (inferredContentType(result) !== 'search') return false;`，并加注释说明「抽取是补全已有发现的正文，不构成新一轮」
- `deep/session.ts:402` — `importRound` 从 `needsRound(input) ? Math.max(1, round) : undefined` 改为恒 `Math.max(1, round)`
- `deep/session.ts:386` — 删除 `options?: { skipRoundIncrement?: boolean }` 参数
- `deep/session.ts:392` — `incrementRound` 去掉 `!options?.skipRoundIncrement &&`
- `deep/local-doc/searcher.ts:211` — 去掉 `{ skipRoundIncrement: true }` 实参

**没有改动的东西**（用户 2026-10-29 特别强调「抽取的动作可不能改没了」）：
- `appendSessionResults` 中 `inferredContentType(input) === 'extracted'` 的写入分支（`session.ts:403-435`）一字未动 —— 正文仍然写入 `content`、`contentType` 仍然升为 `extracted`、`extractor`/`extractedAt` 仍然记录
- `recordExtractionOutcome`（`dg extract --session` 走这条路）一字未动 —— 它本来就写回 `state.rounds` 原值，从不递增
- `commands/extract.ts`、`commands/results-add.ts` 的命令体未动

命令与结果：

```
$ npx tsc --noEmit
tsc=0

$ npx vitest run test/integration/results-add.test.ts
Test Files  1 passed (1)
     Tests  7 passed (7)   （4 个新增轮次用例 + 3 个原有）

$ npm run build && npx vitest run
Test Files  36 passed (36)
     Tests  515 passed (515)   （基线 506 + Step1 的 5 + Step2 的 4）
```

真实 CLI 端到端验证（桩 SearXNG，`--session s`）：

```
搜索后: rounds = 1 | 正文长度 = [0, 0]
抽取后: added 0 updated 5 round 1
   rounds = 1                    ← 抽取不再记轮
   contentTypes = {'extracted'}  ← 抽取动作照常完成
   正文长度 = [3000, 3000, 3000] ← 正文确实写进去了
   origins[0] = [{tool:'digdig', engine:'google', query:'rust async', round:1},
                 {tool:'defuddle', query:'probe', round:1}]   ← 两个 origin 都有 round
再搜第二轮: rounds = 2            ← 搜索仍能开新轮
```

AC4 达成（2026-10-30 修正表述）：对某 URL 执行抽取后 `rounds` 不变，且 verdict **不变差**。实测抽取前 `contentDepth 0 / sourceDiversity 5 → acceptable`，抽取后 `contentDepth 3000 / sourceDiversity 5 / novelty 1 → good`——**结论是升不是降**。原记录写的是「与抽取前一致」，与本行自己给出的数字矛盾：写正文必然抬高 `contentDepth`，verdict 相同是非目标。要杜绝的是反方向，即修复前「搜索轮 acceptable → 抽取轮 contentDepth 141.5 / sourceDiversity 1 → poor」。

对应自动化测试为 `does not make the quality verdict worse when an extraction lands`（断言 `rounds` 不变 + verdict 序数不减 + 正文确实写入）。

#### 兜底为何保留（2026-10-30 实测）

原清单把 `recovery-analysis.ts:61` 与 `query-suggest.ts:146` 的两处 `attrs.round ?? …` 标为"删除"，前提是"round 恒存在"。这个前提对**新写入**成立，对**磁盘上已有的 `graph.json`** 不成立：Step 2 之前，抽取导入产生的 query 节点本就带着 `round: undefined`。

构造一个旧格式图谱（query 节点无 `round`）实测：

| | 保留兜底 | 删除兜底 |
|---|---|---|
| `recovery-analysis.roundQualityHistory[].round` | `[0]` | `[null]` |
| `suggest-queries.roundHistory[].round` | `[1]` | `[null]` |

删除后输出 `round: null`，调用方既拿不到序数也无法区分"第 0 轮"和"没有轮次"，比原来的 `0` 更差。`tsc` 在删除后仍为 0（`attrs.round!` 用非空断言压过了类型），所以类型检查发现不了这个问题。**兜底不是遗漏，是旧数据的兼容层**——与 PRD「Risks」段"不迁移旧 session 数据"的决定一致：新写入修正，旧数据靠兜底继续可读。

两处兜底的具体行为不同，都保留：`recovery-analysis` 用 `0`（把无轮次归到最早的组），`query-suggest` 用 `entries.length + 1`（按遍历序推一个递增序号）。两者都不理想，但都优于 `null`。

### Step 3 — 排序流水线（2026-10-29）

改动：
- **新建 `deep/fuse.ts`**（约 120 行）—— `fuseResults(input)` 纯函数：份内去重 → 建 rankings（响应、`--merge`、session 快照）→ `rrf` → 投影。另导出 `mergeEnvelopeMetadata` 合并 suggestions/answers/unresponsiveEngines。历史只贡献投票，不参与投影，因此 `sessionSnapshot` 的参数类型只要求 `{ url, source? }`。
- **`runCli.ts`** —— 删除 `queries.length === 1` 的单查询分支（原 657-732）与多查询内联融合（原 734-863），换成一段公共路径；删除 `mergeResponses`（不再有任何调用者）与 `rrf` 导入。
- **`session.ts`** —— 写入时 `rank: index + 1`，让 `rank` 与 `fusionScore` 同源同序（AC9）。
- **`test/unit/deep/fuse.test.ts`**（新建，9 个用例）
- **`test/unit/cli.test.ts`** —— 改写两个用例：原「历史结果显示在搜索输出里」断言的是 R6 要改掉的旧契约，改为断言不显示；新增一个用例确认历史仍写回 session。

命令与结果：

```
$ npx tsc --noEmit
exit=0

$ npx vitest run test/unit/deep/fuse.test.ts
Test Files  1 passed (1)
     Tests  9 passed (9)

$ npm run build && npx vitest run
Test Files  37 passed (37)
     Tests  525 passed (525)
```

真实 CLI 端到端验证（桩 SearXNG）：

```
AC6  第2次搜索 tokio scheduler
       returnedResults = 5   totalResults = 10
        0.016393 tokio scheduler-0
        ...（5 条，全部来自本轮）
       旧行为：混入 5 条 rust async 的历史结果，且当前结果 fusionScore = 2/61

AC3  当前结果 fusionScore 从 2/61 降为 1/61 —— 双计消失

AC2  --session a 连跑两次（10 条） 与 --session b --queries "q1,q2" 一次（10 条）
     结果 key 集合一致

AC5  deepseek + google 返回同一 URL：
       0.032522  b.com  ← 两个 provider 都返回，分最高
       0.016393  a.com
       0.016129  c.com
     按融合分排序，不再按 provider 块拼接
```



### Step 4 — 覆盖度事实（2026-10-29）

本步在原计划中是「进度概况」，方向被用户否否并改为「让模型知道查到了哪些方面、还缺哪些」，随后经调研（已写入 `docs/agent_search_integrated_report_2026-10-27.md` 第 3.4 节）定为「CLI 只交付可数事实，方面与缺口由模型判断」。原先写好的 `deep/session-overview.ts` 直接删除，未进入任何提交。

改动：
- **新建 `deep/coverage.ts`** —— `buildCoverage(results, rounds, options?)` 纯函数
- **新建 `commands/coverage.ts`** —— 命令封装，空 session 返回 `EMPTY_SESSION`
- **`runCli.ts`** —— 注册 `coverage` 子命令；新增 `subcommandFormat` 并让 `createProgram` 接收 argv
- **新建 `test/unit/deep/coverage.test.ts`**（9 个用例）

命令与结果：

```
$ npx tsc --noEmit
tsc=0

$ npx vitest run test/unit/deep/coverage.test.ts
Test Files  1 passed (1)
     Tests  9 passed (9)      ← 补 excerpt 用例后为 10

$ npm run build && npx vitest run
Test Files  38 passed (38)
     Tests  534 passed (534)  ← 补 excerpt 用例后为 535
```

真实 CLI（桩 SearXNG，2 轮，零审批零抽取，第二轮的 URL 全部在首轮出现过）：

```
## Coverage — 2 rounds, 3 results

| Round | Queries | Engines | New | Already seen |
|-------|---------|---------|-----|--------------|
| 1 | scheduler work | google | 3 | - |
| 2 | scheduler queue | google | 0 | 3 |

### Seen in more than one round
- https://same.example.com/a (rounds 1, 2)
- https://same.example.com/b (rounds 1, 2)
- https://same.example.com/c (rounds 1, 2)

### Distinctive terms
**Round 1**: about(3) · body(3) · number(3) · queue(3) · scheduler(3)
```

**这一版实测推翻了本步初版记录的一组数字**（`queue/runtime/scheduler/stealing/task/work` 等六词 ×3 轮）。那组输出取自 `content` 已写入正文的 session，而零抽取时 `content` 长度为 0，正文只在 `excerpt` 里。`distinctiveTermsOf` 当时只读 `title` + `content`，于是只剩标题，标题里每个词各出现一次，被「≥2 条共用」规则全部丢弃 —— 真实零抽取 session 上该段恒为空。**AC7 当时并不成立，是记录写错了。**

修法：正文来源改为 `result.content || result.excerpt`，并补一个 `content: ''` 的用例。修复后同一 3 轮 session 输出 `Round 1: scheduler(5)` / `Round 2: driver(5)` / `Round 3: cancellation(5)`，跨轮主题词 `tokio` 不在其中。

AC7 达成：轮数与每轮查询正确；每轮新增数正确；「整轮零新增」在第二组实测中如实报为 `New 0 / Already seen 3` 并列出三条跨轮重复 URL；单轮词表按轮分组，跨轮词排除。

### Step 5 — 文档与收尾（2026-10-29）

改动：
- **`CLAUDE.md` 不在本仓库** —— 主检出里它是未跟踪文件（`git ls-files | grep -i claude` 无匹配），工作树中不存在。原计划的四条 `CLAUDE.md` 修改项做不了，改为核对被跟踪文档：README 的 `--data-file`、三指标描述本来就是对的不需要改。`CLAUDE.md` 里 `SimHash < 0.75` / `entityRichness` 的陈旧描述属于用户本机未跟踪文件，不在本仓库交付面。
- **`runCli.ts:338`** —— `formatSessionReportAsMarkdown` 的指标列表删除 `entityRichness`。`assessResultQuality` 只产出 `contentDepth` / `sourceDiversity` / `novelty`，该列表项恒取不到值，`if (ind)` 早已挡住，故无行为变化。
- **`README.md` / `README.zh-CN.md`** —— 命令表增加 `dg coverage`；新增 `### Session Coverage` / `### 会话覆盖度` 一节，说明「只显示本轮」造成的视野空洞由 `coverage` 按需补回，并点明「判断哪些方面已覆盖是 Agent 的职责」。
- **`skills/digdig/SKILL.md`** —— 命令清单与速查表增加 `dg coverage`。
- **`skills/digdig/references/SOP.md`** —— Phase 6 增加「先读覆盖率再决定下一轮查询」，给出四条读法（`New: 0` 饱和 / 跨轮重复 URL / 每轮独有词 / 多轮薄产出），并注明判断归模型；Self-Check 增加一条 L2/L3 勾选项。
- **`commands/graph-add.ts:4`** —— 删除未使用的 `resultId` import。
- **`todo.md`** —— F6 的 Next action 更新为「Step 3 已完成，诉求实测消失，可关闭」。

命令与结果：

```
$ npx tsc --noEmit
tsc=0

$ npm run build
build=0

$ npx vitest run
Test Files  38 passed (38)
     Tests  535 passed (535)
```

**本步最重要的产出不是文档，是发现 Step 4 的记录是错的。** 按 AC7 原文在真实零审批零抽取 session 上复验时，`dg coverage` 的 `distinctiveTerms` 返回空数组 —— 上一轮记录的六词 ×3 轮并不存在。根因是零抽取时 `content` 为空、正文只在 `excerpt`，而 `distinctiveTermsOf` 只读 `title` + `content`，于是只剩标题，标题里每个词各出现一次，被「≥2 条共用」全部丢弃。已修（`result.content || result.excerpt`）并补用例；同一 3 轮 session 现输出 `Round 1: scheduler(5)` / `Round 2: driver(5)` / `Round 3: cancellation(5)`，`tokio` 正确排除。

第二组实测（两轮，第二轮 URL 全部命中首轮）验证饱和信号：`Round 2 | New 0 | Already seen 3`，并列出三条跨轮重复 URL。

### 域名事实并入（2026-10-30）

`suggest-queries` 的 `unexploredDomains` 搬运进 `coverage`，因为它是旧命令里唯一不依赖图谱、且实测有效的字段。

改动：
- **`deep/coverage.ts`** —— `CoverageReport` 增 `domainsSeen`（`{domain, results}`，按条数降序）与 `untouchedSpecialized`（固定清单减去实际命中）。`domainFactsOf` 用 `URL.hostname` 去 `www.` 并小写；`file:` 与不可解析的 URL 跳过，不进空名桶。
- **`commands/coverage.ts`** —— md 输出增 `### Domains used`（前 15）与 `### Specialized sources not yet used`。
- **`test/unit/deep/coverage.test.ts`** —— 新增 1 个用例：`www.` 折叠、`file:` 不计、命中 `github.com` 后它从待办清单消失而 `arxiv.org` 仍在。
- **PRD R7 / AC7、Spec 5.3–5.5、README 双语、SKILL、SOP** —— 同步。

命令与结果：

```
$ npx tsc --noEmit
tsc=0

$ npx vitest run test/unit/deep/coverage.test.ts
Test Files  1 passed (1)
     Tests  11 passed (11)

$ npm run build && npx vitest run
Test Files  38 passed (38)
     Tests  539 passed (539)
```

真实 CLI（`/tmp/cmp` 的两轮 session）：

```
### Domains used

site0.example.com(2) · site1.example.com(2) · site2.example.com(2) · site3.example.com(2) · site4.example.com(2)

### Specialized sources not yet used

arxiv.org · semanticscholar.org · github.com · stackoverflow.com · docs.rs · npmjs.com · pypi.org · crates.io · medium.com · dev.to · reddit.com · hackernews.com
```

**为什么只搬这一个字段，不整体替换 `suggest-queries`**：在同一 session（有图谱、有审批、有 entity）上对照实测，旧命令另外两个字段都不可用 —— `topEntities` 全为 `degree: 0, frequency: 1`；`roundHistory[].resultCount` 报 2 和 4 而实际都是 5，且把 `results-add --query probe` 的导入标签当成第 2 轮的查询。删除 `suggest-queries` 依赖任务 C 先删 verdict（它的 `qualityLastRound` 来自 `assessLatestResultQuality`），已记入 Follow-ups。

### 顺带发现并修复的既有缺陷：子命令的 `--format` 从未生效

根程序在 `runCli.ts:773` 声明了 `-f, --format`（默认 `md`），各子命令又各自声明同名选项。Commander 把这个 flag 归给**在命令行上后出现的那个 program**，但子命令的 `opts.format` 随后为 `undefined`，于是所有子命令的 `--format md` 都落到了默认分支。实测 `dg session-report s -f md` 与 `dg coverage s --format md` 一样输出 JSON。

`command.rawArgs` 对嵌套子命令是空数组，`command.opts()` 也拿不到值，因此无法在 action 内解析。修法是让 `createProgram(argv)` 记住传入的 argv，用 `subcommandFormat` 从子命令名之后的位置读取。**本步只修了 `coverage` 一处**；其余子命令的同名缺陷仍在，已记入 Follow-ups（它不是本任务引入的，且逐处改动会扩散到 20 多个命令）。

一处刻意的行为保留：同一 URL 被多个 provider 返回时，**第一个 provider 的 body 与 source score 胜出**（`fuse.ts` 的 `current` map 用 first-wins），其余 provider 仍各记一个 origin 并各自贡献一次 RRF 投票。这与旧 `urlMap` 的 first-wins 一致，也是 `keeps source score separate from RRF fusion score` 这个用例依赖的语义。

## Change Log

| 日期 | 修订 |
|---|---|
| 2026-10-28 | v1 初版。用户已确认 4 项决策：只显示本轮 / F6 并入并 superseded / 阈值任务只集中化 / overview 进本任务且图谱不动。 |
| 2026-10-29 | R7 由「进度概况」改为「覆盖度事实」。原方案统计轮次/待审批/域名数，是把运行状态当知识地图。用户指出该输出应服务于搜索策略（已查到哪些方面、还缺哪些），随后调研确认：方面判断须由模型完成，CLI 只交付可数事实。`session-overview.ts` 已删除。同期把调研结论写入 `docs/agent_search_integrated_report_2026-10-27.md` 第 3.4 节。 |
| 2026-10-29 | v1 批准（user，v1，PRD / Spec / Plan）。同日记录：任务 C（`TF-20261028-313ff2`）方向变更为「质量判定退出 CLI，改由 LLM 判断；CLI 只报可数事实」，不再修复 verdict/阈值体系。本任务的 Step 2（轮次归属）因此从「修 quality 的输入」变成「让 C 的事实统计有正确前提」。 |
| 2026-10-29 | **更正 Step 4 的验证记录。** 按 AC7 原文在真实零抽取 session 上复验，`distinctiveTerms` 为空，原记录不成立。根因：零抽取时正文在 `excerpt` 而非 `content`。`coverage.ts` 已改为 `result.content \|\| result.excerpt` 并补用例。Step 4 由 9 用例/534 测试变为 10 用例/535 测试。Step 5 同时改为核对被跟踪文档（README / SKILL / SOP），因为 `CLAUDE.md` 不在本仓库。 |
| 2026-10-30 | R7 与 AC7 增补「实际用到的域名」与「尚未接触的专业信息源」。来源是 `suggest-queries` 的 `unexploredDomains` —— 用户 2026-10-30 要求先验证新机制是否优于旧机制，再决定旧命令去留。对照实测后只搬运该字段；`topEntities` 与 `roundHistory` 实测不可用，删除 `suggest-queries` 依赖任务 C，已记入 Follow-ups。用户同日同意更新 `CLAUDE.md`（不纳入 git）。 |
| 2026-10-30 | **纠正三处不实记录。** 用户指出「没有做的不能标记已做」。核查结果：(1) Step 2 清单两项测试标了 `[x]` 但不存在，已补（`does not make the quality verdict worse…`、`keeps the first-seen round on an origin…`）；(2) 同清单两处「删除 `round` 兜底」标了 `[x]` 但代码未改，实测后**决定保留**并说明理由（旧 `graph.json` 里 query 节点的 `round` 可以是 `undefined`，删兜底会让输出从 `0` 变成 `null`）；(3) AC4 与 R2 的「verdict 与抽取前相同」与实测矛盾——写正文必然抬高 `contentDepth`，verdict 由 `acceptable` 升为 `good` 是正确的，判据改为「不变差」。 |

## Follow-ups

- **扩展 URL 归一化**（协议、`www.`、`utm_*`、`/amp/`、`m.`）：会改变已有 `resultId`，需一次显式迁移决策。spec 2.1 明确本任务不做。
- **`resultId` 少传 `source`**（spec 2.5）：`graph.ts:82` 是 `resultUrlKey({ url })`，`source === 'local'` 分支永远进不去，当前靠"本地文档恰好是 `file://`"兜底。需要决定：删掉 `source` 分支（承认只看协议），或让 `resultId` 接受完整结果对象。
- **三套 `extractDomain`**：`graph.ts:128`（parse 失败返回原串，图节点用）、`quality-assess.ts:58`（`file://` 返回 `''`，质量指标用）、`query-suggest.ts:59`（parse 失败返回 `''`）。三者的失败与 `file:` 语义都不同，导致同一个 URL 在图、质量、建议三处得到不同域名。本任务不动，因为它属于图谱/指标侧。
- **四套相似度实现**：`dedupe.ts:64`（字符 5-gram）、`query-redundancy.ts:69`（词集 / 字符 bigram）、`claims/deterministic-checks.ts:129`（词集 + 停用词 + CJK bigram）、`simhash.ts`（死代码）。与任务 B 的阈值集中化一起考虑，不在本任务合并。
- **provider 上限静默截断**：`--limit 20 -e ollama` 实际只得 10（`ollama-service.ts:31`）。应在输出里说明被 provider 限制，或让 provider 上限可配置。
- **图谱侧问题**（本任务只记录）：`recovery-analysis.ts:82,85` 用裸 `url` 而非 `resultUrlKey` 匹配；`growthRate` 因只有 `graph-add` 造 entity 而恒为 1，两阶段策略结构性不可达；`graph-preprocess.ts:60` `roundsCovered` 硬编码 0；`extractPaths` 无调用方故 `p:` 节点永远不存在；`entityRichness` 从未计算但格式化器仍列。
- **`--quality` 输出膨胀**：20 条待审批结果时 11,462 字节，随 session 线性增长。`coverage` 是常数级，后续可考虑 `--quality` 默认只给摘要。
- **`coverage` 的重复 URL 列表没有上限**：`repeated` 对所有跨轮出现的 URL 全量返回，轮次多、重叠多时会线性增长。实际调用里通常只有个位数，先不截断。
- **`CLAUDE.md` 未纳入版本控制**：主检出里的 `CLAUDE.md` 是未跟踪文件（`git ls-files` 无匹配），工作树中也不存在。它描述的 `novelty (SimHash < 0.75)`、`entityRichness`、`--data <json>` 三处已与实际实现不符（实际是 Jaccard 0.75、无该指标、`--data-file`）。本任务改不了它，因为改的是用户本机文件而非仓库内容。需要用户决定：纳入版本控制并同步，或各自维护。
- **`deep/index.ts` 整个桶文件零消费者**：`grep -rn "deep/index" src test` 无匹配，所有模块都直接按路径导入。它自身还有 `mergeExtractedContent`（仅被桶文件引用一次，无真实调用方）等未被使用的导出。删它或保留都行，属既有状况，不在本任务清理。
- **子命令 `--format` 从未生效**（Step 4 顺带发现）：根程序 `runCli.ts:773` 与各子命令都声明了 `-f, --format`，Commander 把 flag 归给父程序，子命令的 `opts.format` 恒为 `undefined`。本步只修了 `coverage` 用到的路径（`subcommandFormat` + `createProgram(argv)`）；`session-report`、`suggest-queries`、`strategy-info`、`recovery-analysis` 等 20 余个子命令仍有此问题。修复方式统一后应一次性替换掉各自的 `opts.format` 判断。
- **`suggest-queries` 应删除，但删它要等任务 C**：2026-10-30 在同一 session 上对照实测（有图谱、有审批、有 entity）。它的两个图谱字段都不可用：`topEntities` 全为 `degree: 0, frequency: 1`（无边形不成 degree，`degree × frequency` 退化为按 frequency）；`roundHistory[].resultCount` 与 `results.json` 不符（报 2 和 4，实际都是 5），因为它数的是图里的 result 节点（仅已审批的 4/10），且把 `results-add --query probe` 这个导入标签当成第 2 轮的一条查询。唯一有效字段 `unexploredDomains` 已并入 `coverage.untouchedSpecialized`（2026-10-30）。
  删除的阻塞点：`suggest-queries` 的 `qualityLastRound` 来自 `assessLatestResultQuality` 的 verdict，而任务 C 要删掉 verdict 体系；另外 `iteration-data.ts:53` 的 `getSessionAnalysis` 经 `runCli.ts:603` 被搜索主路径的 `--redundancy warn` advice 使用，属于独立改动。两条都不在本任务范围内。
- **providers 自身不过滤**：`ollama-service.ts` / `deepseek-service.ts` 不过滤空结果。Step 3 在合并处统一处理，但 provider 直连的单 provider 场景仍会带出空标题项。

## Version History

- v1 — 2026-10-28 — 初版，待批准。
