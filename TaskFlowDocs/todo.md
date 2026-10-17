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
