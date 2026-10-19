# 项目改名为 `digdig`（含运行时产物迁移）

> Task version: v1
> Status: completed

## Goal

把发布物从 `sxng-cli` 改名为 `digdig`：包名、命令名、文档、skill 目录，以及它写在用户机器上的运行时产物（`.sxng/`、`sxng.config.json`、`SEARXNG_*` 环境变量）。

用户价值：`sxng` 这个名字把工具和它背后的 SearXNG 服务器绑死，而它现在同时接 Ollama 与 DeepSeek，名字已经名不副实。改名本身不产生新能力，价值在于止损——越晚改，越多用户数据落在旧名下。

过渡期 **5 个版本**：新包从 `0.0.2` 起（npm 上 `digdig@0.0.1` 是已占位的空白包），到 **`0.5.0` 切断**。过渡期内旧名全部继续可用，用到时往 stderr 打一行弃用告警；`0.5.0` 时删掉迁移代码与 `sxng` 这个 bin。

## Background / Confirmed Facts

**发布物与占位包**（已核对）

- 仓库只有一个可发布包：`cli/`，`name: "sxng-cli"`、`version: "1.3.2"`、`bin: { "sxng": "dist/index.js" }`。
- npm 上 `digdig` 已是 `0.0.2` 之前的状态：`version 0.0.1`、`author hkwuks`、`maintainers ["hkwuks <hkwuks@qq.com>"]`、`repository` 指向 `github.com/hkwuks/sxng-cli`。**占位包是用户自己的**，不是抢注，改名没有名称风险。
- `npm view sxng-cli version` = `1.3.2`，与工作区一致。
- `npm-reserve-digdig/` 是占位包的源目录（`package.json` + `README.md` 两个文件，untracked 之外的既有布局），`cli/` 才是真包。

**引用面实测**（`git grep`，tracked 文件）

| 模式 | 命中数 | 性质 |
| --- | --- | --- |
| `SearXNG` | 181 | 上游产品名，**不改** |
| `searxng`（小写） | 85 | 上游 URL / 上游变量，多数**不改** |
| `sxng-cli` | 84 | 包名与仓库名，**改** |
| 裸 `sxng` | 797 | 本项目自指，绝大多数**改** |
| `digdig` | 2 | 仅 `todo.md` |

裸 `sxng` 按文件分布：`skills/sxng/SKILL.md` 134、`README.zh-CN.md` 121、`README.md` 118、`cli/README.md` 97、`SOP.md` 48、`cli/src/runCli.ts` 42、`appendix.md` 31、其余零散。**文档占绝大多数，代码只有 42 处**（`runCli.ts` 的 `.name('sxng')`、示例与 hint 文案）。

**必须区分的三种 `sxng`**

1. **上游 SearXNG**：`SearXNGService`、`SearXNGConfig`、`SEARXNG_SETTINGS_PATH`、`https://github.com/searxng/searxng`、`searxng.config.json`（`cli/.gitignore` 里的历史名）。这些指的不是本项目，改名会变成错误陈述。
2. **本项目身份**：包名、bin、`program.name()`、README/CLAUDE.md/skill 文案、`skills/sxng/` 目录、`npm-reserve-digdig/`。
3. **本项目写在用户机器上的产物**：`.sxng/`、`sxng.config.json`、`~/sxng-cli/`、`SEARXNG_*`（10 个）、`origins[].tool === 'sxng'`。

**用户产物的写入点**（已核对源码）

| 产物 | 写入点 | 读取点 |
| --- | --- | --- |
| `.sxng/sessions/` | `commands/session.ts:19` `getDefaultSessionRoot` | 同左；`session.ts:331` `resolveSessionPath` 统一解析 |
| `.sxng/docs/` | `deep/local-doc/indexer.ts:54` | 同左 |
| `.sxng/jina-rate-limit.json` | `deep/extractor.ts:243` | 同左 |
| `sxng.config.json`（本地） | 无（用户手写） | `config.ts:72` `findConfigFile` |
| `~/sxng-cli/sxng.config.json` | `init.ts:75-76` | `config.ts:78` |
| `SEARXNG_*`（10 个） | 无（用户设置） | `config.ts:113-171` |
| `origins[].tool: 'sxng'` | `runCli.ts:481` `originTool` | **没有任何分支依赖它**（`session.ts:182` 的 `isDirectOrigin` 只认 `'user'`/`'agent'`），只是被回显 |

`originTool` 这一行是本次改名的关键事实：`'sxng'` 是一个**只写不判**的标签，所以它不需要迁移代码，也不需要重写旧数据——改写入端即可，旧值照常读、照常回显。

**bin 别名无法从 argv 识别**（已核对）

npm 的全局安装生成的是 shell/cmd 垫片，`process.argv[1]` 永远是 `dist/index.js` 的真实路径，**不是** `sxng`。因此"用户是否用旧命令名调用"只能靠一个专门的入口文件判断，不能靠读 `argv`。

**skill 装在项目外**

`~/.claude/skills/sxng` 是指向 `/mnt/f/MyScripts/LLMConfig/claude/skills/sxng` 的符号链接，**不在本仓库**。按全局规则，本次只改项目内的 `skills/sxng/`，配置目录那侧由用户自行重指。

**版本线与切断点**（用户决定 2026-10-19）

- 新包从 `0.0.2` 起（不是 1.x 续号，也不是从 1.0.0 重起）。
- 切断版本 **`0.5.0`**：迁移代码、`sxng` bin 别名、弃用告警一起删除。
- 语义版本上 `0.0.2 < 1.3.2`：新包会"看起来更旧"。README 与 `sxng-cli` 的 registry 弃用文案必须说明这一点，否则用户会以为装到了旧版本。

**已否决**（用户决定 2026-10-19）

- 本次**不发布**：不发 npm、不在 registry 上 deprecate `sxng-cli`、不改 GitHub 仓库名。
- 因此也**不改 `repository`/`homepage`/`bugs` 三个 URL**：GitHub 在仓库改名后会把旧 URL 重定向，但新 URL 在改名之前是 404。先改字符串等于主动制造三个坏链。三个 URL 随仓库改名一起改，见 Follow-ups。

## Requirements

**R1 身份层改名（纯替换，无迁移）。** `cli/package.json` 的 `name` → `digdig`、`version` → `0.0.2`；`bin` 改为 `{ "digdig": "dist/index.js", "sxng": "dist/sxng.js" }`；`files` 里的 `sxng.config.example.json` 同步改名为 `digdig.config.example.json`。`program.name()` → `'digdig'`。

**R2 `sxng` 命令别名在过渡期内保留。** 新增入口 `cli/src/sxng.ts`（编译为 `dist/sxng.js`），行为：先记一条弃用（R8），再委托给与 `index.ts` 相同的 `main()`。这是唯一可靠的旧命令名检测点（见 Background：argv 不可用）。`0.5.0` 时该文件与 bin 条目一起删除。

**R3 状态目录 `sxng` → `digdig`，采用"就地在场认领"，不搬数据。** 解析规则统一在一个 helper：`digdig` 目录存在 → 用它；否则 `.sxng/` 存在 → 用它（并记一条弃用）；否则创建 `.digdig/`。三个写入点（`getDefaultSessionRoot`、`local-doc/indexer.ts`、`extractor.ts` 的限流槽）必须走同一个 helper，不得各写一份。**任何情况下不移动、不复制、不删除已有目录**：过渡期内新旧两个 bin 指向同一份代码，搬目录会让旧版二次安装的用户当场找不到会话。

**R4 配置文件改名为 `digdig.config.json` / `~/digdig/digdig.config.json`，同样就地认领。** 解析顺序：`./digdig.config.json` → `./sxng.config.json`（旧名，记弃用）→ `~/digdig/digdig.config.json` → `~/sxng-cli/sxng.config.json`（旧名，记弃用）→ 默认值。`init.ts` 只写新路径，不再写旧路径。

**R5 环境变量 `SEARXNG_*` → `DIGDIG_*`。** 10 个：`BASE_URL`、`DEFAULT_ENGINE`、`ALLOWED_ENGINES`、`DEFAULT_LIMIT`、`DEFAULT_FORMAT`、`USE_PROXY`、`PROXY_URL`、`TIMEOUT`、`REDUNDANCY_THRESHOLD`、`REDUNDANCY_BIGRAM_THRESHOLD`。每个都是"读 `DIGDIG_X`，未设则读 `SEARXNG_X` 并记弃用"。`SEARXNG_SETTINGS_PATH` **不是本项目的变量**（它是 SearXNG 服务器自己的），不得改名、不得加入回退。

**R6 `origins[].tool` 的新写入值为 `'digdig'`。** 旧数据里的 `'sxng'` 原样读取、原样回显，**不做一次性的批量重写**：没有任何分支依赖该值（见 Background），重写用户 session 文件是纯粹的破坏性动作。

**R7 文档与 skill 改名。** `README.md`、`README.zh-CN.md`、`cli/README.md`、`CLAUDE.md`、`skills/sxng/**` 里指代本项目的 `sxng` / `sxng-cli` 改为 `digdig`；`skills/sxng/` 目录改名为 `skills/digdig/`，`SKILL.md` 的 frontmatter `name:` 与 `description:` 同步改。上游 SearXNG 的表述、URL、`SEARXNG_SETTINGS_PATH` 一律不动。示例代码里的 `.sxng/` 路径改 `.digdig/`。

**R8 弃用告警：只写 stderr，一行一条，每类每进程最多一条。** 触发类别四种：`command`（经 `sxng.js` 入口调用）、`config`（命中旧配置文件名或旧全局目录）、`env`（读到任一旧变量）、`state`（命中旧状态目录）。文案固定前缀 `[deprecation]`，必须写明"将在 0.5.0 停止工作"与替代写法。不阻塞、不轮询、不 `process.exit`、**绝不写 stdout**（stdout 是给 Agent 解析的 JSON 信封）。

**R9 测试同步。** `cli/test/unit/cli.test.ts:28` 的 `program.name()` 断言、`provider-routing.test.ts:147` 的 `tools: ['deepseek','sxng']` 等**生产者侧**断言改为新值；测试里作为**输入数据**出现的 `origins: [{ tool: 'sxng' }]` 保持不变——它们现在正是"旧数据仍然可读"的回归覆盖。

**R10 迁移代码集中，可一键删除。** 所有回退逻辑放进一个模块（如 `cli/src/legacy.ts`），调用点只调它与记告警，不得把 `||` 回退表达式散进 `config.ts` 的 10 个变量读取里。`0.5.0` 的删除动作 = 删该模块 + 删 `sxng.ts` + 删 package.json 的 `sxng` bin 条目，三处。

## Acceptance Criteria

- **AC1** `npm run build` 后 `dist/index.js --help` 与 `dist/sxng.js --help` 都以 `digdig` 自称；`node dist/index.js --version` 输出 `0.0.2`。
- **AC2** 直接执行 `node dist/sxng.js "q"` 时 stderr 恰好含一条 `[deprecation]` 且提到 `0.5.0`；执行 `node dist/index.js "q"` 时 stderr **不含** `[deprecation]`。
- **AC3** 无 session 时运行搜索，创建的是 `.digdig/sessions/`；预置一个 `.sxng/sessions/x/` 后运行 `--session x`，仍能读到该会话，且 stdout 不变、stderr 多一条 state 类告警。
- **AC4** 同时存在 `./sxng.config.json` 与 `./digdig.config.json` 时，以 `digdig.config.json` 为准且**不**告警；只存在旧名时以旧名为准且告警一次。
- **AC5** `DIGDIG_DEFAULT_LIMIT=3` 与 `SEARXNG_DEFAULT_LIMIT=3` 分别生效；两者同时存在时 `DIGDIG_*` 优先、无告警；只有旧变量时告警一次。`SEARXNG_SETTINGS_PATH` 不产生任何告警（它不是本项目的变量）。
- **AC6** 新产生的 session 结果里 `origins[].tool === 'digdig'`；把旧的 `'sxng'` 值喂给同一路径后仍被正常读取与回显，且文件未被重写（可用 mtime 或内容字节比对证明）。
- **AC7** 任何路径下 `--format json` 的 stdout 仍是可解析的合法 JSON，`[deprecation]` 不出现在 stdout（管道与重定向两种情况都验）。
- **AC8** `git grep -w sxng` 的剩余命中**全部**属于上游 SearXNG 语义或旧名回退代码/测试；逐条可在 PR 描述中列出理由。`skills/` 下不再有 `sxng` 目录。
- **AC9** `cd cli && npm test` 通过（含新增的迁移用例：新名优先、旧名回退、告警只出现一次、旧值不被重写）。
- **AC10** README 的安装段、badge、配置段与 skill 命令示例全部为 `digdig`；`SEARXNG_SETTINGS_PATH` 等上游变量原样保留。

## In Scope

- `cli/package.json`（name/version/bin/files/description/keywords）、`cli/src/sxng.ts`、`cli/src/legacy.ts`、`runCli.ts` 的 `.name()` 与示例文案、`config.ts`、`init.ts`、`commands/session.ts`、`deep/local-doc/indexer.ts`、`deep/extractor.ts`。
- `cli/digdig.config.example.json`（由 `sxng.config.example.json` 改名）。
- `README.md`、`README.zh-CN.md`、`cli/README.md`、`CLAUDE.md`。
- `skills/sxng/` → `skills/digdig/`（目录改名 + 全部文案 + frontmatter）。
- 受影响的测试与新增的迁移测试。
- `npm-reserve-digdig/` 的移除（Q1 用户决定：删除，`cli/package.json` 为唯一真相源）。
- 本任务的三份核心文档。

## Out of Scope

- **发布**：不 `npm publish`、不在 registry 上 deprecate `sxng-cli`、不 bump 发布流程。
- **GitHub 仓库改名**，以及随之而来的 `repository`/`homepage`/`bugs` 三个 URL：见 Background 里的 404 理由，随仓库改名一起做。
- 用户机器上的 `~/.claude/skills/sxng` 符号链接：不在本仓库，按全局规则不碰。
- 上游 SearXNG 相关命名：`SearXNGService`、`SearXNGConfig`、`searxng.config.json`（`.gitignore` 里的历史名）、所有 `searxng/searxng` URL、`SEARXNG_SETTINGS_PATH`。
- `--format md` 输出长度与 `process.exit()` 截断：两项各自有独立任务（`TF-20261018-282836` 与待重设计项），本任务只保证改名不改变它们的现状。
- 任何消息格式、信封结构、错误码的变更。

## Risks / Deferred Items

- **R-1 版本号倒挂。** `digdig@0.0.2` 数字上小于 `sxng-cli@1.3.2`。README 必须显式说明"这是接替 1.3.2 的包，版本号重新起算"，否则用户会以为装错了。
- **R-2 新旧二进制并存时状态分裂。** 若用户同时装着旧的 `sxng-cli@1.3.2` 与新的 `digdig`，旧版写 `.sxng/`、新版首次运行会创建 `.digdig/`，两个会话池互不可见。这是"不搬数据"的固有代价，也是唯一不破坏旧数据的代价；README 的升级段要写明"先卸旧包"。旧版的存在无法从代码侧检测，故不做自动提示。
- **R-3 弃用告警污染 stderr 断言。** 有调用方会断言 stderr 为空（本项目自己的测量脚本就这么做过）。5 个版本的告警期足够长，Q2 讨论是否加一个 `DIGDIG_NO_DEPRECATION=1` 开关。
- **R-4 `origins[].tool` 的可观测变更。** Hyrum's Law：外部若有人按 `tool === 'sxng'` 过滤，新数据会漏。代码内无此依赖，文档内也无；仍应在 CHANGELOG/PR 描述中点明。
- **R-5 0.5.0 的切断是破坏性的。** 届时 `.sxng/` 不再被读，用户未迁移的会话将不可见。这是明确的用户决定（写迁移、5 版后切），不是遗漏；Follow-ups 里逐项列出切断时的删除清单，避免"忘了删"或"删不干净"。
- **R-6 文档改动量远大于代码。** 约 470 处文档、40 处代码。逐处手改不现实，但**不能**盲目全局替换——上游 SearXNG 的 181 处会被误伤。做法是分批带上下文替换并在 AC8 里逐类复核。

## Resolved Questions

- **Q1 `npm-reserve-digdig/` 删除。** 用户决定 2026-10-19。`cli/package.json` 成为唯一真相源；占位包目录一并从仓库移除（已发布到 npm 的 `digdig@0.0.1` 不受影响）。
- **Q2 加 `DIGDIG_NO_DEPRECATION=1` 开关。** 用户决定 2026-10-19。置为 `1` 时四类弃用告警全部静默，退出码与 stdout 不受影响。
- **Q3 `sxng` bin 指向独立的 `cli/src/sxng.ts`（编译为 `dist/sxng.js`）。** 用户决定 2026-10-19。`0.5.0` 与该 bin 条目一并删除。

（无阻塞性未决问题。）

## Version History

- v1 — 初始版本。2026-10-19 用户三项决定：边界=身份层+运行时产物且写迁移、5 版后切断；`sxng` 命令名保留 5 版；新包从 `0.0.2` 起、`0.5.0` 切；本次只改文件不发布。
