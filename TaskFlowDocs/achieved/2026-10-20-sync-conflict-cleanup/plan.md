# Plan — 清掉同步冲突残留

> Task version: v1
> Status: completed

No spec required — small, self-contained task.

## Reference Pointers

- 需求与验收：本任务 `prd.md`（R1–R4、AC1–AC6）
- 发布物来源：`cli/package.json` 的 `files` 字段（`["dist/", "digdig.config.example.json", "README.md"]`）
- 忽略规则现状：`cli/.gitignore`（已有 `dist/`，所以 `dist/` 内的残留对 `git status` 不可见）
- vitest 选择规则：`cli/vitest.config.ts` 的 `include: ['test/**/*.test.ts', ...]`

## Related Tasks

- `TaskFlowDocs/achieved/2026-10-20-dg-command-and-docs/` — 上一次发布相关任务（`dg` 命令名）。本次不修改它，只清理它发布时未察觉的包内残留。

## Skills / Tools Used

- [PRD] `agent-skills:spec-driven-development` — 把「清垃圾」写成可验收的 AC，并划清「已发布版本不可回改」的边界。
- [Plan] `agent-skills:planning-and-task-breakdown` — 确定顺序：先取消跟踪，再删文件，再重建 dist，最后验证 tarball。
- [Spec] `agent-skills:api-and-interface-design` — 确认 `files` + `dist/` 构成对外发布契约：目录整体收录意味着任何未跟踪残留都会外泄，忽略规则必须从源头覆盖，而不只是让 `git status` 看不见。

## Preconditions

- 工作树：`.worktrees/2026-10-20-sync-conflict-cleanup`，分支 `chore/2026-10-20-sync-conflict-cleanup`，基线 `3e7ece1`。
- 用户已批准清理（2026-10-20：「关于你处理冲突文件的建议，我同意」）。
- `0.0.2` 已发布，本次改动进入下一个版本。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-20 23:00 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 取消跟踪并删除冲突测试文件，同时加忽略规则

- Goal: 去掉唯一被 Git 跟踪的冲突副本，并堵住以后新增的同类文件，且不损失测试覆盖。
- Dependencies: 无
- Files: `cli/test/unit/dedupe-results.test.sync-conflict-20260726-104252-JAULAPO.ts`、`cli/.gitignore`
- Implementation checklist:
  - [x] 先对比 `dedupe-results.test.ts`（正本）与冲突副本，确认删的是副本、正本仍在且内容完整。
  - [x] `git rm --cached` 副本，再从磁盘删除。
  - [x] `cli/.gitignore` 追加 `*sync-conflict*` 与一行说明注释。
- Acceptance: AC2、AC3；正本 `cli/test/unit/dedupe-results.test.ts` 仍存在且覆盖同一批用例。
- Verification: `git ls-files | grep -c sync-conflict` 为 0；`ls cli/test/unit/dedupe-results.test.ts` 存在；`git diff cli/.gitignore` 只多两行。
- Rollback: `git checkout -- cli/.gitignore` 并 `git checkout HEAD -- <副本路径>`
- Status: done

### Step 2 — 重建 `dist/` 并核对入口

- Goal: 让 `dist/` 只剩本次构建产物。
- Dependencies: Step 1
- Files: `cli/dist/`（未跟踪）
- Implementation checklist:
  - [x] `rm -rf cli/dist`
  - [x] `cd cli && npm run build`
  - [x] 核对 4 个入口：`dist/index.js`、`dist/sxng.js`、`dist/entry.js`、`dist/legacy.js`
  - [x] `find cli/dist -name '*sync-conflict*' | wc -l` 为 0
- Acceptance: AC1、AC5（build 部分）。
- Verification: 上述两条命令的实测输出。
- Rollback: 重新 `npm run build`（`dist/` 未跟踪，无历史可言）。
- Status: done

### Step 3 — 打包、测试与安装验证

- Goal: 确认发布物干净、行为未变。
- Dependencies: Step 2
- Files: 无（只读验证）
- Implementation checklist:
  - [x] `npm pack --dry-run --json`：243 个文件、0 个 `sync-conflict`、约 191 kB。
  - [x] `npm test` 在干净 cwd 下 36 files / 506 tests 全绿。
  - [x] 用实际 tarball 装到临时项目：`dg` / `digdig` / `sxng` 三个 bin 都在，`dg --version` 为 `0.0.2`。
- Acceptance: AC4、AC5。
- Verification: 三条命令的实测输出写入 `## Verification / Review`。
- Rollback: 不适用（只读）。
- Status: done

## Checkpoints

### Checkpoint A — Step 1 之后

- [x] `git status` 只显示 `.gitignore` 修改与该测试文件的删除
- [x] 正本 `dedupe-results.test.ts` 仍在，且 `npm test` 覆盖数未减少

### Checkpoint B — Step 3 之后（完成）

- [x] AC1–AC6 逐项实测记录在下方
- [x] tarball 内 4 个入口文件齐全

## Verification / Review

实测于 2026-10-20，工作树 `.worktrees/2026-10-20-sync-conflict-cleanup`（基线 `3e7ece1`）。

| AC | 实测 | 结果 |
| --- | --- | --- |
| AC1 | `find dist -name '*sync-conflict*' | wc -l` → `0` | 通过 |
| AC2 | `git ls-files | grep -c sync-conflict` → `0` | 通过 |
| AC3 | `grep -c sync-conflict cli/.gitignore` → `1`（含注释共两行新增） | 通过 |
| AC4 | `npm pack --dry-run --json` → **231 个文件、0 个 sync-conflict、181 kB** | 通过（见偏差 1） |
| AC5 | `npm run build` 退出 0；干净 cwd 下 `npm test` → **36 files / 506 tests 全绿** | 通过 |
| AC6 | `git status` 只有 `cli/.gitignore`、该测试文件的删除、`TaskFlowDocs/` | 通过 |

**额外核对**

- 删除前先对比了正本与副本：`diff` 显示两者**完全相同**，删掉的是纯副本，覆盖无损失。
- 干净 tarball 装进临时项目：`dg` / `digdig` / `sxng` 三个 bin 齐全，`dg --version` 为 `0.0.2`，`dg --help` 为 `Usage: dg ...`，`sxng` 的 stderr 恰一行弃用提示。

**偏差记录**

1. **AC4 预期 243，实测 231。** 差额是 12 个**源码已不存在**的陈旧构建产物：

   | 文件 | 源码是否存在 |
   | --- | --- |
   | `dist/commands/build-graph.{js,d.ts,d.ts.map,js.map}` | 否 |
   | `dist/commands/raw.{js,d.ts,d.ts.map,js.map}` | 否 |
   | `dist/deep/keywords.{js,d.ts,d.ts.map,js.map}` | 否 |

   它们同样是历史上 `dist/` 从未整体重建留下的残留（`src/commands/build-graph.ts`、`src/commands/raw.ts`、`src/deep/keywords.ts` 在当前 `main` 上都不存在）。**这 12 个文件也已经随 `0.0.2` 一起发布了**。本次 `rm -rf dist && npm run build` 顺带把它们清掉了，所以 231 才是真正的干净值；243 是「只删 sync-conflict、保留其它残留」的数。

## Change Log

- v1 — 初始计划。
- 实施完成：3 处改动，AC1–AC6 全部实测；AC4 的 231 与预期的 243 的差额已查明为 12 个源码已删除的陈旧 dist 产物。

## Follow-ups

- 已发布的 `0.0.2` 含 29 个冲突文件；npm 不支持替换已发布版本，只能在下个版本修正，必要时在 Release notes 说明。
- `local-doc.test.ts` 依赖 cwd（base checkout 有旧 `.sxng/` 时失败）—— 独立缺陷，未纳入本次。

## Version History

- v1 — planning。
