# Plan — 清理四项遗留欠账
> Task version: v1
> Status: completed

No spec required — four independent, self-contained fixes with known root causes and single-file blast radius each.

## Reference Pointers

- `cli/src/deep/local-doc/scanner.ts:118,146`、`cli/src/deep/local-doc/searcher.ts:176-185` — R1 的两侧。
- `cli/src/runCli.ts:1196-1217` — R2 的命令注册；`cli/src/deep/iteration-data.ts:48`、`cli/src/runCli.ts:660,1264` — R2 必须保留的消费者。
- `cli/src/config.ts:88,104-116` — R3 的 `JSON.parse` 与逐字段赋值。
- `cli/src/errors.ts:27-52` — R4 的正例：`SEARCH_ERROR_CODES` 数组 + 派生类型，注释说明了为什么用数组而不是裸 union。
- `cli/src/protocol.ts:29`、`cli/src/commands/verdict.ts:28`、`cli/src/commands/review.ts:72,126` — R4 的四个改动点。
- `TaskFlowDocs/achieved/2026-11-18-small-bug-fixes/prd.md:19` — R5 要修正的过期陈述。
- `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/plan.md:440,458` — R2 的历史依据。

## Related Tasks

- `TF-20261103-761aa5`（inbox）— D11 小缺陷集合，包含 frontmatter 标题重复；其 `Next action` 声称「已在批量修复任务处理」，即 R1 的误判来源。本轮不关闭它，只补注记。
- `TF-20261028-fe548a`（已完成）— 定下 `coverage` 取代 `suggest-queries` 的域名事实；R2 的执行依据。

## Skills / Tools Used

- [PRD] Declared `agent-skills:debugging-and-error-recovery` — purpose: 确认四项的根因而不是症状; outcome: R1 根因定位到 `scanner.ts` 的 `headings` 语义混用，R3/R4 定位到「类型断言无运行时校验」与「helper 参数无约束」; incorporated: PRD 的 Background 逐项写成可复现的事实。
- [Plan] `agent-skills:plan` — purpose: 把四项拆成可独立验证的步骤并排依赖顺序; outcome: 四个 Step 彼此无依赖，可单独回退; incorporated: 按「源头 → 记录」排为 R1/R2/R3/R4 四个 Step + R5 收尾。
- [Test] Unaided — testing strategy; considered: testing strategy。四项都靠已有测试框架的针对性用例验证，无新增测试基础设施。

## Preconditions

- `cli/node_modules` 已安装；基线 `npx tsc --noEmit` 为 0。
- 工作树 `fix/2026-11-21-leftover-cleanup`，基线 `1c03ee8`。

## Plan Review

- Verdict: sound
- Coverage: AC1–AC10 逐一落在四个 Step 的 Acceptance 上；R5 的记录修正单独成步，不夹在代码改动里。
- Verifiability: R1 用 `scan()` 的真实输出断言；R2 用 grep 零命中 + 命令表测试；R3 用非法配置文件的真实 `getConfig()` 结果；R4 用 `tsc --noEmit` 本身作为断言（未知码必须编译失败）。
- Layer ownership: 四项分别落在索引层、命令注册层、配置层、协议层，互不重叠；无一处跨层改动。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-21 20:47 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Confirmed interpretations

两处在本轮讨论中定死的口径，实施时不再询问：

- **Step 2 的 `readonly-session.test.ts`**：三处 `suggest-queries` 换成 `coverage`。该文件防的是「只读命令在会话不存在时悄悄建目录」，`coverage` 是同类的只读命令，且正是取代 `suggest-queries` 的那一个。`session-report` 已在列表内，不重复。
- **Step 4 的 `CLI_ERROR_CODES`**：从现有调用点反推的**完整**清单，实测 46 个手写字面量 + 11 个从 `JsonInputResult` / `ApprovalError` / `PATH_INVALID` 流进来的，合计 57 项。不采用「只收编会输出的那些」的缩减版——缩减版让新码漏进白名单时无人发现，正是 `errors.ts:27-52` 否决过的做法。

## Steps

### Step 1 — R1：`headings` 不再承载文档标题

- Goal: frontmatter 标题与 H1 同名时只出现一次，且 `searcher.ts` 的补偿切片随之消失。
- Dependencies: 无。
- Files: `cli/src/deep/local-doc/scanner.ts`、`cli/src/deep/local-doc/searcher.ts`、`cli/test/unit/deep/local-doc.test.ts`。
- Implementation checklist:
  - [x] `scanner.ts:146` 改为 `headings: rawChunk.headings`（`title` 已单独存在，不再前插）。
  - [x] 删除 `searcher.ts:179` 的 `doc.headings[0] === doc.title ? slice(1)` 补偿逻辑，直接 `sectionParts.push(...doc.headings)`。
  - [x] 用例覆盖 frontmatter 与 H1 同名、仅 H1、frontmatter 与 H1 不同名三种输入。
- Acceptance: AC1、AC2。
- Verification: `npx vitest run test/unit/deep/local-doc.test.ts`；另用 `scan()` 实跑一次确认 `headings` 只剩一项。
- Rollback: `git checkout -- cli/src/deep/local-doc/`（两文件独立于其余三步）。
- Status: done

### Step 2 — R2：删除 `suggest-queries` 命令

- Goal: 命令消失且不留下悬空文档指引；`generateQuerySuggestions` 与 `getSessionAnalysis` 不受影响。
- Dependencies: 无。
- Files: `cli/src/runCli.ts`、`cli/test/unit/cli.test.ts`、`cli/test/integration/readonly-session.test.ts`、`skills/digdig/SKILL.md`、`skills/digdig/references/SOP.md`、`skills/digdig/references/appendix.md`、`README.md`、`README.zh-CN.md`、`cli/README.md`。
- Implementation checklist:
  - [x] 删除 `runCli.ts:1196-1217` 的命令块（含 `import { generateQuerySuggestions }` 若因此无其它用处——实测 `:660`/`:1264` 走 `getSessionAnalysis`，故该 import 可删）。
  - [x] 删除 `cli.test.ts` 里 `toContain('suggest-queries')` 的断言。
  - [x] `readonly-session.test.ts` 的三处 `suggest-queries` 改为同类的只读命令（`coverage` 或 `session-report`）。
  - [x] `SKILL.md` 三处（速查块、工作流示例、命令表）、`SOP.md` 两处、`appendix.md` 一处、三份 README 各一行表格删除；`SOP.md`「Phase 5: Query Suggestions」整节替换为指向 `session-report` 的说明。
- Acceptance: AC3、AC4、AC5。
- Verification: `grep -rn "suggest-queries" cli/src skills README.md README.zh-CN.md cli/README.md` 零命中；`npx vitest run test/unit/skill-command-table.test.ts test/unit/deep/iteration-data.test.ts`。
- Rollback: `git checkout -- cli/src/runCli.ts cli/test skills README.md README.zh-CN.md cli/README.md`。
- Status: done

### Step 3 — R3：配置文件数值字段校验

- Goal: 四个数值字段被写成非有限数时落回默认值并留一行 warning。
- Dependencies: 无。
- Files: `cli/src/config.ts`、新增或扩充 `cli/test/unit/config.test.ts`。
- Implementation checklist:
  - [x] 新增局部 helper：接受字段名、原始值、默认值、期望类型（int/float），非有限数时 `console.warn` 并返回默认值。
  - [x] `:104-116` 的四个数值字段改用该 helper；非数值字段的赋值不变。
  - [x] warning 走 stderr（`console.warn`），文案指名 `digdig.config.json` 与字段名。
  - [x] 用例：四个字段各一条 `"abc"` 输入断言落回默认 + warning；一条合法输入断言不被改写。
- Acceptance: AC6、AC7。
- Verification: `npx vitest run test/unit/config.test.ts`；`npx tsc --noEmit`。
- Rollback: `git checkout -- cli/src/config.ts`（新测试文件单独删）。
- Status: done

### Step 4 — R4：错误码收窄 + 收编三处裸写

- Goal: `createErrorEnvelope` 的 `code` 只接受已知码；三处内联信封走同一 helper。
- Dependencies: 无。
- Files: `cli/src/protocol.ts`、`cli/src/commands/verdict.ts`、`cli/src/commands/review.ts`。
- Implementation checklist:
  - [x] `protocol.ts` 新增 `CLI_ERROR_CODES` 数组（收集全部非 `SearchError` 的静态字面量，含 `SEARCH_FAILED`、`INVALID_APPROVAL_SELECTION`、`HEALTH_CHECK_FAILED`、`ENGINES_FETCH_*`、`CATEGORIES_FETCH_*`、`PATH_*`、`NO_*`、`MISSING_*`、`INVALID_*`、`RESULT_*`、`JSON_*`、`STDIN_EMPTY`、`INDEX_*`、`FILE_READ_FAILED`、`GRAPH_*`、`MERGE_FILE_FAILED`、`MEMORY_LIMIT_REACHED`、`SESSION_*`、`SOURCE_RELATION_*`、`QUOTE_MISMATCH`、`HASH_MISMATCH`、`SPECIAL_EXTRACTOR_REQUIRES_URLS`、`UNKNOWN_SESSION_URL`、`EMPTY_QUERY`、`MISSING_QUERY`、`QUALITY_NO_SESSION`、`REDUNDANCY` 相关等）。
  - [x] 派生 `CliErrorCode`，`createErrorEnvelope` 的 `code: SearchErrorCode | CliErrorCode`。
  - [x] 三处内联信封改为 `createErrorEnvelope('CLAIMS_STATE_CORRUPTED', ...)`。
  - [x] 逐个修 `tsc --noEmit` 报出的缺口：动态调用点靠上游已有的 `ApprovalError` / `JsonInputResult` / `PATH_INVALID` 类型收敛；若某上游类型本身是 `string`，补进它自己的联合而不放宽 helper。
- Acceptance: AC8、AC9。
- Verification: `npx tsc --noEmit` 为 0；`npx vitest run test/unit`。
- Rollback: `git checkout -- cli/src/protocol.ts cli/src/commands/verdict.ts cli/src/commands/review.ts`。
- Status: done

### Step 5 — R5：修正过期记录

- Goal: `2026-11-18-small-bug-fixes` 不再声称一件只做了一半的事已经完成。
- Dependencies: Step 1（写注记时要引用实际完成情况）。
- Files: `TaskFlowDocs/achieved/2026-11-18-small-bug-fixes/prd.md`。
- Implementation checklist:
  - [x] 在该文件第 19 行附近追加带日期的注记，说明当时只改了 `searcher.ts` 一侧、根因在 `scanner.ts`、已由 `TF-20261121-567c56` 补完。不改写原句。
- Acceptance: AC10。
- Verification: 人工核对原文未被改写。
- Rollback: `git checkout -- TaskFlowDocs/achieved/2026-11-18-small-bug-fixes/prd.md`。
- Status: done

## Checkpoints

- 每步结束先跑该步的 Verification，再进下一步；四步互不依赖，顺序可换。
- Step 1 与 Step 2 都可能改动 `cli/test/` 下的文件，但不同文件，不冲突。
- 全部完成后跑一次 `npm test` + `npx tsc --noEmit` 作为总检。

## Verification / Review

| 验收 | 断言 | 结果 |
|---|---|---|
| AC1 | frontmatter 标题与 H1 同名时 `headings === ["My Title"]`，标题无 `— My Title` | 通过。用例 `keeps the document title out of the section headings`。改动前该用例与 `does not duplicate a frontmatter title that differs from the heading` 一起失败（2 failed / 37 passed），改动后 39 全绿。 |
| AC2 | 仅 H1 时行为不变 | 通过。`leaves headings alone when there is no frontmatter title` 断言 `["First"]` / `["Second"]`。 |
| AC3 | `suggest-queries` 零命中 | 通过。`grep -rn` 在 `cli/src`、`skills/`、三份 README 中为零；唯一保留的一处是 `cli.test.ts:86` 的 `not.toContain`，即断言它不存在。 |
| AC4 | 命令集合不含该命令 | 通过。`cli.test.ts` 的 `toContain` 改为 `not.toContain`；同时发现并修正 `cli-format.test.ts` 里声明 `-f` 的子命令计数 19 → 18。 |
| AC5 | 消费者未受影响 | 通过。`generateQuerySuggestions` 仍是 `iteration-data.ts` 的组合项；`runCli.ts:660` 的 redundancy advice 与 session-report 路径不变；`iteration-data.test.ts` 与 `readonly-session.test.ts` 全绿（后者用 `coverage` 顶替了被删命令的位置）。 |
| AC6 | `"timeout": "abc"` 落回 25000 且 stderr 指名 | 通过。`config-numeric.test.ts` 用真实临时配置文件导入模块断言值与 warning。 |
| AC7 | 四个字段各一条非法用例，合法输入不受影响 | 通过。9 条用例：4 条非法、4 条合法、1 条 null/boolean。改动前 5 条失败，改动后全绿。 |
| AC8 | 未知码编译失败 | 通过。临时插入 `createErrorEnvelope('INVALID_LIMT', …)` 与 `'NOT_A_REAL_CODE'`，`tsc` 报 TS2345；探针文件已删除。全仓 `tsc --noEmit` 为 0。 |
| AC9 | 信封 JSON 形状不变 | 通过。三处内联字面量换成 `createErrorEnvelope`，该函数产出的正是同一对键（`status: 'error'` / `error.code` / `error.message`），且多出的 `retryable`/`hint` 字段是既有 helper 的既定形状。 |
| AC10 | 旧 PRD 有注记、原文未改 | 通过。注记追加在第 2 条之后，原文一字未动。 |

### 基线失败（非本次引入）

`test/feedback-log.test.ts > search and extraction record phases` 与 `test/unit/feedback-log-vocab.test.ts > records the envelope code` 在**干净基线**（本次全部改动 stash 后）连跑 3 次同样失败，是既有的日志写入竞态 + 5s 超时，与本任务无关。

### 顺带发现并修正

`cli/test/integration/cli-format.test.ts` 用硬编码的 `19` 断言声明 `-f` 的子命令数。删命令必然打破它，已改为 `18` 并注明原因。

## Change Log

- v1 — 初始版本；planning。

## Follow-ups

- `query-suggest.ts` 的 `topEntities` / `roundHistory` 在 Step 2 之后只剩 `session-report` 一处消费者，是否清理留待观察。
- `TF-20261103-761aa5` 的 `Next action` 里「frontmatter 标题重复已在批量修复任务处理」这句随 Step 1 + Step 5 变为准确，无需改它本身。

## Version History

- v1 — 初始版本；planning。
