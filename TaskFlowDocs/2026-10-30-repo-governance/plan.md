# Plan — Add repository governance and CI
> Task version: v1
> Status: in_progress

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
  - [ ] Indentation: 4 spaces for TypeScript, 2 for YAML — with the reason the two differ (different languages, different conventions).
  - [ ] Quotes: single, with the double-quote cases the source already contains.
  - [ ] Semicolons; ESM-only; `NodeNext` module resolution.
  - [ ] Naming: existing forms only (`SearXNGService`, `buildPendingReport`, `resultUrlKey`) — describe, do not invent a scheme.
  - [ ] Comments: English, explain why not what — with one real example from the source.
  - [ ] Tests: vitest, directory layout, `npx vitest run`, note that no network is required because axios is mocked.
  - [ ] A short section stating there is no lint/format tool, and what that means in review.
  - [ ] Every claim checked against `prd.md` Background before the file is saved.
- Acceptance: AC5 — no statement that fails a one-command check.
- Verification: re-derive each numeric claim with the commands recorded in `prd.md`; `grep` for `lint` confirms the "no linter" paragraph is accurate.
- Rollback: delete the file.
- Status: pending

### Step 2 — `CONTRIBUTING.md`

- Goal: the collaboration contract — branch, commit, PR, merge — derived from 14 merged PRs and 11 branch names rather than from preference.
- Dependencies: Step 1 (cross-references `CODE_STYLE.md` instead of restating it).
- Files: `CONTRIBUTING.md` (new)
- Implementation checklist:
  - [ ] Branch naming: `<type>/<slug>`, with the date-prefixed form noted as the current practice and the older form noted as still present in history.
  - [ ] Commit format: `<type>(<scope>): <中文祈使句>`, type list matched to what history uses, body in Chinese as the history does.
  - [ ] PR flow: branch → commits → PR → review → merge commit preserved.
  - [ ] PR body: the five sections, with "验证" stated as required and as commands+output, not a claim.
  - [ ] Pointer to `CODE_STYLE.md` and to the CI workflow; do not duplicate either.
  - [ ] Build/test commands as they actually are: `cd cli && npm run build`, `npm test`.
- Acceptance: AC1 (file exists); every named command exists in `cli/package.json`.
- Verification: run each command named in the document.
- Rollback: delete the file.
- Status: pending

### Step 3 — PR and Issue templates, `CODEOWNERS`

- Goal: `.github/` exists with the review-surface files.
- Dependencies: Step 2 (the PR template body is the one `CONTRIBUTING.md` describes).
- Files: `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/CODEOWNERS` (all new)
- Implementation checklist:
  - [ ] PR template headings are exactly the five in `spec.md`.
  - [ ] Bug report asks the four things the spec settled on; no invented fields.
  - [ ] Feature request stays equally minimal.
  - [ ] `CODEOWNERS` maps `*` to `@hkwuks` — the `author` in `cli/package.json` and the repo owner.
- Acceptance: AC1; PR template headings match `spec.md` word for word.
- Verification: `diff` the headings against the spec; `gh api repos/hkwuks/digdig --jq .owner.login` to confirm the handle.
- Rollback: delete `.github/`.
- Status: pending

### Step 4 — CI workflow

- Goal: every push to `main` and every PR runs build and tests on the Node versions the repository claims to support.
- Dependencies: Steps 1–3 (the workflow is the automation of what those documents say).
- Files: `.github/workflows/ci.yml` (new)
- Implementation checklist:
  - [ ] Triggers: `push` on `main`, all `pull_request`.
  - [ ] Matrix: 18.x, 20.x, 22.x — 18.x is the `engines` floor, not a preference.
  - [ ] `actions/setup-node` with `cache: npm` and `cache-dependency-path: cli/package-lock.json` — the lockfile is not at the repo root.
  - [ ] Steps run with `working-directory: cli`: `npm ci`, `npm run build`, `npm test`.
  - [ ] No lint step — there is no linter.
  - [ ] Action versions pinned to major tags (`@v4`), no floating `@main`.
- Acceptance: AC3 (valid YAML); AC4 (a real run succeeds, or the failure is recorded truthfully).
- Verification: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`; after push, `gh run list`.
- Rollback: delete the file.
- Status: pending

### Step 5 — Index and Todo correction

- Goal: the routing record stops reporting the documents as missing, and the stale `hooks.yml` requirement is removed from the intake entry.
- Dependencies: Steps 1–4 (the files must exist before the index says they do).
- Files: `TaskFlowDocs/repository-docs/index.md`, `TaskFlowDocs/todo.md`
- Implementation checklist:
  - [ ] `CONTRIBUTING.md`: `no` / `missing` → `yes` / `ready`.
  - [ ] `CODE_STYLE.md`: same.
  - [ ] `README.md` row untouched; `ROADMAP.md` stays `missing` (explicitly out of scope).
  - [ ] `TF-20261017-bfc96d` Goal: drop the sentence claiming TaskFlow expects `.github/workflows/hooks.yml` — `index.md` never mentioned it and this repo holds no TaskFlow hook scripts. State the correction in the same entry's note rather than silently deleting the words.
- Acceptance: AC2 (`repository-check` reports both `present`); AC6.
- Verification: `bash hooks/repository-check .`; `grep -n hooks.yml TaskFlowDocs/todo.md` → no hit.
- Rollback: `git checkout -- TaskFlowDocs/`.
- Status: pending

## Checkpoints

- **After Step 2** — `repository-check` clears its two blocking documents. If it still reports `needs`, the files are in the wrong place (it checks the repository root, and this worktree's root is the worktree).
- **After Step 4** — YAML parses and the workflow's steps match what `CONTRIBUTING.md` tells a contributor to run. A mismatch here means one of the two documents is wrong.
- **After Step 5** — every AC demonstrated. Then push and confirm the CI run, since AC4 cannot be satisfied before the branch exists on the remote.

## Verification / Review

_(filled in after Step 5 and the first CI run)_

## Change Log

- v1 — plan written.

## Follow-ups

- `ROADMAP.md` — needs product direction from the user; excluded here.
- Lint/format tooling — deliberately excluded; `CODE_STYLE.md` states its absence so the gap is visible rather than forgotten.

## Version History

- v1 — planning.
