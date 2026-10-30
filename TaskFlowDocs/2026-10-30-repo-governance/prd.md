# 仓库规范与 CI：把已经在做的事写下来
> Task version: v1
> Status: in_progress

## Goal

仓库有可执行的贡献规范与 CI，让"该怎么提交、怎么开 PR、代码该长什么样、改坏了谁来拦"不再靠 `git log` 反推。当前 `.github/` 完全不存在，`CONTRIBUTING.md`、`CODE_STYLE.md`、`ROADMAP.md` 三份文档全部缺失，`TaskFlowDocs/repository-docs/index.md` 已把它们登记为 `missing`。TaskFlow 的 `repository-check` 每次运行都报这三项，PR 模板与 CI 的缺席意味着每个 Pull Request 都没有可对照的必填项，也没有任何自动检查在合并前跑测试。

用户价值：今天开一个 PR，没有任何文档规定它的标题格式、正文该写什么、CI 该跑哪些命令；贡献者只能从历史提交里猜。写下来之后，规则可被检查、可被引用，TaskFlow 的门禁也不再报缺失。

## Background / Confirmed Facts

全部在 `origin/main` @ `2fbc8ac` 上实测。

### 缺什么

| 项 | 状态 | 证据 |
|---|---|---|
| `CONTRIBUTING.md` | 缺失 | 仓库根不存在；`repository-docs/index.md` 标 `missing` |
| `CODE_STYLE.md` | 缺失 | 同上 |
| `ROADMAP.md` | 缺失 | 同上（索引标为 `missing`，但目录检查把它当可选） |
| `.github/` | 整个目录不存在 | `ls .github` → No such file or directory |
| CI | 无 | `gh workflow list` 为空；`.github/workflows/` 不存在 |

### 已经在做、只是没写下来的约定

**分支命名** —— 历史 11 个分支全部形如 `<type>/<slug>`，`type` 取 `feat` / `fix` / `chore` / `refactor`。近期的还带日期：`refactor/2026-10-28-result-identity-pipeline`、`chore/2026-10-20-prepack-clean`。

**提交信息** —— 57 条 `feat:`、8 条 `chore:`、4 条 `refactor(deep):`、3 条 `docs(taskflow):`。格式是 Conventional Commits 的 `<type>(<scope>): <中文祈使句>`，正文用中文分段落说明。主语长度 18–79 字符，中位数 42。

**合并方式** —— `1ec86af`、`9816f2f` 等全部是 `Merge pull request #N from <branch>` 的合并提交，**不是 squash、不是 rebase**。`git merge-base --is-ancestor 9f4d0d4 1ec86af` 确认为真，即分支上的提交在合并后仍可逐个看到。

**PR 正文结构** —— 最近三个 PR（#13、#14、#7）正文都由这几节组成：`## 背景`（缺陷表，带实测数据）、`## 改动`（提交表）、`## 验证`（命令与结果的代码块）、`## 兼容性`、`## 不在本 PR 范围`。这是实际执行的格式，不是设想。

**代码风格** —— 4 空格缩进（`runCli.ts` 192 行 4 空格 / 27 行 2 空格，后者是模板字符串里的命令示例，不是缩进）；单引号为主（218 处单引号 vs 19 处双引号，双引号出现在需要 `\u` 转义或 JSON 字面量处）；语句以分号结尾（`runCli.ts` 506 行）；ESM-only（`"type": "module"`）；注释写英文，且解释"为什么"而不是"是什么"。**没有** eslint / prettier / lint 脚本 —— `package.json` 里无 `lint`、`format` 项。

**测试** —— vitest；`cli/test/unit`、`cli/test/integration`、`cli/test/benchmark`、`cli/test/fixtures`；`npx vitest run` 当前 37 文件 / 519 测试。测试内全部对 axios 做了 `vi.mock`，**不需要网络**——实测在禁网沙箱里跑完整套通过。

**构建** —— `cd cli && npm run build`（`tsc` + 给两个 bin 加执行位）；`npm test` 即 `vitest run`。Node `>=18.0.0`，本地实测 v24.14.0。

### 一条已经过时的记录

Todo 条目 `TF-20261017-bfc96d` 的 Goal 末尾写着"TaskFlow 的 merge driver 和 `todo-merge-audit` check 期望一个 `.github/workflows/hooks.yml` job（见 `TaskFlowDocs/repository-docs/index.md`）"。**这句不成立**：`index.md` 没有任何 `hooks.yml` 字样，仓库里也没有任何 TaskFlow hook 脚本（`git ls-files | grep -c hooks/` → 0）。那是 TaskFlow **插件自身**仓库的 CI，与本仓库无关。本任务的 PRD 不把它列为要求，实施时同步修正该 Todo 条目的这句话。

## Requirements

1. **`CONTRIBUTING.md`**：分支命名、提交信息格式、PR 流程与正文结构、合并方式、模型/Agent 协作约定。全部从上面已确认的事实推导，不发明新政策。
2. **`CODE_STYLE.md`**：TypeScript 风格（缩进、引号、分号、ESM、命名）、注释准则（写为什么、写英文）、测试组织与命令、文档双语对齐规则。**不声称使用 lint 工具**，因为仓库里没有。
3. **PR 模板**：`.github/pull_request_template.md`，采用 #7/#13/#14 实际用的五节结构。
4. **Issue 模板**：`.github/ISSUE_TEMPLATE/bug_report.md` 与 `feature_request.md`。仓库没有历史 issue 可供推导，因此保持最小——只问定位缺陷必需的信息。
5. **`CODEOWNERS`**：`.github/CODEOWNERS`，全部路径归 `@hkwuks`（`package.json` 的 `author` 与仓库 owner 一致）。
6. **CI**：`.github/workflows/ci.yml`，在 push 到 `main` 与所有 PR 上跑 `npm ci` → `npm run build` → `npm test`；Node 版本矩阵覆盖 `engines` 下限 18 与当前 LTS。
7. **同步修正**：`TaskFlowDocs/repository-docs/index.md` 中三份文档的 `Exists` / `Status` 由 `no`/`missing` 改为 `yes`/`ready`；Todo 条目 `TF-20261017-bfc96d` 删掉那句过时的 `hooks.yml` 要求。
8. **不改代码**：本任务只新增文档与 CI 配置，`cli/src/` 一行不动。

## Acceptance Criteria

1. `CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`、`.github/ISSUE_TEMPLATE/bug_report.md`、`.github/ISSUE_TEMPLATE/feature_request.md`、`.github/CODEOWNERS`、`.github/workflows/ci.yml` 七个文件均存在。
2. `bash ~/.claude/plugins/cache/taskflow/taskflow/1.1.8/hooks/repository-check .` 输出中 `CONTRIBUTING.md` 与 `CODE_STYLE.md` 均为 `present`。
3. `ci.yml` 是合法 YAML，且 `yamllint` 或 `python3 -c 'import yaml'` 能解析。
4. CI 实际跑通：推送后 `gh run list` 显示成功。**若 Actions 未启用或无法触发，记录原因，不伪造结果**。
5. `CODE_STYLE.md` 里没有任何仓库不成立的断言（无 lint 工具、无覆盖率门槛），逐句核对。
6. `repository-docs/index.md` 三处状态已更新。
7. `cli/src/` 与 `cli/test/` 零改动：`git diff --stat origin/main -- cli/` 为空。
8. 文档语言与仓库一致：面向贡献者的正文用中文，命令、路径、代码示例原样。

## In Scope

- 新增：`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`、`.github/ISSUE_TEMPLATE/bug_report.md`、`.github/ISSUE_TEMPLATE/feature_request.md`、`.github/CODEOWNERS`、`.github/workflows/ci.yml`
- 修改：`TaskFlowDocs/repository-docs/index.md`、`TaskFlowDocs/todo.md`（修正过时句子）

## Out of Scope

- `ROADMAP.md` —— 需要产品方向，用户未确认。`repository-check` 不把它计入失败项（只对 `CONTRIBUTING.md` / `CODE_STYLE.md` 置 `needs=1`）。
- `CODE_OF_CONDUCT.md`、`SECURITY.md`、`RELEASE.md`、`CHANGELOG.md` —— 索引标为 `optional`，本任务不新增。
- 引入 eslint / prettier / 任何 lint 或格式化工具 —— 那是代码行为的改变，需要单独决定。
- 修改现有工作流的合并方式、分支保护规则 —— 属于仓库设置，不是文件。
- 给 TaskFlow 插件本身加 CI —— 与本仓库无关。

## Risks / Deferred Items

- **风险：把"应当如此"写成"已经如此"。** 每条风格声明都必须有实测依据（见 Background 的计数）。逐条核对是本任务的核心验收项（AC5）。
- **风险：CI 在仓库上跑不起来。** 若 GitHub Actions 未启用，或 `npm ci` 因 symlink 的 `node_modules` 出问题，如实记录并保留工作流文件 —— 文件本身正确，触发是仓库设置问题。
- **风险：Node 18 矩阵失败。** `engines` 写的是 `>=18.0.0`，但本地只在 v24 上验证过。若 18 失败，两种处理：修代码，或把 `engines` 改成事实。**不改矩阵去迁就**——那等于把 `engines` 的谎言保留下来。
- **延期**：`ROADMAP.md` 待用户给方向后再写。

## Open Questions

无阻塞项。两个已定决策：
- Issue 模板保持最小，因为仓库没有历史 issue 可推导格式。
- CI 矩阵以 `engines` 为准，不凭喜好挑版本。
