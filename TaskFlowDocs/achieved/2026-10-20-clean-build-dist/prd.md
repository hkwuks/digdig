# 让构建从空的 `dist` 开始，堵死陈旧产物进包

> Task version: v1
> Status: completed

## Goal

`npm publish` 前一律先清空 `dist/`，让 tarball 里只可能出现**本次源码编译出来的东西**。

用户价值：`digdig@0.0.2` 发布时，包里混进了 41 个不该存在的文件——29 个 Syncthing 冲突副本，12 个源码早已删除的陈旧编译产物。上一次 PR（#11）手工清过一次，但**根因没动**：`tsc` 只会覆盖同名文件，不会删除源码已消失的产物；而 `dist/` 在 `.gitignore` 里，`git status` 看不见它。所以只要不重建，下一次发布会原样复现。

用户的要求是「下次发布的时候保证没有就行」——这需要机制，不是再手工扫一遍。

## Background / Confirmed Facts

均在本工作树核对（`main` = `93c58b5`）。

**当前构建链路**

```json
"build": "tsc && node -e \"try{for (const f of ['dist/index.js','dist/sxng.js']) require('fs').chmodSync(f,0o755)}catch(e){}\"",
"prepublishOnly": "npm run build"
```

- `prepublishOnly` 已经存在并在 `npm publish` 时触发，但它调的 `build` **不做清理**。
- `tsc` 的产物路径由源码树决定；删除 `src/foo.ts` 后 `dist/foo.js` 会**永久留下**。
- `dist/` 被 `cli/.gitignore` 忽略，因此这些残留对 review 完全不可见。

**已发生的后果**（`0.0.2` 实测）

| 类别 | 数量 | 证据 |
| --- | --- | --- |
| `*sync-conflict*` | 29 | `npm pack digdig@0.0.2` 后 `tar tzf \| grep -c sync-conflict` |
| 源码已删除的产物 | 12 | `dist/commands/build-graph.*`、`dist/commands/raw.*`、`dist/deep/keywords.*`，对应 `src/` 文件在 `main` 上均不存在 |

**上一次清理的实测值**（PR #11 合入后）

- `rm -rf dist && npm run build` 后 `npm pack --dry-run`：**231 个文件、181 kB**
- 干净 tarball 装进临时项目：三个 bin 齐全，`dg --version` = `0.0.2`

**为什么选在 `build` 里清，而不是加 `prepack`**

- `prepublishOnly` 只在 `npm publish` 时跑；`prepack` 在 `npm pack` 与 `npm publish` 时都跑。两者都只在发布路径上生效。
- 但残留同样会污染 `npm pack` 出来的本地 tarball（本次排查就是用它发现的），也会污染开发者手工检查。把清理放进 `build` 让**所有**从源码到产物的路径都干净，代价只是一次 `rm -rf`。
- 权衡：`dev`（`tsc --watch`）不走 `build`，增量开发不受影响。

## Requirements

**R1 构建前清空 `dist/`**：`build` 脚本在 `tsc` 之前删掉 `dist/`，用 Node 的 `fs.rmSync(..., { recursive: true, force: true })` 实现，避免引入 `rimraf` 之类的依赖，也避免 `rm -rf` 在 Windows 上的 shell 差异。

**R2 保持现有产物权限修复**：清空后重建，`chmod 0o755` 的两个入口照旧。

**R3 不动 `prepublishOnly`**：它继续调 `build`，于是自动继承清理行为。

**R4 验证机制有效**：人为放一个假产物（模拟源码已删除），跑 `npm pack --dry-run`，确认它不在 tarball 里。

## Acceptance Criteria

- [ ] **AC1** `npm run build` 通过，退出码 0。
- [ ] **AC2** 构建后 `dist/index.js`、`dist/sxng.js`、`dist/entry.js`、`dist/legacy.js` 都存在，且两个入口 `-rwxr-xr-x`。
- [ ] **AC3** 预置 `dist/ghost.js`（`echo x > dist/ghost.js`）后执行 `npm run build`，`dist/ghost.js` 消失。
- [ ] **AC4** 预置 `dist/ghost-sync-conflict-X.js` 后构建，tarball 里不含任何 `sync-conflict`。
- [ ] **AC5** `npm pack --dry-run` 文件数为 **231**（与 PR #11 清理后的基线一致）。
- [ ] **AC6** 干净 cwd 下 `npm test` 仍是 36 files / 506 tests 全绿。
- [ ] **AC7** `npm pack`（非 dry-run）打出的 tarball 装进临时项目后，三个 bin 齐全且 `dg --version` = `0.0.2`。

## In Scope

- `cli/package.json` 的 `scripts.build`

## Out of Scope

- 发布新版本：需要用户执行（npm 2FA）。
- 已发布的 `0.0.2`：npm 不支持替换。
- `cli/.gitignore` 的 `*sync-conflict*` 规则：PR #11 已加，本次不动。
- `local-doc.test.ts` 依赖 cwd 的问题：独立缺陷。

## Risks / Deferred Items

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 清空 `dist` 让增量构建变慢 | 每次全量 `tsc` | 体量小（231 文件、约 2 秒），可接受；`dev` 的 watch 不受影响 |
| Node 内联脚本在 Windows 上路径问题 | 构建失败 | 用 `fs.rmSync` 而非 shell 命令，Node 跨平台一致 |

## Open Questions

无。
