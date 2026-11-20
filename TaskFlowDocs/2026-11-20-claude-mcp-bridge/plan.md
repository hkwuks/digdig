# Plan — Claude Code MCP 桥接
> Task version: v1
> Status: completed

No spec required — small, self-contained capability with a verified external contract.

## Reference Pointers

- `skills/digdig/references/codex-mcp-bridge.md` — 同类先例，本轮文档要说明差异。
- `cli/src/commands/results-add` — 导入入口，`cli/src/runCli.ts` 的 `results-add` 子命令定义。
- `cli/src/protocol.ts` — 信封形状，hook 要解析 `results-add` 的 stdout。
- `cli/test/unit/external-search.test.ts`、`cli/test/unit/commands/extract.test.ts` — 现有测试的 mock 风格。
- 官方文档 `https://docs.claude.com/en/docs/claude-code/hooks` 的 `posttooluse` / `match-mcp-tools` / `common-input-fields` 三节 — 契约来源。

## Related Tasks

- `TF-20261119-extraction-routing`（已完成）— `results-add --kind extracted` 的当前语义。
- `TF-20261120-d27d3d` — 本任务。

## Skills / Tools Used

- [PRD] Unaided — architecture and design; considered: architecture and design
- [Plan] Unaided — work breakdown; considered: work breakdown
- [Test] Unaided — testing strategy; considered: testing strategy

## Preconditions

- `cli/node_modules` 已安装。
- 基线：`npx tsc --noEmit` 为 0，`npx vitest run` 全绿。
- 已实测 `mcp__exa__web_fetch_exa` 的真实返回形状（见 PRD 事实 10）。

## Plan Review

- Verdict: sound
- Coverage: A1–A8 逐条落在三步的 Acceptance 上。
- Verifiability: A2–A6 都是「喂一段固定 stdin，断言 stdout 的 JSON」；A8 直接比对形状。
- Layer ownership: hook 是独立可执行入口，不侵入既有 CLI 命令逻辑；配置读取放在 hook 自己的模块里，不进 `config.ts`。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-20 22:02 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — hook 核心：读配置、提取字段、调用 results-add、输出改写

- Goal: 一个能在 `PostToolUse` 下跑通的入口，行为覆盖 A2–A6。
- Dependencies: 无。
- Files: `cli/src/hooks/claude-mcp-bridge.ts`（新）、`cli/package.json`、`cli/tsconfig.json`（若必需）。
- Implementation checklist:
  - [x] 从 stdin 读 JSON；非 `PostToolUse` 或工具名不在映射表里 → 输出空、退出 0（A4）。
  - [x] 解析配置：环境变量 `DIGDIG_MCP_BRIDGE_CONFIG` 指向的 JSON，缺省读 `<cwd>/.digdig/mcp-bridge.json`。
  - [x] 配置含 `session` 与 `tools` 映射；`session` 目录不存在或未配置 → 不改写，`additionalContext` 说明（A5）。
  - [x] 按映射从 `tool_response` 提取记录，写临时文件到 `<session>/agent-inputs/`。
  - [x] 以子进程调用同包 `dist/index.js results-add <session> --kind <kind> --data-file <file>`。
  - [x] 成功 → 删文件，输出 `hookSpecificOutput.updatedToolOutput` 为与原始 MCP 输出同形状的数组（含一行摘要）（A2、A8）；失败 → 不改写、保留文件、`additionalContext` 说明（A6）。
  - [x] `package.json` 的 `files` 加上 hook 产物路径。
- Acceptance: A2、A4、A5、A6、A8。
- Verification: 单测喂固定 stdin 断言 stdout。
- Rollback: `git revert`。
- Status: done

### Step 2 — 端到端：真实会话写入

- Goal: 证明 hook 落盘到 `session.sqlite` 且 `--quality` 可查到。
- Dependencies: Step 1。
- Files: `cli/test/integration/claude-mcp-bridge.test.ts`（新）。
- Implementation checklist:
  - [x] 临时 HOME + 临时会话目录，跑 hook 子进程。
  - [x] 断言 `--quality` 输出里出现该结果且 `extracted: true`。
  - [x] 断言页面正文没有出现在 stdout（A2、A3）。
- Acceptance: A3。
- Verification: 集成测试。
- Rollback: `git revert`。
- Status: done

### Step 3 — 文档与 SKILL 引用

- Goal: 用户能照着配置起来。
- Dependencies: Step 1。
- Files: `skills/digdig/references/claude-code-mcp-bridge.md`（新）、`skills/digdig/SKILL.md`、`README.md`、`README.zh-CN.md`、`cli/README.md`。
- Implementation checklist:
  - [x] 文档含：`settings.json` 配置片段（带 `mcp__exa__.*` 的 matcher）、映射表字段表、会话声明方式、与 Codex 版的差异表、限制。
  - [x] `SKILL.md` 在 Codex bridge 那一行附近补一行 Claude Code 版。
  - [x] 三份 README 的相应段落补一句，或指向新文档。
- Acceptance: A8 的说明性部分、Requirements 8。
- Verification: 文档内链接可达；命令表守卫测试通过。
- Rollback: `git revert`。
- Status: done

## Checkpoints

- Step 1 与 Step 2 可合并提交；Step 3 单独提交。
- 每个提交前跑 `npx tsc --noEmit`。

## Verification / Review

### 静态检查与全量测试

```
npx tsc --noEmit                   → 0
npx vitest run --testTimeout=30000 → 81 文件 / 906 通过 / 1 跳过（基线 896，+10）
```

### 实测：真实 hook 子进程 + 真实 results-add

```
$ echo '{"hook_event_name":"PostToolUse","tool_name":"mcp__exa__web_fetch_exa",
        "tool_input":{"urls":["https://example.com"]},
        "tool_response":[{"type":"text","text":"# Example Domain\nURL: https://example.com\n\nbody here"}]}' \
  | DIGDIG_MCP_BRIDGE_CONFIG=$D/cfg.json node dist/hooks/claude-mcp-bridge.js

{"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedToolOutput":[
  {"type":"text","text":"dg: imported into session (added 1, updated 0, total 1).
   Page text is in the session, not in this message."}]}}

$ ls $D/session/agent-inputs | wc -l   → 0        （暂存文件已删）
$ node dist/index.js --session $D/session --quality --format json
  → 含 https://example.com，extracted 为真
```

### 反向验证

1. **全部早退**：把 `runHook` 首行改成无条件 `return {}`：

```
× replaces the page text with counts, keeping the tool output shape
× stages the imported record before calling results-add
× leaves the result alone when no config exists
× keeps the input file when the import fails
× treats a non-ok envelope as a failed import and keeps the file
× deletes the staged file once the record is in the session
× refuses a response it cannot read a url from
× writes an excerpt rather than a body for search mappings
Tests  8 failed | 2 passed (10)
```

剩下 2 条通过的正是「不该动结果」的用例（未映射工具、`tool_name` 不在表里），
本就应该继续通过。

2. **摘要形状**（A8）：把 `summaryOutput` 改成直接返回裸字符串：

```
× replaces the page text with counts, keeping the tool output shape
Tests  1 failed | 8 passed (9)
```

### 开发过程中修掉的三个真问题

1. **`entry` 路径少退一层**：`process.argv[1]` 是 `dist/hooks/claude-mcp-bridge.js`，
   父目录是 `dist/hooks`。首次实测时 `results-add` 根本没被调到，`agent-inputs`
   里堆了一个没人导入的文件。这正是端到端测试存在的理由——单测里 `execFile`
   是 mock 的，路径错也看不出来。
2. **端到端测试用 `execFile` 喂 stdin**：`execFile` 没有 `input` 选项（那是
   `execFileSync` 的），hook 读 stdin 读到超时。改用 `spawn` 手动写 stdin。
3. **端到端测试没设 `DIGDIG_MCP_BRIDGE_CONFIG`**：hook 于是去 CLI 的 cwd 找
   `.digdig/mcp-bridge.json`，静默走「无配置」分支。

### 与计划的偏差

- 计划 Step 1 提到可能要改 `cli/tsconfig.json`，实际不需要（`src/hooks/` 在既有
  include 范围内）。
- `package.json` 无需改动：`files` 已是 `["dist/", ...]`，hook 产物在 `dist/hooks/`；
  `bin` 不加，hook 由用户配置引用，不是可执行入口。
- Step 3 的 README 改动比原计划多出 `README.md`（它原本没有 MCP 段落，补了一句）。

## Change Log

- `2f5e5cb` `feat(hooks)` —— hook 实现、单测 9 条、端到端 1 条、新文档。
- `62cbc20` `docs` —— 三份 README + SKILL.md 指路。

## Follow-ups

- 若上游 MCP 工具返回形状变化，摘要会失配；考虑加 `--dry-run` 输出实际形状。
- 插件自带 MCP 服务器的 scoped 工具名不做特殊处理。

## Version History

- v1 — planning.
