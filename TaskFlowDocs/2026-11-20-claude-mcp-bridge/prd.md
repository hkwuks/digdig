# Claude Code MCP 桥接：MCP 结果自动入 dg 会话
> Task version: v1
> Status: completed

## Goal

为 Claude Code 提供一个 PostToolUse hook：MCP 工具返回的结果由 hook 进程直接落到会话的 `agent-inputs` 并调用 `results-add`，模型只收到一行摘要而不是整页正文。

## Task Kind

- Kind: capability

## Background / Confirmed Facts

### 已有先例

1. `skills/digdig/references/codex-mcp-bridge.md`（`f5083e4` 引入）为 Codex 做了同类事情：让模型在一次 `functions.exec` 调用里自己写代码搬运 MCP 结果，模型只看到 import 状态与计数。
2. 该文档第 3 行明确写它是 host-specific bridge，不是 MCP 特性，也不能让 dg 继承别人的凭据。
3. `skills/digdig/SKILL.md:137` 引用它，限定为「In a compatible Codex host」。

### Claude Code 的实际机制（已查官方文档，非推测）

4. `PostToolUse` hook 的输入带 `tool_input` 与 `tool_response`（完整结果），MCP 工具额外带 `mcp_server`。文档原文：「The input includes both `tool_input`, the arguments sent to the tool, and `tool_response`, the result it returned.」
5. 输出字段 `hookSpecificOutput.updatedToolOutput`「Replaces the tool's output with the provided value **before it is sent to Claude**. The value must match the tool's output shape.」
6. `updatedMCPToolOutput` 是同一能力的 MCP-only 旧名，文档建议用 `updatedToolOutput`。
7. `PostToolUse` 的 matcher 按工具名匹配，MCP 工具形状是 `mcp__<server>__<tool>`；服务器级通配必须写 `mcp__exa__.*`，文档明说 `mcp__exa` 只做精确匹配、匹配不到任何工具。
8. `PostToolUse` 只对**成功**的工具调用触发；失败走 `PostToolUseFailure`，而后者不能改写结果。
9. matcher 里带 `.*` 的写法对插件自带的 MCP 服务器不适用：那类工具名是 `mcp__plugin_<plugin>_<server>__<tool>`，要写更长的匹配。
10. 已实测 `mcp__exa__web_fetch_exa` 返回 `[{"text":"# Example Domain\nURL: https://example.com\n...","type":"text"}]` —— 与 codex bridge 里假设的 `result.content?.filter(b => b.type === 'text')` 形状一致。

### 与 Codex 版的差异

11. Codex 版让**模型**写代码完成搬运，占据模型推理、可能写错；Claude Code 的 hook 在模型完全不知情的情况下执行，模型看不到那页正文。
12. Codex 版依赖 `functions.exec` 与 `mcp__node_repl__js` 两个宿主特性；Claude Code 只需要 hook + Bash 或直接子进程调用。
13. 相同点：都不共享凭据，都需要显式指定目标会话，都不保证节省量、不减少 provider 计费。

### 会话归属

14. hook 无法自己推断「这次 MCP 调用属于哪个 dg 会话」—— `session_id` 是 Claude Code 的会话 ID，与 `.digdig/sessions/` 下的目录无关。
15. `git grep` 确认代码里不存在 `DIGDIG_SESSION` / `current-session` 之类的现有机制。
16. 用户已确认：由 Agent 显式声明目标会话，不做自动推断。

### 现状与约束

17. `cli/package.json` 的 `files` 为 `["dist/", "digdig.config.example.json", "README.md"]`，新增文件必须落在其中才会随包发布。
18. `bin` 只有 `dg` / `digdig` / `sxng` 三个入口，没有 hook 入口。
19. `cli/package.json` 依赖里没有 MCP SDK；本轮不引入。

## Requirements

1. 提供一个可在 Claude Code `PostToolUse` 配置里引用的 hook 可执行入口，随 npm 包发布。
2. hook 读取一份映射表配置：MCP 工具名 → `kind`（`search` / `extracted`）+ 从 `tool_response` 提取字段的路径 + 记录字段（url/title/excerpt/content/tool/query）的来源路径。
3. hook 只对映射表里列出的工具生效；未列出的工具原样放行，不改写结果。
4. hook 从显式配置读取目标会话路径；未配置或会话不存在时，**不改写结果**，只在 `additionalContext` 里说明跳过原因。
5. 成功导入时，`hookSpecificOutput.updatedToolOutput` 把结果替换为一行摘要（导入状态、provider、新增/更新/总数），正文只落在会话的 `agent-inputs` 与 `session.sqlite` 里。
6. 导入失败时不改写结果，保留输入文件供排查，并在 `additionalContext` 里说明。
7. 不新增 npm 依赖。不引入 MCP SDK，不实现 MCP 服务器。
8. 文档说明：如何配置、映射表的字段语义、与 Codex 版的差异、限制（provider 计费不变、不保证节省量、`PostToolUse` 不覆盖失败调用）。
9. 不改变既有 CLI 的参数与输出。

## Acceptance Criteria

- A1：`npx tsc --noEmit` 为 0，`npx vitest run` 全绿。
- A2：给定一份含 `mcp__exa__web_fetch_exa` 的映射表与一个已存在的会话，hook 收到形如实测 Exa 返回的 `tool_response`，输出现 `hookSpecificOutput.updatedToolOutput`，且其内容不含页面正文。
- A3：同一输入下，`agent-inputs` 下出现一个临时 JSON 文件，且 `session.sqlite` 里出现对应结果（用 `dg --session <s> --quality` 可查到，`extracted` 为真）。
- A4：工具名不在映射表里时，hook 输出为空（不改写），退出码 0。
- A5：未配置会话、或会话目录不存在时，hook 不改写结果，`additionalContext` 含跳过原因。
- A6：导入失败（例如 `results-add` 返回非 ok）时不改写结果，`agent-inputs` 文件保留。
- A7：`--obscura` 等既有 CLI 行为不变，既有测试全部继续通过。
- A8：`hookSpecificOutput.updatedToolOutput` 的形状与 MCP 工具的原始输出形状一致（数组 + `{type:"text", text}`），不是裸字符串。

## External Facts

- Depends on external facts: yes
- Why not: 依赖 Claude Code 的 hook 契约（输入字段、`updatedToolOutput` 语义、matcher 语法）。已通过官方文档核对并在 Background 记录了原文引用；本仓库无法自行定义这些语义。
- Source: https://docs.claude.com/en/docs/claude-code/hooks
- What it settled: `PostToolUse` 的输入确实含完整 `tool_response`，且 `hookSpecificOutput.updatedToolOutput` 会在结果送达模型前替换它 —— 本任务可行性完全依赖这两点（PRD 事实 4、5）。另确认 MCP matcher 必须写 `mcp__server__.*`，`PostToolUse` 只对成功调用触发（事实 7、8）。
- Source: https://docs.claude.com/en/docs/claude-code/hooks#match-mcp-tools
- What it settled: 插件自带 MCP 服务器的工具名是 `mcp__plugin_<plugin>_<server>__<tool>`，对裸服务器键写的 matcher 不会命中（事实 9）—— 决定了首版文档必须写明这条限制，而不是给出一个会静默失效的示例。

## In Scope

- 新增 hook 可执行脚本与映射表配置的读取/校验。
- 新增 hook 的单测与端到端测试。
- 新增 `skills/digdig/references/claude-code-mcp-bridge.md` 文档，并在 `SKILL.md` 引用。
- `package.json` 的 `files` 与必要字段调整。

## Out of Scope

- 自动推断会话归属（用户已确认显式声明）。
- 实现 MCP 服务器或复用宿主凭据。
- 覆盖 `PostToolUseFailure`（第三方契约不允许改写失败结果）。
- 为所有 MCP 工具预置映射（只给 Exa 一份可用默认，其余由用户按契约自行填）。
- 修改 Codex bridge。
- 测量或承诺 token 节省量。

## Risks / Deferred Items

- 映射表是用户可编辑的自由格式，写错字段路径会静默提取不到内容 —— 用「字段缺失即跳过并说明」而不是猜。
- `updatedToolOutput` 要求形状与工具原输出一致；若上游 MCP 改形状，摘要会被拒或显示异常。测试固定实测形状。
- hook 在每次匹配的 MCP 调用上运行，多一次进程启动开销。
- 插件自带 MCP 服务器的工具名规则不同，首版文档说明即可，不做特殊处理。

## Open Questions

无。用户已确认三项：显式声明会话、可配置映射表、hook 脚本 + 文档（不加安装命令）。
