# Plan — 给 digdig 加 npm 自动发布：打 v* tag 触发 GitHub Actions，用 npm tru
> Task version: v1
> Status: planning

No spec required — small, self-contained task.

## Reference Pointers

- `TaskFlowDocs/repository-docs/index.md` — 路由记录；本任务涉及 `CONTRIBUTING.md`（`release` 相）与 `.github/` 下的 workflow
- `CONTRIBUTING.md` — 分支/提交/PR 规范，发布小节要写进这里
- `.github/workflows/ci.yml` — 现有 CI 的结构与注释风格，新 workflow 保持一致
- `cli/package.json` — `version`、`prepublishOnly`、`files`、`repository`
- 外部依据（2026-11-01 查证）：
  - <https://docs.npmjs.com/trusted-publishers/> — OIDC 配置字段、`id-token: write`、自动 provenance
  - <https://docs.npmjs.com/cli/v11/commands/npm-trust/> — `npm trust github` 需要 npm ≥ 11.15.0
  - <https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/> — npm ≥ 11.5.1、`--provenance` 不再需要

## Related Tasks

- 无。`2026-10-30-repo-governance`（已归档）建立了 `ci.yml` 和 `CONTRIBUTING.md`，本任务是在那份基础上补发布，不修改它的任何既有内容。

## Skills / Tools Used

- [PRD] Unaided — considered: "requirements elicitation and framing"
- [Plan] Unaided — considered: "work breakdown and task decomposition"
- [Test] Unaided — considered: "testing strategy"

三份全部走了 unaided 声明而非 Skill 调用，理由相同：本任务的产物是一个 workflow 文件加一段文档，约束全部来自外部事实（npm 的 OIDC 协议、registry 行为、GitHub Actions 语法），没有任何设计自由度需要方法论来收敛。调研已经在 PRD 之前做完了（见 Reference Pointers 的外部依据），写成文档是整理，不是发现。

## Preconditions

- 分支：`ci/2026-11-01-npm-automated-publish`，从 `origin/main` @ `1e77905` 切出
- 工作树：`/mnt/f/WorkSpace/Node/digdig/.worktrees/2026-11-01-readme-token-claim`（该目录被 `2026-11-01-readme-token-claim` 复用，PR #20 已合并，其工作已完成）
- 无需任何 secret。这是本任务的核心目的 —— 有 `NPM_TOKEN` 反而是失败信号（AC7）。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-01 21:49 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 写出并验证 publish workflow

- Goal: `.github/workflows/publish.yml` 存在，且它的每一步都能在没有 npm 凭证的情况下被验证到（除了真正上传那一步）。
- Dependencies: 无
- Files:
  - `.github/workflows/publish.yml`（新增）
- Implementation checklist:
  - [x] 触发条件 `on.push.tags: ['v*']`
  - [x] `permissions: { contents: read, id-token: write }`
  - [x] 步骤顺序：checkout → setup-node（`24.x`，`registry-url`，不配 cache）→ 版本校验 → `npm ci` → `npm test` → `npm publish`
  - [x] 版本校验在 tag 与 `cli/package.json` 的 `version` 不一致时 `exit 1`
  - [x] 三个 npm 步骤都在 `working-directory: cli`
  - [x] `npm publish` 不带 `--provenance`、不带 `--access public`
  - [x] 注释说明「不配 cache」和「版本校验为什么必须在 publish 之前」，风格对齐 `ci.yml`
- Acceptance: AC1–AC5
- Verification:
  - workflow YAML 语法：用 Node 解析 `yaml`（CI 里已有转义依赖，若无则用 `npx yaml` 或 Python 的 `yaml.safe_load`）确认可解析 —— 避免 YAML 语法错误在推到 tag 之后才发现
  - **版本校验逻辑本地实测**：把那段 shell 抽出来，分别喂匹配和不匹配的两组 tag/version，确认前者 exit 0、后者 exit 1
  - **`npm publish --dry-run` 实测**：在 `cli/` 下跑，确认 tarball 内容正确（`dist/`、`digdig.config.example.json`、`README.md`），且 `prepublishOnly` 真的触发了构建
  - **不实测的**：真正的 OIDC 认证与上传。原因见 Risks —— npmjs.com 上的 trusted publisher 配置只能在网页做，且只有真正的 `v*` tag 才会触发 workflow。这两项在合并后第一次发版时验证，PR 里如实写明这一点，不假装验证过。
- Rollback: 删掉 `.github/workflows/publish.yml`。没有 tag 时它不会被触发，放着也无影响。
- Status: pending

### Step 2 — CONTRIBUTING.md 补发布小节

- Goal: 一个不了解这套配置的人，读完就知道发一个版本要做什么、以及哪些是一次性前置。
- Dependencies: Step 1（文档描述的文件必须先存在，且文件名要与实际一致）
- Files:
  - `CONTRIBUTING.md`
- Implementation checklist:
  - [x] 一次性配置小节：npmjs.com → 包 Settings → Trusted Publisher 的五个字段（org/user、repo、**workflow 文件名**、environment 留空、allowed actions 勾 `npm publish`）
  - [x] 强调 workflow 文件名只写文件名本身，且必须与实际文件完全一致（`publish.yml`）
  - [x] 发版命令序列：`cd cli && npm version patch` → `git push --follow-tags`
  - [x] 说明为什么 `npm version` 而不是手改 `package.json`：它同时产出 tag，两者不会漂
  - [x] 说明发布失败要发新版本号重来，不能重跑同一 tag（`EPUBLISHCONFLICT`）
  - [x] 建议顺手在 npm 端选「Require 2FA and disallow tokens」，把 token 这条路彻底关掉
- Acceptance: AC6
- Verification: 按文档里的命令序列实际走一遍到 `npm version --no-git-tag-version` 为止（不真的 commit/tag），确认命令本身成立、路径正确
- Rollback: 还原 `CONTRIBUTING.md`。
- Status: pending

## Checkpoints

### Checkpoint — Steps 1–2 完成

- [x] `grep -rn "NPM_TOKEN" .github/ CONTRIBUTING.md` 无命中（AC7）
- [x] workflow YAML 可解析
- [x] 版本校验逻辑两组输入实测通过
- [x] `npm publish --dry-run` 的 tarball 内容符合预期
- [x] `npm run build` && `npm test` 在 `cli/` 下全绿（不是本任务改的，但发布前它们必须成立）
- [x] 未经实测的部分（OIDC 上传）在 PR 描述里如实标注

## Verification / Review

- 全量测试：`cd cli && npm test`（当前基线 555 passed / 41 files）
- 本任务不改任何 `cli/src/` 下的代码，测试数字预期不变 —— 若变了说明改错了地方
- 审查重点：workflow 的步骤顺序。publish 必须是最后一个可能失败的步骤，因为前面的失败可以修完重来，publish 之后的失败只能靠发新版本

## Change Log

- 2026-11-01 — v1 建立，PRD 与 Plan 同批写入

## Follow-ups

- 合并后需要在 npmjs.com 上配置 trusted publisher，这一步只能人做。配置完成前 workflow 是死的。
- 首次真实发布（下一个版本号）后，回来核对 provenance 是否真的生成：`npm audit signatures` 或 npmjs.com 包页面的 Provenance 区块。
- 若将来想要 release notes，再单独考虑 GitHub Release 或 `CHANGELOG.md` —— 本任务明确不做。

## Version History

- v1 — planning.

## Change Log — 实现阶段记录

- 2026-11-01 — Step 1 完成。`npm publish --dry-run` 首次失败于 `tsc: not found` —— 这个 worktree 从未装过依赖。`npm ci` 后通过。这是环境问题不是代码问题，记录下来是因为它同时验证了 `prepublishOnly` 确实会在 publish 时触发构建（dry-run 的输出里能看到 `> digdig@0.0.2 prepublishOnly > npm run build`）。
- 2026-11-01 — Step 1 的 dry-run 末尾报 `EPUBLISHCONFLICT`（cannot publish over 0.0.2）。这是**预期结果**，不是失败：0.0.2 已在 registry 上，dry-run 也走到 registry 的版本检查。真正的新版本发布不会遇到。
- 2026-11-01 — AC7 原写法 `grep -rn "NPM_TOKEN"` 实测误报：命中的是 `publish.yml:15` 里那句「There is no NPM_TOKEN anywhere in this workflow」的注释。验收标准已改为查实际 token 机制（`secrets.` / `NODE_AUTH_TOKEN` / `_authToken` / `npm login`），实测零命中。这是验收标准写错了，不是实现有问题，两者都记在这里。
- 2026-11-01 — Step 2 完成。`CONTRIBUTING.md` 新增「发布」小节（63 行），位于 CI 与本地验证之间。
