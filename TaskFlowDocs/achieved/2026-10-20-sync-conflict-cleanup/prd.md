# 清掉同步冲突残留，避免它们再次进入发布物

> Task version: v1
> Status: completed

## Goal

从仓库里清除 Syncthing / 云同步产生的 `*sync-conflict*` 副本，并把它挡在两条路径之外：**不能进 npm tarball**，**不能被 git 跟踪**。

用户价值：`digdig@0.0.2` 已经发布，而它里面混着 29 个 2026-06-29 的旧编译残留（`dist/runCli.sync-conflict-*.js` 等）。这些文件不是本次构建产物，却占了 316 KB，还会让人误以为包里多了一套代码。已发布版本改不了，但下一个版本必须干净，而且这类文件不该再出现第二次。

## Background / Confirmed Facts

均在本工作树核对（`main` = `3e7ece1`）。

**污染范围**

| 位置 | 数量 | 状态 |
| --- | --- | --- |
| `cli/dist/**/*sync-conflict*` | 29 | 未跟踪，但 `dist/` 被整体打进 tarball |
| `cli/test/unit/dedupe-results.test.sync-conflict-20260726-104252-JAULAPO.ts` | 1 | **已被 git 跟踪** |
| `.git/{refs,logs}/**` | 约 20 | Git 自身引用日志，与本次无关，不动 |

**为什么一直没被发现**

- `cli/.gitignore` 里有 `dist/`，所以 `git status` 看不到 `dist/` 里的任何东西 —— 包括这 29 个文件。
- `cli/package.json` 的 `files: ["dist/", ...]` 按目录整体收录，`npm pack` 不做内容筛选。
- 那个被跟踪的测试文件**从未执行过**：vitest 的 `include` 是 `test/**/*.test.ts`，而文件名是 `dedupe-results.test.sync-conflict-<ts>-<id>.ts`，`.test.` 之后不是以 `ts` 结尾，匹配不上。

**已发布版本的实际内容**（`npm pack digdig@0.0.2` 实测）

- 272 个条目，其中 29 个 `sync-conflict`
- 正常入口 `dist/index.js`、`dist/sxng.js`、`dist/entry.js`、`dist/legacy.js` 都在，功能未受影响

**清理后的实测结果**（已在 base checkout 试跑）

- `find dist -name '*sync-conflict*' | wc -l` → 0
- `npm pack --dry-run`：**272 → 243 个文件**，191 kB（原 233 kB）

## Requirements

**R1 删除 `dist/` 下的冲突文件**：删除全部 `cli/dist/**/*sync-conflict*`，随后 `rm -rf dist && npm run build` 重新生成干净产物。

**R2 取消跟踪冲突测试文件**：`git rm --cached` 并从磁盘删除 `cli/test/unit/dedupe-results.test.sync-conflict-20260726-104252-JAULAPO.ts`。它从未执行过，删除不减少任何有效覆盖。

**R3 加忽略规则**：`cli/.gitignore` 增加 `*sync-conflict*`，注释写明原因（同步工具冲突副本）。

**R4 重新打包验证**：`npm pack --dry-run` 文件数为 243、`sync-conflict` 计数为 0。

## Acceptance Criteria

- [ ] **AC1** `find cli/dist -name '*sync-conflict*' | wc -l` 为 0。
- [ ] **AC2** `git ls-files | grep -c sync-conflict` 为 0。
- [ ] **AC3** `cli/.gitignore` 含 `*sync-conflict*`。
- [ ] **AC4** `npm pack --dry-run` 报告 243 个文件、0 个 `sync-conflict`。
- [ ] **AC5** `npm run build` 通过；`npm test` 与清理前基线一致（36 files / 506 tests，干净 cwd 下）。
- [ ] **AC6** 除上面三处外没有其他文件被改动（`git status` 只列 `.gitignore` 与该测试文件的删除）。

## In Scope

- `cli/dist/`（未跟踪的构建产物，重新生成）
- `cli/test/unit/dedupe-results.test.sync-conflict-20260726-104252-JAULAPO.ts`（取消跟踪并删除）
- `cli/.gitignore`

## Out of Scope

- 已发布的 `0.0.2` 本身：npm 不允许替换已发布版本的 tarball，清理只能体现在下一个版本。
- 发布下一个版本：需要用户明确授权与 npm 2FA。
- `.git/` 里的 `sync-conflict` 引用日志：Git 内部状态，与发布物无关。
- `local-doc.test.ts` 依赖 cwd 导致 base checkout 里失败：独立缺陷，另有取舍。

## Risks / Deferred Items

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 误删正常构建产物 | 包缺入口文件 | 删除后 `rm -rf dist` 全量重建，并核对 4 个入口文件存在 |
| 忽略规则过宽 | 误忽略合法文件名 | `*sync-conflict*` 是同步工具的固定命名模式，正常源码不会含该串 |

## Open Questions

无。
