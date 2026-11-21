# 忽略 Python 编译产物、修复 WAL 切换竞态、删除已废弃的图采样模块
> Task version: v2
> Status: completed

## Goal

四件事：`.gitignore` 忽略 `__pycache__/`；修复 `source-migration.test.ts` 在 CI 上偶发的并发失败；物理删除已废弃的 `graph-sampling.ts` 与 `query-graph` 命令链；把 D11 剩余项的处置落成记录。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

### R1 — `__pycache__/` 未被忽略

`.gitignore` 只有 `.digdig/` 与 `.sxng/`。`test/research-bench/__pycache__/*.pyc` 因此出现在 `git status` 里。该目录整个未被跟踪（`git log -- test/research-bench` 为空），但 `.pyc` 是编译产物，不属于任何人要提交的东西。

### R2 — `source-migration.test.ts` 的并发失败，根因不是原先以为的那个

原始症状（main 的 `44903782319`）：

```
× serializes simultaneous v2 upgrades without duplicating review history
AssertionError: expected [ 1, +0 ] to deeply equal [ +0, +0 ]
```

我最初归因为「两个进程抢 `BEGIN IMMEDIATE`，后到者拿到 `SQLITE_BUSY` 后没有重试」。**这个归因经实测被否定**：

- `BEGIN IMMEDIATE` 是串行的，且 `timeout: 5000` 对它生效——实测等满 5019 ms 才抛。
- 用真实测试桩（`user_version = 2`）跑 25 轮、16 进程并行压测，`0` 失败。纯迁移不触发。

真正的位置在迁移**之后**那一行 `cli/src/deep/session-db.ts:221`：

```ts
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
```

`PRAGMA journal_mode=WAL` 需要独占时刻，**且不遵守 `timeout`**：当另一个连接持有写事务时，它在 0–1 ms 内抛 `database is locked`，不等 busy timeout。两个 worker 打开同一个 session 文件时，第一个提交完迁移事务、第二个刚走到这一行，就撞上了。

实测三条证据：

| 探针 | 场景 | 无修复 | 有修复 |
|---|---|---|---|
| `/tmp/t7.mjs` | 非 WAL 库 + 另一连接持写事务，直接执行该 pragma | 1 ms 抛 `database is locked` | — |
| `/tmp/t11.mjs` | **跨进程**：另一进程持写事务 300 ms 后释放，调用真实 `openSessionDatabase` | **0 ms 抛** | **305 ms 后成功**，`journal_mode = wal` |
| `source-migration.test.ts` 新增用例 | 同上，纳入套件 | 失败 | 通过 |

同一进程内的探针（`/tmp/t10.mjs`）**做不到区分**——SQLite 不让路给自身。这一点必须记录，否则下一个人会用进程内的探针得出「修复无效」的错结论。

`[1, 0]` 的 `1` 正是第二个 worker 迁移**成功后**在 WAL 切换上退出。

### R3 — 图采样模块全链已废弃

`query-graph` 从 `036e30f`（2026-06-08）起描述里就写着 `[DEPRECATED] Query subgraph via BFS. Use graph-explore + graph-drill instead.`，运行时也打 `console.warn`。但真正没有任何弃用说法的是实现本身：

- `cli/src/deep/graph-sampling.ts`（534 行）+ `cli/src/commands/query-graph.ts`（251 行）仍完整存在；
- 12 个单测（`graph-sampling.test.ts`）、1 个集成测试（`sampling-path-extraction.test.ts`）、1 个 benchmark 仍在引用 `sampleGraph`；
- `skills/digdig/references/appendix.md:74` 还留着一行「Using `query-graph` | Deprecated」。

判据层面的问题（`graph-sampling.ts:506` 的 `mulberry32(config.rngSeed ?? 42)` 实测恒选 `community_core_path` 只是其中最刺眼的一处）：

1. **四个具名策略都是 query-blind 的拓扑启发式。** `augmented_chain` 每跳取度数最大的邻居（`:189`），`community_core_path` 从全图度数最大的 hub 出发 BFS（`:380-405`），`deep_chain` 优化的是路径「长」而不是「相关」（`:458-478`）。度数 = 被提及得多，不等是回答问题所需——这一条在 GraphRAG 文献里有直接对应的判断（degree tells you what the corpus talks about most, not what the question needs）。
2. **`mixed` 的随机是硬编码的。** CLI 从不传 `rngSeed`（`git grep rngSeed` 只有测试文件传），seed 恒为 42，实算 `mulberry32(42)` 第一个数落在 idx 2 → `community_core_path`。
3. **关系名从不参与选择。** `collectAllEdgesBetween`（`:98-109`）把选中节点之间的边全量收进来，`relation` 只是打包带上。而 `graph-explore` 按 relation 分组排序、`graph-drill` 按 relation 过滤——语义边的名字才是可推理的轴。
4. **有向图被当无向图。** `forEachNeighbor` / `forEachEdge` 全流程不区分方向，抹平了「A → B」与「B 只是提到 A」的差别。
5. **一次性预算 vs 反馈环。** 种子须一次点全、`maxHops` 固定、找不到种子只回 `{ reason: 'no_valid_seed' }`；而 explore/drill 每次只读一个实体并给出 `suggestedNextSteps` / `nextSteps`，找不到实体还给 Levenshtein 近邻。

对照外部实现（六家 GraphRAG 类项目的 local retrieval：Microsoft GraphRAG、nano-graphrag、LightRAG、HippoRAG、LlamaIndex `KnowledgeGraphRAGRetriever`、Neo4j/NVIDIA G-Retriever），**没有任何一家随机采样子图**；它们的「sampling」是 embedding 余弦 top-k、PPR 质量、token 预算切分。唯一在检索时随机的 ToG-R 把随机放在 **LLM 已按问题筛完关系之后**的实体展开上，目的是省 LLM 调用。`LEGO-GraphRAG` 的实测还给出正面否证：random-walk 采样「Recall 上不到 60%，几乎无法在 GraphRAG 中使用」，且 PPR 在所有子图尺寸上都优于它。

根因是 digdig 这一层**没有 query-aware 的输入**：`git grep -in "embedding|pagerank|personalized" -- cli/src` 只命中一行注释，graphology 里也没有 PageRank。sampling 拿不到 query，只能拿度数当判据——这不是算法调参能解决的。判定「该看哪里」的信息全部在 agent 手里，所以 explore + drill 赢。

### R4 — 一条先前给出的错误归因需要留痕

我在本轮对话中两次给出过未经实测的结论：先说是 `SQLITE_BUSY` 无重试，后又说「mixed 不用修因为它唯一调用者已废弃」（该命令确实废弃，但 `sampleGraph` 能力仍在、12 个单测仍绿）。两者都被证据推翻。

## Requirements

- **R1** `.gitignore` 增加一行 `__pycache__/`。不动 `test/` 与 `docs/` 的跟踪状态（用户明确「暂时不管」）。
- **R2** `openSessionDatabase` 的 WAL 切换在 `database is locked` 时重试，有次数上限；已是 WAL 的库视为完成。不改变迁移事务的语义。
- **R2b** 新增一条**跨进程**回归用例，证明该场景下有修复通过、无修复失败。
- **R3** 物理删除整条采样链：`cli/src/deep/graph-sampling.ts`、`cli/src/commands/query-graph.ts`、`runCli.ts` 的注册块与 import、三个引用它的测试文件、`graph.ts` 里三个只服务于它的 `PathType` 成员，以及 `appendix.md` 那一行。不做保留兼容。
- **R4** 把 R2、R3 的最终事实写入 `TaskFlowDocs/todo.md` 的 D11 条目，使下次不必考古、也不再走回同样的错误归因。

## Acceptance Criteria

| ID | 可验证的断言 |
|---|---|
| AC1 | `git check-ignore -v test/research-bench/__pycache__/*.pyc` 命中 `.gitignore:3` |
| AC2 | 跨进程探针：无修复 0 ms 抛错，有修复在持锁方释放后成功切到 `wal` |
| AC3 | 新增的 `switches to WAL while another process holds a write transaction` 在无修复时失败、有修复时通过 |
| AC4 | `source-migration.test.ts` 全部 6 条通过 |
| AC5 | `graph-sampling`、`query-graph`、`sampleGraph`、`augmented_chain` 在 `cli/` 与 `skills/` 下零命中 |
| AC6 | `createProgram()` 不再注册 `query-graph`；`git grep -c "sampleGraph" -- cli/` 为 0 |
| AC7 | `git grep -c "path-extraction" -- cli/` 不因删除而减少（`graph-add` 仍用它，单测仍覆盖它） |
| AC8 | 全量测试与 `tsc --noEmit` 不因本次改动变差 |
| AC9 | `todo.md` 的 D11 条目含 `query-graph`/采样模块的处置、`mixed` 的处置、以及对本轮错误归因的更正 |

## External Facts

- Depends on external facts: yes
- Source: https://www.sqlite.org/pragma.html#pragma_journal_mode
- What it settled: 官方文档确认 `PRAGMA journal_mode` 在切换到 WAL 时需要独占访问，冲突时返回 `SQLITE_BUSY`；这与实测的「0 ms 抛出、不遵守 busy timeout」一致，排除了「重试无意义」的可能。
- Source: https://arxiv.org/html/2410.20724v4（LEGO-GraphRAG）、https://arxiv.org/html/2405.14831v2（HippoRAG）、https://www.microsoft.com/en-us/research/publication/think-on-graph/、https://microsoft.github.io/graphrag/query/local_search/
- What it settled: 六家 GraphRAG 类实现的检索层都不随机采样子图；唯一在检索时用随机的 ToG-R 把随机放在 LLM 筛完关系之后；LEGO-GraphRAG 实测 random-walk 采样在检索中不可用且 PPR 全面优于它。据此确认删除是正确处置，而不是「调参没调好」。

## In Scope

- `.gitignore`
- `cli/src/deep/session-db.ts` 的 WAL 切换
- `cli/test/integration/source-migration.test.ts` 的新增用例
- 删除：`cli/src/deep/graph-sampling.ts`、`cli/src/commands/query-graph.ts`、`cli/src/runCli.ts` 的注册与 import、`cli/test/unit/deep/graph-sampling.test.ts`、`cli/test/integration/sampling-path-extraction.test.ts`、`cli/test/benchmark/performance.bench.ts` 的采样段、`cli/src/deep/graph.ts` 的三个 `PathType` 成员、`skills/digdig/references/appendix.md:74`
- 更新：`cli/test/unit/cli.test.ts`（两条断言）、`cli/test/unit/skill-command-table.test.ts`（`EXEMPT` 清空）
- `TaskFlowDocs/todo.md` 的 D11 条目

## Out of Scope

- **`sampleGraph` 能力的替代品**：如果将来要恢复 query-aware 采样，需要先引入 embedding 索引或 PPR，那是新任务（见 R3 根因）。
- **`degree-utils` 的三个导出**（`getEntitiesWithDegrees` / `adaptiveDegreeRange` / `filterEntitiesByDegree`）：delete-only 之后没有生产调用者，但仍有 18 个单测覆盖，属于死代码清理范畴，与本任务的「删一条已废弃命令链」不同轴，单独处理。
- **`test/` 与 `docs/` 的跟踪状态**：用户明确暂时不管。
- **迁移事务本身**：`BEGIN IMMEDIATE` 的串行语义经实测正确，不改。
- **`PathType` 的其它消费方**：`path-extraction.ts` 只产出 `composition_chain` 与 `conjunction`，不受影响；已核对。

## Risks / Deferred Items

- **重试次数上限是经验值**：20 次 × 50 ms = 1 s。持锁方若真的跑超过 1 s（大迁移），仍会失败。缓解：这个上限比原 `timeout: 5000` 保守，失败时会抛原始错误而非静默卡死；若将来出现更长的迁移，再调。
- **捕获范围偏宽**：`catch` 会吞掉任何异常并重试，包括「不是 locked」的。第 20 次仍失败时抛的是最后一次的错误，所以不会吞掉真实原因；但 19 次无意义重试会拉长失败路径 1 s。可接受。
- **进程内探针不可用于验证**：SQLite 不会让路给自身，有修复时进程内探针仍失败。这是一条必须写进注释的陷阱。
- **删掉 `sampling-path-extraction.test.ts` 会损失一条跨模块覆盖**：它断言「采样 + 路径抽取」能串起来。但 `path-extraction.test.ts` 有 23 条单测独立覆盖 `extractPaths`，且这条集成测试的价值完全建立在采样模块上。随采样一起删是正确取舍。
- **延后**：`git log` 显示 `036e30f` 是一次 20+ 文件的大重构，可能还有其他「加功能同时标废弃」的遗留，未逐一排查。

## Open Questions

无。
