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

- 不要在 `main` 上直接提交 —— 走分支和 PR。
- 不要提交 `.digdig/` 下的 session 数据 —— 已在 `.gitignore` 里。
- 不要提交密钥或 token。配置优先级见 `README.md`，密钥放环境变量或本地 config 文件。
- 不要为了让 CI 变绿而删测试或放宽断言。修代码，或者说明为什么测试本身是错的。
