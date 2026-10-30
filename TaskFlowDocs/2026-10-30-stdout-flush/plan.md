# Plan — Stop `process.exit()` from truncating piped stdout
> Task version: v1
> Status: in_progress

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
  - [ ] `process.exit(exitCode)` inside the success path becomes `process.exitCode = exitCode`.
  - [ ] `process.exit(1)` in the catch becomes `process.exitCode = 1`.
  - [ ] Keep the `console.error` in the catch; it goes to stderr and is not affected.
  - [ ] No `return` is added — `main()` has nothing after either branch.
- Acceptance: `grep -c 'process\.exit(' cli/src/entry.ts` → 0; `npx tsc --noEmit` → 0.
- Verification: `grep` count, `tsc --noEmit`, then a real CLI run piped through `cat` to confirm the process still terminates.
- Rollback: `git checkout -- cli/src/entry.ts`.
- Status: pending

### Step 2 — `cli/src/runCli.ts`: the 44 command-branch exits

- Goal: every command branch sets an exit code and returns instead of terminating the process.
- Dependencies: Step 1.
- Files: `cli/src/runCli.ts`
- Implementation checklist:
  - [ ] All 44 `process.exit(n)` calls become `process.exitCode = n`.
  - [ ] Each site already reaches a terminal statement (`return`, `}`, `});`, or `} catch (...)`), so the branches still end where they ended before — verified site by site before the edit, not assumed.
  - [ ] `return;` is added where a site is followed by a `}` that is not the end of the enclosing function, and only there. Sites whose next statement is `return`/`return;` need nothing.
  - [ ] `return 0` / `return 1` branches at the tail of `runSearch` are unchanged — they were never `process.exit`.
- Acceptance: `grep -c 'process\.exit(' cli/src/runCli.ts` → 0; no branch's exit code changes; `npx tsc --noEmit` → 0.
- Verification: `grep` count; `tsc --noEmit`; `npx vitest run` (37 files / 519 tests, unchanged); the three exit-code spot checks in Step 3.
- Rollback: `git checkout -- cli/src/runCli.ts`.
- Status: pending

### Step 3 — Prove the defect is gone, end to end

- Goal: the truncation itself is measured fixed on a real invocation, not inferred from the source change.
- Dependencies: Steps 1–2.
- Files: none (verification only).
- Implementation checklist:
  - [ ] Build a `dist` and produce an output larger than 65,536 bytes from a real command.
  - [ ] Compare `| wc -c` against `> file; wc -c` — they must be equal, and both must exceed 65,536.
  - [ ] `--format json` piped to `jq .` parses without error.
  - [ ] Exit codes: healthy path → 0; `--health` against a dead `DIGDIG_BASE_URL` → 1; `--engines-list` against a dead server → 1.
  - [ ] `dg init` still terminates (readline closes, process exits).
- Acceptance: AC2, AC5, AC6 of the PRD all pass with recorded commands and outputs.
- Verification: outputs pasted into `## Verification / Review`.
- Rollback: not applicable (no writes).
- Status: pending

## Checkpoints

- **After Step 1** — `tsc --noEmit` clean and `dg --version | cat` still terminates. One file changed; if this hangs, the keep-alive assumption is wrong and Step 2 must not start.
- **After Step 2** — full suite green at the unchanged baseline (37 / 519). This is the gate before believing the change is behavior-preserving.
- **After Step 3** — every AC demonstrated with a command and its output.

## Verification / Review

_(filled in during Step 3)_

## Change Log

- v1 — plan written.

## Follow-ups

- `TF-20261017-4f3dbb` — error classification (`retryable` / `hint` derived from error type). Adjacent in the same `catch`, but a separate contract change; not touched here.

## Version History

- v1 — planning.
