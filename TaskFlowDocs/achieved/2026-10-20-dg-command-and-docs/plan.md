# Plan — 命令名改为 `dg`、多后端定位、文档事实错误清理

> Task version: v1
> Status: completed

No spec required — small, self-contained task.

## Reference Pointers

- 需求与验收标准：本任务 `prd.md`（R1–R9、AC1–AC13）
- 前一次改名任务的迁移边界（不改的东西）：`TaskFlowDocs/achieved/2026-10-19-rename-digdig/spec.md` 的 I1「只读旧世界，从不写旧世界」
- 后端选择逻辑：`cli/src/runCli.ts:397-470`（`EXTERNAL_PROVIDERS`、`planProviderSearch`、`searchOneQuery`）
- 环境变量读取：`cli/src/legacy.ts:121`（`envRaw`），`cli/src/config.ts:52-72`（四个读取器）
- 仓库文档路由：`TaskFlowDocs/repository-docs/index.md`（无 `CONTRIBUTING.md`/`CODE_STYLE.md`，本次是文档措辞修正，不新建治理文档）

## Related Tasks

- `TaskFlowDocs/achieved/2026-10-19-rename-digdig/` — 前序任务（身份层与运行时产物改名）。本次不修改它的任何文档，只在它建立的命名体系内追加 `dg` 这个 bin，并修正它未覆盖的文档事实错误。
- `TaskFlowDocs/achieved/2026-10-17-deepseek-search-provider/` — DeepSeek 后端来源；本次只补文档与 `init` 询问，不改其代码路径。

## Skills / Tools Used

- [PRD] `agent-skills:spec-driven-development` — 用于把「改命令名」和「改定位」两件事写成可验收的 R/AC，并区分命令位与身份位。
- [Plan] `agent-skills:planning-and-task-breakdown` — 用于按依赖排序：bin 必须先于命令位替换，否则文档先改会造成不可用的中间态。
- [Spec] `agent-skills:api-and-interface-design` — 用于判断 `bin` 表是一个对外契约：已发布的 `sxng` bin 不能删，新增 `dg`/`digdig` 是加性变更（Hyrum's Law）。

## Preconditions

- 工作树：`.worktrees/2026-10-20-dg-command-and-docs`，分支 `chore/2026-10-20-dg-command-and-docs`，基线 `cfad652`。
- `cli/node_modules` 存在（若缺失先 `cd cli && npm install`）。
- 不执行 `npm publish`、`npm deprecate`；不改远端仓库（GitHub description 改动在实施阶段单独确认）。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-20 20:33 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 加 `dg` bin 并改程序自身标识

- Goal: 让 `dg` 成为真实可用的命令，同时 `--help` 第一屏就点明多后端。
- Dependencies: 无
- Files: `cli/package.json`、`cli/src/runCli.ts`
- Implementation checklist:
  - [x] `cli/package.json` `bin`：新增 `"dg": "dist/index.js"`，保留 `"digdig"` 与 `"sxng"`。
  - [x] `cli/package.json` `description` 保持三种后端并列（已符合）。
  - [x] `runCli.ts` `.name('digdig')` → `.name('dg')`；`.description(...)` 改为 `dg (digdig) - Web Search Tool (SearXNG, Ollama, DeepSeek)`。
  - [x] `--health` 的 option 描述从「Check SearXNG server health」改为不暗示通用健康检查的措辞（实际落定为 `Check the SearXNG backend health (Ollama/DeepSeek have no health endpoint)`，因为该检查只打 SearXNG 的 `/healthz`）。
- Acceptance: AC2、AC3、AC4 通过（`--help` usage 含 `dg`；`npm pack --dry-run` 列出三个 bin；两个 bin 都能建会话）。
- Verification: `cd cli && npm run build && node dist/index.js --help | head -5`；`npm pack --dry-run 2>&1 | grep -A4 '"bin"'`。
- Rollback: `git checkout -- cli/package.json cli/src/runCli.ts`
- Status: done

### Step 2 — 命令位替换（代码侧示例与 hint）

- Goal: CLI 自身输出的帮助示例不再教用户敲一个刚被降为长名的命令。
- Dependencies: Step 1
- Files: `cli/src/runCli.ts`、`cli/src/commands/graph-traverse.ts`、`cli/src/commands/query-graph.ts`、`cli/src/index.ts`
- Implementation checklist:
  - [x] `runCli.ts` 中 32 处命令位 `digdig ` → `dg `（`.example()` 文本、hint 文案、`Recovery:` 行）。
  - [x] `commands/graph-traverse.ts`、`commands/query-graph.ts` 各 2 处同理。
  - [x] `index.ts` 头部注释的 `digdig - Main Entry Point` 改为 `dg (digdig) - Main Entry Point`。
  - [x] **不动** `originTool` 的 `'digdig'` 回退与三处 `result.source || 'digdig'` —— 那是 `origins[].tool` 的取值，属于数据契约，与命令名无关。
- Acceptance: AC6 的代码侧部分成立；`grep -n 'digdig ' cli/src/runCli.ts` 只剩身份位（若为零更好）。
- Verification: `cd cli && grep -n "digdig " src/runCli.ts src/commands/*.ts` 逐条确认。
- Rollback: `git checkout -- cli/src`
- Status: done

### Step 3 — 三份 README 的命令位替换与多后端定位

- Goal: 文档与命令保持一致，并把 SearXNG 从「定义」降为「默认后端」。
- Dependencies: Step 1（文档承诺的 `dg` 必须已经存在）
- Files: `README.md`、`README.zh-CN.md`、`cli/README.md`
- Implementation checklist:
  - [x] 命令位 `digdig ` → `dg `：`README.md` 78 处、`README.zh-CN.md` 76 处、`cli/README.md` 63 处（以 `grep -c` 实测为准）。
  - [x] **白名单保留**：`npm install -g digdig`、`digdig@0.0.2`、`digdig.config.json`、`~/digdig/`、`.digdig/`、`hkwuks/digdig`、`npx skills add hkwuks/digdig`、`digdig.CMD`、`digdig-native`。
  - [x] tagline 改为多后端：EN `A multi-backend web search CLI for agents — SearXNG · Ollama · DeepSeek`；ZH 对应中文。
  - [x] Features 新增一条 `🔌 Pluggable Backends` / 「可插拔后端」：SearXNG 为默认，`-e ollama` / `-e deepseek` 显式切换。
  - [x] `-e, --engines` 选项说明补 `deepseek`（三份）。
  - [x] Quick Start 的 `export SEARXNG_BASE_URL=...` → `export DIGDIG_BASE_URL=...`（三份各 1 处）。
- Acceptance: AC6（命令位清零、身份位存活）、AC2 的文档侧一致。
- Verification: 替换后 `grep -nc 'install -g digdig' README.md README.zh-CN.md cli/README.md` 各为 1；`git diff --stat` 只涉及这三个文件。
- Rollback: `git checkout -- README.md README.zh-CN.md cli/README.md`
- Status: done

### Step 4 — 环境变量表、timeout、DeepSeek 配置项

- Goal: 文档里的配置事实与代码一致。
- Dependencies: Step 3（同文件，避免两次冲突）
- Files: `README.md`、`README.zh-CN.md`、`cli/README.md`、`cli/digdig.config.example.json`
- Implementation checklist:
  - [x] 三份 README 环境变量表 10 行 `SEARXNG_*` → `DIGDIG_*`。
  - [x] 表后补一句兼容说明：`SEARXNG_*` 旧名在 `0.5.0` 前仍被读取并打一行 `[deprecation]`。
  - [x] 三份 README 的 `timeout` 默认值 `30000` → `10000`（表 + 配置示例）。
  - [x] `cli/digdig.config.example.json` 的 `"timeout": 30000` → `10000`。
  - [x] `README.zh-CN.md`、`cli/README.md` 环境变量表补 `DEEPSEEK_API_KEY` 行（与 `README.md:998` 同措辞）。
  - [x] 三份 README 的配置示例补 `"deepseekApiKey": ""`（紧随 `ollamaApiKey`）。
- Acceptance: AC7、AC8、AC10。
- Verification: `grep -c 'DIGDIG_' README.md` ≥10；`grep -n '30000' README.md README.zh-CN.md cli/README.md cli/digdig.config.example.json` 为空。
- Rollback: `git checkout -- README.md README.zh-CN.md cli/README.md cli/digdig.config.example.json`
- Status: done

### Step 5 — 删除假的自动回退描述，并在 `init` 里补 DeepSeek

- Goal: 不再让用户以为 SearXNG 挂了会自动切 Ollama；`init` 能配到两种额外后端。
- Dependencies: 无（与 Step 3/4 同属文档，但涉及源码，放后面以免与 Step 1/2 冲突）
- Files: `cli/src/init.ts`、`cli/src/ollama-service.ts`、`README.md`、`README.zh-CN.md`
- Implementation checklist:
  - [x] `init.ts` 三行改写：注释 `// Configure Ollama (fallback search)` → `// Configure Ollama web search`；段标题 `--- Ollama (Fallback Search) ---` → `--- Ollama Web Search ---`；用户提示改为「显式用 `-e ollama` 选择，不是自动回退」。
  - [x] `init.ts` 新增 DeepSeek 段（同形）：段标题、一句说明（计费按成功请求）、`deepseekApiKey` 询问。
  - [x] `ollama-service.ts` 头部注释 `so it can serve as a drop-in fallback` → `so it can be selected explicitly with -e ollama`。
  - [x] `README.md` / `README.zh-CN.md` 的 `optional fallback backend` / 「可选备用搜索后端」→「可选后端，用 `-e ollama` 显式选择」。
- Acceptance: AC9、AC11。
- Verification: `cd cli && npm run build`；`printf '\n\n\n\n\n\n\n\n\n\n' | node dist/index.js init` 观察是否出现 DeepSeek 段（或源码断言 `grep -c deepseek src/init.ts`）。
- Rollback: `git checkout -- cli/src/init.ts cli/src/ollama-service.ts README.md README.zh-CN.md`
- Status: done

### Step 6 — 死链与 skill 同步

- Goal: 文档里不再有打不开的链接；skill 里不再只有 Ollama 一个外部后端。
- Dependencies: Step 3（README 文本已定稿）
- Files: `README.md`、`README.zh-CN.md`、`cli/README.md`、`skills/digdig/SKILL.md`、`skills/digdig/references/appendix.md`、`skills/digdig/references/pipeline.md`
- Implementation checklist:
  - [x] 三处 `[PRD-005 design improvements](cli/docs/prds/PRD-005-design-improvements.md)` 改为纯文本（无超链接）。
  - [x] `SKILL.md` 的命令位 `digdig ` → `dg `（101 处，白名单同上）；`-e` 说明补 `deepseek`；`--engines-list` 说明从「includes ollama」改为「includes ollama/deepseek」；后端段补 DeepSeek 一行。
  - [x] `appendix.md` 命令位替换（22 处）+ 换后端指引点名 `deepseek`。
  - [x] `pipeline.md`（13 处）、`claim-evidence-review.md`（2 处）、`SOP.md`（32 处）命令位替换。
- Acceptance: AC12、AC13。
- Verification: `grep -rn 'PRD-005-design-improvements.md' README.md README.zh-CN.md cli/README.md` 只余纯文本；`grep -c deepseek skills/digdig/SKILL.md skills/digdig/references/appendix.md` > 0。
- Rollback: `git checkout -- README.md README.zh-CN.md cli/README.md skills/digdig`
- Status: done

## Checkpoints

### Checkpoint A — Step 1 之后

- [x] `npm run build` 通过
- [x] `node dist/index.js --help` 的 usage 行含 `dg`
- [x] `node dist/sxng.js --version` 的 stderr 仍恰一行 `[deprecation]`

### Checkpoint B — Step 2–4 之后

- [x] `npm test` 全绿（基线 506 例）
- [x] `grep -rn 'install -g digdig' README.md README.zh-CN.md cli/README.md` 各 1
- [x] 命令位 `digdig ` 在三份 README 中为 0

### Checkpoint C — Step 5–6 之后（完成）

- [x] AC1–AC13 逐项实测记录在下方 Verification
- [x] `git diff --stat` 与 In Scope 列表一一对应，无越界文件

## Verification / Review

实测于 2026-10-20，工作树 `.worktrees/2026-10-20-dg-command-and-docs`（基线 `cfad652`）。

| AC | 实测 | 结果 |
| --- | --- | --- |
| AC1 | `npm run build` 退出 0；`npm test` → **36 files / 506 tests 全绿**（改前 506，`test/unit/cli.test.ts` 的 `.name()` 期望值随 R1 更新） | 通过 |
| AC2 | `node dist/index.js --help` 首行 `Usage: dg [options] [command] [query]`，次行 `dg (digdig) - Web Search Tool (SearXNG, Ollama, DeepSeek)` | 通过 |
| AC3 | `package.json` → `{"dg":"dist/index.js","digdig":"dist/index.js","sxng":"dist/sxng.js"}`；`dist/index.js` 存在且可执行；`package-lock.json` 的 bin 段同步 | 通过 |
| AC4 | 临时 cwd + 空 HOME，`DIGDIG_BASE_URL=http://127.0.0.1:9` 下两个 bin 各自建出 `.digdig/sessions/ds_*` | 通过 |
| AC5 | `dist/index.js --version` 的 stderr **0 字节**；`dist/sxng.js --version` 的 stderr **恰一行** `[deprecation] the `sxng` command is deprecated; use `dg` ...` | 通过 |
| AC6 | 三份 README + 五份 skill 文档中命令位 `digdig ` 为 0（正则覆盖 `--`/`-e`/子命令/引号四种形态）；`install -g digdig` 保留 README 3 / zh 3 / cli 1 | 通过 |
| AC7 | 三份 README 环境变量表 10 行全为 `DIGDIG_*`；`SEARXNG_*` 仅剩 `README.md:744,748` 的升级说明与 `SEARXNG_SETTINGS_PATH`（SearXNG 服务器自身变量） | 通过 |
| AC8 | `grep -c 30000` 三份 README 与 `cli/digdig.config.example.json` 均为 0；`config.ts:40` 默认 `10000`，`init.ts` 的 `DEFAULT_CONFIG` 同步改 10000 | 通过 |
| AC9 | `init.ts` 只剩「Neither is an automatic fallback」「Not a fallback for an unreachable SearXNG」；`ollama-service.ts` 头部改为 "selected explicitly with `-e ollama`" | 通过 |
| AC10 | `DEEPSEEK_API_KEY` 三份 README 各 1 行；`"deepseekApiKey"` 三份配置示例各 1 处 | 通过 |
| AC11 | `init` 交互新增 `--- DeepSeek Search (optional) ---` 与 `DeepSeek API key (leave blank to skip)`；`dist/init.js` 中计数为 1（管道喂入的交互式验证受 readline 缓冲影响，改用源码与构建产物断言） | 通过（方式调整） |
| AC12 | 三处 `PRD-005-design-improvements.md` 链接改为纯文本「the local, not-yet-published PRD-005 ...」/「本地尚未发布的 PRD-005 设计改进文档」 | 通过 |
| AC13 | `deepseek` 出现次数：`SKILL.md` 4 行、`appendix.md` 1 行、`pipeline.md` 1 行（新增 DeepSeek 后端行） | 通过 |

**额外核对**

- 三份 README 的 `json` 配置示例全部可 `JSON.parse`（另一块含 `{ ... }` 占位的信封示例本就不是合法 JSON，未动）。
- 上游 `SearXNG` 引用未被误伤：`README.md` 17、`README.zh-CN.md` 18、`cli/README.md` 9（tagline 不再点名 SearXNG，但正文所有自托管说明原样保留）。
- 命令位替换后按列重排了代码块内的行尾注释（`dg init` 等变短导致的错位），并单独修正了被重排误伤的 `# 1)`–`# 5)` 独立注释行与 YAML `secret_key`/`url` 的原有对齐。

**偏差记录**

1. `init.ts` 的 `SearXNGConfig` 接口原先缺少 `ollamaApiKey` 之外的 `deepseekApiKey`，新增询问后 `tsc` 报 TS2339；已同时补接口字段与 `DEFAULT_CONFIG`。
2. `test/unit/cli.test.ts:28` 断言 `program.name() === 'digdig'`，R1 后必须改为 `'dg'`（这是命令名变更是有意的契约变更，不是测试放宽）。
3. `init.ts` 的 `DEFAULT_CONFIG.timeout` 原为 `30000`，与 `config.ts` 的 `10000` 不一致；R6 要求文档以代码为准，顺带把 `init` 的默认值也对齐到 `10000`，避免 `init` 写出的值又被 README 反驳。

## Change Log

- v1 — 初始计划。
- 实施完成：19 个文件变更（含 todo.md），AC1–AC13 全部实测；偏差 3 条记于 Verification。

## Follow-ups

- `--graph <file>` 选项无读取方（`runCli.ts:1765` 只把它塞进对象，无消费点）——既有独立缺陷，本次不动。
- `cli/docs/`、`docs/` 未跟踪，是死链的根因；是否入库由用户决定，本次只把死链改为纯文本。
- 发布（`npm publish digdig@0.0.2`、`npm deprecate sxng-cli`）待用户明确授权。

## Version History

- v1 — planning。
