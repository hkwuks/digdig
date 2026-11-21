# 清理四项遗留欠账：local-doc 标题重复、suggest-queries 命令、config 数值校验、信封码类型
> Task version: v1
> Status: completed

## Goal

清理四处已确认但仍未关闭的欠账，并修正因此产生的过期记录。四项彼此独立，每项都有实测复现，不引入新的设计方向。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

### R1 — local-doc 的 frontmatter 标题被拼接两次

`2026-11-18-small-bug-fixes` 的 PRD 第 2 条写「frontmatter 标题不重复」并已勾选完成，但它只改了一侧。

- `cli/src/deep/local-doc/scanner.ts:146` 在文件有 frontmatter `title` 时，把该标题**前插**进每个 chunk 的 `headings`：`headings: frontmatterTitle ? [title, ...rawChunk.headings] : rawChunk.headings`。而 `title` 本身就是 `frontmatterTitle`（`:118-119`）。
- 该提交（`19f4fbf`）改的是另一侧 `cli/src/deep/local-doc/searcher.ts:179`：`doc.headings[0] === doc.title ? doc.headings.slice(1) : doc.headings`。

复现（`scan()` 的真实输出，frontmatter 标题与 H1 同名——Obsidian / 常见 Markdown 里的主流形态）：

```
headings: ["My Title","My Title"]  =>  title: "My Title — My Title"
```

`slice(1)` 只削掉第一个重复项，第二个仍然进了 section 拼接。根因在 `scanner.ts`：`headings` 同时承载「文档标题」与「章节标题」两种东西。

### R2 — `suggest-queries` 的删除条件早已满足

`achieved/2026-10-28-result-identity-pipeline/plan.md:440` 与 `:458` 记载：该命令 4 个输出字段中，`topEntities` 实测全为 `degree: 0, frequency: 1`（没有边就没有度数，`degree × frequency` 排序退化为只按 frequency），`roundHistory[].resultCount` 实测报 2 和 4 而实际都是 5，且把 `results-add --query probe` 的导入标签当成第 2 轮查询。同处写明「删除 `suggest-queries` 依赖任务 C 先删 verdict」。

任务 C（`achieved/2026-10-30-quality-facts`，`Status: completed`）已完成，`cli/src/deep/quality-assess.ts` 与 `cli/src/deep/recovery-analysis.ts` 均已不存在（实测 `ls` 报 No such file）。阻塞条件消失，命令仍在 `cli/src/runCli.ts:1196`。

### R3 — 配置文件数值字段无类型校验

`cli/src/config.ts:104-116` 是逐字段赋值：

```ts
if (fileConfig.timeout !== undefined) config.timeout = fileConfig.timeout;
```

`fileConfig` 来自 `JSON.parse`（`:88`），其静态类型只是对 `Partial<SearXNGConfig>` 的断言，运行时什么都能装。配置文件写 `"timeout": "abc"` 会被原样接受，`service.ts` 的 axios 随后拿到字符串。

同形状漏掉的还有三个数值字段：`defaultLimit`、`redundancyThreshold`、`redundancyBigramThreshold`。环境变量一侧有 `readIntEnv` / `readFloatEnv` 兜底（`:63-77`），文件一侧没有。

### R4 — 信封错误码没有任何类型约束

`cli/src/protocol.ts:29` 是 `code: string`，全仓 82 处 `createErrorEnvelope` 调用，字面量彼此无关。仓库里已有正例：`cli/src/errors.ts` 的 `SEARCH_ERROR_CODES` 是运行时数组 + 派生联合类型，注释明写理由是「feedback log 要按运行时白名单核对，纯类型在那里不可见」。

另有三处**绕过 helper、内联信封字面量**：`cli/src/commands/verdict.ts:28`、`cli/src/commands/review.ts:72`、`:126`，都硬编码 `CLAIMS_STATE_CORRUPTED`。

### R5 — 由此产生的过期记录

- `achieved/2026-11-18-small-bug-fixes/prd.md:19` 声称「frontmatter 标题不重复」已完成，与 R1 冲突。
- `cli/src/deep/query-suggest.ts:34/37` 的两个字段随 R2 失去命令侧出口，`iteration-data.ts` 仍在组合它们，需说明保留理由。

## Requirements

- **R1** 标题重复在源头消除：`scanner.ts` 产出的 `headings` 只含章节标题，不含文档标题；`searcher.ts` 的切片逻辑随之消失。对「frontmatter 标题与 H1 同名」与「仅 H1」两种输入都只出现一次。
- **R2** 删除 `suggest-queries` 命令的注册、帮助文本、三份 README 表格行、`SKILL.md` 三处提及、`SOP.md` 与 `appendix.md` 的示例段落，以及钉住该命令存在的测试断言。`query-suggest.ts` 模块与 `generateQuerySuggestions` **保留**：`session-report`（`runCli.ts:1211`）与 `--redundancy warn` 的 advice（`:660`、`iteration-data.ts:48`）仍消费它。
- **R3** 四个数值字段在文件侧统一校验：不是 `typeof === 'number' && Number.isFinite` 就落回 `DEFAULT_CONFIG` 的值，并在 stderr 打一行 warning 指名字段名。不引入配置 schema、不引入新依赖。
- **R4** 新建 `CLI_ERROR_CODES` 运行时数组（仿 `SEARCH_ERROR_CODES`），派生 `CliErrorCode` 类型；`createErrorEnvelope` 的 `code` 收窄为 `SearchErrorCode | CliErrorCode`。三处内联信封字面量改用 `createErrorEnvelope`。静态字面量调用点逐一核对，动态调用点（`error.code`、`input.code`、`result.error.code`）靠已有类型自然收敛。
- **R5** 修正 `achieved/2026-11-18-small-bug-fixes/prd.md` 的过期陈述，追加带日期的注记而不改写原文。

## Acceptance Criteria

| ID | 可验证的断言 |
|---|---|
| AC1 | frontmatter 标题与 H1 同名时，`scan()` 返回的 `headings` 为 `["My Title"]`，`docSearch` 产出的标题为 `"My Title"`（无 `— My Title`） |
| AC2 | 仅 H1、无 frontmatter 时，`headings` 与标题不变，行为与改动前一致 |
| AC3 | `grep -rn "suggest-queries"` 在 `cli/src`、`skills/`、三份 README 中零命中 |
| AC4 | `createProgram()` 注册的命令集合不再含 `suggest-queries`；`skill-command-table` 测试仍绿 |
| AC5 | `session-report` 的 Top Entities 段与 `--redundancy warn` 的 `advice.type === 'graph'` 仍能产出，`getSessionAnalysis` 单测仍绿 |
| AC6 | 配置文件 `"timeout": "abc"` 时 `getConfig().timeout === 25000`，且 stderr 出现指名 `timeout` 的 warning |
| AC7 | 四个数值字段各有一条非法输入用例；合法输入不受影响 |
| AC8 | `createErrorEnvelope` 的 `code` 对未知字符串编译失败；全部调用点过 `tsc --noEmit` |
| AC9 | 三处内联信封改走 helper 后输出 JSON 形状不变（`status`/`error.code`/`error.message` 同键同名） |
| AC10 | `achieved/2026-11-18-small-bug-fixes/prd.md` 含 2026-11-21 的注记，原文未被改写 |

## External Facts

- Depends on external facts: no
- Why not: 四项的判据全部在仓库内可打开的文件里：R1 的两侧是 `cli/src/deep/local-doc/scanner.ts:146` 与 `cli/src/deep/local-doc/searcher.ts:179`；R2 的依据是 `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/plan.md:440` 与 `:458`，阻塞条件由 `TaskFlowDocs/achieved/2026-10-30-quality-facts/prd.md` 的 `Status: completed` 解除；R3 是 `cli/src/config.ts:104-116`；R4 是把 `cli/src/errors.ts:27-52` 已有的写法复制到 `cli/src/protocol.ts:29`。没有一处需要超出本仓库才能判定。

## In Scope

- `cli/src/deep/local-doc/scanner.ts`、`searcher.ts` 与对应用例
- `cli/src/runCli.ts` 的 `suggest-queries` 注册与文档面、`cli/test` 相关断言
- `cli/src/config.ts` 的数值字段校验与其单测
- `cli/src/protocol.ts`、`cli/src/commands/verdict.ts`、`cli/src/commands/review.ts` 的错误码类型
- `achieved/2026-11-18-small-bug-fixes/prd.md` 的注记

## Out of Scope

- **`query-suggest.ts` 模块本身**：`session-report` 与 redundancy advice 还在用，删除是另一个决定。
- **`topEntities` / `roundHistory` 两个字段的存废**：命令删掉后只剩 `session-report` 一处消费者，是否清理留待观察。
- **`--engines-list` 只列 provider 名**、**`--limit` 父子同名冲突**、**`mixed` 采样固定 seed**：已记录为既有设计限制或已用 workaround 覆盖。
- **`body_versions` 无回收**：真实存在但需显式字节记账方案，属设计变更。
- 不写兼容层：删除的字段不留别名、不读旧形态。

## Risks / Deferred Items

- **R2 是破坏性删除**：外部若有人调用 `dg suggest-queries` 会立刻失败。缓解：该命令的字段实测不可用（见 R2 证据），且仓库无对内调用者；README 与 SKILL 同步删除，不留悬空指引。
- **R3 落回默认值会掩盖配置错误**：写错后程序继续用默认值跑，用户可能不知道自己在用默认值。缓解：warning 写 stderr（不污染 stdout 的 JSON），指名字段与非法值。
- **R4 的类型收窄会在添加新错误码时变成编译错误**：这是目的而非风险；新码必须同时进 `CLI_ERROR_CODES`。
- **延后**：`getSessionAnalysis` 是否该拆掉 `suggestions` 字段，取决于 R2 之后 `session-report` 是否仍需要 `topEntities`。

## Open Questions

无。三个方向已由用户确认：只删命令保留模块；四个数值字段都校验并落回默认 + 警告；建统一联合类型并收编三处裸写。
