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
- Updated: 2026-10-18
- Goal: A search provider's body content survives neither into the session nor into the Agent's view. Two independent defects, plus a field-mapping decision that the measurements below reframe.
- Task: Not promoted.
- Next action: Decide the `SearchResult` field shape (whether to add `snippet`), then fix the session-tier loss and the display tier.

### Measured: `SearchResult.content` is a body-text sample, not a snippet

`sxng` search results carry exactly one text field. Measured lengths:

| Provider | field feeding `content` | measured length (10 results) |
| --- | --- | --- |
| SearXNG | `content` | 101–180 chars (short, query-relative) |
| Ollama | `content` | **835–25,804** (median 8,606) — full page bodies, 94% of stdout |
| DeepSeek | `summary` | 3,171–5,075 chars (full-page abstract, not query-relative) |

So `content` de facto means "the best body-text sample this provider can give", and the scale already differs by two orders of magnitude across providers. Note DeepSeek's `summary` does **not** need `need_content` — it is returned by default at no extra request; `need_content` only adds a longer full text on top.

Consumers split into two incompatible groups:

| Wants a | Consumers |
| --- | --- |
| short, display-oriented text | `formatAsMarkdown` (`runCli.ts:70`), preview (`runCli.ts:1644`) |
| long text for analysis | `tfidf.ts:71`, `co-occurrence.ts:42,109`, novelty (`quality-assess.ts:106`), `dedupe.ts:91` |

Candidate resolution: add an optional `snippet?: string` to `SearchResult` (additive, non-breaking per the `api-and-interface-design` skill) for the display slot, and let `content` stay the long analysis sample. DeepSeek then maps `snippet` → `snippet` and `summary` → `content`; SearXNG and Ollama keep filling only `content` and let the display layer truncate. Do **not** map DeepSeek's `snippet` into `content`: that discards free body text and makes DeepSeek noisier than SearXNG rather than better.

Unmapped DeepSeek fields deliberately left out: `rerank_score` (0–3) and `authority` (0–4) — different scale from the existing 0–1 `score`; `site_name`, `site_icon`.

### Defect 1 — content is dropped when the result enters the session

`inferredContentType` (`session.ts:182-185`) resolves to `'extracted'` only when `content` is a string **and** `extractedAt` is a number; a search provider result has neither, so it resolves to `'search'`, and `makeResult` (`session.ts:200-203`) then `delete`s `content`. `excerpt` is a field on `SessionResultInput` that `makeResult` does not delete, but **no code anywhere reads `excerpt`** — writing it without a consumer would just move the discard.

Verified: `-e 360search --session X` stores results as `contentType: search | has content: false | excerpt len: 0`.

Consequences: `hasVerifiedContent` (requires `contentType === 'extracted'`) excludes every search result from approval and from `graph-preprocess`, so an `extract` pass is mandatory before a search result can be used; and `computeContentDepth` (`quality-assess.ts:68-76`) measures only extracted bodies, returning `value: 0, pass: false` whenever none exist, which makes the threshold of 150 vacuous on a search-only session.

Decide whether search-time bodies persist as `excerpt` (and give `excerpt` a consumer), or enter at the extracted tier (and reconsider what `contentType` is actually marking — provenance or verification).

### Defect 2 — stdout is truncated at 65536 bytes, so output is silently lost

Reading `sxng ... -e ollama --format json` through a pipe yields exactly **65,536 bytes** and invalid JSON (`Unterminated string in JSON at position 65262`); redirecting to a file yields the true **106,771 bytes**. Reproduced twice. `--format md` truncates at the same threshold (65,536 via pipe vs 103,255 to a file).

Impact is provider-dependent: SearXNG search (~5,596 bytes with `-l 2`) and DeepSeek (~47,175 bytes for 10 results) stay under the limit, while Ollama (~107 KB) crosses it. Any Agent that pipes `sxng` output — the common case — gets silently truncated, unparseable JSON.

Fix options: bound the printed body text (which the `snippet` decision above would do naturally), or stop emitting the full body in the default output and point the caller at the session copy. Routing alone (stream vs file) is not a fix, since the CLI cannot control how its caller captures stdout. Note the observed threshold depends on the reader's buffer size, not on anything `sxng` sets — 65,536 is what this session's reader uses; a different caller may cut at a different point, or not at all. The defect to fix is therefore "the default output can exceed what a caller can capture", not the specific number.

## SearXNG results reach the session with an empty excerpt

- ID: TF-20261018-1b6064
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-18
- Updated: 2026-10-18
- Goal: `-e 360search --session X` stores results as `contentType: 'search'` with `excerpt` length 0, yet `SearXNGService` maps `content` from `item.content || item.snippet` (`service.ts:138`) and the provider did return non-empty content (101–180 chars). Trace where the text is lost between `SearchResult` and the stored `SessionResult` before acting on `TF-20261017-d8f7b3`, so that fix does not silently assume a value is already there.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## Sync the DeepSeek provider into the sxng skill docs

- ID: TF-20261017-83df6c
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: The `-e deepseek` provider shipped in PR #3 is absent from the skill. `skills/sxng/SKILL.md` lines 85 and 94 describe `--engines` and the `ollama` provider without `deepseek`; line 348 documents Ollama's key/env wiring as if it were the only external provider. `skills/sxng/references/pipeline.md:33` lists only the Ollama L1 backend. `skills/sxng/references/appendix.md:76` names only ollama/tavily/exa as fallback backends. Also document the new `PROVIDER_NOT_CONFIGURED` failure for `-e <provider>` without a key, which changes the L1 fallback guidance in appendix.md.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## SearXNG results reach the session with an empty excerpt: results.json shows cont

- ID: TF-20261018-1b6064
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-18
- Updated: 2026-10-18
- Goal: SearXNG results reach the session with an empty excerpt: results.json shows contentType 'search' with excerpt len 0 for -e 360search, yet service.ts maps content from item.content || item.snippet. Trace where content is lost between SearchResult and the stored SessionResult before acting on the search-time-body todo, so the two are not conflated.
- Task: Not promoted.
- Next action: Clarify and promote when ready.
