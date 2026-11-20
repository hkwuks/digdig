# Plan — --data-stdin 与拆掉 hook
> Task version: v1
> Status: completed

No spec required — the change is one function plus its call sites, and the acceptance is "pipe something in, read it back out".

## Reference Pointers

- `cli/src/commands/json-input.ts` — 唯一收口点，两个来源在这里合流。
- `cli/src/commands/results-add.ts` — 消费方之一，形状校验在这层。
- `cli/src/init.ts:42` — 项目里已有的 stdin 使用先例。
- `skills/digdig/references/importing-agent-results.md` — 合并后的唯一文档。

## Related Tasks

- `TF-20261120-d27d3d`（已取消）— 原 hook 实现。
- `TF-20261120-9ada7d`（已取消）— 插件化方向。

## Skills / Tools Used

- [PRD] Invoked `mcp__exa__web_fetch_exa` to read the Claude Code and CodeBuddy hook contracts verbatim before deciding to drop the hook; architecture and design considered unaided.
- [Plan] Invoked `mcp__exa__web_search_exa` to check whether other CLIs ship per-host equivalents before deciding the work breakdown stayed in one function.
- [Test] Invoked `mcp__exa__web_search_exa` while checking that `readFileSync(0)` was the right stdin idiom; testing strategy considered unaided.

## Preconditions

- `cli/node_modules` 已安装。
- 基线：`npx tsc --noEmit` 为 0，全量测试通过。

## Plan Review

- Verdict: sound
- Coverage: A1–A8 逐条落在四步的 Acceptance 上。
- Verifiability: A2–A5 都能用一条 `printf | node dist/index.js` 验证；A6 在 `--quality` 的选择路径上。
- Layer ownership: 解码放 `json-input.ts` 共用，命令层只传来源声明，不重复实现。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-20 23:40 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 拆掉 hook

- Goal: 移除逐宿主适配的 hook 实现，而不是留成死代码。
- Dependencies: 无。
- Files: `cli/src/hooks/claude-mcp-bridge.ts`（删）、`cli/test/unit/hooks/claude-mcp-bridge.test.ts`（删）、`cli/test/integration/claude-mcp-bridge.test.ts`（删）。
- Implementation checklist:
  - [x] 删除实现与全部测试。
  - [x] 确认无残留引用。
- Acceptance: A7。
- Verification: `grep -rn "mcp-bridge"` 为空。
- Rollback: `git revert`。代码在 PR #76 历史中可查。
- Status: done

### Step 2 — stdin 来源

- Goal: 两个来源合流到一处解码，六个命令都能用。
- Dependencies: 无。
- Files: `cli/src/commands/json-input.ts`、`cli/src/runCli.ts`、五个命令实现。
- Implementation checklist:
  - [x] `JsonInputSource` 加 `stdin?: boolean`，与 `value` 互斥。
  - [x] `readFileSync(0)` 读全部 stdin；空内容报 `STDIN_EMPTY`。
  - [x] 抽出 `decodeUtf8` 由两个来源共用（BOM / UTF-16 / 非法字节）。
  - [x] 六个调用点接线。
  - [x] 三个 `requiredOption` 放宽为 `option`。
  - [x] 修正跳过/恢复的判断：`Boolean(opts.skipFile)` → file 与 stdin 的并集。
- Acceptance: A1–A6、A8。
- Verification: 单测 + 真实管道集成测试。
- Rollback: `git revert`。
- Status: done

### Step 3 — 测试

- Goal: 覆盖 stdin 的三条失败路径，并证明真管道能通。
- Dependencies: Step 2。
- Files: `cli/test/unit/commands/json-input.test.ts`、`cli/test/integration/data-stdin.test.ts`（新）。
- Implementation checklist:
  - [x] 单测：stdin 解析、空 stdin、来源互斥。
  - [x] 集成：`spawn` 喂真进程，断言 `--quality` 能查到。
  - [x] 集成：空 stdin 不创建会话目录。
  - [x] 反向验证：拆掉 stdin 分支后新用例必须变红。
- Acceptance: A2、A3、A4、A5。
- Verification: `npx vitest run`。
- Rollback: `git revert`。
- Status: done

### Step 4 — 文档合并

- Goal: 一份文档覆盖所有宿主，不再一宿主一个 md。
- Dependencies: Step 2。
- Files: `skills/digdig/references/importing-agent-results.md`（新）、两份 bridge 文档（删）、`SKILL.md`、三份 README。
- Implementation checklist:
  - [x] 讲清两种 kind、两种输入形态、能否省上下文的区分。
  - [x] `SKILL.md` 两行指路合并成一行。
  - [x] 三份 README 不再承诺 hook。
  - [x] 命令表标注 `--data-stdin`。
- Acceptance: Requirements 7。
- Verification: `skill-command-table.test.ts` 通过。
- Rollback: `git revert`。
- Status: done

## Checkpoints

- Step 1 独立提交（纯删除）；Step 2、3、4 各自独立提交。
- 每个提交前跑 `npx tsc --noEmit`。

## Verification / Review

### 静态检查与全量测试

```
npx tsc --noEmit                   → 0
npx vitest run --testTimeout=60000 → 80 文件 / 901 通过 / 1 跳过
CI                                  → 4/4 通过
```

### 实测

```
$ printf '%s' '[{"url":"https://example.com/x","title":"Piped","content":"Body via pipe.","extractor":"exa","tool":"exa","query":"q"}]' \
    | node dist/index.js results-add "$D/s" --kind extracted --data-stdin
{ "status": "ok", "data": { "added": 1, "total": 1, "pendingApproval": 1 } }

$ node dist/index.js --session "$D/s" --quality --format json
  → total 1, extracted 1, sourceList ["example.com"]

$ printf '' | node dist/index.js results-add "$D/s" --kind search --data-stdin
{ "status": "error", "error": { "code": "STDIN_EMPTY" } }   exit=1
```

### 反向验证

把 `if (source.stdin)` 改成 `if (false && source.stdin)`：

```
× parses JSON piped on stdin without any session file
× reports STDIN_EMPTY rather than INVALID_JSON when nothing is piped
Tests  2 failed | 5 passed (7)
```

剩下 5 条通过的是文件来源用例，本就不该受影响。

### 开发过程中修掉的真问题

1. **`git rm` 提前 stage**：第一次提交时，删除的文件跟着 `git add` 一起被带进了 `docs` 那个 commit，与它的主题不符。用 `git reset --soft HEAD~3` 重排，拆成四个边界正确的提交。
2. **跳过判断会错**：`Boolean(opts.skipFile)` 在加 stdin 后无法区分跳过与恢复，改成看并集。
3. **`gh pr edit` 静默失败两次**：它退出码 1（gh 自己在调已废弃的 `projectCards` GraphQL），我只读了输出里的警告就当成功。显式打印 `$?` 才发现，改用 REST API（`gh api -X PATCH`）绕过那个字段。

## Change Log

- `0c0efc2` `refactor(hooks)` —— 删除 hook 实现与 10 条测试。
- `7c5a198` `feat(cli)` —— stdin 来源，六个命令接线。
- `28741d6` `test(cli)` —— 单测三条 + 真实管道集成测试。
- `1b8948f` `docs(skills)` —— 两份文档合并为一份。
- `a06891f` `docs` —— 三份 README 改述。

## Follow-ups

- `--data-file` 的路径校验对能写文件的调用者无安全收益，删除与否是独立决定。
- 若将来某个宿主支持 hook 改写且契约稳定，可重新评估；但不应为它维护多份适配。

## Version History

- v1 — planning.
