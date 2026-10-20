# Plan — 构建从空 `dist` 开始

> Task version: v1
> Status: completed

No spec required — small, self-contained task.

## Reference Pointers

- 需求与验收：本任务 `prd.md`（R1–R4、AC1–AC7）
- 当前构建脚本：`cli/package.json` 的 `scripts.build` 与 `scripts.prepublishOnly`
- 发布物白名单：`cli/package.json` 的 `files: ["dist/", "digdig.config.example.json", "README.md"]`
- 上一次清理的基线与证据：`TaskFlowDocs/achieved/2026-10-20-sync-conflict-cleanup/plan.md`

## Related Tasks

- `TaskFlowDocs/achieved/2026-10-20-sync-conflict-cleanup/` — 手工清过一次残留（PR #11）。本次补上机制，让它不会再发生。

## Skills / Tools Used

- [PRD] `agent-skills:spec-driven-development` — 把「下次别再有」翻译成可验证的机制与 AC，并明确 `prepack` 与 `build` 的取舍。
- [Plan] `agent-skills:planning-and-task-breakdown` — 单步改动 + 四类验证（正常构建、假产物、tarball 计数、安装冒烟）。
- [Spec] `agent-skills:api-and-interface-design` — 把 `files: ["dist/"]` 视为发布契约：目录整体收录意味着构建产物集合必须由构建过程独占，不能继承历史状态。

## Preconditions

- 工作树：`.worktrees/2026-10-20-prepack-clean`，分支 `chore/2026-10-20-prepack-clean`，基线 `93c58b5`。
- 用户已明确要求：下次发布必须干净，不需要为 0.0.2 写说明。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-20 23:10 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 在 `build` 前清空 `dist`

- Goal: 任何一次构建都从一个空目录开始，产物集合完全由当前源码决定。
- Dependencies: 无
- Files: `cli/package.json`
- Implementation checklist:
  - [x] `scripts.build` 改为先 `fs.rmSync('dist', { recursive: true, force: true })`，再 `tsc`，最后保留现有的两个入口 `chmod 0o755`。
  - [x] 用 Node 内联脚本实现，不引入 `rimraf`，避免 shell 差异。
  - [x] `prepublishOnly` 保持 `npm run build`（自动继承）。
- Acceptance: AC1、AC2。
- Verification: `cd cli && npm run build`；`ls -l dist/index.js dist/sxng.js` 权限为 `-rwxr-xr-x`。
- Rollback: `git checkout -- cli/package.json`
- Status: done

### Step 2 — 用假产物验证机制

- Goal: 证明「源码已删除的产物」不会再进 tarball，而不是只在当前这一版碰巧干净。
- Dependencies: Step 1
- Files: 临时写入 `cli/dist/`（不跟踪）
- Implementation checklist:
  - [x] 放 `dist/ghost.js` 与 `dist/ghost-sync-conflict-X.js`，各自写入任意内容。
  - [x] 执行 `npm run build`。
  - [x] 断言两个文件都不存在。
- Acceptance: AC3、AC4。
- Verification: `test ! -e dist/ghost.js`；`find dist -name '*sync-conflict*' | wc -l` 为 0。
- Rollback: 不适用（临时文件，`dist/` 会被下一次构建清空）。
- Status: done

### Step 3 — tarball 与安装冒烟

- Goal: 确认干净构建的产物在真实安装场景下可用。
- Dependencies: Step 2
- Files: 无（只读验证）
- Implementation checklist:
  - [x] `npm pack --dry-run --json`：231 个文件。
  - [x] 干净 cwd 下 `npm test`：36 files / 506 tests 全绿。
  - [x] `npm pack` 后装进临时项目：三个 bin 齐全，`dg --version` 为 `0.0.2`。
- Acceptance: AC5、AC6、AC7。
- Verification: 三条命令的实测输出写入 `## Verification / Review`。
- Rollback: 不适用。
- Status: done

## Checkpoints

### Checkpoint A — Step 1 之后

- [x] `npm run build` 通过且入口权限正确
- [x] `git diff` 只涉及 `cli/package.json` 的 `build` 一行

### Checkpoint B — Step 3 之后（完成）

- [x] AC1–AC7 逐项实测记录
- [x] 假产物测试证明机制有效（不是碰巧干净）

## Verification / Review

实测于 2026-10-20，工作树 `.worktrees/2026-10-20-prepack-clean`（基线 `93c58b5`）。

| AC | 实测 | 结果 |
| --- | --- | --- |
| AC1 | `npm run build` 退出 0 | 通过 |
| AC2 | 四个入口齐全；`dist/index.js`、`dist/sxng.js` 为 `-rwxr-xr-x` | 通过 |
| AC3 | 预置 `dist/ghost.js` 后构建 → 文件消失（2 个 ghost → 0 个） | 通过 |
| AC4 | 预置 `dist/ghost-sync-conflict-*.js` 后构建 → `find dist -name '*sync-conflict*'` = 0，tarball 内 `ghost` 计数 = 0 | 通过 |
| AC5 | `npm pack --dry-run --json` → **231 个文件、181 kB、0 个 sync-conflict** | 通过 |
| AC6 | 干净 cwd 下 `npm test` → **36 files / 506 tests 全绿** | 通过 |
| AC7 | tarball 装进临时项目：三个 bin 齐全，`dg --version` = `0.0.2`，`sxng` stderr 恰一行弃用提示 | 通过 |

**机制有效性的关键证据**：AC3/AC4 是**先放后建**的正向反证 —— 假产物在构建前真实存在（`ls dist/ghost*` 返回 2 个），构建后归零。这排除了「这一版碰巧没有残留」的解释。

**偏差记录**

无。改动只有 `scripts.build` 一行，其余行为（`prepublishOnly`、入口 chmod、`dev` watch）均未变。

## Change Log

- v1 — 初始计划。
- 实施完成：仅 `scripts.build` 一行改动，AC1–AC7 全部实测；假产物测试证明机制有效。

## Follow-ups

- 已发布 `0.0.2` 无法修正（npm 不支持替换）；用户已明确不需要为此写说明。
- `local-doc.test.ts` 依赖 cwd 的问题仍未处理。

## Version History

- v1 — planning。
