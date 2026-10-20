# 命令名简化为 `dg`，并把项目定位从「SearXNG 的 CLI」改为「多后端搜索 CLI」

> Task version: v1
> Status: completed

## Goal

两件事，一次做完：

1. **命令名**：主推命令从 `digdig` 改为 **`dg`**（包名仍是 `digdig`）。`digdig` 保留为自描述长名，`sxng` 继续按既有五版过渡窗口带告警可用。
2. **项目定位**：三份 README 与 GitHub 仓库描述不再把工具定义为「SearXNG 的命令行界面」。SearXNG 降为**默认后端**，与 Ollama 网页搜索、DeepSeek Search 并列为可选后端。

同时清掉这一轮逐行核对文档时发现的**事实错误**（它们大多属于既有 inbox 项，本次一并结清，见 R4–R8）。

用户价值：`dg` 是给 Agent 和终端用户敲的，越长越难用；只把 SearXNG 写进 tagline，会让已经配置 Ollama/DeepSeek 的用户以为装错了工具，也让只想要一次搜索、不想自托管服务的人直接放弃。

## Background / Confirmed Facts

均在本工作树核对（`main` = `cfad652`）。

**后端事实**

- 后端由一个列表决定：`cli/src/runCli.ts:397` `EXTERNAL_PROVIDERS = ['ollama', 'deepseek']`。`--engines` 里的 `ollama`/`deepseek` 走独立 `search()`，其余引擎名转发给 SearXNG（`planProviderSearch` / `searchOneQuery`）。
- **不存在自动回退**。`grep -rn "service\.search" cli/src/` 只有一处（`searchOneQuery`），没有任何 catch 之后转投别的后端。`baseUrl` 指向死服务时，未指定 `-e` 的搜索直接 `SEARCH_FAILED` 退出 1。所以「SearXNG 不可用时回退 Ollama」是**假描述**，出现在 6 行里（见 R5）。
- `deepseekApiKey` 在 config 里存在（`config.ts:36`）、`DEEPSEEK_API_KEY` 在 `config.ts:160` 被读取、`README.md:998` 有表行 —— 但 **`README.zh-CN.md` 与 `cli/README.md` 的环境变量表都没有它**；三份 README 的 `digdig.config.json` 示例里**都没有 `deepseekApiKey`**；`digdig init` 也**从不询问 DeepSeek key**（只有 `init.ts:151` 的 Ollama 段）。

**timeout 事实**

- 代码默认 `DEFAULT_CONFIG.timeout = 10000`（`cli/src/config.ts:40`），无配置文件、无环境变量时生效值就是 10000。
- 三份 README 的环境变量表都写 `30000`，三份配置示例也都写 `"timeout": 30000`；`cli/digdig.config.example.json` 同为 `30000`。示例文件本身站在错的一侧。

**环境变量前缀事实**

- 十个变量的读入口是 `envRaw(name)`（`legacy.ts:121`）：`DIGDIG_<name>` 优先，`SEARXNG_<name>` 兼容且打一行告警。
- 三份 README 的环境变量表**全部只列 `SEARXNG_*`**（各 10 行），把兼容名当成了正式名。`DIGDIG_` 在三份 README 里合计只出现 3 次，全在升级说明段里。

**`dg` 可用性**

- 本机 `/usr/bin/dig` 与 `/usr/bin/dd` 都存在，`dg` 不存在。所以**不选** `dig`（撞 `dig(1)` DNS 工具，双向误命中）与 `dd`（撞 `dd(1)`，误用可毁盘）；选 `dg`。

**命令名出现的两种形态**（必须区分）

| 形态 | 例子 | 处理 |
| --- | --- | --- |
| 命令位 | `digdig "query"`、`` `digdig --health` ``、`$ digdig init` | 改 `dg` |
| 身份/路径位 | `npm install -g digdig`、`digdig@0.0.2`、`.digdig/sessions/`、`digdig.config.json`、`hkwuks/digdig`、`origins[].tool = 'digdig'` | **不改** |

**404 链接事实**

- `README.md:1198`、`README.zh-CN.md:1186`、`cli/README.md:415` 三处指向 `PRD-005-design-improvements.md`。该文件在本机存在，但 `git ls-files cli/docs` 为空 —— 整个 `cli/docs/` 未跟踪，GitHub 上是 404；`cli/package.json` 的 `files` 也不含 `docs/`，npm 页面上同样打不开。

## Requirements

**R1 命令名**：`cli/package.json` 的 `bin` 变为三个入口 —— `dg` 与 `digdig` 都指向 `dist/index.js`，`sxng` 指向 `dist/sxng.js`。`.name()` 改为 `dg`；`--help` 的描述保留 `digdig` 以自描述。

**R2 命令位替换**：README×3、`skills/digdig/` 全部文档、`cli/src/runCli.ts` 的 help 示例与 hint，命令位的 `digdig` 改为 `dg`。身份/路径位（上表右列）逐字保留。

**R3 多后端定位**：三份 README 的 tagline 改为多后端表述并点名三种后端；Features 新增一条后端可插拔；`-e` 选项说明补上 `deepseek`。

**R4 环境变量表**：三份 README 的十行变量名改为 `DIGDIG_*`，并在表后补一句：`SEARXNG_*` 旧名在 `0.5.0` 前仍被读取，用到时 stderr 打一行 `[deprecation]`。

**R5 删除假回退描述**：6 行全部改写为「显式用 `-e ollama` 选定，不是自动回退」：
- `cli/src/init.ts` 的三行（注释、段标题、用户可见提示）
- `README.md` / `README.zh-CN.md` 的 "optional fallback backend" / 「可选备用搜索后端」
- `cli/src/ollama-service.ts` 头部注释的 "drop-in fallback"

**R6 timeout 对齐代码**：三份 README 的表与配置示例、`cli/digdig.config.example.json` 的 `timeout` 均改为 `10000`（以代码为准）。

**R7 DeepSeek 配置补齐**：`README.zh-CN.md`、`cli/README.md` 环境变量表补 `DEEPSEEK_API_KEY` 行；三份 README 的配置示例补 `"deepseekApiKey": ""`；`digdig init` 增加 DeepSeek key 询问（与 Ollama 同形，但不声称回退）。

**R8 404 链接**：三处指向未跟踪文档的 Markdown 链接改为纯文本引用（保留「见 PRD-005」语义，不给死链）。

**R9 skill 同步**：`skills/digdig/SKILL.md` 的 `-e` 说明、`--engines-list` 说明、后端段补 DeepSeek；`appendix.md` 的换后端指引点名 `deepseek`。

## Acceptance Criteria

- [ ] **AC1** `npm run build` 通过；`npm test` 全绿（改前 506 例）。
- [ ] **AC2** `node dist/index.js --help` 的 usage 含 `dg`，描述同时含 `SearXNG`、`Ollama`、`DeepSeek`。
- [ ] **AC3** `npm pack --dry-run` 的 bin 段列出 `dg`、`digdig`、`sxng` 三个名字，且 `dist/index.js` 存在。
- [ ] **AC4** 临时目录下 `dg --session new "x"` 与 `digdig --session new "x"` 都能创建会话（同一份代码，两个 bin）。
- [ ] **AC5** `node dist/sxng.js --version` 的 stderr 恰一行 `[deprecation]`；`node dist/index.js --version` 的 stderr 为 0 字节。
- [ ] **AC6** 三份 README 的命令示例中不再有命令位的 `digdig `；三份 `grep -c 'npm install -g digdig'` 均为 1（身份位未被误伤）。
- [ ] **AC7** 三份 README 环境变量表 10 行均为 `DIGDIG_*`；`SEARXNG_*` 只出现在升级说明与兼容性提示里。
- [ ] **AC8** 三份 README 的 `timeout` 默认值均为 `10000`，与 `cli/src/config.ts:40` 一致；`cli/digdig.config.example.json` 同为 `10000`。
- [ ] **AC9** `cli/src/init.ts` 与 `cli/src/ollama-service.ts` 不再有「自动回退」语义的措辞。
- [ ] **AC10** 三份 README 的配置示例均含 `deepseekApiKey`；三份 README 均含 `DEEPSEEK_API_KEY`。
- [ ] **AC11** `digdig init` 交互中出现 DeepSeek key 询问（管道喂输入或源码断言）。
- [ ] **AC12** 三份 README 已无 `PRD-005-design-improvements.md` 形式的 Markdown 链接。
- [ ] **AC13** `skills/digdig/SKILL.md` 与 `references/appendix.md` 提到 `deepseek` 的行数 > 0。

## In Scope

- `cli/package.json`（bin、description）
- `cli/src/runCli.ts`（`.name`、`.description`、help 示例、hint、`--health` 帮助文案）
- `cli/src/init.ts`（DeepSeek 询问 + 删除假回退文案）
- `cli/src/ollama-service.ts`（仅头部注释）
- `cli/digdig.config.example.json`（timeout）
- `README.md`、`README.zh-CN.md`、`cli/README.md`
- `skills/digdig/SKILL.md` 与 `references/*.md`
- GitHub 仓库 description（远端，`gh repo edit`）

## Out of Scope

- **不发布**：不 `npm publish`、不 `npm deprecate sxng-cli`。
- 不改 `SEARXNG_SETTINGS_PATH`（那是 SearXNG 服务器自己的变量，本项目从不读取）。
- 不改 `SearXNGService` / `SearXNGConfig` / `searxng.config.json` 等上游命名。
- 不改 `.digdig/` 状态目录与 `digdig.config.json` 文件名（身份位）。
- 不提交 `cli/docs/`、`docs/`（未跟踪的设计文档，与本次无关）。
- 不动 `--graph <file>` 这个无读取方的选项（独立缺陷）。
- 不重指本地 `~/.claude/skills/sxng` 符号链接（用户已声明本地先不做）。
- 不把安装段重构为「三后端平级」（用户已选「SearXNG 作默认」）。

## Risks / Deferred Items

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 命令位替换误伤身份位 | 出现 `npm install -g dg` 这类错误指令 | 白名单正则 + 逐条 review `git diff`；AC6 反向校验 |
| 新增 bin `dg` 与其他全局包冲突 | `npm i -g` 时报 bin 冲突 | 保留 `digdig` 长名兜底（正是用户选三 bin 的理由） |
| `dg` 与某些 shell 别名冲突 | 用户敲 `dg` 不命中 | 文档同时给出 `digdig` |

## Open Questions

无 —— 三个决策（命令名组合、SearXNG 地位、旧账是否合并）已由用户在 2026-10-20 确定。
