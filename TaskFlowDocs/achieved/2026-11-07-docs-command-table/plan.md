# Plan — SKILL.md 命令表补全与漂移校验
> Task version: v1
> Status: completed

No spec required — 两行文档 + 一个测试文件，无新接口、无新抽象。

## Reference Pointers

- `skills/digdig/SKILL.md:311-338` — Command Reference 表（要补的位置）
- `skills/digdig/references/SOP.md:398-430` — `doc-index` / `doc-search` 的完整说明，描述文案以此为准
- `cli/src/runCli.ts:865-890` — 两个命令的 `.description()` 与选项
- `cli/src/runCli.ts:809` — `query-graph` 的 `[DEPRECATED]` 描述
- `cli/test/unit/cli.test.ts:33` — 已有的 `program.commands.map(c => c.name())` 用法，校验测试照此取集合
- `skills/digdig/references/appendix.md:75` — `query-graph` 废弃指引

## Related Tasks

- 无。这是独立的小任务。

## Skills / Tools Used

- [PRD] Unaided — 需求与范围由用户确定（补全 + 加校验），事实由 grep 与 `createProgram()` 核对；considered: requirements elicitation and framing
- [Plan] Unaided — 单步文档改动 + 单文件测试；considered: work breakdown and task decomposition
- [Test] Unaided — 沿用仓库既有 vitest 单元测试结构；considered: testing strategy

## Preconditions

- 工作树 `.worktrees/2026-11-07-docs-command-table`，分支 `docs/2026-11-07-docs-command-table`，基线 `e3678df`
- `cli/node_modules` 已符号链接到主 checkout
- 基线：`npm test` 598 用例通过

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-07 20:05 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 写校验测试（先 RED）

- Goal: 有一个测试能指出 SKILL.md 与真实命令集合的差异，且现在就应该失败。
- Dependencies: 无
- Files: `cli/test/unit/skill-command-table.test.ts`
- Implementation checklist:
  - [x] 从 `../../src/runCli.js` 导入 `createProgram`，取其 `commands` 的 name 集合
  - [x] 读 `skills/digdig/SKILL.md`，用正则提取表中 `| \`dg <name>` 的命令名（跳过 `dg <query>` 这种占位写法）
  - [x] 定义豁免清单常量，当前只有 `{ name: 'query-graph', reason: 'deprecated in favor of graph-explore + graph-drill' }`
  - [x] 断言：`documented ∪ exempt === registered`
  - [x] 失败时分别报告「文档缺」与「文档多」两组命令名，不用整集合比较
- Acceptance: AC3、AC5、AC6（R5/R6 的落地）
- Verification: `npx vitest run test/unit/skill-command-table.test.ts` 此时应失败，失败信息指名 `doc-index` 与 `doc-search`
- Rollback: 删文件即可
- Status: done

### Step 2 — 补 SKILL.md 两行

- Goal: 测试转绿。
- Dependencies: Step 1
- Files: `skills/digdig/SKILL.md`
- Implementation checklist:
  - [x] 在 Command Reference 表中加 `doc-index` 行：描述「Index local documents for BM25 search」，紧跟 `dg extract` 之后（文档处理相邻）
  - [x] 加 `doc-search` 行：描述「Search local documents and inject results into session」
  - [x] `query-graph` 不加
- Acceptance: AC1、AC2、AC3
- Verification: 重跑 Step 1 的测试，12 项全绿
- Rollback: `git checkout -- skills/digdig/SKILL.md`
- Status: done

### Step 3 — 验证测试真的能抓漂移

- Goal: 证明这个测试不是摆设 —— 加一个假命令它会红，且报对名字。
- Dependencies: Step 2
- Files: 无（临时改动后还原）
- Implementation checklist:
  - [x] 临时在 `runCli.ts` 加一个 `probe-command` 的 `.command()` 声明
  - [x] 跑测试，确认失败且信息里有 `probe-command`
  - [x] 还原 `runCli.ts`
  - [x] `npm test` 全量
- Acceptance: AC4、AC5
- Verification: 上述命令退出码与输出
- Rollback: `git checkout -- cli/src/runCli.ts`
- Status: done

## Checkpoints

- Step 1 后：测试失败，信息指名 `doc-index`、`doc-search`
- Step 2 后：测试通过
- Step 3 后：假命令能被抓到且还原干净（`git status` 无 `runCli.ts` 改动）

## Verification / Review

全部 AC 由 `cli/test/unit/skill-command-table.test.ts`（4 条）覆盖。

**RED**（Step 1 完成后，SKILL.md 尚未补）：

```
Test Files  1 failed (1)
     Tests  1 failed | 3 passed (4)
AssertionError: SKILL.md is missing: doc-index, doc-search
+ [ "doc-index", "doc-search" ]
```

另外 3 条此时已通过，各自证明：没有幽灵命令、豁免项指向真实命令、解析器抓到了 24 条（不是空集导致的假通过）。

**GREEN**（Step 2 补两行后）：`4 passed (4)`。

**漂移可被抓住**（AC4，Step 3）：临时往 `runCli.ts` 注入一个 `probe-command`，测试失败且信息指名它：

```
AssertionError: SKILL.md is missing: probe-command
+ [ "probe-command" ]
```

随后 `git checkout -- cli/src/runCli.ts` 还原，`git status` 确认该文件无改动、`grep -c probe-command` 为 0。

**全量**：`npx vitest run --reporter=dot` → `Test Files 48 passed (48)` / `Tests 602 passed (602)`，退出码 0（原 598 + 本任务新增 4）。

## Change Log

- 2026-11-07 implement — `skills/digdig/SKILL.md` 补 `doc-index`/`doc-search` 两行；新增 `cli/test/unit/skill-command-table.test.ts`，用 `createProgram()` 与 markdown 解析双向比对，`query-graph` 以带理由的豁免项排除。

## Follow-ups

- `CLAUDE.md` 的命令表缺 14 个 —— 同一类问题，但那是维护者文档，本任务不处理。

## Version History

- v1 — planning.
