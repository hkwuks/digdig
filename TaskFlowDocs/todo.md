# Todo

## Add DeepSeek Search API as a search provider

- ID: TF-20261017-d5d5af
- Status: done
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-10-17
- Goal: Add DeepSeek Search API as a search provider
- Task: `TaskFlowDocs/achieved/2026-10-17-deepseek-search-provider/`
- Next action: None — completed and archived.

## Fix the stale Ollama auto-fallback documentation

- ID: TF-20261017-437d95
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-10-18
- Goal: Four files (originally recorded as two) claim sxng auto-falls back to Ollama web search when SearXNG is unavailable. That behavior does not exist. Verified 2026-10-18 against the merged `main` build: with `ollamaApiKey` configured, `baseUrl` pointed at a dead server, and no `-e` flag, `sxng "rust async runtime"` returns `SEARCH_FAILED` / "Search failed: Bad Gateway", `retryable: true`, exit 1 — Ollama is never called. The resolution is documentation, not code. Six lines across those four files: `cli/src/init.ts:151` (the user-facing message) plus the `--- Ollama (Fallback Search) ---` heading at :150 and the `// Configure Ollama (fallback search)` comment at :149; `README.md:984` and `README.zh-CN.md:974` ("optional fallback backend" / "可选备用搜索后端"); and `cli/src/ollama-service.ts:5`, whose header still says "so it can serve as a drop-in fallback".
- Task: Not promoted.
- Next action: Doc-only. Reword all six lines to describe `-e ollama` as a second backend selected explicitly, not an automatic fallback. Consider folding in the two adjacent `engines-list` items below.

### Correction to how this entry was originally written

It said "no catch/fallback exists around the three `service.search` call sites". The count was right when written — commit `8e95fad` (which introduced Ollama, 2026-08-05) had three, at the caller level, and none of them caught a failure to retry elsewhere. But PR #3's refactor collapsed them to **one** (`runCli.ts:437`, inside `searchOneQuery`), so "three sites" now describes code that no longer exists. The claim is still false, for a simpler reason: there is no fallback path anywhere, at any site count. `grep -rn "service\.search" cli/src/` returns exactly that one line.

### The `-e ollama` without a key question — confirmed

Verified in a clean cwd (its own `sxng.config.json`, `OLLAMA_API_KEY` and `DEEPSEEK_API_KEY` unset, so the home config's `ollamaApiKey` does not apply): `-e ollama` returns `PROVIDER_NOT_CONFIGURED` with the Ollama-specific hint, `retryable: false`, **exit 1** — identical in shape to `-e deepseek`. Both are correct. Note the home config at `~/sxng-cli/sxng.config.json` has a real `ollamaApiKey`, so any test run from this machine's project directories silently uses it and cannot exercise this path; `env -u` is not enough, the config file has to be out of scope too.

### Two smaller `--engines-list` defects found alongside

Both are in `runCli.ts:1669-1697`, found while verifying the above, and neither is a fallback issue — but they live in the same handful of lines the doc fix touches, so folding them in is cheaper than a third entry.

**The CLI reports success while the server is unreachable.** `getEngines()` swallows the HTTP failure, logs `Failed to fetch engines: Request failed with status code 502` to stderr, and returns `[]` (`service.ts:87-90`). `--engines-list` then sees an empty list, notices a configured provider, and emits `status: "ok"` with **exit 0** — verified with `baseUrl` pointed at a dead server. The error lands on stderr and the envelope reports success, so an Agent reading stdout cannot tell the server was down.

**`source: 'server'` is a lie when the entries are local.** The list is `serverEngines ++ configuredProviders` (`runCli.ts:1683`), but the `source` field is hardcoded `'server'`. With a dead SearXNG and only a configured provider, the output is `{"engines": ["ollama"], "source": "server"}` — an entry that did not come from the server, labelled as if it did. Either the label should distinguish the two origins or the field should go.

## F5 — Reclassify search errors by cause

- ID: TF-20261017-4f3dbb
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up:F5
- Added: 2026-10-17
- Updated: 2026-10-18
- Goal: The `runSearch` top-level catch (`runCli.ts:880-891`) marks every failure `retryable: true` with `hint: 'Check your network connection and SearXNG server status'`, so a real DeepSeek 401 is reported as retryable and blamed on the wrong subsystem. Give provider errors a discriminable type (the repo already has `SessionStateError` with a `code` field) and let the catch derive `retryable` and `hint` from it.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

### Verified 2026-10-18 against the merged `main` build

A real DeepSeek 401 (invalid key, live endpoint) returns:

```json
{ "status": "error", "error": { "code": "SEARCH_FAILED",
  "message": "DeepSeek search failed: HTTP 401 Authorization Required",
  "retryable": true },
  "hint": "Check your network connection and SearXNG server status" }
```

Two things wrong: an auth failure is not retryable, and SearXNG is not involved. A genuine network failure (unreachable `baseUrl`) returns the same envelope, so today the two are indistinguishable — which is the actual defect, not just the wording.

### The same path loses the provider name entirely for Ollama

`-e ollama` with an invalid key yields `message: "Request failed with status code 401"` — no provider named, and the hint again points at SearXNG. `DeepSeekService` wraps its errors (`DeepSeek search failed: …`, `deepseek-service.ts:58,60`); `OllamaService` does not wrap at all, so the caller gets raw axios text. Any fix that derives `retryable`/`hint` from a typed error should cover both providers, and the missing wrap on the Ollama side is part of the same change.

## F6 — Apply RRF fusion to merged multi-provider results

- ID: TF-20261017-25e067
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up:F6
- Added: 2026-10-17
- Updated: 2026-10-18
- Goal: In the single-query path, `-e deepseek,google` concatenates provider results ahead of SearXNG results without ranking; RRF only runs for `--queries` and `--session`. Decide the ordering strategy, and consider feeding DeepSeek's `rerank_score`/`authority` in as the provider-side signal.
- Task: Not promoted.
- Next action: Clarify and promote when ready.

### Verified 2026-10-18 against the merged `main` build

`-e ollama,360search` returns 16 results in strict blocks — the 10 provider results first, then the 6 SearXNG ones — with **no `fusionScore` on any of them**, confirming the single-query path does no fusion. `mergeResponses` (`runCli.ts:447-463`) is a plain `flatMap` over `[...providerResponses, sxngResponse]`, so block order is structural, not ranked.

Measured with `ollama` as the provider stand-in, since no `DEEPSEEK_API_KEY` is available. The merge code is provider-generic (`EXTERNAL_PROVIDERS`), so `-e deepseek,google` takes the same path; only the ordering *within* the provider block differs, and that block is passed through in provider-returned order either way. The DeepSeek-specific part of this entry — whether `rerank_score`/`authority` should supply a ranking signal — remains unmeasured and needs a key.

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
- Updated: 2026-10-18
- Goal: Configure the GitHub repo with code standards, a contribution flow, and CI: `CONTRIBUTING.md` (branch prefixes, commit format, PR flow), `CODE_STYLE.md`, PR and issue templates, `CODEOWNERS`, and GitHub Actions running build + tests on push and PR. Note: TaskFlow's merge driver and `todo-merge-audit` check expect a `.github/workflows/hooks.yml` job (see `TaskFlowDocs/repository-docs/index.md`).
- Task: Not promoted.
- Next action: Clarify and promote when ready.

### Two things the CI job has to solve, found 2026-10-18

**The repo is not installable as checked out.** `cli/.gitignore` ignores `node_modules/` and there is no root `.gitignore`, but `node_modules/` exists at the repo root (102 MB) and is untracked — so a fresh clone has no root dependencies at all. `cli/sxng.config.example.json` and `README.md` both sit above the only package. Decide where the package root actually is (and whether the stray root `node_modules/` was ever meant to exist) before writing a workflow that runs `npm ci` — otherwise the job's first step is already ambiguous.

**`npm test` cannot run in the main checkout as it stands.** `npm run build` (plain `tsc`) succeeds, but `npm test` (`vitest`) fails at startup with `Cannot find module '.../rolldown-binding.linux-x64-gnu.node'`: `cli/node_modules/@rolldown/` holds only `binding-win32-x64-msvc`, i.e. Windows binaries installed from a Windows shell. The WSL worktree has the correct `binding-linux-x64-gnu`. This is an environment fact, not a code defect — but a CI job on Linux will pass while a local Windows/WSL mixed checkout fails, which is worth stating explicitly so it is not mistaken for a code failure later.

**`TaskFlowDocs/repository-docs/index.md` is not tracked.** TaskFlow's contract is that this index *is* committed while `personal.md` beside it is not, and the host hook maintains it. `git ls-files TaskFlowDocs/repository-docs/` returns nothing, so the routing record every session reads exists only on this machine. It also still lists `CODE_STYLE.md` as `missing`, which is what this task is for. Commit it as part of the governance work — and note its `Exists: local` row for the personal rule is deliberately not a committed fact.

## Search-time body content is discarded before the session sees it

- ID: TF-20261017-d8f7b3
- Status: in_progress
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-17
- Updated: 2026-10-18
- Goal: A search provider's body content survives neither into the session nor into the Agent's view. Originally two defects; **Defect 2 was split out on 2026-10-18 (user decision) into `TF-20261018-282836`** because its root cause is the shared exit mechanism, not search. What remains here is one defect — content is dropped when the result enters the session — plus the field-mapping decision that the measurements below settle.
- Task: `TaskFlowDocs/2026-10-18-search-body-excerpt/`
- Next action: PRD/Plan 已写完并置 ready，等待用户批准 v1 后实施。

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

Direction settled 2026-10-18 by user decision; **not implemented and not yet promoted** — this entry is the promotion candidate. Add an optional `snippet?: string` to `SearchResult` (additive, non-breaking per the `api-and-interface-design` skill) for the display slot, and let `content` stay the long analysis sample. DeepSeek then maps `snippet` → `snippet` and `summary` → `content`; SearXNG and Ollama keep filling only `content` and let the display layer truncate. Do **not** map DeepSeek's `snippet` into `content`: that discards free body text and makes DeepSeek noisier than SearXNG rather than better.

Two names, deliberately: `snippet` on `SearchResult` (search-layer semantics — it is what the provider gave) and the existing `excerpt` on `SessionResult`/`SessionResultInput`. The rename happens at the one place the two layers meet, `appendSessionResults`. Reusing `excerpt` in both layers was rejected as the lesser evil — it costs nothing to spread, but puts a session-layer word into the search-layer output.

The mapping, per provider — the display slot falls back rather than being a hard requirement, so only DeepSeek has to fill it:

| sxng field | role | DeepSeek | SearXNG | Ollama |
| --- | --- | --- | --- | --- |
| `snippet?` (new, optional) | display: one short query-relative blurb | `snippet` | `content` (already 101–180) | `content` (truncated by the display layer) |
| `content` | analysis: the longest body text available | `summary` | `content` (same value) | `content` |
| `publishedDate` | | `date` | `publishedDate` | — |
| `score` (0–1) | | not mapped | `score` | — |

Display layer reads `snippet ?? truncate(content)`. Both writers must change: `formatAsMarkdown` (`runCli.ts:70`) and the pending-list preview (`runCli.ts:1644`).

Unmapped DeepSeek fields deliberately left out: `rerank_score` (0–3) and `authority` (0–4) — different scale from the existing 0–1 `score`; `site_name`, `site_icon`.

### Defect 1 — content is dropped when the result enters the session

`inferredContentType` (`session.ts:182-185`) resolves to `'extracted'` only when `content` is a string **and** `extractedAt` is a number; a search provider result has neither, so it resolves to `'search'`, and `makeResult` (`session.ts:200-203`) then `delete`s `content`, `extractor` and `extractedAt`. `excerpt` is a field on `SessionResultInput` that `makeResult` does not delete, but nothing writes it for a search result either — and **no code anywhere reads `excerpt`** (verified: every `excerpt` reference in `src/` is a declaration or a write — `results-add.ts:54,75`, `session.ts:420-421,599`, `extractor.ts`; neither `runCli.ts` nor any output path touches it). Writing it without a consumer would just move the discard.

Verified 2026-10-18 against a live SearXNG: `node dist/index.js "rust async runtime tokio" -e 360search --session /tmp/sess-probe` stored 5 results, each `contentType: search`, `content` and `excerpt` both **absent (not empty)**, and the stray `excerpt len: 0` in the earlier record was my probe printing `(r.excerpt || '').length` on a field that does not exist. `content` is genuinely non-empty at the provider (101–180 chars) and is dropped by `makeResult`.

Consequences, all verified in `src/`: `graphPreprocess` takes its bodies from `results.filter(hasVerifiedContent)` (`graph-preprocess.ts:38`), so everything that feeds `computeTfIdf` / `buildCoOccurrence` / `computeCrossResultFrequency` — plus `tfidf.ts:71` and `co-occurrence.ts:42,109`'s own `filter(r => r.content)` — sees only extracted results, and an `extract` pass is mandatory before a search result can influence the graph at all. `hasVerifiedContent` (`session.ts:300-309`) requires `contentType === 'extracted'` **and** a non-empty `extractor` string, so a search result that keeps its body cannot enter that set without also claiming an extractor. And `computeContentDepth` (`quality-assess.ts:68-76`) likewise measures only `r.content` present, returning `value: 0, pass: false` whenever none exist, which makes the threshold of 150 vacuous on a search-only session.

The tier decision (settled 2026-10-18, user decision): **search-time bodies persist as `excerpt`, not at the extracted tier.** `hasVerifiedContent` is left alone, so a provider body stays visibly unverified and cannot become citation-grade. This does mean `excerpt` needs its missing consumer built in the same change — a search body landing somewhere nothing reads would just be the current discard, renamed.

This is already the convention on the import path, so the change is bringing the native path in line rather than inventing a slot: `results-add --kind search` writes `excerpt` from the imported item (`commands/results-add.ts:54`) while deliberately keeping the body out of `content`, and `extractor.ts` fills `excerpt` from the page description for extracted results (`extractor.ts:158,172`).

Why not the extracted tier, which would light up every downstream analysis at once: `hasVerifiedContent` (`session.ts:300-309`) requires `contentType === 'extracted'` **and** a non-empty `extractor` string, so a search result could only enter that set by claiming an extractor that does not exist. And that set is not merely an analysis pool — evidence claims cite `result.content` by **character offset** and re-check the quote against it (`commands/evidence.ts:117-128` — `RESULT_NOT_APPROVED`, `OFFSET_OUT_OF_RANGE`, `QUOTE_MISMATCH`, `HASH_MISMATCH`), and `resolveApprovedContent` (`claims/deterministic-checks.ts:43-52`) resolves a claim's source the same way. Promoting a provider summary there would put a hash-verified citation on a text that is not the page it names. That is the reason `contentType` is worth keeping as a verification marker rather than redefining as provenance.

### Defect 2 — `process.exit()` truncates piped stdout at 65,536 bytes

> **Split out 2026-10-18 (user decision) into `TF-20261018-282836`.** The measurements stay here as the record of how the root cause was found; that entry is the one to promote.

Reading `sxng ... -e ollama --format json` through a pipe yields exactly **65,536 bytes** and invalid JSON; redirecting to a file yields the full output. `--format md` truncates at the same threshold.

**Root cause found 2026-10-18, and it is not the reader.** The earlier note in this entry — that "the observed threshold depends on the reader's buffer size" — is wrong. It is `process.exit()`. Minimal reproduction with no sxng involved:

```
console.log('x'.repeat(200000)) + process.exit(0) | pipe   → 65536   (truncated)
console.log('x'.repeat(200000)) + natural exit    | pipe   → 200001  (intact)
console.log('x'.repeat(200000)) + process.exit(0) > file   → 200001  (intact)
```

Identical through `wc -c`, `cat > file`, and a Node reader, so it is not the consumer. `process.exit()` terminates before Node flushes the stdout write buffer; when stdout is a pipe the kernel takes only what fits (65,536 = this machine's pipe capacity), and to a file it is written synchronously so nothing is lost. 65,536 was a property of the machine's pipe, never of the caller.

`sxng` calls `process.exit` on essentially every path — 47 occurrences across `cli/src/`, 45 of them in `runCli.ts`, of which 23 are the `process.exit(code)` that ends a subcommand, including right after `runSearch` returns (`runCli.ts:1748`). So the mechanism is available to every command; it only shows on output larger than the pipe buffer.

Be precise about the reach, though: no subcommand was *observed* truncating — `session-report` on a small session measures 2,647 bytes both ways, and the search path is the only place an oversized payload was actually reproduced. The claim that "every subcommand has it" is an inference from the shared exit mechanism, not a measurement. The repro above is what establishes it; it should be confirmed per-command before being relied on.

**Fix**: stop calling `process.exit()` to end a successful command — set `process.exitCode` and let the event loop drain, which is also what the project rule forbids anyway ("do not use any method which may block the running code to achieve the function of outputting logs"). Bounding the output is a separate, still-worthwhile change, not the fix for this.

**Impact**: provider-dependent only in that it takes a big response to notice. Ollama crosses it; SearXNG and DeepSeek did not in the measurements above, but any provider can cross it on a longer query or a higher `--limit`. A caller that pipes `sxng` — the common case for an Agent — gets silently truncated, unparseable JSON. The mechanism is not search-specific: it applies to any command whose output exceeds the pipe buffer, since they all end in `process.exit`. (`session-report` on a small session measures 2,647 bytes both ways, so no subcommand was *observed* truncating — the repro above is what establishes the reach.)

## SearXNG results reach the session with an empty excerpt (resolved — probe artifact)

- ID: TF-20261018-1b6064
- Status: cancelled
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-18
- Updated: 2026-10-18
- Goal: Resolved 2026-10-18 — not a separate defect. Nothing is lost between `SearchResult` and the stored `SessionResult` beyond what `TF-20261017-d8f7b3` already records: `makeResult` deletes `content` for `contentType: 'search'` and nothing writes `excerpt`. The "excerpt len 0" that motivated this entry came from a probe printing `(r.excerpt || '').length` on a field that does not exist on a search result; a re-run on a live SearXNG shows both `content` and `excerpt` absent. Folded into `TF-20261017-d8f7b3` rather than deleted.
- Task: Not promoted.
- Next action: None — superseded by `TF-20261017-d8f7b3`.

## Documented default timeout contradicts the code

- ID: TF-20261018-7c4e12
- Status: inbox
- Priority: low
- Owner: Claude
- Source: follow-up
- Added: 2026-10-18
- Updated: 2026-10-18
- Goal: `SEARXNG_TIMEOUT`'s documented default disagrees with what the CLI actually uses. `DEFAULT_CONFIG` sets `timeout: 10000` (`cli/src/config.ts:38`) and that is the effective value — verified by importing `config.js` from a cwd whose config file omits the field. But `README.md:981` and `README.zh-CN.md:971` both publish `30000`, and `cli/sxng.config.example.json:9` ships `"timeout": 30000`. A user copying the example gets 30s; a user reading the README's "default" column believes 30s is the default when it is not. `CLAUDE.md` (untracked, local) says `10000`, matching the code — possible evidence the code is the intended side and the example was edited later.
- Task: Not promoted.
- Next action: Decide whether 10000 or 30000 is intended, then align the code default, the example config, and both README tables. Update the local `CLAUDE.md` too if it moves.

## Sync the DeepSeek provider into the sxng skill docs

- ID: TF-20261017-83df6c
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-17
- Updated: 2026-10-18
- Goal: The `-e deepseek` provider shipped in PR #3 is absent from the skill. Verified line by line on `main` (2026-10-18): `skills/sxng/SKILL.md:85` (`--engines-list` — "includes ollama if configured"), `:94` (`-e` help — "use `ollama` for Ollama web search"), and `:348` (the Ollama key/env paragraph, written as if it were the only external provider) all omit `deepseek`. `skills/sxng/references/pipeline.md:33` lists only the Ollama L1 backend row. `skills/sxng/references/appendix.md:76` names only ollama/tavily/exa as switch-to backends.
- Task: Not promoted.
- Next action: Rewrite the listed sites to cover both external providers symmetrically.

### Two additions the skill also needs

**`PROVIDER_NOT_CONFIGURED` changes the L1 fallback guidance.** `SKILL.md:140` tells the Agent to switch backends when one fails (`sxng -> tavily -> exa`), and `appendix.md:76` repeats it. But `-e ollama` or `-e deepseek` without a key is *not* a backend failure to route around — it is a usage error that exits 1 with a config hint, and the correct response is to drop the `-e` flag or configure the key, not to switch to tavily. Say so where that guidance lives.

**`SKILL.md:348` also understates the Ollama activation rule.** It says `ollama` appears in `--engines-list` when `ollamaApiKey` is configured — true, but the same line should note that a *bare* `-e ollama` on a machine without the key now hard-fails rather than falling back, which is the `PROVIDER_NOT_CONFIGURED` behavior above. Same for `deepseek`.

## SearXNG results reach the session with an empty excerpt: results.json shows cont

- ID: TF-20261018-1b6064
- Status: cancelled
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-18
- Updated: 2026-10-18
- Goal: Duplicate of the entry above (same ID, created by `hooks/task intake` when the long goal was used as the heading). The heading was then shortened by hand and re-added, leaving both copies. Both copies are now `cancelled` — the underlying question turned out to be a probe artifact and is recorded in `TF-20261017-d8f7b3`. Cancelled rather than deleted: the merge driver's invariant is that a Todo entry is never dropped.
- Task: Not promoted.
- Next action: None — see `TF-20261017-d8f7b3`.

## Stop `process.exit()` from truncating piped stdout

- ID: TF-20261018-282836
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-18
- Updated: 2026-10-18
- Goal: No command's piped stdout is silently truncated. `process.exit()` terminates the process before Node flushes the stdout write buffer, so when stdout is a pipe the kernel keeps only what fits — 65,536 bytes on this machine — and a piping Agent receives cut-off, unparseable JSON. **Split out of `TF-20261017-d8f7b3` on 2026-10-18** (user decision): it was recorded there as that entry's "Defect 2", but its root cause is the shared exit mechanism, not search, and none of the field-mapping work touches it.
- Task: Not promoted.
- Next action: Promote when ready. Measurements, the minimal reproduction and the fix are recorded in `TF-20261017-d8f7b3` → `### Defect 2`; copy that section into this task's PRD when it is promoted.

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
