# Plan — 融合结果可解释化：暴露 votes 分解与约束失效标记
> Task version: v1
> Status: completed

No spec required — small, self-contained task.

## Reference Pointers

- `cli/src/service.ts:17-58` — `SearchOptions` / `SearchResult` / `SearchResponse`
- `cli/src/service.ts:140-175` — 响应映射，`engines`/`positions` 在这里被丢弃
- `cli/src/deep/fuse.ts:110-125` — 融合投影，`{...original}` 会带过新增字段
- `cli/src/runCli.ts` — 两条输出路径（`formatAsMarkdown`、JSON envelope）
- 实测数据：`q=python+tutorial&engines=bing,brave,mojeek` → 32 条，`engines` 长度分布 `{1:29, 2:3}`

## Related Tasks

- `2026-10-28-result-identity-pipeline`（已归档）— 建立了 `fuse.ts` 作为唯一排序决策点。本任务沿用该结构，不新增第二条排序路径。
- `2026-10-31-error-classification`（已归档）— `SearchError` 的分类模式是本任务的先例：**保留事实，派生结论**。`votes` 同理，存的是引擎和名次，不是「可信度评分」。

## Skills / Tools Used

- [PRD] Unaided — considered: "requirements elicitation and framing"
- [Plan] Unaided — considered: "work breakdown and task decomposition"
- [Test] Unaided — considered: "testing strategy"

三份 unaided。设计空间被实测数据定死了：SearXNG 已经给出 `engines`/`positions`，所以「怎么算分解」这个问题不存在，只剩「怎么透传」。没有需要方法论收敛的决策。

## Preconditions

- 分支 `feat/2026-11-02-result-explainability`，基于 `main` @ `c6a3481`
- worktree `.worktrees/2026-11-02-result-explainability`
- 本机 SearXNG 可达（`localhost:3668`），用于实测验证
- 基线：556 tests / 41 files

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-02 21:10 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 透传 `engines`/`positions` 为 `votes`，保留未响应原因

- Goal: 数据从 SearXNG 到 `SearchResult` 不再丢失。
- Dependencies: 无
- Files:
  - `cli/src/service.ts`
- Implementation checklist:
  - [x] `SearchResult` 新增 `votes?: Array<{ engine: string; position: number }>`
  - [x] 映射时读取 `item.engines` / `item.positions`，按索引配对
  - [x] 两者长度不等或任一非数组时，`votes` 整个省略（不填半个）
  - [x] `SearchResult.engine` 保持原样（单值，是「主引擎」，现有测试依赖它）
  - [x] `unresponsiveEngines` 改为携带原因：保留 `string[]` 还是改对象数组，在实现时按调用点数量决定，并记录选择
- Acceptance: AC1, AC2
- Verification: 用真实 SearXNG 跑 `q=python+tutorial&engines=bing,brave,mojeek`，断言有至少一条 `votes.length === 2`
- Rollback: 还原 `service.ts`
- Status: done

### Step 2 — 校验 `fuse.ts` 不丢 `votes`

- Goal: 融合投影后 `votes` 仍在。
- Dependencies: Step 1
- Files:
  - `cli/src/deep/fuse.ts`（可能无需改动）
- Implementation checklist:
  - [x] 确认 `projected.push({ ...original, fusionScore: item.score })` 会带过 `votes`
  - [x] 若 `mergeResults` 或 `sessionSnapshot` 路径会覆盖，补上
- Acceptance: AC4（部分）
- Verification: 单测断言融合后 `display[0].votes` 存在
- Rollback: 无需（若无改动）
- Status: done

### Step 3 — 两条输出路径展示

- Goal: md 简洁可读，json 完整。
- Dependencies: Step 1, 2
- Files:
  - `cli/src/runCli.ts`
- Implementation checklist:
  - [x] JSON：`votes` 原样输出（仅当存在）
  - [x] JSON：顶层保留未响应引擎及原因
  - [x] Markdown：仅当 `votes.length > 1` 时标注，形如 `[2 engines: bing #1, brave #2]`
  - [x] Markdown：未响应引擎列在结果区之外，带原因
  - [x] 存在 `--time` 或 `--lang` 时，输出一行说明该约束未经各引擎逐个确认
- Acceptance: AC4, AC5, AC6
- Verification: 真实查询分别用 `-f json` 和 `-f md` 观察输出
- Rollback: 还原 `runCli.ts`
- Status: done

### Step 4 — 测试

- Goal: 覆盖四条边界。
- Dependencies: Step 1–3
- Files:
  - `cli/test/unit/` 下新增/修改
- Implementation checklist:
  - [x] 多引擎命中 → `votes` 两个元素，位置正确
  - [x] 单引擎 → `votes` 一个元素
  - [x] `engines`/`positions` 不等长 → `votes` 缺席
  - [x] 未响应引擎 → 名称与原因都在
  - [x] md 输出：多引擎标注出现，单引擎不出现
- Acceptance: AC7
- Verification: `npx vitest run`
- Rollback: 还原测试文件
- Status: done

## Checkpoints

### Checkpoint — 全部 Steps 完成

- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → 全绿，数量 > 556
- [x] 真实 SearXNG 上 `-f json` 能看到 `votes` 与未响应原因
- [x] 真实 SearXNG 上 `-f md` 能看到多引擎标注
- [x] `--time` / `--lang` 时出现约束提示

## Verification / Review

- 单测：四条边界各一条
- 集成：真实 SearXNG 三种查询（单引擎、多引擎、含 unresponsive）
- 关键断言不是「字段存在」，而是「**多引擎命中的结果里，名次与引擎正确配对**」—— 这条错了，整个分解就是假的

## Change Log

- 2026-11-02 — v1 建立。实测确认 SearXNG 已返回 `engines`/`positions` 且等长对齐，`service.ts` 丢弃了它们。

## Follow-ups

- 逐引擎的过滤条件归因需要 SearXNG 暴露更多信息，本任务只做保守提示。
- 引擎质量统计与路由是 treg 借鉴清单里的低优先级项，需要长期数据。

## Version History

- v1 — planning.

## 实现记录

- 2026-11-02 — Step 1 完成。`SearchResult` 新增 `votes?`，`SearchResponse.unresponsiveEngines` 从 `string[]` 改为 `UnresponsiveEngine[]`（带 `reason`）。调用点只有 4 处（`fuse.ts`、`runCli.ts`、两个 provider 返回空数组），改动可控，所以直接改了类型而非新增字段。
- 2026-11-02 — Step 2 完成。`fuse.ts` 的 `{...original}` 确实带过 `votes`，无需改动投影。但 `mergeEnvelopeMetadata` 需要改：它原来按数组元素去重，新类型是对象，`includes` 失效。改为按引擎名 Map 去重，保留首个原因。
- 2026-11-02 — Step 3 完成。md 输出：`[2 engines: bing #1, brave #2]` 仅在 ≥2 引擎时出现；未响应引擎带原因；`--time`/`--lang` 时输出约束范围说明。`displayData` 新增 `timeRange`/`language`。
- 2026-11-02 — Step 4 完成。新增 `test/unit/result-votes.test.ts`，9 条测试。

### 测试有效性验证（做了回退实验）

写完测试后逐个回退实现，确认测试真的能抓到：

| 回退内容 | 结果 |
|---|---|
| 完全移除 `votes: mapVotes(item)` | 3 条测试失败 ✓ |
| 移除未响应原因（只留引擎名） | 2 条测试失败 ✓ |
| 移除 `engines.length !== positions.length` 检查 | **9 条全过 ✗** |

第三个发现是真问题：长度不等时，循环取 `positions[i]` 得到 `undefined`，被后面的 `typeof position !== 'number'` 接住了。所以长度检查是**冗余的第二道防线**。补了一条 `positions` 比 `engines` 长的用例（`['bing']` vs `[1,2]`）——这种方向每个 position 都是数字，类型检查拦不住，只有长度检查能拦。补完后回退验证通过。

这不是白做：两道防线都留着，但测试现在能区分它们。
