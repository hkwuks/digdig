# Spec — 改名的迁移边界与切断

> Task version: v1

## Objective and Success Criteria

把 `sxng-cli` 改名为 `digdig` 时，用户在旧版本下产生的**一切**都必须继续可用；新版本产生的一切都必须落在新名下；两者都不通过 "搬文件" 实现。

成功判据三条：

1. **无数据丢失**：升级后旧会话、旧配置、旧环境变量全部照常生效，且迁移过程**不修改任何用户文件的内容与位置**。
2. **无歧义**：新旧名同时存在时，新名胜出，且不告警（并存不是用户的错）。
3. **可切断**：`0.5.0` 删除迁移只需三处删除（`legacy.ts`、`sxng.ts`、`package.json` 的 `sxng` bin 条目），删完不留下任何死分支。

## Architecture Boundaries and Responsibilities

| 层 | 职责 | 不负责 |
| --- | --- | --- |
| `cli/src/legacy.ts` | 唯一的旧名解析 + 唯一的弃用告警出口 | 不搬文件、不重写用户数据、不创建旧目录 |
| `cli/src/sxng.ts` | 旧命令名入口，先记 `command` 类告警再委托 `main()` | 不复制 `main()` 逻辑 |
| `cli/src/index.ts` | 新命令名入口，仅调用 `main()` | 不记告警 |
| `cli/src/config.ts` | 决定**取值语义**（空串、非法值、优先级） | 不决定**从哪个变量名取** |
| `cli/src/init.ts` | 只写新路径 | 不再创建 `~/sxng-cli/` |
| 三个状态写入点 | 用 `resolveStateRoot()` 拼路径 | 不各自探测旧目录 |

分界线的一句话：**"名字从哪来"归 `legacy.ts`，"值怎么解"归原调用点。** 这条线是 `config.ts` 的 10 个变量不必各写一份 `||` 回退的原因。

## Project Structure / Affected Files

```
cli/package.json                    name/version/bin/files/description/keywords
cli/src/legacy.ts                   新增
cli/src/sxng.ts                     新增
cli/src/index.ts                    main() 抽成导出
cli/src/runCli.ts                   .name() / originTool / 三处 source 默认值 / 示例文案
cli/src/config.ts                   findConfigFile + 10 处 env 取值
cli/src/init.ts                     只写新路径
cli/src/commands/session.ts         getDefaultSessionRoot
cli/src/deep/local-doc/indexer.ts   状态根
cli/src/deep/extractor.ts           Jina 限流槽（必须与 session 同根）
cli/digdig.config.example.json      由 sxng.config.example.json 改名
cli/test/unit/legacy.test.ts        新增
cli/test/**                         生产者侧断言改新值；输入数据的旧值不动
README.md / README.zh-CN.md / cli/README.md / CLAUDE.md
skills/sxng/**  →  skills/digdig/**
.gitignore（根，当前 untracked）     追加 `.digdig/`
```

## Interfaces, Data Flow, and Contracts

`legacy.ts` 的全部导出，五个：

```ts
export type DeprecationKind = 'command' | 'state' | 'config' | 'env';

/** 每类每进程最多写一次 stderr。永不抛错、永不写 stdout、永不改变退出码。 */
export function deprecate(kind: DeprecationKind, message: string): void;

/** 当前生效的状态根目录（绝对路径）。可能指向已存在的旧目录；不创建任何目录。 */
export function resolveStateRoot(): string;

/** resolveStateRoot() 的便捷拼接。 */
export function resolveStatePath(...segments: string[]): string;

/** 当前生效的配置文件路径；都不存在时返回 null。 */
export function resolveConfigPath(): string | null;

/**
 * 取一个环境变量的原始字符串（未解析、未 trim）。
 * DIGDIG_<name> 已定义则用它（不告警）；否则 SEARXNG_<name>（告警一次）；否则 undefined。
 */
export function envRaw(name: string): string | undefined;
```

数据流（只读，不回写）：

```
argv ──> sxng.ts ─┐
                  ├─> main() ─> config ──> envRaw / resolveConfigPath
argv ──> index.ts ┘                │
                                   ├─> getDefaultSessionRoot ──> resolveStateRoot
                                   ├─> indexer 状态根 ─────────> resolveStateRoot
                                   └─> extractor 限流槽 ───────> resolveStateRoot
```

`main()` 的抽取是 R2 的硬前提：`sxng.ts` 与 `index.ts` 都必须调用同一份 `main()`，否则两个入口会漂移。

## Invariants and Compatibility

**I1 只读旧世界，从不写旧世界。** 迁移代码的任何路径都不得 `rename`/`copy`/`rm` 用户目录或配置文件，也不得批量重写 session 内的 `origins[].tool`。理由：过渡期内新旧两个 bin 指向同一份代码，搬目录会让"先装了旧版、再装新版"的用户在两次调用之间失去会话。这条同时给出**下坡路**：既然没有变换用户数据，把包版本回退到 `1.3.2` 永远安全。

**I2 新名优先，且优先时不告警。** 每个解析点统一为"新存在 → 用新；否则旧存在 → 用旧 + 告警；否则用新并让调用方创建"。并存**不是**冲突，是一段正常的过渡状态，不该被当成异常报告。

**I3 告警只走 stderr，一行一条，每类每进程一次。** stdout 是 Agent 解析的 JSON 信封，任何告警不得进入。`DIGDIG_NO_DEPRECATION=1` 时四类全部静默，但解析行为与退出码不变——开关只影响可观测性，不影响语义。

**I4 上游名不动。** `SearXNGService`、`SearXNGConfig`、`SEARXNG_SETTINGS_PATH`、`searxng/searxng` 的 URL、`cli/.gitignore` 里的 `searxng.config.json`（历史名）全部保持原样。`SEARXNG_SETTINGS_PATH` 尤其容易被误改：它是 **SearXNG 服务器进程**的变量，本项目只是文档里演示怎么启动服务器，把它纳入回退等于让 `digdig` 去读一个它从来不认识的变量。

**I5 `origins[].tool` 是新旧共存的数据，不是待迁移的数据。** 代码内没有任何分支判断该值（`isDirectOrigin` 只认 `'user'`/`'agent'`），它只被写入和回显。因此只改写入端，旧值原样读、原样显示。这是 Hyrum's Law 下最小的可观测变更：别人若按 `=== 'sxng'` 过滤会漏新数据，所以必须在 PR 描述里点名（PRD R-4）。

**I6 状态根只有一个。** session、本地文档索引、Jina 限流槽三处必须解析到同一个根。限流槽尤其不能分叉：新旧根各有一个限流器，就等于把 20 RPM 的预算放大成 40 RPM。

## Validation and Error Semantics

- `deprecate` 不接受空消息；消息非空是调用方的责任，模块内不做校验（内部调用点固定）。
- 告警写入失败（stderr 关闭等）**静默吞掉**：弃用提示不值得让一条搜索命令失败。
- `resolveConfigPath()` 返回 `null` 表示"都不存在"，由 `config.ts` 落到默认值——与今天 `findConfigFile` 返回 `null` 的语义一致。
- `envRaw` 保留**原始字符串**，不做 trim、不判空。空串语义由调用点决定（`readOptionalEnv` 视空为空缺，`!== undefined` 的调用点视空为已设置）；这一保持是刻意的，否则 `SEARXNG_ALLOWED_ENGINES=""` 这类边界会在改名时悄悄改变行为。
- 非法值（`DIGDIG_TIMEOUT=abc`）沿用现有解析器的回退默认值，不在 `legacy.ts` 里做二次校验。

## Code and Test Constraints

- 迁移代码只允许出现在 `legacy.ts`；`config.ts` 里不得出现任何字面量 `'SEARXNG_'` 回退表达式，只允许 `envRaw('TIMEOUT')` 这样的调用。
- `0.5.0` 的切断 = 删三个东西。因此任何新增的旧名逻辑都必须落在 `legacy.ts`、`sxng.ts` 或 package.json 的 bin 条目内，**不得**渗进其它文件。
- 测试分两类，不得混淆：
  - **生产者侧断言**（`program.name()`、`originTool` 的返回值、缺失时的默认值）断言新值。
  - **旧值作输入**（`origins: [{ tool: 'sxng' }]`、`process.env.SEARXNG_TIMEOUT = ...`）保持旧值，它们正是"旧数据仍可读"的回归覆盖。
- 告警测试同时断言 stdout 为空：`--format json` 在管道与重定向两种 stdout 下都必须是可解析 JSON（覆盖 PRD AC7）。
- 每个新解析点至少一个"新名存在时不告警"的用例——否则"新名优先"只有正向证明，没有负向证明。

## Design Decisions and Alternatives

**D1 采用 expand/contract，而不是原地改名。** 本任务就是"扩张"（新名可写、旧名可读），`0.5.0` 才是"收缩"（删回退）。这与数据库列改名的纪律一致：**绝不在同一个发布里既改写入端又删读取端**。若一次做完，回退包版本就会同时丢失数据可见性与配置，用户的会话在一夜之间消失且无法靠降级挽回。

**D2 状态目录"就地认领"，不搬。** 备选是首次运行时把 `.sxng/` → `.digdig/`。否决理由：搬动会破坏新旧包交替使用（旧包随后会在空目录里重建 `.sxng/`，形成两个会话池）；且搬动是单向破坏性动作，一旦中断就只剩半个目录树。就地认领的代价是 PRD R-2 记录的"两个会话池互不可见"，这个代价只在新旧包**同时**安装时出现，因而可以在 README 用"先卸旧包"消解。

**D3 配置文件用"探测链"，不用单点回退。** 五个位置按新→旧顺序探测，任一命中即停。备选是把旧文件读进来合并到新文件（迁移写盘），否决理由同上，且合并会制造第三份真相。

**D4 `origins[].tool` 不做一次性重写。** 备选是在加载 session 时把 `'sxng'` 改写成 `'digdig'` 再落盘。否决理由：这是对用户数据的不可逆改写，只为修一个没有任何读取方依赖的标签；而旧值本身无害。重写还把"读"变成"写"，违背 I1。

**D5 旧命令名用独立入口，不用 argv 嗅探。** npm 生成的垫片让 `process.argv[1]` 恒为 `dist/index.js` 的真实路径，嗅探不可靠。独立入口多一个 10 行文件，换来一个可靠的检测点，且切断时与 bin 条目一起消失。

**D6 版本号从 `0.0.2` 起算。** npm 上 `digdig@0.0.1` 是占位包；`0.0.2` 是第一个真包。代价是与 `sxng-cli@1.3.2` 数字倒挂，必须在 README 显式说明，否则用户会以为装到了更旧的版本（PRD R-1）。

## Open Questions

（无。Q1–Q3 已于 2026-10-19 由用户决定，见 `prd.md` 的 Resolved Questions。）
