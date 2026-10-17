# Todo

## Add DeepSeek Search API as a search provider

- ID: TF-20261017-d5d5af
- Status: in_progress
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: Add DeepSeek Search API as a search provider
- Task: `TaskFlowDocs/2026-10-17-deepseek-search-provider/`
- Next action: Complete PRD / Spec / Plan and request approval.

## Fix the stale Ollama auto-fallback documentation

- ID: TF-20261017-437d95
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: `init.ts:151` and README claim sxng falls back to Ollama web search when SearXNG is unavailable, but no catch/fallback exists around the three `service.search` call sites, so that behavior never existed. Also confirm the `-e ollama` without a key path now reports PROVIDER_NOT_CONFIGURED consistently with `-e deepseek`.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## F5 — Reclassify search errors by cause

- ID: TF-20261017-4f3dbb
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up:F5
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: The `runSearch` top-level catch marks every failure `retryable: true` with a SearXNG/network hint, so a real DeepSeek 401 is reported as retryable and blamed on the wrong subsystem. Give provider errors a discriminable type (the repo already has `SessionStateError` with a `code` field) and let the catch derive `retryable` and `hint` from it.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## F6 — Apply RRF fusion to merged multi-provider results

- ID: TF-20261017-25e067
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up:F6
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: In the single-query path, `-e deepseek,google` concatenates provider results ahead of SearXNG results without ranking; RRF only runs for `--queries` and `--session`. Decide the ordering strategy, and consider feeding DeepSeek's `rerank_score`/`authority` in as the provider-side signal.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## Rename sxng-cli to digdig

- ID: TF-20261017-20f05a
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: Rename the project to `digdig` and publish under the npm package `digdig` (https://www.npmjs.com/package/digdig). Scope to settle: `package.json` `name`/`bin` (`sxng` → `digdig`, and whether a `sxng` alias is kept), README/README.zh-CN/CLAUDE.md/skills references, the repository URL, the placeholder already staged at `npm-reserve-digdig/`, and a deprecation path for the existing `sxng-cli` package.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## Add repository governance and CI

- ID: TF-20261017-bfc96d
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: Configure the GitHub repo with code standards, a contribution flow, and CI: `CONTRIBUTING.md` (branch prefixes, commit format, PR flow), `CODE_STYLE.md`, PR and issue templates, `CODEOWNERS`, and GitHub Actions running build + tests on push and PR. Note: TaskFlow's merge driver and `todo-merge-audit` check expect a `.github/workflows/hooks.yml` job (see `TaskFlowDocs/repository-docs/index.md`).
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## Search-time body content is discarded before the session sees it

- ID: TF-20261017-d8f7b3
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: A search provider's body content never reaches the session. `makeResult` (`session.ts:200-203`) deletes `content` whenever `contentType` resolves to `'search'`, and nothing writes `excerpt` either; verified empirically — `-e 360search --session X` stores results with `has content: false, excerpt len: 0`. Consequences: `hasVerifiedContent` (requires `contentType === 'extracted'`) excludes every search result from approval and from `graph-preprocess`; and `computeContentDepth` (`quality-assess.ts:68-76`) measures only extracted bodies, returning `value: 0, pass: false` whenever none exist. DeepSeek's `summary` (measured 3171–5075 chars) is already fetched and paid for per request, then dropped. Decide whether search-time bodies should persist as `excerpt` or enter at the extracted tier, and what that means for the contentDepth threshold of 150.
- Task: Not promoted.
- Next action: Clarify and promote when ready.
