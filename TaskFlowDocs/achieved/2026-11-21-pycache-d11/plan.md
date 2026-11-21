# Plan — 忽略 Python 编译产物、修复 WAL 切换竞态、删除图采样模块
> Task version: v2
> Status: completed

No spec required — four changes, each independently verifiable, with the concurrency failure and the sampling module's call graph both already established.

## Reference Pointers

- `cli/src/deep/session-db.ts:221` — 被替换的 WAL 切换。
- `cli/test/integration/source-migration.test.ts:94-104` — 既有的并发用例，它没能覆盖到真正失败的那一行。
- `cli/src/deep/graph-sampling.ts:189,380,458,506` — R3 的删除对象及其四处判据缺陷。
- `cli/src/runCli.ts:948-966` — 注册块；`cli/src/runCli.ts:25` — import。
- `cli/src/deep/graph.ts:28,102-116` — `PathType` 与 `PATH_TYPE_PREFIX`，三个成员只服务采样。
- `cli/test/unit/skill-command-table.test.ts:22-30` — 唯一为 `query-graph` 保留豁免的地方。
- `TaskFlowDocs/achieved/2026-11-11-engine-defaults-graph-sources/prd.md:17,43` — 「mixed 暂不修复」的原始决定（本轮改判为删除）。

## Related Tasks

- `TF-20261103-761aa5`（inbox）— D11 七项小缺陷。本轮补完其记录，不关闭该条目。
- `TF-20261121-567c56`（已完成）— PR #78，修掉 D11 中的 frontmatter 一项。

## Skills / Tools Used

- [PRD] `agent-skills:debugging-and-error-recovery` — purpose: 确认并发失败的根因而不是症状; outcome: 否定「BEGIN IMMEDIATE 无重试」这一初判，定位到 `PRAGMA journal_mode=WAL` 不遵守 busy timeout; incorporated: PRD 的 Background 逐条写成可复现的事实，含三条探针的对照结果。
- [Spec] Unaided — architecture and design specification; considered: 无 spec，四处改动各自独立且已在 PRD 定清。
- [Plan] Unaided — work breakdown and task decomposition; considered: 按「已复现 → 修 → 加回归 → 删已废弃 → 记录」排为五步，删除步骤再按「引用者清点 → 物理删除 → 全仓校验」拆开。
- [Test] Unaided — testing strategy; considered: 复用既有 integration 套件的 spawn 模式；删除后的覆盖由 `path-extraction.test.ts`(23 条) 与 `graph.test.ts` 承接，不新写测试。

## Preconditions

- `cli/node_modules` 已安装。
- 基线：`npx tsc --noEmit` 为 0。
- 修复已落在工作区（`session-db.ts` 的重试、`.gitignore` 的一行、新回归用例），待文档与提交。

## Plan Review

- Verdict: sound
- Coverage: AC1–AC9 落在五个 Step 上。AC5/AC6/AC7 是三条独立的删除后断言（零命中、注册表、不误伤），分属 Step 4 的验证段。
- Verifiability: AC2 用跨进程探针，AC3 用「无修复失败 / 有修复通过」的双跑对照——这是本任务最关键的一条，因为单跑通过与单跑也通都无法区分修复是否有效。AC7 防止删采样时连带删掉仍在使用的 `path-extraction`。
- Layer ownership: 库层（session-db）、忽略规则（.gitignore）、检索层（graph-sampling/query-graph）、类型层（graph.ts 的 PathType）、记录（todo.md）五层互不重叠。
- 顺序风险: Step 4 的删除会改动 `runCli.ts`，而 Step 5 要写 `todo.md`；两者不重叠，可并行，但提交必须一次做完，否则中间态 `tsc` 不过。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-21 23:22 +0800
- Approved version: v2
- Approved scope: PRD / Plan

## Steps

### Step 1 — `.gitignore` 忽略 `__pycache__/`

- Goal: 编译产物不进 `git status`。
- Dependencies: 无。
- Files: `.gitignore`。
- Implementation checklist:
  - [x] 追加一行 `__pycache__/`。
- Acceptance: AC1。
- Verification: `git check-ignore -v test/research-bench/__pycache__/grader.cpython-312.pyc` → `.gitignore:3:__pycache__/`。
- Rollback: `git checkout -- .gitignore`。
- Status: done

### Step 2 — WAL 切换在 `database is locked` 时重试

- Goal: 第二个 worker 不再因为切换 journal mode 撞上第一个 worker 的事务而失败。
- Dependencies: 无。
- Files: `cli/src/deep/session-db.ts`。
- Implementation checklist:
  - [x] 把 `db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')` 换成「读回 `journal_mode` 确认是 `wal`，否则重试」的循环，上限 20 次、间隔 50 ms。
  - [x] 注释写明两点：该 pragma **不遵守** `timeout`（实测 0 ms 抛）；**进程内无法验证**（SQLite 不让路给自身），必须跨进程。
- Acceptance: AC2。
- Verification: 跨进程探针：持锁方释放后成功切到 `wal`。
- Rollback: `git checkout -- cli/src/deep/session-db.ts`。
- Status: done

### Step 3 — 跨进程回归用例

- Goal: 该场景在无人值守的测试里也被守住，且能在无修复时失败。
- Dependencies: Step 2。
- Files: `cli/test/integration/source-migration.test.ts`。
- Implementation checklist:
  - [x] 新增 `switches to WAL while another process holds a write transaction`：先把库置为 `journal_mode=DELETE`，spawn 一个持写事务 400 ms 的进程，然后 `openSessionDatabase` 必须成功且 `journal_mode = wal`。
- Acceptance: AC3、AC4。
- Verification: 无修复时该用例失败（`database is locked`），有修复时 6/6 通过。
- Rollback: `git checkout -- cli/test/integration/source-migration.test.ts`。
- Status: done

### Step 4 — 物理删除图采样模块与 `query-graph` 命令链

- Goal: 删掉一条已废弃、判据层面站不住、且唯一出口已死的实现链；让仓库里不再存在第二套「该看哪个子图」的答案。
- Dependencies: 无。
- Files（删除）: `cli/src/deep/graph-sampling.ts`、`cli/src/commands/query-graph.ts`、`cli/test/unit/deep/graph-sampling.test.ts`、`cli/test/integration/sampling-path-extraction.test.ts`。
- Files（编辑）: `cli/src/runCli.ts`、`cli/src/deep/graph.ts`、`cli/test/benchmark/performance.bench.ts`、`cli/test/unit/cli.test.ts`、`cli/test/unit/skill-command-table.test.ts`、`skills/digdig/references/appendix.md`。
- Implementation checklist:
  - [x] 清点引用者后再删：`git grep -n "sampleGraph" | "graph-sampling" | "query-graph"` 应只剩这四个文件 + 上述编辑点。
  - [x] 删除 4 个文件；`runCli.ts` 移除 import（第 25 行）与注册块（948–966 行）。
  - [x] `graph.ts` 把 `PathType` 收窄为 `'composition_chain' | 'conjunction'`，并删掉 `PATH_TYPE_PREFIX` 里 `augmented_chain` / `community_core_path` / `dual_core_bridge` 三个成员。
  - [x] `performance.bench.ts` 删除 `Graph sampling` 段、import、以及头部注释里那一行目标。
  - [x] `cli.test.ts` 把 `expect(commandNames).toContain('query-graph')` 改为 `not.toContain`（带日期注释），并删除 `query-graph has seeds, depth, and strategy options` 整条用例。
  - [x] `skill-command-table.test.ts` 的 `EXEMPT` 清空——唯一条目就是 `query-graph`。
  - [x] `appendix.md:74` 删掉「Using `query-graph`」那一行。
  - [x] 追加两处计划外但必改的：`cli-format.test.ts` 的 `-f` 计数 18→17（`query-graph` 声明过 `-f`），`backward-compat.test.ts` 文件头注释里那条从未存在的 `query-graph` 用例。
- Acceptance: AC5、AC6、AC7。
- Verification: 已核实。零命中（仅剩两处提及删除事实的注释）；`npx tsc --noEmit` 为 0；`path-extraction.test.ts` + `graph.test.ts` + `cli.test.ts` + `skill-command-table.test.ts` + `degree-utils.test.ts` 共 122 条全绿；`path-extraction` 仍有 2 处引用（`graph-add.ts` 与单测）；`degree-utils.ts` 零改动。
- Rollback: `git checkout -- . && git clean -fd cli/src/deep/graph-sampling.ts cli/src/commands/query-graph.ts cli/test/unit/deep/graph-sampling.test.ts cli/test/integration/sampling-path-extraction.test.ts`。
- Status: done

### Step 5 — 记录 D11 与本轮两次错误归因

- Goal: 下一次不必再考古，也不再走回同样的错误归因。
- Dependencies: Step 4（记录里要写删除已完成）。
- Files: `TaskFlowDocs/todo.md`。
- Implementation checklist:
  - [x] D11 条目的 `Next action` 补写采样模块的处置：整块物理删除（`graph-sampling.ts` + `query-graph` + 测试），理由是 R3 的五条判据缺陷 + 六家外部实现的对照 + 根因「这一层没有 query-aware 输入」；`mixed` 随模块一并消失，不再是「暂缓」。
  - [x] 同一处记明本轮两次错误归因（`BEGIN IMMEDIATE` 无重试、唯一调用者已废弃）均经实测否定，以及真正的原因在 `session-db.ts:221` 的 WAL 切换。
  - [x] 记下延后项：`degree-utils` 三个导出已成死代码、`036e30f` 可能还有同类「加功能同时标废弃」的遗留。
- Acceptance: AC9。
- Verification: 人工核对条目内容；`git diff --stat cli/src/deep/graph-sampling.ts cli/src/deep/degree-utils.ts` 对前者为空（已删）、对后者为空（未动）。
- Rollback: `git checkout -- TaskFlowDocs/todo.md`。
- Status: done

## Checkpoints

- Step 1–3 已完成并通过验证。
- Step 4 与 Step 5 必须同一提交完成：Step 4 删掉 `runCli.ts` 的注册后，若 `todo.md` 还写着它存在，文档与实际不一致；反之中间态 `tsc` 也不会过。
- 提交前跑一次全量测试与 `tsc --noEmit`。

## Verification / Review

- AC1 通过（`.gitignore:3` 命中）。
- AC2 通过（跨进程探针：无修复 0 ms 抛，有修复 305 ms 后 `wal`）。
- AC3 通过（新用例无修复失败、有修复通过）。
- AC4 通过（`source-migration.test.ts` 6/6）。
- AC5 通过（`cli/` + `skills/` 零命中，仅剩两处说明性的历史注释）。
- AC6 通过（`createProgram()` 不再注册它；`sampleGraph` 0 处）。
- AC7 通过（`path-extraction` 仍被 `graph-add.ts` 与单测引用）。
- AC8 部分：`tsc --noEmit` 为 0；全量 893 条中仅 2 个文件失败，均为**既有 flaky**（`feedback-log.test.ts`、`feedback-log-vocab.test.ts`，前一轮已在干净基线上 3/3 复现同样失败，与本轮改动无交集）。
- AC9 通过（D11 条目已写入处置、错误归因更正与两个延后项）。

**删除的净效果**：源码 −785 行（`graph-sampling.ts` 534 + `commands/query-graph.ts` 251），测试 −564 行（`graph-sampling.test.ts` 409 + `sampling-path-extraction.test.ts` 122 + benchmark 采样段 33），编辑 7 个文件约 −40 行。

## Change Log

- v1 — 初始版本；planning。三步（gitignore / WAL / 回归用例），D11 只记录不实施。
- v2 — 用户决定「弃用整个采样模块 → 物理删除 → 并入本任务」。新增 Step 4；R3 从「记录废弃缘由」改写为「删除整条链」并补上根因与外部对照；Step 5 加严为「记录删除已完成」；AC 由 7 条扩到 9 条（新增零命中、注册表、不误伤三条）。

## Follow-ups

- `degree-utils.ts` 的 `getEntitiesWithDegrees` / `adaptiveDegreeRange` / `filterEntitiesByDegree` 在 Step 4 后没有生产调用者，但有 18 个单测覆盖。属死代码清理，单独决定。
- `git log` 显示 `036e30f` 是一次 20+ 文件的大重构，可能还有其他「同一次提交既加功能又标废弃」的遗留，未逐一排查。
- 如将来要恢复 query-aware 采样，前置条件是 embedding 索引或 PPR，见 PRD R3 根因。

## Version History

- v1 — 初始版本；planning。
- v2 — 合并采样模块删除；planning。
