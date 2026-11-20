# 订正三份 README 的过时内容
> Task version: v1
> Status: completed

## Goal

订正 `README.md`、`README.zh-CN.md`、`cli/README.md` 中与当前代码矛盾的陈述、失效的外部引用、缺失的命令行与子命令选项。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

### 已被删除却仍被写成现有功能

1. `README.md:1045`、`README.zh-CN.md:1026`、`cli/README.md:253` 写深搜具备「a Query Plan that records what is still missing」。
2. `cli/src` 内无 `queryPlan` / `QueryPlan` / `query-plan` 任何符号（`git grep` 零命中）。
3. `TaskFlowDocs/todo.md` 的 `TF-20261107-897767` 记录该方向已撤销：设计报告 `docs/agent_search_integrated_report_2026-10-27.md` 3.4.5 明写「不要在命令行内实现方面聚类」，执行摘要写「覆盖度不由命令行算法判定……该判断交给模型，命令侧只交付可数事实」。
4. 3.4.3 / 3.4.4 的实测是该判断的依据：小语料上 `tf × idf` 让 `tokio`/`async`/`rust`（各 10/20）排在 `scheduler`/`epoll`/`cancellation`（各 5/20）之前；同义表述下词袋余弦 0.102、跨方面 0.012，`cos ≥ 0.3` 聚出 12 个单点簇。词袋还原不出「方面」，所以 CLI 不该持有缺口清单。
5. `README.md:1050`、`cli/README.md:258` 的 workflow 图把 `Quality Assess` 列为 CLI 阶段。
6. `e113695`（2026-10-30）已删除 `quality-assess.ts`、`recovery-analysis.ts`、`calibrate-thresholds.ts` 与 `recovery-analysis` 命令，提交信息写明「`deep/` 里不再有函数回答'好还是不好'」。
7. `README.zh-CN.md` 的 workflow 图把该阶段译作「审查事实」，对应 `--quality`，而 `--quality` 只报可数事实、不做评估。Zh 版没有字面错误但与该阶段名的取舍不一致；统一后不再有歧义。

### provider 列表落后

8. 三份文档头图副标题均为 `SearXNG · Ollama · DeepSeek`。
9. `cli/src/runCli.ts:368` 的 `EXTERNAL_PROVIDERS` 是 `['ollama', 'deepseek', 'exa', 'tavily', 'firecrawl', 'jina']`，六个。
10. 三份文档的 `-e, --engines` 选项行（`README.md:932`、`README.zh-CN.md:913`、`cli/README.md:155`）只列 `ollama` 与 `deepseek`。
11. 同一份代码的 `--help` 文本（`runCli.ts:923`）由 `EXTERNAL_PROVIDERS` 拼出，已列全部六个。文档与自家帮助文本不一致。

### 已经不成立的限制

12. 三份文档的 Known Limitations 第一条（`README.md:1225`、`README.zh-CN.md:1210`、`cli/README.md:432`）称「Claim, Evidence, and Review files still have no cross-file transaction」。
13. Claims/Evidence/Reviews 已迁入 SQLite：`cli/src/claims/store.ts:6` 引入 `withSessionWrite`，`:49,66` 按表名读写 `session.sqlite` 的表。
14. `cli/src/deep/session-store.ts:10-23` 的 `withSessionWrite` 在一个 `withTransaction` 内执行整个 action。
15. `cli/src/commands/evidence.ts:211-215` 在同一个 `mutateSessionState` 回调里依次调用 `saveEvidences` / `saveVerdicts` / `saveClaims` / `saveReviews`，四张表落在同一个事务里。
16. 「文件」这个措辞本身也已过时：存储单元是表，不是文件。

### 悬空引用

17. 三份文档 Known Limitations 末尾都指向「the local, not-yet-published PRD-005 design-improvements document」（`README.md:1230`、`README.zh-CN.md:1215`、`cli/README.md:437`）。
18. `git ls-files` 中不存在 `PRD-005` 或 `design-improvement` 任何文件；读者无法查证该引用。

### 缺失的命令与选项

19. `cli/README.md` 命令表缺 `coverage` 与 `graph-pending`；`README.md` 两者都有。
20. `query-graph` 不进任何命令表，这是有意为之：`cli/src/runCli.ts` 中它被标为 `[DEPRECATED]`，`cli/test/unit/skill-command-table.test.ts:25` 的豁免清单专门跳过它。本轮维持现状。
21. 以下子命令选项在三份文档中均无记载，但都在 `--help` 输出里：
    - `strategy-info --broad-rounds <n>`（默认 2）、`--transition-threshold <n>`（默认 0.2）
    - `graph-preprocess --top <n>`（默认 30）、`--max-terms <n>`（默认 50）、`--co-occurrence-threshold <n>`（默认 2）
    - `graph-obfuscate --list`、`--fallback-rules`（experimental）、`--skip-types <t1,t2>`
    - `evidence-list --include-invalid`
    - `doc-index -t, --type <exts>`（默认 `md,txt`）、`doc-search -k, --top <n>`、`--boost <field:w,...>`
22. 配置键、环境变量表与 `cli/digdig.config.example.json` 三者一致，无需改动。

## Requirements

1. 三份文档不得再把 Query Plan 或 Quality Assess 描述为现有 CLI 能力。
2. 三份文档的 provider 列表与 `EXTERNAL_PROVIDERS` 一致。
3. 三份文档的 Known Limitations 不得再写「多文件无跨文件事务」。
4. 三份文档不得引用仓库中不存在的文档。
5. `cli/README.md` 命令表补齐 `coverage` 与 `graph-pending`。
6. 上述子命令选项在三份文档中有记载，取值与默认值以 `--help` 为准。
7. `query-graph` 维持不列入。
8. 中英文档内容对等。
9. 不动 `CHANGELOG.md`（用户明确）。

## Acceptance Criteria

- A1：三份文档中 `Query Plan` 零命中；深搜引言改为描述 `dg coverage` 与 `--quality` 提供的可数事实。
- A2：workflow 图不再出现 `Quality Assess` / 「审查事实」阶段。
- A3：三份文档的副标题与 `-e, --engines` 行列出 `EXTERNAL_PROVIDERS` 的全部六个值。
- A4：三份文档中 `cross-file transaction` / 「跨文件事务」零命中；改为描述单事务写多表。
- A5：三份文档中 `PRD-005` 零命中。
- A6：`cli/README.md` 命令表包含 `coverage` 与 `graph-pending`。
- A7：`grep` 三份文档能查到 `--broad-rounds`、`--transition-threshold`、`--max-terms`、`--co-occurrence-threshold`、`--fallback-rules`、`--skip-types`、`--include-invalid`、`--boost`。
- A8：`npx vitest run test/unit/skill-command-table.test.ts` 通过（该测试校验三份文档的命令表与 SKILL.md 一致）。
- A9：`git diff --stat` 只含三份 README，不含 `CHANGELOG.md` 与源码。

## External Facts

- Depends on external facts: no
- Why not: 全部验收对照本仓库的源码、`--help` 输出与 git 历史。Query Plan 的撤销依据是仓库内的设计报告与 TaskFlow 记录，均已提交。

## In Scope

- `README.md`、`README.zh-CN.md`、`cli/README.md` 的事实订正与命令/选项补全。

## Out of Scope

- `CHANGELOG.md`（用户明确不动）。
- `skills/digdig/SKILL.md` 与 `skills/digdig/references/SOP.md`：它们的 Query Plan 指 Agent 工作笔记里的计划，不是 CLI 功能，`SKILL.md:165` 明确写「it is not a new CLI command or session file」。
- `query-graph` 入表。
- 源码改动。
- `CLAUDE.md`（未跟踪的本机文件）。

## Risks / Deferred Items

- 中英文档若只改一处会加剧不对称，验收 A8 用既有测试兜住命令表部分，措辞部分靠逐条对照。
- 子命令选项补全后文档会变长；代价是与 `--help` 存在重复，需要在 `--help` 变更时同步，这是既有问题的延续而非新增。

## Open Questions

无。用户已确认：范围取「都改，query-graph 不列」，CHANGELOG 不动。
