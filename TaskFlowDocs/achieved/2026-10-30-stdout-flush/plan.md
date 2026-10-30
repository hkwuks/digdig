# Plan — Stop `process.exit()` from truncating piped stdout
> Task version: v1
> Status: completed

No spec required — small, self-contained task. Scope is two files and one mechanical transformation.

## Reference Pointers

- Todo entry `TF-20261018-282836` in `TaskFlowDocs/todo.md` — carries the 2026-10-18 root-cause finding and minimal reproduction.
- Sibling entry `TF-20261017-d8f7b3` — this defect's original home before the split; its note records why the two changes must land separately.
- `TaskFlowDocs/repository-docs/index.md` — routing record. `CONTRIBUTING.md` and `CODE_STYLE.md` are `missing` on this branch; this task therefore follows the repository's existing, observable conventions (see Preconditions) rather than a written rule.

## Related Tasks

- Parent by origin: `TF-20261017-d8f7b3` (search body/excerpt, archived as `2026-10-18-search-body-excerpt`). This task was split out of it; it planned against no version of that task's contract and shares no files with it.
- None blocking. `TF-20261017-bfc96d` (repo governance) runs concurrently in `.worktrees/2026-10-30-repo-governance`. It adds new files only (`CONTRIBUTING.md`, `CODE_STYLE.md`, `.github/`), so it does not touch either file this task changes.

## Skills / Tools Used

- [PRD] `agent-skills:debugging-and-error-recovery` — reproduce, localize, reduce, fix root cause, guard, verify.
- [Plan] `agent-skills:planning-and-task-breakdown` — the step breakdown and its checkpoints.
- [Test] Unaided — considered: "testing strategy". The verification here is measured byte counts through a real pipe plus the existing suite at an unchanged baseline, not a new test suite.

## Preconditions

- Base: `origin/main` @ `2fbc8ac`. Branch `fix/2026-10-30-stdout-flush` in `.worktrees/2026-10-30-stdout-flush`.
- Baseline established on `main` before any edit: `npx tsc --noEmit` → 0; `npx vitest run` → 37 files / 519 tests.
- `cli/node_modules` is symlinked from the main checkout and excluded locally; it is not part of this change.
- Method is fixed by measurement, not preference: `process.exit()` is what truncates (minimal repro in the PRD), and natural exit is not blocked by axios keep-alive (measured, PRD Background). So the target is `process.exitCode` + return, with no flush shim and no blocking wait.

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-31 00:09 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — `cli/src/entry.ts`: stop exiting at the top of the process

- Goal: the two `process.exit()` calls in `main()` become exit-code assignment, so the process is allowed to flush stdout on its way out.
- Dependencies: none.
- Files: `cli/src/entry.ts`
- Implementation checklist:
  - [x] `process.exit(exitCode)` inside the success path becomes `process.exitCode = exitCode`.
  - [x] `process.exit(1)` in the catch becomes `process.exitCode = 1`.
  - [x] Keep the `console.error` in the catch; it goes to stderr and is not affected.
  - [x] No `return` is added — `main()` has nothing after either branch.
- Acceptance: `grep -c 'process\.exit(' cli/src/entry.ts` → 0 real calls; `npx tsc --noEmit` → 0.
- Verification: the only remaining `process.exit(` text is inside the new header comment. `dg --version | cat` → `0.0.2`, exit 0; dead server piped through `tail` returns the full `SEARCH_FAILED` envelope and terminates.
- Rollback: `git checkout -- cli/src/entry.ts`.
- Status: done

### Step 2 — `cli/src/runCli.ts`: the 44 command-branch exits

- Goal: every command branch sets an exit code and returns instead of terminating the process.
- Dependencies: Step 1.
- Files: `cli/src/runCli.ts`
- Implementation checklist:
  - [x] All 44 `process.exit(n)` calls become `process.exitCode = n`.
  - [x] Each site already reaches a terminal statement (`return`, `}`, `});`, or `} catch (...)`), so the branches still end where they ended before — verified site by site before the edit, not assumed.
  - [x] `return;` is added where a site is followed by a `}` that is not the end of the enclosing function, and only there. In the event no site needed one: all 44 were already followed by `return` or closed the enclosing block.
  - [x] `return 0` / `return 1` branches at the tail of `runSearch` are unchanged — they were never `process.exit`.
- Acceptance: `grep -c 'process\.exit(' cli/src/runCli.ts` → 0; no branch's exit code changes; `npx tsc --noEmit` → 0.
- Verification: grep → 0; `tsc --noEmit` → 0; `npx vitest run` → 37 files / 519 tests (identical to baseline); exit-code spot checks in Step 3.
- Rollback: `git checkout -- cli/src/runCli.ts`.
- Status: done

**Two deviations from the checklist as written:**

1. One site was `process.exit(applySkip(...) ? 0 : 1)` — a nested call the pattern could not rewrite, so it was changed by hand to `process.exitCode = applySkip(...) ? 0 : 1`. The count is 43 by regex plus 1 by hand, not 44 by regex.
2. The third checklist item turned out to be moot: no site needed a `return;` added, because every one of the 44 was already followed by a `return` or closed its enclosing block. The item was kept and marked done rather than deleted, so the record shows it was checked.

### Step 3 — Prove the defect is gone, end to end

- Goal: the truncation itself is measured fixed on a real invocation, not inferred from the source change.
- Dependencies: Steps 1–2.
- Files: none (verification only).
- Implementation checklist:
  - [x] Build a `dist` and produce an output larger than 65,536 bytes from a real command.
  - [x] Compare `| wc -c` against `> file; wc -c` — they must be equal, and both must exceed 65,536.
  - [x] `--format json` piped to `jq .` parses without error.
  - [x] Exit codes: healthy path → 0; `--health` against a dead `DIGDIG_BASE_URL` → 1.
  - [x] ~~`--engines-list` against a dead server → 1~~ — **checked, and the expectation was wrong.** It exits 0. See below.
  - [x] `dg init` still terminates (readline closes, process exits).
- Acceptance: AC2, AC5, AC6 of the PRD all pass with recorded commands and outputs.
- Verification: outputs pasted into `## Verification / Review`.
- Rollback: not applicable (no writes).
- Status: done

**A defect this Step assumed away.** The checklist asked for `--engines-list` against a dead server to exit 1. Measured, it exits **0**, and it does so on unmodified `main` too (`DIGDIG_BASE_URL=http://127.0.0.1:1 ./dist/index.js --engines-list` → 0, run against the main checkout's build). So this is a pre-existing defect, not a regression from this task, and it is already recorded in `todo.md`. The checklist item is struck rather than marked done, because the behaviour it asserted does not exist.

## Checkpoints

- **After Step 1** — `tsc --noEmit` clean and `dg --version | cat` still terminates. One file changed; if this hangs, the keep-alive assumption is wrong and Step 2 must not start.
- **After Step 2** — full suite green at the unchanged baseline (37 / 519). This is the gate before believing the change is behavior-preserving.
- **After Step 3** — every AC demonstrated with a command and its output.

## Verification / Review

全部在 `fix/2026-10-30-stdout-flush` @ `824b155` 上实测（PR #15，已合并为 `3d2300b`）。

### 编译与测试

```
npx tsc --noEmit     → 0
npx vitest run       → 37 文件 / 519 测试通过
基线（改动前）        → 37 文件 / 519 测试通过
```

### 缺陷已消失

桩 SearXNG，10 条结果各 8,606 字符正文（接近 Ollama 中位数）：

| | 修复前 | 修复后 |
|---|---|---|
| 管道 `\| wc -c` | 65,536 | **89,273** |
| 重定向 `> file` | 89,273 | 89,273 |
| 两者相等 | 否 | **是** |
| `\| jq -r '.data.totalResults'` | `Unterminated string` | **`10`** |
| 管道 `--format md` | 65,536 | **88,032** |

最小复现（与 dg 无关）在 `main` 上仍然复现，说明判据本身有效：

```
node -e "console.log('x'.repeat(200000)); process.exit(0)" | wc -c   → 65536
node -e "console.log('x'.repeat(200000))"                    | wc -c   → 200001
```

### 退出码未变

| 路径 | 退出码 |
|---|---|
| 健康搜索 | 0 |
| 死服务器搜索 | 1 |
| `--health` 死服务器 | 1 |
| `--categories-list` 死服务器 | 1 |
| `--version` | 0 |
| 管道拦截后的 `PIPESTATUS[0]` | 1 |

### 进程不被挂住

- 进程内起本地 server、`keepAliveTimeout = 600000`、发一次 GET 后不调 exit → **0 ms 退出**。keepAlive 的空闲连接不阻止退出。
- `printf '\n'×13 | timeout 25 dg init` → **exit 0**（不是 124），readline 正确关闭。

### 一处既有缺陷，如实记录

`--engines-list` 对死服务器返回 exit 0。在 `main` 的未改动构建上行为相同，非本任务引入，`todo.md` 已有记录。已从 Step 3 的验收项里划掉而非勾选 —— 它断言的行为不存在。

### 两处 checklist 与实物不符，已记录

见 Step 2 的 deviations：一处嵌套调用需手工改；`return;` 一项实际无用武之地。两项都保留在文档里并标注实际结果，没有删除。

## Change Log

- v1 — plan written.

## Follow-ups

- `TF-20261017-4f3dbb` — error classification (`retryable` / `hint` derived from error type). Adjacent in the same `catch`, but a separate contract change; not touched here.

## Version History

- v1 — planning.

## Todo Record

Moved verbatim from the TODO entry by `hooks/archive`, grouped by the field each block followed.

### `- Next action:`

### Verified facts carried over from `TF-20261017-d8f7b3`
Minimal reproduction, with no sxng code involved:
```
console.log('x'.repeat(200000)) + process.exit(0) | pipe   → 65536   (truncated)
console.log('x'.repeat(200000)) + natural exit    | pipe   → 200001  (intact)
console.log('x'.repeat(200000)) + process.exit(0) > file   → 200001  (intact)
```
Identical through `wc -c`, `cat > file`, and a Node reader, so the consumer is not the variable; 65,536 was this machine's pipe capacity (`fcntl.F_GETPIPE_SZ`). `sxng` calls `process.exit` 46 times — 45 in `cli/src/runCli.ts` (23 of them the `process.exit(code)` ending a subcommand, including right after `runSearch` returns at `:1748`) and 1 in `cli/src/index.ts`'s `main()`.
Be precise about the reach: **no subcommand was observed truncating.** `session-report` on a small session measures 2,647 bytes both ways, and the search path is the only place an oversized payload was reproduced. "Every subcommand has it" is an inference from the shared exit mechanism, not a measurement, and should be confirmed per-command before being relied on.
**Fix**: stop calling `process.exit()` to end a command — set `process.exitCode` and let the event loop drain. This is also what the project rule already requires ("do not use any method which may block the running code to achieve the function of outputting logs"). Bounding the output is a separate, still-worthwhile change, not the fix for this.
**Interaction with the sibling task**: after this lands, `--format md` on an Ollama search (`content` 835–25,804 chars) stops being truncated at 65,536 — the full body reaches the pipe. Lengthening the md output must not be done in the same change as the exit fix, or the two effects cannot be told apart when verifying.
