# Spec — Add repository governance and CI
> Task version: v1

## Objective and Success Criteria

建立本仓库的贡献治理面：`CONTRIBUTING.md`、`CODE_STYLE.md`、PR/Issue 模板、`CODEOWNERS`、GitHub Actions CI。

**成功的判据不是"文件存在"，而是"文件里每一句都成立"。** 本仓库没有历史治理文档可继承，所以全部内容必须从可核验的事实推导：分支历史、提交历史、合并拓扑、源码统计、`package.json`。任何无法用命令验证的政策性断言都不写。

这条约束是本 spec 的核心。一份写着"运行 `npm run lint`"而仓库里没有 lint 的 `CODE_STYLE.md`，比没有这份文档更糟 —— 它会让下一个贡献者（或 Agent）浪费一轮去执行一个不存在的命令。

## Architecture Boundaries and Responsibilities

七份产物分成三类，各自的权威范围不重叠：

| 类别 | 文件 | 权威于 | 不权威于 |
|---|---|---|---|
| 协作流程 | `CONTRIBUTING.md` | 分支命名、提交格式、PR 流程与正文、合并方式 | 代码长什么样（→ `CODE_STYLE.md`） |
| 代码规范 | `CODE_STYLE.md` | 缩进/引号/分号/ESM、命名、注释准则、测试组织 | 提交信息（→ `CONTRIBUTING.md`） |
| 自动化 | `.github/workflows/ci.yml` | 合并前必须通过什么 | 本地怎么跑（`CONTRIBUTING.md` 指向它） |
| 模板 | `.github/pull_request_template.md`、`.github/ISSUE_TEMPLATE/*` | PR / Issue 的必填结构 | 流程本身 |
| 归属 | `.github/CODEOWNERS` | 谁被请求 review | — |

**不重复的边界**：`CONTRIBUTING.md` 提到测试命令时只引用，不复制 `CODE_STYLE.md` 里的完整测试组织说明。`CODE_STYLE.md` 提到提交格式时同理。两份文档互相引用而不是各自复述一遍 —— 复述是第二个事实源，改了一处忘另一处。

**`AGENTS.md` / `CLAUDE.md` 不在本任务内。** `CLAUDE.md` 是主检出的未跟踪文件，按用户要求不入库。

## Project Structure / Affected Files

新增（仓库根）：

```
CONTRIBUTING.md
CODE_STYLE.md
.github/
├── CODEOWNERS
├── pull_request_template.md
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   └── feature_request.md
└── workflows/
    └── ci.yml
```

修改：

```
TaskFlowDocs/repository-docs/index.md     三行 Exists/Status
TaskFlowDocs/todo.md                      修正 TF-20261017-bfc96d 的过时句子
```

**零改动**：`cli/src/`、`cli/test/`、`cli/package.json`。本任务不引入 lint 工具，不改 `engines`，不动任何代码。

## Interfaces, Data Flow, and Contracts

### CI 契约

```yaml
触发：push → main；所有 pull_request
job build：node 18.x（engines 下限）、20.x、22.x  → npm ci → npm run build
job test： node 20.x、22.x                        → npm ci → npm test
共同：actions/checkout → actions/setup-node(cache: npm, cache-dependency-path: cli/package-lock.json)
      各 step 的 working-directory: cli
```

**为什么拆成两个 job**：`build` 在 18/20/22 全跑，`test` 只在 20/22 跑。`vitest@4` 声明 `engines.node = ^20.0.0 || ^22.0.0 || >=24.0.0`，其 `rolldown` 依赖又要求 `^20.19.0`，所以 18 上跑不了测试；但 `tsc` 在 18 上正常，且已实测构建产物在 Node 18.20.8 下能完成真实搜索。发布的 npm 包声明 `engines.node >= 18.0.0`，删掉 18 那一格会让这个承诺无人检查。拆 job 是让每个版本跑到它能跑的部分。

**为什么不加 lint 步骤**：仓库没有 linter。加一个需要先决定用哪个、写配置、修一遍现有告警 —— 那是另一件事，不在本 spec。

**为什么不改 `engines`**：提到 `>=22` 会让已安装 0.0.2 的 Node 18 用户收到 npm 警告，是面向用户的行为改变，需要单独决定，不混在「加 CI」里做。

**缓存路径**：`package-lock.json` 在 `cli/` 下而非仓库根，`cache-dependency-path` 必须指对，否则缓存静默失效。

### PR 模板契约

五节，取自 #7 / #13 / #14 实际使用的结构：

```markdown
## 背景        ← 要解决什么，带可核验的事实（表格优先）
## 改动        ← 提交或文件级别的改动清单
## 验证        ← 实际运行的命令与结果，贴输出
## 兼容性      ← 行为变化、旧数据、迁移
## 不在本 PR 范围 ← 明确排除项，避免 review 范围蔓延
```

**"验证"一节是必填**，填法是贴命令和输出，不是写"已测试"。

### 提交信息契约

`<type>(<scope>): <中文祈使句>`，type ∈ {feat, fix, docs, refactor, chore, test}，scope 可选（近期用法：`deep`、`search`、`cli`、`build`、`taskflow`）。正文用中文分点说明为什么，不是复述改了什么。

主语长度：历史中位数 42 字符，最长 79。规范的表述是"尽量简短"，不给硬上限 —— 硬上限会被特例打破，然后规范本身变成谎话。

### 分支契约

`<type>/<slug>`，type 同提交。2026-10-19 之后的分支带日期前缀：`<type>/YYYY-MM-DD-<slug>`。规范写成"推荐带日期"，因为更早的分支没有。

### 合并契约

保留合并提交（`Merge pull request #N from <branch>`），不 squash、不 rebase。这不是偏好 —— 已合并的 14 个 PR 全是这样，且分支上的提交在合并后仍可 bisect。

## Invariants and Compatibility

1. **不引入不存在的东西。** 无 lint 命令、无覆盖率门槛、无 `make`、无 pre-commit 钩子。每条规范都能被一个命令验证。
2. **不改变任何现有行为。** 本任务只加文件与改索引。`cli/` 下 diff 必须为空。
3. **中英双语 README 的既有约定不被破坏。** 新文档用中文，因为仓库面向的贡献者语言是中文（提交历史 100% 中文）；`README.md` / `README.zh-CN.md` 的双语对齐是它们自己的规则，不延伸到新建文档。
4. **TaskFlow 索引是路由记录，不是政策正文。** `repository-docs/index.md` 只记录路径、阶段、是否存在；政策内容留在源文件。更新索引时只改 `Exists` / `Status` 两列，不把文档内容抄进去。

## Validation and Error Semantics

| 检查 | 命令 | 期望 |
|---|---|---|
| 七份文件存在 | `ls` 逐个 | 全部存在 |
| TaskFlow 认可 | `bash hooks/repository-check .` | `CONTRIBUTING.md: present`、`CODE_STYLE.md: present` |
| YAML 合法 | `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` | 无异常 |
| 代码零改动 | `git diff --stat origin/main -- cli/` | 空 |
| 规范无虚构 | 逐条对照 Background 的实测数据 | 每条都能指回一个证据 |
| CI 实际跑通 | `gh run list --workflow=ci.yml` | 成功 |

**CI 跑不通时的语义**：如果 GitHub Actions 在本仓库未启用，或 `npm ci` 在 Actions 环境失败，如实记录失败原因与日志。**不删掉工作流来让验收变绿**，也不声称"应该能过"。

## Code and Test Constraints

本任务不写 TypeScript。约束针对 Markdown 与 YAML：

- Markdown 用 ATX 标题（`##`），与仓库现有文档一致。
- 代码块标注语言（```bash、```yaml、```json、```typescript）。
- 路径用仓库相对路径，不写本机绝对路径。
- YAML 用 2 空格缩进（GitHub Actions 的通行写法；仓库的 TypeScript 用 4 空格，两者不冲突——不同语言不同惯例）。
- 不放徽章、不放 Logo、不放"欢迎贡献 🎉"这类无信息量的句子。

## Design Decisions and Alternatives

### 决策 1：文档内容从历史推导，而非套模板

**考虑过**：直接照搬 TaskFlow 插件的 `CONTRIBUTING.md` / `CODE_STYLE.md` 骨架。
**否决**：那两份文档描述的是"零运行时依赖的 POSIX shell 钩子"项目，规则与一个 TypeScript CLI 几乎不重叠（它的 CODE_STYLE 通篇讲 shell，只有"Markdown"一节通用）。照搬会写出一份"看起来专业但与本仓库无关"的文档。
**采用**：实测本仓库的分支名、提交前缀、缩进、引号、合并拓扑，把观察到的模式写成规范。

### 决策 2：不引入 lint 工具

**考虑过**：顺手加上 eslint + prettier 配置，让 `CODE_STYLE.md` 有工具背书。
**否决**：这会改变 `package.json`、新增两个依赖、并可能需要修一批现有告警 —— 超出"写文档"的范围，且是行为改变。`CODE_STYLE.md` 的规范由**人读**和 review 保证，不假装有自动检查。
**留下口子**：文档里明确写"本仓库当前没有 lint 工具，规范靠 review"，这样将来加 lint 时那句话就是待改项，而不是被遗忘的谎言。

### 决策 3：Issue 模板保持最小

**考虑过**：写完整的 bug report 模板（环境、版本、复现步骤、期望、实际、日志）。
**采用**：精简版 —— 因为仓库没有历史 issue 可供推导实际需要什么，写太细等于发明政策。只保留定位缺陷不可省的四项：做了什么、期待什么、实际什么、版本/环境。

### 决策 4：CI 矩阵以 `engines` 为准

`engines: >=18.0.0` 是仓库对外的承诺。矩阵从 18 起，是让这个承诺可被检查。若 18 失败，调 `engines` 或修代码，两者都是诚实的选择；删掉矩阵那一格是把承诺降级成装饰。

## Open Questions

无。三个待定项都已在本 spec 内定案：不带 lint 工具、Issue 模板取最小、矩阵以 `engines` 为准。`ROADMAP.md` 明确排除（需要产品方向，用户未给）。
