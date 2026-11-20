# 给所有 JSON 输入命令加 --data-stdin，拆掉 Claude Code hook，文档合并成一份通用导入说明
> Task version: v1
> Status: completed

## Goal

让「把 Agent 已经拿到的内容交给 dg」成为一条所有宿主通用的命令，并移除为逐宿主适配而写、最终判定不划算的 Claude Code hook。

## Task Kind

- Kind: capability

## Background / Confirmed Facts

### 原方案与放弃理由

1. 本任务的前身 `TF-20261120-d27d3d` 实现了 Claude Code 的 `PostToolUse` hook（`cli/src/hooks/claude-mcp-bridge.ts`，288 行），能在结果送达模型前替换它。
2. `PostToolUse` 的 `hookSpecificOutput.updatedToolOutput` 是核实过的官方契约：「Replaces the tool's output with the provided value before it is sent to Claude. The value must match the tool's output shape.」（https://docs.claude.com/en/docs/claude-code/hooks）
3. 它是**唯一**能让正文完全不进模型上下文的机制。但逐宿主适配成本高：Claude Code 要求替换值与原输出形状一致；CodeBuddy 的 skill frontmatter hooks 只在 `context: fork` 生效（https://www.codebuddy.ai/docs/cli/skills），够不到主会话；Codex、dsh、Trae 无改写字段。
4. 用户判定：兼容性太难做，不做 hook、不做插件。

### 真正卡住的地方

5. `results-add` 只接受落在 `<session>/agent-inputs/` 下的文件路径（`cli/src/commands/json-input.ts` 的 `validateSessionInputFile`）。
6. `JsonInputSource.file?: boolean` 已存在非文件分支，但它的实现是 `return { ok: false, code: 'JSON_FILE_OUTSIDE_SESSION' }` —— 需求被主动拒绝，不是做不了。
7. 于是任何想导入内容的 Agent 都要 mkdir → 写文件 → 传路径 → 负责清理。这四步对作为子进程被调用的 Agent 没有任何收益：模型本来就能写任意文件。
8. `cli/src/init.ts:42` 证明 stdin 在本项目已被使用过。

### 收口点

9. `readSessionJsonInput` 是全部 JSON 输入的**唯一**入口，六个调用方：`results-add`、`graph-add`、`source-relations`、`claim-add`、`evidence-verify`、`runCli.ts` 的 `--quality` 选择读取。

## Requirements

1. `readSessionJsonInput` 接受 stdin 作为与文件并列的输入来源。
2. 两个来源共用同一套 UTF-8 校验与 JSON 解析，不各写一遍。
3. 空的 stdin 报独立错误码，与 JSON 格式错误区分开。
4. 全部六个调用方都接上，不是只改 `results-add`。
5. 三个 `requiredOption` 放宽，否则 stdin 到不了。
6. 删除 hook 实现、它的测试与两份逐宿主 bridge 文档。
7. 文档合并成一份，讲清两种 kind、两种输入形态、以及「能否省上下文取决于宿主」。
8. 文件来源的行为、路径校验与错误码不变。

## Acceptance Criteria

- A1：`npx tsc --noEmit` 为 0，全量测试通过。
- A2：`printf '%s' '[...]' | dg results-add <s> --kind extracted --data-stdin` 导入成功，`--quality` 能查到且 `extracted` 为真。
- A3：空 stdin 报 `STDIN_EMPTY` 且不创建会话目录。
- A4：同时给文件与 stdin 报 `MULTIPLE_JSON_INPUTS`。
- A5：UTF-16 / BOM / 非法字节在两个来源上报同样的 `UNSUPPORTED_JSON_ENCODING`。
- A6：`--approve-stdin` / `--skip-stdin` / `--unskip-stdin` 可用，且跳过与恢复的判断不再依赖 `Boolean(opts.skipFile)`。
- A7：hook 相关文件与两份 bridge 文档全部移除，无残留引用。
- A8：既有的 `--data-file` 测试全部继续通过。

## External Facts

- Depends on external facts: yes
- Why not: 「能否省上下文」取决于宿主能否从代码里调用工具并只回传代码输出，这是宿主契约，不是 dg 能定义的。
- Source: https://docs.claude.com/en/docs/claude-code/hooks
- What it settled: `updatedToolOutput` 确实能在结果送达模型前替换它（事实 2）——本任务放弃的正是这个能力，理由是逐宿主维护成本，不是它无效。另确认 `PostToolUse` 只对成功调用触发，失败走 `PostToolUseFailure`，后者不可改写。
- Source: https://www.codebuddy.ai/docs/cli/skills
- What it settled: CodeBuddy 的 skill frontmatter hooks「Only effective when `context: fork`」且生命周期绑定 fork subagent（事实 3）——这条排除了「用一份 skill frontmatter 覆盖两个宿主」的想法。

## In Scope

- `readSessionJsonInput` 的 stdin 来源与共用解码。
- 六个调用点接线，三个 `requiredOption` 放宽。
- 单测三条（stdin 解析、空 stdin、来源互斥）与一条真实管道集成测试。
- 删除 hook 实现与两份 bridge 文档，三份 README 相应改述。

## Out of Scope

- 任何宿主的 hook、插件或映射表。
- 自动推断会话归属（`session_id` 与 `.digdig/sessions/` 无关）。
- 删除 `--data-file` 的路径校验（既有调用依赖它）。
- 测量或承诺 token 节省量。

## Risks / Deferred Items

- `readFileSync(0)` 在测试里被 mock 替换，证明的是分支存在而非管道接通——所以另加了真实子进程的集成测试。这是本轮唯一无法靠单测覆盖的断言。
- `--data-file` 的路径校验对能写文件的调用者没有安全收益，但删除属于另一个决定，本轮保留。

## Open Questions

无。
