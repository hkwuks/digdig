# Plan — 项目改名为 `digdig`

> Task version: v1
> Status: completed

## Spec Pointers

- 本任务无 `spec.md`：改动是机械替换 + 一个回退模块，没有新架构。设计约束写在 `prd.md` 的 R1–R10。

## Reference Pointers

- `prd.md` 的 Background：引用面实测表（181 上游 / 84 包名 / 797 自指）、用户产物写入点表、bin 别名无法从 argv 识别。
- `npm view digdig`（2026-10-19）：`0.0.1`、`author hkwuks`、`maintainers hkwuks <hkwuks@qq.com>` —— 占位包是自己的。

## Related Tasks

- 无。`TF-20261017-20f05a` 是同一诉求的旧 Todo 条目，本任务由它派生；该条目保留（Todo 不删），状态已指向本任务。

## Skills / Tools Used

- [PRD] `agent-skills:api-and-interface-design` — purpose: 划"必须迁移 / 可静默认领 / 必须不动"的边界，并判断哪些既有可观测行为已构成事实契约；outcome: succeeded；incorporated: `Prefer Addition Over Modification` 落实为 R1 的纯增量改名与 R3/R4/R5 的"新名先试、旧名兜底"探测链；Hyrum's Law 落实为 PRD R-4——把 `origins[].tool` 标为可观测但无读取方依赖的值，据此决定只改写入端、不重写旧数据；`validate at boundaries` 落实为 R5 中 `SEARXNG_*` 只在本项目 IO 边界（环境变量读取处）改名，上游服务器变量 `SEARXNG_SETTINGS_PATH` 明确排除在外。
- [Plan] `agent-skills:planning-and-task-breakdown` — purpose: 把 7 步排成"每步结束都能构建、且迁移代码可一键删除"的顺序；outcome: succeeded；incorporated: 把文档扫尾（约 470 处，且与 181 处上游引用纠缠）排到最后，因为替换规则依赖前面已确定的代码事实；识别出 `extractor.ts` 的 Jina 限流槽必须与 session 同根（否则新旧限流器把 20 RPM 放大成 40 RPM），因此把它并入 Step 3 而不是留在文档/收尾里；把 Step 5 的 `origins[].tool` 单列，因为它唯一的正确做法是"只改写入端、不写迁移重写"。
- [Spec] `agent-skills:deprecation-and-migration` — purpose: 为改名定出扩张/收缩节奏、下坡路与切断清单；outcome: succeeded；incorporated: 采用 `expand → contract`（本任务只做扩张，`0.5.0` 才收缩），据此拒绝"同一次发布里既改写入端又删读取端"；确立 I1「只读旧世界、从不写旧世界」作为无数据丢失的充分条件，同时它天然给出可回退性（把包退到 `1.3.2` 永远安全）；D2/D3/D4 三处否决"搬目录 / 合并配置 / 重写标签"都引用该纪律；`Compulsory`（有硬截止 `0.5.0`）要求配套迁移文档，落实为 README 的升级段。

## Preconditions

- [x] 用户批准本 Plan（v1）——**已批准 2026-10-19**。
- [x] 工作树 `.worktrees/2026-10-19-rename-digdig`，分支 `chore/2026-10-19-rename-digdig`。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-19 22:19 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 身份层改名，构建通过

- Goal: 包名、版本、bin、`program.name()` 全部变成 `digdig`，同时保留 `sxng` bin 指向新入口。
- Dependencies: 无
- Files: `cli/package.json`、`cli/src/index.ts`、`cli/src/sxng.ts`（新）、`cli/src/runCli.ts`、`cli/digdig.config.example.json`（改名）
- Implementation checklist:
  - [x] `cli/package.json`：`name` → `digdig`、`version` → `0.0.2`、`description` 去掉 "SearXNG CLI" 前缀、`bin` → `{ "digdig": "dist/index.js", "sxng": "dist/sxng.js" }`、`files` 指向 `digdig.config.example.json`。
  - [x] 把 `index.ts` 的 `main()` 抽成可导出函数，`index.ts` 与新的 `sxng.ts` 都只调用它（`sxng.ts` 额外先记一条 `command` 类弃用）。
  - [x] `runCli.ts:912` `.name('sxng')` → `'digdig'`。
  - [x] `git mv cli/sxng.config.example.json cli/digdig.config.example.json`。
- Acceptance: AC1
- Verification: `npm run build`；`node dist/index.js --version` = `0.0.2`；`node dist/sxng.js --help` 自称 `digdig`。
- Rollback: `git checkout -- cli/package.json cli/src/index.ts cli/src/runCli.ts && rm cli/src/sxng.ts`，`git mv` 反向。
- Status: done

### Step 2 — `legacy.ts`：一处回退 + 一处告警

- Goal: 把全部"旧名回退"与"弃用告警"收进一个模块，使 0.5.0 的删除是一次三处删除。
- Dependencies: Step 1（`sxng.ts` 要调它）
- Files: `cli/src/legacy.ts`（新）、`cli/test/unit/legacy.test.ts`（新）
- Implementation checklist:
  - [x] `deprecate(kind, message)`：按 `kind` 去重，每进程每类只写一次 stderr；前缀固定 `[deprecation]`；**不写 stdout**；受 `DIGDIG_NO_DEPRECATION=1` 抑制（Q2 建议采纳）。
  - [x] `resolveStateRoot()`：`$PWD/.digdig` 存在 → 用它；否则 `.sxng` 存在 → 用它 + `deprecate('state', …)`；否则返回 `.digdig`（不 mkdir，由调用方建）。
  - [x] `resolveConfigPath()`：按 R4 的五个位置依次探测，命中旧名时记 `config` 类。
  - [x] `resolveEnv(name)`：`DIGDIG_<name>` 优先，为空则取 `SEARXNG_<name>` 并记 `env` 类；**不含 `SETTINGS_PATH`**。
  - [x] 单元测试：优先级、告警只出现一次、`DIGDIG_NO_DEPRECATION` 抑制、stdout 恒为空。
- Acceptance: AC2、AC5（前三项）、AC7
- Verification: `npx vitest run test/unit/legacy.test.ts`
- Rollback: 删除两个新文件；调用点未接之前无影响。
- Status: done

### Step 3 — 三个状态目录写入点改走 `resolveStateRoot`

- Goal: session、本地文档索引、Jina 限流槽三处读到同一个根目录。
- Dependencies: Step 2
- Files: `cli/src/commands/session.ts`、`cli/src/deep/local-doc/indexer.ts`、`cli/src/deep/extractor.ts`
- Implementation checklist:
  - [x] `session.ts:18-20` `getDefaultSessionRoot` 改调 `resolveStateRoot()` + `sessions`。
  - [x] `indexer.ts:52-54` 同改。
  - [x] `extractor.ts:243` 同改（限流槽必须与 session 同根，否则新旧并存时会出现两个限流器）。
  - [x] 三处都不得自行 mkdir 旧目录：`resolveStateRoot` 返回旧路径时原样返回。
- Acceptance: AC3
- Verification: 无 session 首次运行 → 出现 `.digdig/sessions/`；预置 `.sxng/sessions/x` 后 `--session x` 可读且 stderr 有 state 告警。
- Rollback: 三处各自恢复 `resolve('.sxng', …)` / `join(cwd, '.sxng')`。
- Status: done

### Step 4 — 配置与环境变量接上回退

- Goal: 新名优先、旧名可用、旧名告警，且回退逻辑不出现在 `mergeConfig` 的 10 个分支里。
- Dependencies: Step 2
- Files: `cli/src/config.ts`、`cli/src/init.ts`
- Implementation checklist:
  - [x] `findConfigFile`（`config.ts:71-83`）改调 `resolveConfigPath()`。
  - [x] `mergeConfig` 里 10 处 `readOptionalEnv('SEARXNG_X')` / `process.env.SEARXNG_X` 改为 `resolveEnv('X')`；`SEARXNG_SETTINGS_PATH` 不在其中，保持不动。
  - [x] `init.ts:75-76` 写 `~/digdig/digdig.config.json`；不再创建 `~/sxng-cli/`。
  - [x] 保持 `config.ts` 头注释的优先级说明与新行为一致。
- Acceptance: AC4、AC5
- Verification: 四项组合（新名/旧名/并存/都缺）逐一跑；`SEARXNG_SETTINGS_PATH` 只设它时不产生告警。
- Rollback: `git checkout -- cli/src/config.ts cli/src/init.ts`。
- Status: done

### Step 5 — `origins[].tool` 写入端改为 `digdig`

- Goal: 新数据的归因标签是新名；旧值不重写。
- Dependencies: Step 1
- Files: `cli/src/runCli.ts`（`originTool`，`runCli.ts:479-482`）；`cli/src/runCli.ts:1579`、`1656`、`1675` 的 `result.source || 'sxng'` 默认值
- Implementation checklist:
  - [x] `originTool` 的兜底值改 `'digdig'`。
  - [x] 三处 `|| 'sxng'` 的显示默认值改 `'digdig'`（`source` 由 `doc-search` 写成 `'local'`，其余靠这个兜底）。
  - [x] **不写任何迁移/重写旧 `origins` 的代码**；不碰 `session.ts`。
- Acceptance: AC6
- Verification: 新搜索产出的 session 里 `origins[0].tool === 'digdig'`；用现有测试里 `tool: 'sxng'` 的输入数据跑一遍，文件字节不变（内容比对）。
- Rollback: `git checkout -- cli/src/runCli.ts`（注意 Step 1 也改过该文件，回滚只回滚这两个位置）。
- Status: done

### Step 6 — 测试同步

- Goal: 生产者侧断言用新值；作为输入数据出现的旧值保留，充当"旧数据仍可读"的回归覆盖。
- Dependencies: Step 1、Step 5
- Files: `cli/test/unit/cli.test.ts`、`cli/test/unit/provider-routing.test.ts`、`cli/test/integration/session.test.ts` 等
- Implementation checklist:
  - [x] `cli.test.ts:28` `toBe('sxng')` → `'digdig'`。
  - [x] `provider-routing.test.ts:147` 的期望数组改新值。
  - [x] 其余 `origins: [{ tool: 'sxng' }]` 作为**输入**的一律不动；逐处确认它是输入而非断言。
  - [x] 新增迁移用例（Step 2 的测试之外）：旧状态目录可读、旧配置可读、旧变量可读。
- Acceptance: AC9
- Verification: `cd cli && npm test`
- Rollback: `git checkout -- cli/test/`
- Status: done

### Step 7 — 文档与 skill 扫尾（分批，可复核）

- Goal: 约 470 处文档引用改完，且 181 处上游 SearXNG 引用一处不伤。
- Dependencies: Step 1–6 完成（先让代码事实确定，再写文档）
- Files: `README.md`、`README.zh-CN.md`、`cli/README.md`、`CLAUDE.md`、`skills/sxng/**` → `skills/digdig/**`
- Implementation checklist:
  - [x] `git mv skills/sxng skills/digdig`；改 `SKILL.md` 的 `name:`/`description:` 与正文。
  - [x] 按文件分批：每批替换后 `git diff` 逐条看，**不跑全局 sed**。
  - [x] 替换规则三条：`sxng-cli` → `digdig`；指代本项目的 `sxng` → `digdig`；`.sxng/` → `.digdig/`。`SearXNG`/`searxng` 的 181+ 处一律不动，除非它指的是包名。
  - [x] 保留 `SEARXNG_SETTINGS_PATH`、`searxng/searxng` URL、`SearXNGService`、`SearXNGConfig`。
  - [x] README 的安装段与 badge 改新包名，并写清"版本号重新起算、`digdig@0.0.2` 接替 `sxng-cli@1.3.2`"（R-1）。
  - [x] 升级段写明"先卸旧包"（R-2）。
- Acceptance: AC8、AC10
- Verification: `git grep -w sxng` 剩余命中逐条分类；`git grep -c SearXNG` 的计数不低于改前的 181（证明没被误伤）。
- Rollback: `git checkout -- '*.md'` + `git mv` 反向。
- Status: done

## Checkpoints

- **After Step 1**: 构建通过、两个 bin 都能启动、版本号正确。此时改名对用户唯一的可见变化是 `--version` 与 `--help` 的自称。
- **After Step 5**: 迁移行为全部到位（状态目录、配置、环境变量、归因标签），且旧数据一条没动。这是最高风险区，先跑通再加文档。
- **After Step 7**: 文档一致性复核。AC8/AC10 是这一步的唯一把关。

## Verification / Review

| AC | 验证方式 | 结果 |
| --- | --- | --- |
| AC1 | `--version` / `--help` 对两个入口 | 通过。`node dist/index.js --version` → `0.0.2`；两个入口的 `--help` 都以 `Usage: digdig` 开头。 |
| AC2 | 两入口的 stderr 差分 | 通过。`dist/sxng.js` stderr 恰一行 `[deprecation] …0.5.0`；`dist/index.js` stderr 0 字节；`DIGDIG_NO_DEPRECATION=1` 时 stderr 0 字节。 |
| AC3 | 空目录首次运行 vs 预置 `.sxng/` | 通过。空目录建出 `.digdig/sessions/`；预置 `.sxng/sessions/legacy-sess` 后 `--session legacy-sess` 读到该会话，只建 `.sxng`、不建 `.digdig`，stderr 有 state 告警。 |
| AC4 | 四种配置组合 | 通过。只有 `digdig.config.json`(limit 2) 时取 2、无告警；只有 `sxng.config.json`(limit 7) 时取 7、告警一次。 |
| AC5 | 两套 env 变量，含并存与 `SETTINGS_PATH` | 通过。`DIGDIG_DEFAULT_LIMIT=3`+`SEARXNG_DEFAULT_LIMIT=9` → 取 3、无告警；仅旧变量 → 取 3、env 告警恰一行（两类不同变量共用一次额度，见下"实施偏差"）；`SEARXNG_SETTINGS_PATH` 产生 0 条告警。 |
| AC6 | 新产出断言 + 旧输入字节比对 | 通过。新 session `origins[].tool` 全为 `digdig`；手工把某条改成 `sxng` 后 `session-report` 正常返回 `status: ok`，读后该值仍为 `sxng`（未被重写）。 |
| AC7 | 管道与重定向两种 stdout | 通过。重定向到文件的 stdout 可 `JSON.parse`，且 `grep -c deprecation` = 0；管道场景由 `cli/test/unit/legacy.test.ts` 的 stdout 断言覆盖。 |
| AC8 | `git grep -w sxng` 逐类复核 | 通过，剩余命中分四类：① GitHub 仓库 URL（24 处，见 Out of Scope）；② `sxng-cli` 包的升级说明（README 迁移段，属刻意的历史事实）；③ 迁移代码本身（`legacy.ts`/`sxng.ts`/`package.json` bin/`config.ts` 注释）；④ 测试里作为**输入数据**的 `tool: 'sxng'` 与临时目录前缀。`skills/` 下已无 `sxng` 目录。 |
| AC9 | `npm test` | 通过。36 文件 / 506 测试全绿（新增 `test/unit/legacy.test.ts` 11 例）。 |
| AC10 | README 段落抽查 + 上游计数对比 | 通过。三份 README 的 `SearXNG` 计数与改前逐一相等（15/15、16/16、7/7），证明上游引用未被误伤。 |

### 实施偏差

- **AC5 的"每类每进程一次"在 env 上比预期粗。** `deprecate` 按 `kind` 去重，而十个变量共用一个 `env` 类，所以同时设置 `SEARXNG_TIMEOUT` 与 `SEARXNG_DEFAULT_LIMIT` 只会看到一条告警。这是刻意的：五版过渡期里十行告警会淹没输出。测试与 AC5 按"恰一行"记录。
- **`npm-reserve-digdig/` 未在本工作树内。** 它是 base checkout 的**未跟踪**目录，`git worktree add` 不会带过来。Q1 的删除动作需在 base checkout 执行，已记入 Follow-ups。
- **CLAUDE.md 未被 Git 跟踪。** 计划里列了它，但 `git ls-files` 无此文件（它只在 base checkout 里作为未跟踪文件存在），因此本工作树没有可改的副本；其内容随 Q1 之后的收尾一起在 base checkout 处理，已记入 Follow-ups。
- **`skills/sxng` → `skills/digdig` 用 `git mv`，历史可追。** 五个文件全部保留在 diff 中（4 个 rename+modify，1 个纯 rename）。

## Change Log

- 2026-10-19：Step 1–7 全部实施并验收。代码侧改动：`package.json`（name/version/bin/files/description/构建脚本）、`entry.ts`/`sxng.ts`/`legacy.ts` 三个新模块、`runCli.ts`（`.name()`、`originTool`、三处 `source` 默认值、32 处命令示例、3 处 `.digdig/` 路径、hint 文案）、`config.ts`（`findConfigFile` 改调 `resolveConfigPath`，十个变量改走 `envRaw`/`read*Env`）、`init.ts`（只写 `~/digdig/digdig.config.json`）、三个状态根、`doc-index.ts`/`graph.ts` 注释。文档侧：三份 README + 五份 skill 文档，含新增的升级/迁移段落。
- 2026-10-19：未预期的额外改动 — `graph-traverse.ts`/`query-graph.ts` 的 hint 文案、`deep/graph.ts` 的 `source` 注释也含旧命令名，一并改掉（属 R7 的"指代本项目的 `sxng`"）。

## Follow-ups

- **0.5.0 切断清单**（届时删这三处，别多删）：`cli/src/legacy.ts`、`cli/src/sxng.ts`、`cli/package.json` 的 `"sxng"` bin 条目。同时删掉三份 README 的升级/迁移段落与 `config.ts` 头注释里的"falling back to"句子。
- **发布动作**（不在本任务）：`npm publish` `digdig@0.0.2`；`npm deprecate sxng-cli "Renamed to digdig. Install with: npm i -g digdig"`。
- **GitHub 仓库改名**：仓库改名后一次性更新 `repository`/`homepage`/`bugs` 三个 URL 以及三份 README 里 24 处仓库链接（`hkwuks/sxng-cli`、`hkwuks%2Fsxng-cli`、`npx skills add hkwuks/sxng-cli`、`git clone`、`cd sxng-cli/cli`、star-history badge、LICENSE 链接）。
- **`npm-reserve-digdig/` 删除**（Q1 已批准）：需在 **base checkout** 执行，`rm -rf npm-reserve-digdig`；它是未跟踪目录，不在本工作树内。
- **`CLAUDE.md` 同步**（base checkout 的未跟踪文件）：其中的 `sxng`/`sxng-cli`/`.sxng/`/`SEARXNG_*` 表述需同样更新；本工作树没有该文件。
- **`skills/sxng` 在配置目录的符号链接**：由你自行重指到 `skills/digdig`。

## Version History

- v1 — planning。步骤按"先让身份层能构建 → 再让迁移可删 → 再动文档"排序；文档放最后，因为替换规则依赖前面已确定的代码事实。
