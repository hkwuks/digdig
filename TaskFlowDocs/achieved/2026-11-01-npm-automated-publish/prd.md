# 给 digdig 加 npm 自动发布：打 v* tag 触发 GitHub Actions，用 npm tru
> Task version: v1
> Status: completed

## Goal

给 digdig 加 npm 自动发布：打 `v*` tag 触发 GitHub Actions，用 npm trusted publishing (OIDC) 发布，零长期 token，自动生成 provenance。

当前发版是纯手工：改 `cli/package.json` 的 `version`、本地 `npm publish`。没有 tag、没有 GitHub Release、没有构建溯源，发布这一步完全依赖本机环境和本机的 npm 登录态。

## Background / Confirmed Facts

以下全部在 2026-11-01 实测，不是从文档抄的：

| 项 | 实测结果 |
| --- | --- |
| `digdig` 是否已发布 | 是，`0.0.2`，dist-tag `latest` |
| 仓库可见性 | PUBLIC（provenance 的硬性前提之一） |
| `repository.url` 与仓库名大小写 | 一致：`git+https://github.com/hkwuks/digdig.git` / `hkwuks/digdig` |
| 已有 `NPM_TOKEN` secret | 没有 —— 不需要清理历史凭据 |
| 已有 git tag | 没有，一个都没有 |
| 已有 GitHub Release | 没有 |
| `cli/package.json` → `prepublishOnly` | `npm run build`，所以 `npm publish` 会自己构建 |
| `bin` | `dg` / `digdig` / `sxng` 三个入口 |
| `files` | `dist/`、`digdig.config.example.json`、`README.md` |
| `CONTRIBUTING.md` 里的发布流程 | 没有，`rule` 表里 `RELEASE.md` / `CHANGELOG.md` 标 `no / optional` |
| 本机 npm | `11.11.1` |

**关键前提：trusted publishing 只能配置在「已存在于 registry 的包」上。** 所以首次发布必须用 token，之后才能切 OIDC。`digdig` 已经发到 `0.0.2`，这个坑天然绕过去了 —— 这也是本任务能一次做完、不需要过渡 token 的唯一原因。

技术依据：

- trusted publishing 要求 npm CLI ≥ `11.5.1` 且 Node ≥ `22.14.0`。CI 里用 `node-version: 24.x` 一次满足；本机 npm 版本与 CI 无关，不用动。
- 开启 trusted publishing 后 **provenance 自动生成**，`--provenance` 标志不再需要。触发条件三条同时满足：走 OIDC、公开仓库、公开包。三条都满足。
- workflow 里必须有 `id-token: write`，这既是 OIDC 认证的前提，也是 provenance 的前提。

## Requirements

- R1 — 打一个 `v*` tag 并推送，即可完成一次发布，不需要本地凭证、不需要手动登录 npm。
- R2 — 认证走 npm trusted publishing (OIDC)，仓库里不存任何长期 npm 写权限凭据。
- R3 — 发布产物带 provenance 证明，用户可验证它确实由这个仓库的这段提交构建而来。
- R4 — tag 与 `cli/package.json` 的 `version` 不一致时，发布必须在**上传之前**失败。`npm publish` 撤不回，发错版本无法补救。
- R5 — 发布前跑完整测试。发出去的包撤不回来，测试跑一遍值得。
- R6 — `CONTRIBUTING.md` 补一节发布流程，说清怎么发一个版本、依赖哪些一次性配置。

## Acceptance Criteria

- AC1 — `.github/workflows/publish.yml` 存在，触发条件为 `push` 到 `v*` tag。
- AC2 — 该 workflow 声明 `permissions: { contents: read, id-token: write }`。
- AC3 — 版本校验步骤在 tag 与 `cli/package.json` 的 `version` 不匹配时以非 0 退出，且该步骤排在 `npm publish` 之前。
- AC4 — 发布步骤在 `working-directory: cli` 下执行 `npm publish`，不传 `--provenance`（OIDC 下自动）、不传 `--access public`（非 scoped 且包已存在）。
- AC5 — workflow 不使用 dependency cache（`cache` / `package-manager-cache` 均不启用）。
- AC6 — `CONTRIBUTING.md` 含发布小节，覆盖：一次性配置在哪做、发一个版本的命令序列、为什么发布失败要重建 tag 而不是重跑。
- AC7 — `grep -rn "secrets\.\|NODE_AUTH_TOKEN\|_authToken\|npm login" .github/` 无命中（确认没有退回 token 方案）。

  > 原写法是 `grep -rn "NPM_TOKEN"`。实测发现它会把 workflow 里**解释为什么不用 token** 的注释也算成命中，属于误报 —— 验收标准该查的是实际用法，不是某个词有没有出现。已改成查真正的 token 机制。

## In Scope

- 新增 `.github/workflows/publish.yml`
- `CONTRIBUTING.md` 补发布小节
- `TaskFlowDocs/repository-docs/index.md` 的发布相关行状态更新（若确实需要）

## Out of Scope

- **自动决定版本号。** 版本号由人用 `npm version patch|minor|major` 决定，不从 commit message 推。理由见 Open Questions 已决项。
- **`RELEASE.md` / `CHANGELOG.md`。** 这两份在索引里标 `no / optional`，本任务不创建。
- **`engines` 调整。** `engines.node >= 18.0.0` 是面向用户的承诺，与 CI 跑在哪个 Node 无冲突（`ci.yml` 里已就这个问题写了注释）。发布 workflow 用 Node 24 是 runner 的事，不是包的要求。
- **在 npmjs.com 上点配置。** 那是仓库外的一次性人工操作，不在代码里，也不在 PR 里。任务负责把它写进文档，不负责执行。
- **GitHub Release 的创建。** 触发方式选了 tag push，不经过 Release 事件，所以不发 Release。想要 release notes 是后续独立的事。

## Risks / Deferred Items

- **风险：一次性的网页配置没做，workflow 就是死的。** 代码合进去、tag 打上去，发布会在认证步骤失败。缓解：`CONTRIBUTING.md` 把它写成前置条件，并在 PR 描述里点名这是合并后必须做的一步。
- **风险：workflow 文件名必须与 npmjs.com 上填的完全一致。** 填 `publish.yml` 而文件叫 `npm-publish.yml` 就不匹配。缓解：文件就叫 `publish.yml`，文档里把「只写文件名、必须完全一致」写明。
- **风险：发布成功的 tag 无法「重跑」。** 版本已存在于 registry 时 `npm publish` 必然失败（`EPUBLISHCONFLICT`）。如果 workflow 在 publish 之后、其他步骤之前挂了，修复只能靠发新版本号。缓解：把测试和版本校验都排在 publish 之前，让 publish 尽可能成为最后一个可能失败的步骤。
- **延后：`npm stage publish` 的两阶段发布。** 它能让发布先进入暂存区、由维护者用 2FA 批准后才真正上线。安全姿态更好，但多一个人工步骤，且需要 npm 端另配权限。这次不做。

## Open Questions

三个决策点已于 2026-11-01 由用户以「按推荐定」确认：

| 问题 | 决定 | 理由 |
| --- | --- | --- |
| 触发方式 | `push` 到 `v*` tag | `npm version` 一行同时产出 `package.json` 版本号和 tag，两者天然一致，不会漂。Release 事件要多一步且引入第二种真相来源；`workflow_dispatch` 丢掉 tag 这个 git 内记录。 |
| 版本号谁定 | 人定（`npm version`） | 零新依赖。semantic-release / release-please 从 commit message 推版本，需要引入工具并强制 commit 规范；现有 commit 格式够用，但没有理由为此再加一层。 |
| 手动审批闸门 | 不要 | 打 tag 即发布，路径最短。需要双人复核时再加 GitHub Environment + npm 端 Environment name，两者可后补，不影响 workflow 结构。 |

无其他未决问题。
