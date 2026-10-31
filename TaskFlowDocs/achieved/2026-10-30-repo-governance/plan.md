# Plan — Add repository governance and CI
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md` — boundaries per document, CI contract, PR template contract, decisions and rejected alternatives.

## Reference Pointers

- `TaskFlowDocs/todo.md` → `TF-20261017-bfc96d` — the intake entry, including the stale `hooks.yml` sentence this task corrects.
- `TaskFlowDocs/repository-docs/index.md` — routing record; three rows move from `missing` to `ready` here.
- `git log --format='%s' --all` — the 57 `feat:` / 8 `chore:` / 4 `refactor(deep):` prefixes the commit contract is derived from.
- `git log --graph` on `1ec86af`, `9816f2f` — merge commits are preserved, not squashed.
- `gh pr view 7,13,14` — the five-section PR body structure.
- `cli/package.json` — `engines.node >=18.0.0`, no `lint` or `format` script, single lockfile at `cli/package-lock.json`.

## Related Tasks

- Sibling by intake order, running concurrently: `2026-10-30-stdout-flush` (`TF-20261018-282836`) in `.worktrees/2026-10-30-stdout-flush`. It changes `cli/src/runCli.ts` and `cli/src/entry.ts`. This task adds only new files plus two metadata edits, so the two diffs cannot collide. Both branches are cut from `origin/main` @ `2fbc8ac`; whichever merges second rebases only on the shared `todo.md`.
- No parent task. `TF-20261017-bfc96d` was a standalone inbox entry.

## Skills / Tools Used

- [PRD] `agent-skills:spec-driven-development` — PRD framing, and the "derive policy from the repository, never fabricate" constraint.
- [Spec] `agent-skills:documentation-and-adrs` — document boundaries, one authoritative source per subject.
- [Plan] `agent-skills:planning-and-task-breakdown` — the step breakdown and its checkpoints.
- [Test] Unaided — considered: "testing strategy". This task adds documents and CI config; the verification is file existence, YAML parsing, `repository-check`, and a real workflow run, not a code test.

## Preconditions

- Base: `origin/main` @ `2fbc8ac`. Branch `chore/2026-10-30-repo-governance` in `.worktrees/2026-10-30-repo-governance`.
- Baseline confirmed in this worktree before any edit: `npx vitest run` → 37 files / 519 tests passing.
- `cli/node_modules` is symlinked from the main checkout and git-excluded; not part of this change.
- The measured facts the documents will cite are recorded in `prd.md` → Background and reproduce with the commands in `spec.md` → Validation.

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-31 00:04 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — `CODE_STYLE.md`

- Goal: state the code conventions this repository actually follows, each one traceable to a measurement, and say plainly that there is no linter.
- Dependencies: none.
- Files: `CODE_STYLE.md` (new)
- Implementation checklist:
  - [x] Indentation: 4 spaces for TypeScript, 2 for YAML — with the reason the two differ (different languages, different conventions).
  - [x] Quotes: single, with the double-quote cases the source already contains.
  - [x] Semicolons; ESM-only; `NodeNext` module resolution.
  - [x] Naming: existing forms only (`SearXNGService`, `buildPendingReport`, `resultUrlKey`) — describe, do not invent a scheme.
  - [x] Comments: English, explain why not what — with one real example from the source.
  - [x] Tests: vitest, directory layout, `npx vitest run`, note that no network is required because axios is mocked.
  - [x] A short section stating there is no lint/format tool, and what that means in review.
  - [x] Every claim checked against `prd.md` Background before the file is saved.
- Acceptance: AC5 — no statement that fails a one-command check.
- Verification: re-derive each numeric claim with the commands recorded in `prd.md`; `grep` for `lint` confirms the "no linter" paragraph is accurate.
- Rollback: delete the file.
- Status: done

### Step 2 — `CONTRIBUTING.md`

- Goal: the collaboration contract — branch, commit, PR, merge — derived from 14 merged PRs and 11 branch names rather than from preference.
- Dependencies: Step 1 (cross-references `CODE_STYLE.md` instead of restating it).
- Files: `CONTRIBUTING.md` (new)
- Implementation checklist:
  - [x] Branch naming: `<type>/<slug>`, with the date-prefixed form noted as the current practice and the older form noted as still present in history.
  - [x] Commit format: `<type>(<scope>): <中文祈使句>`, type list matched to what history uses, body in Chinese as the history does.
  - [x] PR flow: branch → commits → PR → review → merge commit preserved.
  - [x] PR body: the five sections, with "验证" stated as required and as commands+output, not a claim.
  - [x] Pointer to `CODE_STYLE.md` and to the CI workflow; do not duplicate either.
  - [x] Build/test commands as they actually are: `cd cli && npm run build`, `npm test`.
- Acceptance: AC1 (file exists); every named command exists in `cli/package.json`.
- Verification: run each command named in the document.
- Rollback: delete the file.
- Status: done

### Step 3 — PR and Issue templates, `CODEOWNERS`

- Goal: `.github/` exists with the review-surface files.
- Dependencies: Step 2 (the PR template body is the one `CONTRIBUTING.md` describes).
- Files: `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/CODEOWNERS` (all new)
- Implementation checklist:
  - [x] PR template headings are exactly the five in `spec.md`.
  - [x] Bug report asks the four things the spec settled on; no invented fields.
  - [x] Feature request stays equally minimal.
  - [x] `CODEOWNERS` maps `*` to `@hkwuks` — the `author` in `cli/package.json` and the repo owner.
- Acceptance: AC1; PR template headings match `spec.md` word for word.
- Verification: `diff` the headings against the spec; `gh api repos/hkwuks/digdig --jq .owner.login` to confirm the handle.
- Rollback: delete `.github/`.
- Status: done

### Step 4 — CI workflow

- Goal: every push to `main` and every PR runs build and tests, with the Node versions the published package claims to support covered by at least a build check.
- Dependencies: Steps 1–3 (the workflow is the automation of what those documents say).
- Files: `.github/workflows/ci.yml` (new)
- Implementation checklist:
  - [x] Triggers: `push` on `main`, all `pull_request`.
  - [x] Two jobs, split by what each Node line can actually do:
    - `build` on 18.x / 20.x / 22.x — `npm ci` + `npm run build`.
    - `test` on 20.x / 22.x — `npm ci` + `npm test`.
  - [x] `actions/setup-node` with `cache: npm` and `cache-dependency-path: cli/package-lock.json` — the lockfile is not at the repo root.
  - [x] Steps run with `working-directory: cli`.
  - [x] No lint step — there is no linter.
  - [x] Action versions pinned to major tags (`@v4`), no floating `@main`.
- Acceptance: AC3 (valid YAML); AC4 (a real run succeeds, or the failure is recorded truthfully).
- Verification: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`; after push, `gh run list`.
- Rollback: delete the file.
- Status: done

**Deviation (2026-10-31, user chose option A)**: the first run failed on `node 18.x` at the `Test` step. The cause is the test runner, not this codebase: `vitest@4.1.8` declares `engines.node = ^20.0.0 || ^22.0.0 || >=24.0.0`, and its `rolldown` dependency needs `^20.19.0` for `node:util`'s `styleText`. `Build` and `Install` passed on 18. A built `dist/` was then run under Node 18.20.8 and completed a real search successfully, so `engines: >=18.0.0` is true for the runtime and false only for the development toolchain. Deleting the 18 leg would have removed the only check on a promise the published `npm` package makes, so the jobs are split instead: 18 keeps its build check, and tests run where a runner exists.

### Step 5 — Index and Todo correction

- Goal: the routing record stops reporting the documents as missing, and the stale `hooks.yml` requirement is removed from the intake entry.
- Dependencies: Steps 1–4 (the files must exist before the index says they do).
- Files: `TaskFlowDocs/repository-docs/index.md`, `TaskFlowDocs/todo.md`
- Implementation checklist:
  - [x] `CONTRIBUTING.md`: `no` / `missing` → `yes` / `ready`.
  - [x] `CODE_STYLE.md`: same.
  - [x] `README.md` row untouched; `ROADMAP.md` stays `missing` (explicitly out of scope).
  - [x] `TF-20261017-bfc96d` Goal: drop the sentence claiming TaskFlow expects `.github/workflows/hooks.yml` — `index.md` never mentioned it and this repo holds no TaskFlow hook scripts. State the correction in the same entry's note rather than silently deleting the words.
- Acceptance: AC2 (`repository-check` reports both `present`); AC6.
- Verification: `bash hooks/repository-check .`; `grep -n hooks.yml TaskFlowDocs/todo.md` → no hit.
- Rollback: `git checkout -- TaskFlowDocs/`.
- Status: done

## Checkpoints

- **After Step 2** — `repository-check` clears its two blocking documents. If it still reports `needs`, the files are in the wrong place (it checks the repository root, and this worktree's root is the worktree).
- **After Step 4** — YAML parses and the workflow's steps match what `CONTRIBUTING.md` tells a contributor to run. A mismatch here means one of the two documents is wrong.
- **After Step 5** — every AC demonstrated. Then push and confirm the CI run, since AC4 cannot be satisfied before the branch exists on the remote.

## Verification / Review

全部在 `chore/2026-10-30-repo-governance` 上实测（PR #16，已合并为 `526a485`）。

### AC1 — 七份文件存在

```
CONTRIBUTING.md                          OK
CODE_STYLE.md                            OK
.github/pull_request_template.md         OK
.github/ISSUE_TEMPLATE/bug_report.md     OK
.github/ISSUE_TEMPLATE/feature_request.md OK
.github/CODEOWNERS                       OK
.github/workflows/ci.yml                 OK
```

### AC2 — TaskFlow 认可

```
$ bash hooks/repository-check .
Document CONTRIBUTING.md: present
Document CODE_STYLE.md: present
```

### AC3 — YAML 合法

```
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
build -> ['18.x', '20.x', '22.x'] | [checkout@v4, setup-node@v4, Install, Build]
test  -> ['20.x', '22.x']         | [checkout@v4, setup-node@v4, Install, Test]
```

### AC4 — CI 实际跑通

PR #16 的 5 个 job 全绿（run `41089469692`）：

```
build (node 18.x)  pass  16s
build (node 20.x)  pass  13s
build (node 22.x)  pass  10s
test  (node 20.x)  pass  16s
test  (node 22.x)  pass  17s
```

**第一次运行在 `node 18.x` 的 `Test` 失败**，原因与代码无关：`vitest@4.1.8` 声明 `engines.node = ^20.0.0 || ^22.0.0 || >=24.0.0`，其 `rolldown` 依赖要求 `^20.19.0`。`Install` 与 `Build` 在 18 上均通过；用 Node 18.20.8 直接跑构建好的 `dist/index.js` 能完成真实搜索。按用户决定（选项 A）拆成 `build`/`test` 两个 job，`engines` 未动。详见 Step 4 的 Deviation 段。

### AC5 — 规范里没有不成立的断言

逐条复核过：

| 声明 | 复核命令 | 结果 |
|---|---|---|
| 没有 lint 工具 | `grep '"lint"' cli/package.json` | 0 |
| 无 eslint/prettier 配置 | `ls .eslintrc* .prettierrc*` | 0 个 |
| `"type": "module"` | `grep '"type"' cli/package.json` | 命中 |
| `NodeNext` | `grep -c NodeNext cli/tsconfig.json` | 2 |
| `strict: true` | `grep '"strict"' cli/tsconfig.json` | 命中 |
| 依赖按字母序 | 脚本比对 `dependencies` / `devDependencies` | 均有序 |
| 4 空格缩进 | `session.ts` 212 行 4 空格 / 0 行 2 空格 | 成立 |
| 命令可用 | `npm run build` / `npm test` / `npx tsc --noEmit` | 均通过 |

**实施中纠正了一处自己写错的话**：`CONTRIBUTING.md` 初稿称 `.worktrees/` "已在 `.git/info/exclude` 里"。核实后它只在**本机**的 exclude 中，不在被跟踪的 `.gitignore` 里 —— 新 clone 不会有这一行。已改为说明它是本地约定，并给出一行补上的命令。

### AC6 — 索引已更新

`repository-docs/index.md` 三行 `no`/`missing` → `yes`/`ready`（`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`），`CODEOWNERS` 由 `optional` → `ready`。`ROADMAP.md` 仍为 `missing`（明确排除）。

### AC7 — 零代码改动

```
$ git diff --stat origin/main -- cli/
（空）
```

### AC8 — 语言与仓库一致

新文档正文用中文；命令、路径、代码示例原样。与提交历史 100% 中文的事实一致。

### 记录上的三点说明

1. **`hooks.yml` 那句更正是有意留痕的。** `grep hooks.yml TaskFlowDocs/todo.md` 仍有 1 处命中 —— 那是 `## Correction` 段本身在引述被删的原句。静默删除会让后来的人以为这条要求从未存在过。
2. **CI 拆 job 是对已批准 Plan 的工作修订**，不是版本升级：交付承诺（有 CI、跑构建与测试、覆盖 engines 下限）未变，变的是"覆盖"的实现方式。已记入 Change Log。
3. **本段是在主检出里补写的。** 实施与 `approve` 都在 `.worktrees/2026-10-30-repo-governance` 完成，那个 worktree 已随 PR #16 合并移除，其 capability 记录也随之消失；主检出因此没有该任务的 evidence，补写时按门禁给出的路径用 `task unaided` 声明了阶段。这不影响记录的真实性 —— 各阶段的能力调用在 Change Log 与 `## Skills / Tools Used` 里原本就有，且已由 `approve` 在 worktree 内核对过。

## Change Log

- v1 — plan written.
- 2026-10-31 — 首次 CI 运行在 `node 18.x` 的 `Test` 步骤失败。原因是测试运行器而非本仓库代码（`vitest@4.1.8` 要求 Node `^20`，其 `rolldown` 依赖要求 `^20.19.0`）。按用户决定（选项 A）把 CI 拆成 `build`（18/20/22）与 `test`（20/22）两个 job，`engines` 不动。同步更新 `spec.md` 的 CI 契约段、`CONTRIBUTING.md` 的 CI 段。工作修订，Task 版本保持 v1。

## Follow-ups

- `ROADMAP.md` — needs product direction from the user; excluded here.
- Lint/format tooling — deliberately excluded; `CODE_STYLE.md` states its absence so the gap is visible rather than forgotten.

## Version History

- v1 — planning.

## Todo Record

Moved verbatim from the TODO entry by `hooks/archive`, grouped by the field each block followed.

### `- Next action:`

  **Correction (2026-10-31)**: this entry used to end its Goal with "TaskFlow's merge driver and `todo-merge-audit` check expect a `.github/workflows/hooks.yml` job (see `TaskFlowDocs/repository-docs/index.md`)". That claim did not hold: `index.md` contains no mention of `hooks.yml`, and this repository holds no TaskFlow hook scripts at all (`git ls-files | grep -c hooks/` → 0). The `Hooks` workflow it described belongs to the TaskFlow plugin's own repository. The sentence was removed rather than left in the Goal, and the entry no longer asks for that job.
- 用户 2026-10-30 再次要求：需要给仓库配置规则、code style、contributing 等。实测当前状态：`.github/` 目录不存在，没有 PR 模板、没有 CODEOWNERS、没有 CI workflow；`CONTRIBUTING.md`、`CODE_STYLE.md`、`ROADMAP.md` 均缺失（`TaskFlowDocs/repository-docs/index.md` 已登记为 missing）。现有约定只能从 `git log` 反推：`type(scope): 中文摘要` + 正文，分支 `<type>/<日期>-<slug>`，合并走 GitHub PR。promote 时应把这些反推出来的实践写成文档，并让 TaskFlow 的 `repository-docs-context` hook 能识别。
### Two things the CI job has to solve, found 2026-10-18
**The repo is not installable as checked out.** `cli/.gitignore` ignores `node_modules/` and there is no root `.gitignore`, but `node_modules/` exists at the repo root (102 MB) and is untracked — so a fresh clone has no root dependencies at all. `cli/sxng.config.example.json` and `README.md` both sit above the only package. Decide where the package root actually is (and whether the stray root `node_modules/` was ever meant to exist) before writing a workflow that runs `npm ci` — otherwise the job's first step is already ambiguous.
**`npm test` cannot run in the main checkout as it stands.** `npm run build` (plain `tsc`) succeeds, but `npm test` (`vitest`) fails at startup with `Cannot find module '.../rolldown-binding.linux-x64-gnu.node'`: `cli/node_modules/@rolldown/` holds only `binding-win32-x64-msvc`, i.e. Windows binaries installed from a Windows shell. The WSL worktree has the correct `binding-linux-x64-gnu`. This is an environment fact, not a code defect — but a CI job on Linux will pass while a local Windows/WSL mixed checkout fails, which is worth stating explicitly so it is not mistaken for a code failure later.
**`TaskFlowDocs/repository-docs/index.md` is not tracked.** TaskFlow's contract is that this index *is* committed while `personal.md` beside it is not, and the host hook maintains it. `git ls-files TaskFlowDocs/repository-docs/` returns nothing, so the routing record every session reads exists only on this machine. It also still lists `CODE_STYLE.md` as `missing`, which is what this task is for. Commit it as part of the governance work — and note its `Exists: local` row for the personal rule is deliberately not a committed fact.
