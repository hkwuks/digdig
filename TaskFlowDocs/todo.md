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
