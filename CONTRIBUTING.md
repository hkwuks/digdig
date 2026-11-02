# Contributing

## 开始之前

- 先读 `CODE_STYLE.md`（代码规范）和 `README.md`（项目怎么用）。
- 装依赖：`cd cli && npm ci`
- 确认本地能跑通：`npm test`

## 分支

分支名形如 `<type>/<slug>`，`type` 与提交前缀同一套：

```
feat/quantum-scoring
fix/stdout-truncation
refactor/result-identity
chore/repo-governance
docs/sop-phase-order
```

当前的实践是带上日期：`<type>/YYYY-MM-DD-<slug>`，例如 `refactor/2026-10-28-result-identity-pipeline`。更早的分支没有日期，两种都在历史里，都能接受。

分支从 `main` 切出，短生命周期。合完就删。

> `.worktrees/` 不在 `.gitignore` 里，而在本机 `.git/info/exclude` 中 —— 它是本地约定，不随仓库分发。新建 worktree 前先确认你的 clone 有这一行：
>
> ```bash
> grep -q '^\.worktrees/$' .git/info/exclude || echo '.worktrees/' >> .git/info/exclude
> ```

## 提交信息

格式：

```
<type>(<scope>): <祈使句主语>

<body>
```

**`type`** —— 用历史里实际出现过的：

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修缺陷 |
| `refactor` | 不改变外部行为的重构 |
| `docs` | 只改文档 |
| `chore` | 构建、依赖、仓库杂务 |
| `test` | 只改测试 |

**`scope`** 可选，用模块名：`deep`、`search`、`cli`、`build`、`repo`、`taskflow`。

**主语** 用中文祈使句，说做了什么，不说"修改了一些东西"。历史中位数 42 字符，尽量简短 —— 但不要为了短牺牲准确。

**正文** 用中文，说**为什么**，不是复述改了什么。可以分点、可以放表格、可以贴实测数据。

真实例子：

```
refactor(deep): 质量判断层退场，CLI 只报可数事实

`--quality` 会给一个 good / acceptable / poor 标签。这个标签从来没阻断过
任何流程，而它背后的三个数字各有各的问题。全部在 main (9816f2f) 上实测。

| 缺陷 | 实测 |
|---|---|
| verdict 不参与过滤 | 唯一读者是 runCli.ts:373 打印一句 recovery 提示 |
...
```

一次提交做一件事。格式化、重命名这类改动单独提，不要混在逻辑修改里。

## Pull Request

1. 从 `main` 切分支，在分支上提交。
2. 推分支：`git push -u origin <branch>`
3. 开 PR：`gh pr create --base main`
4. 等 CI 绿。
5. 合并 —— **保留合并提交**（不要 squash、不要 rebase）。历史上的 PR 全部是 `Merge pull request #N from <branch>`，分支上的提交在合并后仍可逐个查看和 bisect。

### PR 正文

五节，`.github/pull_request_template.md` 会预填：

```markdown
## 背景
## 改动
## 验证
## 兼容性
## 不在本 PR 范围
```

**「验证」一节必填，填法是贴命令和输出，不是写"已测试"。** 例如：

```
npx tsc --noEmit     → 0
npx vitest run       → 37 文件 / 519 测试通过
基线                 → 37 文件 / 519 测试
```

**「不在本 PR 范围」** 用来划清 review 边界。发现但没修的问题写在这里，不要顺手改 —— 顺手改会让 PR 的验证结果无法归因。

## CI

`.github/workflows/ci.yml` 在每次 push 到 `main` 和每个 PR 上跑两个 job：

| job | Node 矩阵 | 跑什么 |
|---|---|---|
| `build` | 18.x / 20.x / 22.x | `npm ci` → `npm run build` |
| `test` | 20.x / 22.x | `npm ci` → `npm test` |

**为什么 18.x 只编译不测试**：`vitest` 4 要求 Node `^20`，跑不起来；但 `tsc` 在 18 上正常，而发布的 npm 包声明 `engines.node >= 18.0.0`。所以 18 保留编译检查，测试在有运行器的版本上跑。删掉 18 那一格就等于让 `engines` 的承诺无人检查。

CI 失败时先看是哪一格：只有 18.x 的 `build` 挂通常意味着用了 18 不支持的语法，这时的正确处置是改代码或调 `engines`，**不是把 18.x 从矩阵里删掉**。

## 发布

发布由 tag 触发，`.github/workflows/publish.yml` 负责构建、测试并上传到 npm。认证走 npm 的 trusted publishing（OIDC），**仓库里没有任何 npm 写权限凭据**，也不需要 `npm login`。

### 一次性配置（只能在网页做）

**没有这一步，workflow 是死的** —— tag 推上去会在认证阶段失败。每个包只需配一次：

1. 打开 <https://www.npmjs.com/package/digdig> → **Settings** → **Trusted Publisher** → 选 GitHub Actions

2. 填四个字段：

   | 字段 | 值 |
   |---|---|
   | Organization or user | `hkwuks` |
   | Repository | `digdig` |
   | Workflow filename | `publish.yml` |
   | Environment name | 留空 |

3. **Workflow filename 只写文件名本身**，不带 `.github/workflows/` 前缀，且必须与 `.github/workflows/` 下的实际文件**完全一致**。填 `npm-publish.yml` 而文件叫 `publish.yml`，匹配不上，报错信息也不会直说是哪个字段错了。

4. 在 Allowed actions 里勾上 `npm publish`。

配好之后建议顺手做一件事：Settings → **Publishing access** → 选「Require two-factor authentication and disallow tokens」。这会把传统的 token 发布路径彻底关掉，而 trusted publisher 不受影响 —— 它用的是 OIDC，不是 token。

### 发一个版本

发布是**权限分层的**：有 `main` 推送权限的人可以直接在 `main` 上改版本号并打 tag；没有这个权限的人走分支 + PR，合并后再打 tag。两条路的产物是一样的 —— tag 都落在 `main` 的提交上。

**两条路都显式打 tag，不用 `npm version` 的自动打 tag。** 原因见本节末尾。

**有 `main` 推送权限**

```bash
git checkout main && git pull
cd cli
npm version patch --no-git-tag-version   # 改 package.json + package-lock.json，不打 tag
cd ..
git commit -am "chore(release): 版本升到 <version>"
git tag v<version>
git push origin main && git push origin v<version>
```

`npm version` 负责把 `cli/package.json` 和 `cli/package-lock.json` 两处 `version` 一起改对，然后提交、打 tag、分两次推送。**tag 必须推到 `main` 的那个提交上** —— 它是 `publish.yml` 唯一的触发条件。

**没有 `main` 推送权限**

```bash
cd cli
npm version patch --no-git-tag-version   # 只改版本号，不打 tag
git checkout -b chore/release-<version>
git commit -am "chore(release): 版本升到 <version>"
git push -u origin chore/release-<version>
```

然后开 PR。**合并之后**再打 tag —— tag 必须落在 `main` 上，落在分支提交上会让已经合并的分支多一个游离标签：

```bash
git checkout main && git pull
git tag v<version> && git push origin v<version>
```

### 为什么显式打 tag，而不是让 `npm version` 自己打

因为在这个仓库里，它打不出来，**而且不告诉你**。

`cli/` 是仓库的子目录，`.git` 在上一层。npm 的 git 检测在这里会失败，`--loglevel=verbose` 下的原话是：

```
npm verbose version Not tagging: not in a git repo or no git cmd
```

但 git 本身没问题 —— 在 `cli/` 下 `git rev-parse --git-dir` 正常返回 `/mnt/f/WorkSpace/Node/digdig/.git`。是 npm 的检测在这个组合下失效，不是 git 坏了。

问题在于**它是静默的**：不报错、不警告，输出照常是 `v0.0.4`，看起来完全正常。结果是版本号改了、提交了、推送了，**但 tag 没有，`publish.yml` 永远不会触发** —— 而你看不出哪里不对。

`git tag` 手动打不受影响，所以两条路径都改成显式打 tag。

**不要手改 `package.json` 的版本号。** 手改容易漏掉 `package-lock.json` 里那两处 `version`；用 `npm version --no-git-tag-version` 让 npm 去改，只把打 tag 这一步拿回来自己控制。

### workflow 做了什么

| 步骤 | 作用 |
|---|---|
| 版本校验 | tag 与 `cli/package.json` 的 `version` 不一致时立即失败 |
| `npm ci` | 按 lockfile 装依赖 |
| `npm test` | 全量测试 |
| `npm publish` | 构建（`prepublishOnly`）并上传，自动带 provenance 证明 |

**版本校验必须在 `npm publish` 之前**，因为它不可逆：`npm publish` 一旦成功，那个版本号就永久占用了，撤不回来。前面的步骤失败还能修完重来，发布之后的失败只能发新版本号。

### 发布失败了怎么办

| 失败在哪 | 怎么处理 |
|---|---|
| `npm publish` **之前** | 修好代码，删掉 tag 重新打同一个版本号，再推。`git tag -d v0.0.3 && git push origin :refs/tags/v0.0.3` |
| `npm publish` **之后** | 版本号已被占用，同一个号再发会 `EPUBLISHCONFLICT`。只能发一个新版本号。 |

workflow 把测试和版本校验都排在发布前面，就是为了让 `npm publish` 尽量成为最后一个可能失败的步骤。

### 为什么不用 token

长期写权限 token 有两个问题：会被泄漏，需要轮换。OIDC 换来的凭据是每次发布现签的，只对这一个 workflow 有效，用完即弃。顺带的好处是 provenance —— npm 会自动附上一份签名证明，说明这个 tarball 由哪个仓库的哪次提交构建而来，用户可以用 `npm audit signatures` 验证。

真要用 token 的话，注意 classic **Publish** 类型的 token 在 CI 里必然失败（`EOTP`，runner 没法输入一次性密码），得用 **Automation** 类型或带读写权限的 granular token。这条路不推荐 —— trusted publishing 已经能用了。

## 本地验证

提交前至少跑一遍：

```bash
cd cli
npx tsc --noEmit     # 类型
npm test             # 全量测试，约 20 秒
```

只改了一个模块时可以先跑单文件：

```bash
npx vitest run test/unit/deep/dedupe.test.ts
```

完整命令见 `CODE_STYLE.md`。

## 报告问题

用 `.github/ISSUE_TEMPLATE/bug_report.md`。最少给四样：做了什么、期待什么、实际什么、版本与环境。

版本：`dg --version`。环境：操作系统、Node 版本、用的哪个搜索后端（SearXNG / Ollama / DeepSeek）。

## 不要做的事

- 不要在 `main` 上直接提交 —— 走分支和 PR。**例外：发布时的版本号提交**，有 `main` 推送权限的人可以直接提交（见「发布」一节）。
- 不要提交 `.digdig/` 下的 session 数据 —— 已在 `.gitignore` 里。
- 不要提交密钥或 token。配置优先级见 `README.md`，密钥放环境变量或本地 config 文件。
- 不要为了让 CI 变绿而删测试或放宽断言。修代码，或者说明为什么测试本身是错的。
