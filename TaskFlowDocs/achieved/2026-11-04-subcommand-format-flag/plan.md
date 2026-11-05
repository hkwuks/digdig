# Plan — 子命令 -f/--format 归属与 md 输出契约
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md` — 契约 1（flag 归属）、契约 2（默认值）、契约 3（md 必须可消费）

## Reference Pointers

- `cli/src/runCli.ts:772` — 根命令 `-f` 声明（保留）
- `cli/src/runCli.ts:946-1300` — 18 个子命令的 `-f` 声明（删除）
- `cli/src/runCli.ts:437-447` — `subcommandFormat`（删除）
- `cli/src/runCli.ts:166` — `formatPreprocessAsMarkdown`（修 rounds）
- `cli/src/runCli.ts:221` — `formatFactsAsMarkdown`（加 id/rev 列）
- `cli/src/deep/graph-preprocess.ts:61` — `roundsCovered` 硬编码 0
- `cli/src/commands/review.ts:78-81` — policy-aggregate 早退分支

## Related Tasks

- 依赖已归档任务 `TaskFlowDocs/achieved/2026-11-03-session-reimport-downgrade/`（无代码耦合，仅同一模块）

## Skills / Tools Used

- [PRD] Unaided — 需求已由前期调研与用户三问确定；considered: requirements elicitation and framing
- [Spec] `agent-skills:spec-driven-development` — 用 spec-first、验收门槛与边界三分法组织输出契约；outcome: 产出 spec.md 三契约 + SC/AC 门禁；incorporated: 契约 1（flag 保留声明只改读取）、契约 2（默认值不动）、契约 3（md 必须可消费）
- [Plan] Unaided — 单文件为主的分步改造；considered: work breakdown and task decomposition
- [Test] Unaided — 测试策略沿用仓库既有 vitest 结构（unit + integration），本次不额外引入测试方法论能力；considered: testing strategy and code review

## Preconditions

- worktree `.worktrees/2026-11-04-subcommand-format-flag`，分支 `fix/2026-11-04-subcommand-format-flag`
- `cli/node_modules` 已安装
- 基线：`npm test` 566 通过

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-05 21:56 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 改读 optsWithGlobals，保留全部声明

- Goal: 让 `-f` 在 18 个子命令上生效，两种书写位置都支持，`--help` 不变。
- Dependencies: 无
- Files: `cli/src/runCli.ts`
- Implementation checklist:
  - [x] 18 处 action 签名补 `command` 参数，改读 `command.optsWithGlobals().format`
  - [x] 每处解析结果 `?? <该命令原默认>`，保持 13 json / 5 md 不变
  - [x] 18 处 `-f, --format` 声明**保持不动**
  - [x] 删除 `subcommandFormat`（`:437-447`）及其唯一调用点 `coverage`（`:1008`）
- Acceptance: AC1、AC1b、AC2、AC6
- Verification: `npx vitest run test/integration/cli-format.test.ts`（Step 4 新建）
- Rollback: 单文件改动，`git revert` 即可
- Status: done

### Step 2 — 修 graph-preprocess 的 md 渲染与 roundsCovered

- Goal: md 分支可达后不崩溃，且显示真实轮次。
- Dependencies: Step 1（md 分支需可达）
- Files: `cli/src/runCli.ts`、`cli/src/deep/graph-preprocess.ts`
- Implementation checklist:
  - [x] `graph-preprocess.ts` 的 `roundsCovered` 返回真实轮次数，不再硬编码 `0`
  - [x] `formatPreprocessAsMarkdown` 的 `resultProvenance` 表格读真实存在的字段
  - [x] 无 provenance 时不渲染该表
- Acceptance: AC3
- Verification: `npx vitest run test/unit/graph-preprocess-md.test.ts`
- Rollback: 两个文件独立回退
- Status: done

### Step 3 — 修 policy-aggregate 早退分支 + --quality 的 md 补 id/rev

- Goal: 无 claim 时也遵守 `-f`；`--quality` 的 md 可被 agent 用于审批。
- Dependencies: Step 1
- Files: `cli/src/commands/review.ts`、`cli/src/runCli.ts`
- Implementation checklist:
  - [x] `review.ts:78-81` 的早退分支按 `options.format` 输出
  - [x] `formatFactsAsMarkdown` 表格增加 `ID` 与 `Rev` 两列
  - [x] 确认 `--approve-file` 能从 md 读到的 id/revision 成功审批
- Acceptance: AC4、AC5
- Verification: `npx vitest run test/unit/quality-md.test.ts`
- Rollback: 两处独立改动
- Status: done

### Step 4 — 补回归测试并全量验证

- Goal: 每条 AC 有测试且撤销修复时失败。
- Dependencies: Step 1-3
- Files: `cli/test/integration/cli-format.test.ts`、`cli/test/unit/graph-preprocess-md.test.ts`、`cli/test/unit/quality-md.test.ts`
- Implementation checklist:
  - [x] 18 个命令 × {-f md, -f json, 无 -f, 前置 -f md} 的矩阵测试
  - [x] `--quality` md 含 id/rev 且能完成审批的端到端测试
  - [x] `graph-preprocess -f md` 不崩溃
  - [x] `policy-aggregate -f md` 无 claim 时输出 md
  - [x] 逐条确认撤销修复后测试失败
  - [x] `npm test` 全量通过
- Acceptance: AC7
- Verification: `npm test`
- Rollback: 测试文件可独立删除
- Status: done

## Checkpoints

- Step 1 完成后先跑全量测试，确认没有命令的默认输出改变（AC2 的逐字节对比）。

## Verification / Review

- 2026-11-05 Step 4: 新增 4 个测试文件共 20 条；撤销 src 后 10 条失败；全量 46 files / 586 passed

- 2026-11-05 Step 3: policy-aggregate -f md 空场景输出 md；--quality md 表格含 ID/Rev，用解析出的值成功审批 2 条

- 2026-11-05 Step 2: graph-preprocess -f md 退出 0，Rounds 显示真实值 3，Result Provenance 表格正常渲染

- 2026-11-05 Step 1: npx vitest run: 42 files / 566 passed; CLI 实测 session-report 与 graph-search 双向切换正常; 子命令 --help 仍列出 -f

| 检查 | 命令 | 结果 |
|---|---|---|
| 格式矩阵 | `npx vitest run test/integration/cli-format.test.ts` | 10 passed |
| graph-preprocess md | `npx vitest run test/unit/graph-preprocess-md.test.ts` | 待记录 |
| quality md | `npx vitest run test/unit/quality-md.test.ts` | 3 passed |
| policy-aggregate md | `npx vitest run test/unit/policy-aggregate-md.test.ts` | 3 passed |
| 撤销修复（RED） | 上述 4 个文件 | 10 failed / 10 passed |
| 全量 | `cd cli && npm test` | 46 files / 586 passed |

## Change Log

- 2026-11-04：任务创建（large，含 spec）。

## Follow-ups

- `--limit` 的父子冲突（P2）同属 commander flag 归属问题，本次未动。
- `graph-explore`/`graph-drill` 的 `--seed` 只认 label、不认 `e:` id，独立问题。

## Version History

- v1 — planning.
