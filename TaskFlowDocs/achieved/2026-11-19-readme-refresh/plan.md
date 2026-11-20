# Plan — 订正三份 README 的过时内容
> Task version: v1
> Status: completed

No spec required — documentation correction against verified code facts.

## Reference Pointers

- `README.md` / `README.zh-CN.md` / `cli/README.md` — 三份待改文档。
- `cli/src/runCli.ts:368,923` — `EXTERNAL_PROVIDERS` 与其拼出的 `--help` 文本，是本轮 provider 列表的真源。
- `cli/src/deep/session-store.ts:10-23`、`cli/src/commands/evidence.ts:211-215` — 单事务写多表的实现。
- `cli/src/claims/store.ts:6,49,66` — Claims 等已按表写入 `session.sqlite`。
- `TaskFlowDocs/todo.md` 的 `TF-20261107-897767` — Query Plan 撤销的完整理由与实测数据。
- `cli/test/unit/skill-command-table.test.ts` — 校验三份文档命令表的既有测试。

## Related Tasks

- `TF-20261107-897767`（已取消）— Query Plan 方向的撤销依据。
- `TF-20261118-9bd13b`（已完成）— 反馈日志。本轮不动其段落。
- `TF-20261118-90bf69`（已完成）— 上次补齐 README 命令表缺行。

## Skills / Tools Used

- [PRD] Unaided — defect investigation; considered: defect investigation
- [Plan] Unaided — documentation and decision; considered: documentation and decision
- [Test] Unaided — testing strategy; considered: testing strategy

## Preconditions

- 工作树基于 `f819e0f`（README 订正任务的登记提交）。
- `cli/node_modules` 已安装，或可 `npm ci`。

## Plan Review

- Verdict: sound
- Coverage: PRD 的 A1–A9 逐条落在下面三个步骤的 Acceptance 上。
- Verifiability: 每条验收都是 `grep` 或既有测试，不需要人工判断。
- Layer ownership: 只改文档，不碰源码与 CHANGELOG。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-19 23:43 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 订正已被删除却仍写成现有功能的内容

- Goal: 移除 Query Plan 与 Quality Assess 的现有能力陈述，改用 `dg coverage` 与 `--quality` 的可数事实描述。
- Dependencies: 无。
- Files: `README.md`、`README.zh-CN.md`、`cli/README.md`。
- Implementation checklist:
  - [x] 三处深搜引言（`README.md:1045`、`README.zh-CN.md:1026`、`cli/README.md:253`）把「a Query Plan that records what is still missing」换成对 `dg coverage` 与 `--quality` 的实际描述。
  - [x] 两处 workflow 图（`README.md:1050`、`cli/README.md:258`）去掉 `Quality Assess` 阶段；中文图（`README.zh-CN.md` 工作流）同步。
  - [x] 保留 `--quality` 作为「审批前查看可数事实」的步骤名，不把它的语义说成评估。
- Acceptance: A1、A2。
- Verification: `grep -c "Query Plan"` 在三个文件均为 0；`grep -c "Quality Assess"` 为 0。
- Rollback: `git revert` 本步骤提交。
- Status: done

### Step 2 — 订正 provider 列表、失效限制与悬空引用

- Goal: provider 列表与代码一致；Known Limitations 反映 SQLite 现状；删掉指向不存在文档的引用。
- Dependencies: 无。
- Files: `README.md`、`README.zh-CN.md`、`cli/README.md`。
- Implementation checklist:
  - [x] 三处副标题（`README.md:5`、`README.zh-CN.md:5`、`cli/README.md:9`）补上 exa / tavily / firecrawl / jina。
  - [x] 三处 `-e, --engines` 选项行列出全部六个外部 provider。
  - [x] 三处 Known Limitations 第一条改写：会话结果与图谱写入仍是会话级锁 + 事务；Claim/Evidence/Review 已写入 `session.sqlite`，`evidence-verify` 的四次保存在同一事务内。不再用「文件」措辞。
  - [x] 删掉三处 `PRD-005` 引用句。
- Acceptance: A3、A4、A5。
- Verification: `grep` 三个文件，`cross-file` / 「跨文件事务」 / `PRD-005` 均为 0；副标题与 `-e` 行含六个 provider 名。
- Rollback: `git revert` 本步骤提交。
- Status: done

### Step 3 — 补齐命令表与子命令选项

- Goal: `cli/README.md` 命令表补 `coverage`、`graph-pending`；三份文档补上 PRD 事实 21 列的选项。
- Dependencies: Step 1、Step 2（同文件，避免冲突）。
- Files: `README.md`、`README.zh-CN.md`、`cli/README.md`。
- Implementation checklist:
  - [x] `cli/README.md` 命令表在 `session-report` 之后插入 `coverage`，在 `review-list` 之后插入 `graph-pending`，措辞与 `README.md` 一致。
  - [x] 三份文档的图谱章节补 `graph-preprocess` 的 `--top` / `--max-terms` / `--co-occurrence-threshold`，以及 `graph-obfuscate` 的 `--list` / `--fallback-rules` / `--skip-types`。
  - [x] 三份文档的阶段命令说明补 `strategy-info --broad-rounds` / `--transition-threshold` 及默认值。
  - [x] 三份文档补 `evidence-list --include-invalid`、`doc-index -t`、`doc-search -k` / `--boost`（若已有则不重复）。
  - [x] 不列 `query-graph`。
- Acceptance: A6、A7。
- Verification: `grep` 命中全部八个选项；`npx vitest run test/unit/skill-command-table.test.ts` 通过。
- Rollback: `git revert` 本步骤提交。
- Status: done

## Checkpoints

- 三个步骤可合并为一个提交（同一批文档订正），也可按语义拆成两个：Step 1+2 一起（事实订正），Step 3 单独（补全）。
- 每步改完跑 `grep` 验收，最后跑命令表测试。

## Verification / Review

### 逐条验收（A1–A7 全部为 grep 结果）

```
                          Query Plan  Quality Assess  cross-file  跨文件  PRD-005
README.md                      0              0           0       0        0
README.zh-CN.md                0              0           0       0        0
cli/README.md                  0              0           0       0        0

                          --broad-rounds  --transition-threshold  --max-terms
README.md                        1                    1               1
README.zh-CN.md                  1                    1               1
cli/README.md                    1                    1               1

                          --co-occurrence-threshold  --fallback-rules  --skip-types
三份文档均                    1                        1               1

                          --include-invalid  --boost
三份文档均                    1                 1
```

副标题与 `-e, --engines` 行在三份文档中都含全部六个外部 provider。

### 静态检查与全量测试

```
npx tsc --noEmit                → 0
npx vitest run --testTimeout=30000 → 79 文件 / 896 通过 / 1 跳过（基线 892，+4）
```

`+4` 来自把第四份文档纳入命令表守卫（4 文档 × 4 测试 = 16，此前为 12）。

### 反向验证暴露的真问题

对 A8 做反向验证时，先删掉 `cli/README.md` 里刚补的 `coverage`、`graph-pending` 两行，
测试仍然 12/12 通过。追查发现守卫本身有遗漏：

`cli/test/unit/skill-command-table.test.ts` 的 `DOCUMENTS` 只列了
`skills/digdig/SKILL.md`、`README.md`、`README.zh-CN.md`，**没有 `cli/README.md`**
—— 而 `cli/package.json` 的 `files` 是 `["dist/", "digdig.config.example.json", "README.md"]`，
`cli/README.md` 正是 npm 用户 `npm i -g` 后实际会读的那份，也是唯一没有守卫的文档面。

把 `cli/README.md` 加入 `DOCUMENTS` 后重做反向验证：

```
× documents every registered command the Agent is meant to use
AssertionError: ../../../cli/README.md is missing: coverage, graph-pending:
  expected [ 'coverage', 'graph-pending' ] to deeply equal []
Tests  1 failed | 15 passed (16)
```

恢复后 16/16。这条修改不属原计划，但它让 A8 从「形式上通过」变成「真的守住所怀疑的文件」；
如果只跑正向验证，漏行的文档会一直是绿的。

### 与计划的偏差

- 计划写「Step 1+2 一起、Step 3 单独」两个提交，实际合成一个 `9df170a`。原因：`cli/test/unit/skill-command-table.test.ts`
  的修改与 Step 3 的文档改动必须同提交，否则该提交自身的守卫会红；拆开反而制造一个中间的红状态。
- 计划未包含 `cli/test/unit/skill-command-table.test.ts` 的修改，见上。

## Change Log

- `9df170a` `docs(readme): 订正三份 README 的过时内容` —— 三份文档 + 守卫的 `DOCUMENTS` 补 `cli/README.md`。
- 未动 `CHANGELOG.md`（用户明确）。

## Follow-ups

- 子命令选项与 `--help` 的重复无法根除；若要根治需从 `--help` 生成文档，不属本轮。

## Version History

- v1 — planning.
