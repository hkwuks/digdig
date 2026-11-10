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
- Status: done
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-10-20
- Goal: Four files (originally recorded as two) claim sxng auto-falls back to Ollama web search when SearXNG is unavailable. That behavior does not exist. Verified 2026-10-18 against the merged `main` build: with `ollamaApiKey` configured, `baseUrl` pointed at a dead server, and no `-e` flag, `sxng "rust async runtime"` returns `SEARCH_FAILED` / "Search failed: Bad Gateway", `retryable: true`, exit 1 — Ollama is never called. The resolution is documentation, not code. Six lines across those four files: `cli/src/init.ts:151` (the user-facing message) plus the `--- Ollama (Fallback Search) ---` heading at :150 and the `// Configure Ollama (fallback search)` comment at :149; `README.md:984` and `README.zh-CN.md:974` ("optional fallback backend" / "可选备用搜索后端"); and `cli/src/ollama-service.ts:5`, whose header still says "so it can serve as a drop-in fallback".
- Task: `TaskFlowDocs/achieved/2026-10-20-dg-command-and-docs/`
- Next action: None — closed 2026-10-20; all six lines reworded under R5.

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
- Status: done
- Goal: The `runSearch` top-level catch (`runCli.ts:880-891`) marks every failure `retryable: true` with `hint: 'Check your network connection and SearXNG server status'`, so a real DeepSeek 401 is reported as retryable and blamed on the wrong subsystem. Give provider errors a discriminable type (the repo already has `SessionStateError` with a `code` field) and let the catch derive `retryable` and `hint` from it.
- Task: `TaskFlowDocs/achieved/2026-10-31-error-classification/`
- Next action: None — completed and archived.

## F6 — Apply RRF fusion to merged multi-provider results

- ID: TF-20261017-25e067
- Status: cancelled
- Priority: normal
- Owner: Claude
- Source: follow-up:F6
- Added: 2026-10-17
- Updated: 2026-10-28
- Goal: Superseded by `TF-20261028-fe548a` (2026-10-28) — 该任务的 R8 把 `-e deepseek,google` 一并纳入统一融合流水线，本条的诉求（单查询路径只拼接不排序）届时自动消失，故不再单独实施。原始描述保留如下供追溯：In the single-query path, `-e deepseek,google` concatenates provider results ahead of SearXNG results without ranking; RRF only runs for `--queries` and `--session`. Decide the ordering strategy, and consider feeding DeepSeek's `rerank_score`/`authority` in as the provider-side signal.
- Task: Not promoted.
- Next action: None — superseded by `TF-20261028-fe548a`。该任务 Step 3 已完成（2026-10-29），`-e deepseek,google` 现走统一融合流水线并输出 `fusionScore`，本条诉求已实测消失，可关闭。

### Verified 2026-10-18 against the merged `main` build

`-e ollama,360search` returns 16 results in strict blocks — the 10 provider results first, then the 6 SearXNG ones — with **no `fusionScore` on any of them**, confirming the single-query path does no fusion. `mergeResponses` (`runCli.ts:447-463`) is a plain `flatMap` over `[...providerResponses, sxngResponse]`, so block order is structural, not ranked.

Measured with `ollama` as the provider stand-in, since no `DEEPSEEK_API_KEY` is available. The merge code is provider-generic (`EXTERNAL_PROVIDERS`), so `-e deepseek,google` takes the same path; only the ordering *within* the provider block differs, and that block is passed through in provider-returned order either way. The DeepSeek-specific part of this entry — whether `rerank_score`/`authority` should supply a ranking signal — remains unmeasured and needs a key.

## Rename sxng-cli to digdig

- ID: TF-20261017-20f05a
- Status: done
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-17
- Updated: 2026-11-01
- Goal: Rename the project to `digdig` and publish under the npm package `digdig` (https://www.npmjs.com/package/digdig). Scope to settle: `package.json` `name`/`bin` (`sxng` → `digdig`, and whether a `sxng` alias is kept), README/README.zh-CN/CLAUDE.md/skills references, the repository URL, the placeholder already staged at `npm-reserve-digdig/`, and a deprecation path for the existing `sxng-cli` package.
- Task: `TaskFlowDocs/achieved/2026-10-19-rename-digdig/`
- Next action: None — completed 2026-10-19 and archived. Closed 2026-11-01 after re-verifying the scope.

### Re-verified 2026-11-01, and why the entry stayed `inbox` until now

Every item in the Goal is settled. Measured on `main` @ `8766b54`:

| Item | State |
|---|---|
| `package.json` `name` | `digdig` |
| Published package | `digdig@0.0.2` on npm |
| Old package `sxng-cli` | frozen at `1.3.3`, migration notice as commit `91e689c` |
| Repository URL / homepage | `github.com/hkwuks/digdig` |
| `README.md`, `README.zh-CN.md`, `skills/` | renamed |
| `npm-reserve-digdig/` placeholder | gone — removed after the package was secured |
| Task directory | `TaskFlowDocs/achieved/2026-10-19-rename-digdig/`, PRD and Plan both `Status: completed` |

**The `sxng` remnants are a deliberate transition, not unfinished work**, and each names its own removal condition:

- `cli/src/sxng.ts` — the pre-rename bin entry; header says "Removed in 0.5.0 along with the `sxng` entry in package.json and `legacy.ts`".
- `cli/src/legacy.ts` — reads `sxng.config.json` and the `sxng-cli/` state directory, warning on each hit that "(support is removed in 0.5.0)".
- `README.md:735` / `README.zh-CN.md:728` — tell the user the `sxng` alias exists for the transition.

This entry's metadata simply never followed its task into `achieved/`; the work itself was done on 2026-10-19. Closing it so the next reader does not conclude the rename still needs doing.

**Residual, not part of this entry**: internal identifiers in `runCli.ts` still spell the old name — `sxngResponse`, `sxngEngines` (`:342`, `:350`, `:365`, `:371-379`, `:616-618`). They are private variable names with no user-visible effect, so the rename left them; renaming them is cosmetic cleanup with no deadline.

## Add repository governance and CI

- ID: TF-20261017-bfc96d
- Status: done
- Goal: Configure the GitHub repo with code standards, a contribution flow, and CI: `CONTRIBUTING.md` (branch prefixes, commit format, PR flow), `CODE_STYLE.md`, PR and issue templates, `CODEOWNERS`, and GitHub Actions running build + tests on push and PR.
- Task: `TaskFlowDocs/achieved/2026-10-30-repo-governance/`
- Next action: None — completed and archived.

## Search-time body content is discarded before the session sees it

- ID: TF-20261017-d8f7b3
- Status: done
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-17
- Updated: 2026-10-30
- Goal: A search provider's body content survives neither into the session nor into the Agent's view. Originally two defects; **Defect 2 was split out on 2026-10-18 (user decision) into `TF-20261018-282836`** because its root cause is the shared exit mechanism, not search. What remains here is one defect — content is dropped when the result enters the session — plus the field-mapping decision that the measurements below settle.
- Task: `TaskFlowDocs/achieved/2026-10-18-search-body-excerpt/`
- Next action: None — completed and archived.

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
- Updated: 2026-10-30
- Goal: Resolved 2026-10-18 — not a separate defect. Nothing is lost between `SearchResult` and the stored `SessionResult` beyond what `TF-20261017-d8f7b3` already records: `makeResult` deletes `content` for `contentType: 'search'` and nothing writes `excerpt`. The "excerpt len 0" that motivated this entry came from a probe printing `(r.excerpt || '').length` on a field that does not exist on a search result; a re-run on a live SearXNG shows both `content` and `excerpt` absent. Folded into `TF-20261017-d8f7b3` rather than deleted.
- Task: Not promoted.
- Next action: None — superseded by `TF-20261017-d8f7b3`.

## Client request timeout must exceed the SearXNG server timeout

- ID: TF-20261018-7c4e12
- Status: done
- Goal: Reopened 2026-11-05 to reverse the direction the 2026-10-20 fix took. That fix saw `README.md`/`README.zh-CN.md`/`cli/sxng.config.example.json` publishing `30000` against `DEFAULT_CONFIG`'s `10000` and aligned the documents down to the code without asking which value was right. It picked the wrong side: `cli/src/config.ts:40`'s `timeout` is the axios request timeout for `cli/src/service.ts:141`, and a client-side timeout below the server's own is a client that hangs up while SearXNG is still working. Upstream SearXNG defaults are `outgoing.request_timeout: 2.0` / `max_request_timeout: 10.0`; this repository's own recommended `settings.yml` (`README.md:83-84`) raises them to `10.0` / `25.0`. At 10000 the client therefore ties the upstream maximum and loses to the configuration this repository tells users to run — the search fails with `NETWORK_ERROR` / `timeout of 10000ms exceeded` while the server is healthy. Reopened scope: default to 25000 in `cli/src/config.ts`, `cli/src/init.ts` and `cli/digdig.config.example.json`, update the three README tables/examples and the local `CLAUDE.md`, and raise `dg init`'s floor from 1000 to 12000 so an interactive answer cannot reintroduce a client timeout below SearXNG's default maximum.
- Task: `TaskFlowDocs/achieved/2026-11-05-request-timeout/`
- Next action: None — completed and archived.

## Sync the DeepSeek provider into the sxng skill docs

- ID: TF-20261017-83df6c
- Status: done
- Priority: normal
- Owner: Claude
- Source: follow-up
- Added: 2026-10-17
- Updated: 2026-10-20
- Goal: The `-e deepseek` provider shipped in PR #3 is absent from the skill. Verified line by line on `main` (2026-10-18): `skills/sxng/SKILL.md:85` (`--engines-list` — "includes ollama if configured"), `:94` (`-e` help — "use `ollama` for Ollama web search"), and `:348` (the Ollama key/env paragraph, written as if it were the only external provider) all omit `deepseek`. `skills/sxng/references/pipeline.md:33` lists only the Ollama L1 backend row. `skills/sxng/references/appendix.md:76` names only ollama/tavily/exa as switch-to backends.
- Task: `TaskFlowDocs/achieved/2026-10-20-dg-command-and-docs/`
- Next action: None — closed 2026-10-20; SKILL.md / pipeline.md / appendix.md now name deepseek (R9), and the `-e` without-key behaviour is unchanged and still documented as a usage error.

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
- Updated: 2026-10-30
- Goal: Duplicate of the entry above (same ID, created by `hooks/task intake` when the long goal was used as the heading). The heading was then shortened by hand and re-added, leaving both copies. Both copies are now `cancelled` — the underlying question turned out to be a probe artifact and is recorded in `TF-20261017-d8f7b3`. Cancelled rather than deleted: the merge driver's invariant is that a Todo entry is never dropped.
- Task: Not promoted.
- Next action: None — see `TF-20261017-d8f7b3`.

## Stop `process.exit()` from truncating piped stdout

- ID: TF-20261018-282836
- Status: done
- Goal: No command's piped stdout is silently truncated. `process.exit()` terminates the process before Node flushes the stdout write buffer, so when stdout is a pipe the kernel keeps only what fits — 65,536 bytes on this machine — and a piping Agent receives cut-off, unparseable JSON. **Split out of `TF-20261017-d8f7b3` on 2026-10-18** (user decision): it was recorded there as that entry's "Defect 2", but its root cause is the shared exit mechanism, not search, and none of the field-mapping work touches it.
- Task: `TaskFlowDocs/achieved/2026-10-30-stdout-flush/`
- Next action: None — completed and archived.

## Rename sxng-cli to digdig. Publish under the npm package digdig (already reserve

- ID: TF-20261019-091828
- Status: done
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-19
- Updated: 2026-10-19
- Goal: Rename sxng-cli to digdig. Publish under the npm package digdig (already reserved at https://www.npmjs.com/package/digdig, version 0.0.1, owned by hkwuks). Scope per user decision 2026-10-19: rename the identity layer (package name, bin, program.name(), README/README.zh-CN/cli/README/CLAUDE.md/skills references, skill directory name, repository/homepage/bugs URLs, plus the placeholder in npm-reserve-digdig/) AND the runtime artifacts (.sxng/ state directory, sxng.config.json, SEARXNG_* env vars, origins[].tool value) with migration code that keeps the old names working. Transition window: 5 versions. Old command name sxng and old names keep working through it with a one-line stderr deprecation notice; the old package sxng-cli is deprecated pointing at the new one. Migration code and the sxng bin alias are removed at the cut. Version line per user decision 2026-10-19: the new package starts at 0.0.2 and the cut lands at 0.5.0. Publishing to npm, deprecating sxng-cli on the registry, and renaming the GitHub repository are explicitly NOT this task: file changes only, no publish.
- Task: `TaskFlowDocs/achieved/2026-10-19-rename-digdig/`
- Next action: None — completed and archived.

## 命令名改为 dg（保留 digdig 长名与过渡期 sxng），并把项目定

- ID: TF-20261020-cfaa30
- Status: done
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-20
- Updated: 2026-10-20
- Goal: 命令名改为 dg（保留 digdig 长名与过渡期 sxng），并把项目定位从 SearXNG 的 CLI 改为多后端搜索 CLI，同时修正多份文档里的事实错误（环境变量前缀、timeout 默认值、不存在的 Ollama 自动回退、缺失的 DeepSeek 配置项、404 链接）
- Task: `TaskFlowDocs/achieved/2026-10-20-dg-command-and-docs/`
- Next action: None — completed and archived.

## 清理同步冲突残留：dist/ 下 29 个 *sync-conflict* 文件被打进已

- ID: TF-20261020-0248a8
- Status: done
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-20
- Updated: 2026-10-20
- Goal: 清理同步冲突残留：dist/ 下 29 个 *sync-conflict* 文件被打进已发布的 0.0.2 tarball，另有一个被 git 跟踪的冲突测试文件从未执行
- Task: `TaskFlowDocs/achieved/2026-10-20-sync-conflict-cleanup/`
- Next action: None — completed and archived.

## 让构建从空的 dist 开始，保证下次 npm publish 的 tarball 不再夹

- ID: TF-20261020-8f03df
- Status: done
- Priority: normal
- Owner: Claude
- Source: user-request
- Added: 2026-10-20
- Updated: 2026-10-20
- Goal: 让构建从空的 dist 开始，保证下次 npm publish 的 tarball 不再夹带历史残留（冲突副本与源码已删除的旧编译产物）
- Task: `TaskFlowDocs/achieved/2026-10-20-clean-build-dist/`
- Next action: None — completed and archived.

## 质量过滤修复：verdict 不阻断任何流程、contentDepth 分母只数

- ID: TF-20261028-313ff2
- Status: done
- Goal: 把质量「过滤」从 CLI 里退出来，改成**只报客观事实，由 LLM 判断好坏**。CLI 不引入 embedding、不做语义相似度、不给 verdict。判据：凡是需要"这算不算好"的结论，都不该由 CLI 给；凡是能数出来的事实（条数、长度、域名数、重复数、覆盖率），CLI 报准。
- Task: `TaskFlowDocs/achieved/2026-10-30-quality-facts/`
- Next action: None — completed and archived.

## 统一搜索结果身份与排序流转：URL 身份收拢到单一函数（cano

- ID: TF-20261028-fe548a
- Status: done
- Goal: 统一搜索结果身份与排序流转：URL 身份收拢到单一函数（canonicalUrl/resultKey），让 dedupe/session/graph/RRF 复用同一 key；抽取不再递增 round；RRF 前对每份 ranking 去重、append 移到融合之后，使单查询与多查询路径语义一致
- Task: `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/`
- Next action: None — completed and archived.

## dg --engines-list 在 SearXNG 不可达时仍报告 status ok 与 exit 0，且 s

- ID: TF-20261101-8ef67f
- Status: done
- Goal: dg --engines-list 在 SearXNG 不可达时仍报告 status ok 与 exit 0，且 source 字段把所有条目都标成 server
- Task: `TaskFlowDocs/achieved/2026-11-01-engines-list-exit/`
- Next action: None — completed and archived.

## 给 digdig 加 npm 自动发布：打 v* tag 触发 GitHub Actions，用 npm tru

- ID: TF-20261101-5c6346
- Status: done
- Goal: 给 digdig 加 npm 自动发布：打 v* tag 触发 GitHub Actions，用 npm trusted publishing (OIDC) 发布，零长期 token，自动生成 provenance
- Task: `TaskFlowDocs/achieved/2026-11-01-npm-automated-publish/`
- Next action: None — completed and archived.

## 修复 local-doc 索引内存预算判定的 flaky：heapUsed 采样可能为负

- ID: TF-20261101-692612
- Status: done
- Goal: 修复 local-doc 索引内存预算判定的 flaky：heapUsed 采样可能为负
- Task: `TaskFlowDocs/achieved/2026-11-01-heap-budget-negative/`
- Next action: None — completed and archived.

## 修正 CONTRIBUTING.md 的发布流程：按 main 推送权限分层，有权限

- ID: TF-20261101-19eb71
- Status: done
- Goal: 修正 CONTRIBUTING.md 的发布流程：按 main 推送权限分层，有权限直推、无权限走 PR，并说明两种情况下 tag 打在哪
- Task: `TaskFlowDocs/achieved/2026-11-01-release-permissions/`
- Next action: None — completed and archived.

## 融合结果可解释化：暴露 SearXNG 已有的 engines/positions 做 votes

- ID: TF-20261102-efa659
- Status: done
- Goal: 融合结果可解释化：暴露 SearXNG 已有的 engines/positions 做 votes 分解，并对未响应的引擎与可能失效的过滤条件显式标记
- Task: `TaskFlowDocs/achieved/2026-11-02-result-explainability/`
- Next action: None — completed and archived.

## 2026-11-02-release-tag-fix

- ID: TF-20261102-b17641
- Status: done
- Goal: 修正 CONTRIBUTING.md：npm version 在 cli/ 子目录打不出 tag，发布流程改为显式打 tag
- Task: `TaskFlowDocs/achieved/2026-11-02-release-tag-fix/`
- Next action: None — completed and archived.

## P1 — 子命令的 -f/--format 全部失效

- ID: TF-20261103-fad9a9
- Status: done
- Goal: 子命令 -f/--format 失效：根命令与 21 个子命令重复声明 -f，commander 把 flag 归给父命令，子命令 opts.format 恒为 undefined，全部回落 JSON（session-report/graph-preprocess/suggest-queries/strategy-info/claim-list/review-list/evidence-*/graph-explore/drill/traverse/search/graph-obfuscate）。仅 coverage 靠 subcommandFormat 读原始 argv 幸免
- Task: `TaskFlowDocs/achieved/2026-11-04-subcommand-format-flag/`
- Next action: None — completed and archived.

## P2 — graph-search 的 -l/--limit 失效

- ID: TF-20261103-d06a7c
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: graph-search 的 -l/--limit 失效：根命令与子命令重复声明 -l，子命令 opts.limit 恒为 undefined，回落到默认 10。实测 --keyword alpha -l 2 仍返回 10 条
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P3 — --graph <file> 是空选项

- ID: TF-20261103-1350fc
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: --graph <file> 是空选项：--help 声称保存搜索结果到图文件，参数一路传进 runSearch 的类型（runCli.ts:464/1569）却从不被读取，实测不产生任何文件。要么实现要么删除
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P4 — --session + --merge 时 merge 结果被静默丢弃

- ID: TF-20261103-f917c9
- Status: done
- Goal: --session 与 --merge 同时用时 merge 结果被静默丢弃：fuseResults 计入排序与候选池(totalResults=31)，但 onlyCurrent 过滤掉 display，appendSessionResults 只写 display，落盘 results.json 中该 URL 完全消失
- Task: `TaskFlowDocs/achieved/2026-11-09-session-merge-results/`
- Next action: None — completed and archived.

## P5 — -l abc / -l -5 静默放行

- ID: TF-20261103-bb3296
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: -l abc / -l -5 静默放行：parseInt 得到 NaN 或负数，axios 丢掉 NaN 参数，limit 无校验，实测 -l abc 返回 30 条（服务端默认）；NaN 还让融合后的 slice 变成空操作
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P6 — baseUrl 缺失时报错误导、retryable 判定错

- ID: TF-20261103-a062c7
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: baseUrl 缺失或非法时报错误导且可重试性判定错：无配置时搜索报 SEARCH_FAILED/Invalid URL 无 hint，--health 提示文字里的 URL 为空，--engines-list 与 --categories-list 对同一配置错误报不同 code，--engines-list 还标 retryable:true。应在发请求前统一报 CONFIG_MISSING
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P7 — 只读命令对不存在的会话名创建目录

- ID: TF-20261103-def17e
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 只读命令在会话名拼错时创建目录：session-report/suggest-queries/graph-preprocess/--quality 对不存在的会话 exit 0 且经 initSessionDir/mkdirSync 创建 .digdig/sessions/<name>/，session-list 随后以 createdAt:0 列出。coverage 表现正确（EMPTY_SESSION、exit 1、不建目录），其余应对齐
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P8 — 轮次计数不一致（roundsCovered 恒 0 / 计数器与 origin 不符）

- ID: TF-20261103-844d30
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 轮次计数不一致：graph-preprocess 硬编码 roundsCovered:0（graph-preprocess.ts:61），md 输出永远是 Rounds: 0；纯导入会话 appendSessionResults 用 Math.max(1,round) 写 origin round=1 但计数器 data.rounds 保持 0，coverage 显示 0 rounds 却又有 round 1 的表
- Task: 部分完成：前半（`roundsCovered` 恒 0）已由 `TaskFlowDocs/achieved/2026-11-04-subcommand-format-flag/` 修复，现读 `loadSessionRounds`。后半（纯导入会话 origin round=1 与 data.rounds=0 不一致）仍未修
- Next action: 后半需单独 promote。

## P12 — graph-explore / graph-drill 的 --seed 只认 label，不认节点 id

- ID: TF-20261105-b1e4c7
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-05-format-fix-followup
- Added: 2026-11-05
- Updated: 2026-11-05
- Goal: `--seed` 只按 label 逐字匹配，传节点 id 会报 ENTITY_NOT_FOUND：graph-explore.ts:544-558 的 findEntityByLabel 只比较 `attrs.label.toLowerCase() === lowerLabel`，`dg graph-explore <s> --seed e:entity0` 找不到图中确实存在的 e:entity0，反而提示「Entity Number 0 (distance: 11)」；而 help 文本写的是「Seed entity label」，AGENTS 消费方拿到 id 时无从得知要用 label。实测（2026-11-05）：传 e:entity0 → ENTITY_NOT_FOUND，传 "Entity Number 0" → 正常输出
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P13 — query-graph 的 md 不崩溃（撤销 2026-11-03 的误判）

- ID: TF-20261105-c9d2a1
- Status: cancelled
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-05-format-fix-followup
- Added: 2026-11-05
- Updated: 2026-11-05
- Goal: 2026-11-03 调研曾把 query-graph 的 md 崩溃记为缺陷，实际是探测时漏传 seeds/depth 导致。补齐参数后 exit 0、输出正常（query-graph.ts:55-120）。本条作为误判撤销记录，无需修复
- Task: Not promoted.
- Next action: None — 误判撤销。

## P9 — --quality 的 source 字段永远是 digdig

- ID: TF-20261103-097d13
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: --quality 的 source 字段永远是 digdig：pending-facts 读 result.source，但没有任何代码写这个字段；results-add --tool exa 把工具名记在 origins[].tool，实测 exa 导入后仍报 source: digdig
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P10 — extract 全部失败仍 exit 0

- ID: TF-20261103-631878
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: extract 全部失败仍 exit 0：dg extract --urls <死链> 返回 status:ok、success:0/failed:1、退出码 0，Agent 据退出码会误判成功。全部失败时应非零退出
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## P11 — defaultEngine 是死配置，allowedEngines 只在 -e 时校验

- ID: TF-20261103-0c810d
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-research:2026-11-03-cli-audit
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: defaultEngine 是死配置：config.ts 定义且 README:990 有文档，但无任何代码读取；allowedEngines 只在传了 -e 时才校验，默认路径不受约束
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C1 — 空 quote / 反向区间被接受为证据并可自动批准

- ID: TF-20261103-5075cc
- Status: done
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-09
- Goal: 空 quote / 反向区间被接受为证据并可自动批准：evidence.ts:120-128 只校验 charStart<0 与 charEnd>content.length，没有 charStart<charEnd 也没有非空校验，slice(10,3) 得到空串，quote:'' 必然匹配，hash 是空串 SHA-256 永远自洽。实测 --stance support 写入 ev_001 并 exit 0
- Task: PR #37 (360cc35)：空引用与无效区间校验
- Next action: None — 已由合并的修复完成。

## C2 — 重复验证沿用旧 stance，反驳覆盖不掉支持

- ID: TF-20261103-e5d727
- Status: done
- Goal: 重复验证沿用旧 stance，反驳覆盖不掉支持：evidence.ts:151-164 按 evidenceId 找到已有 verdict 后不更新 stance/reason/confidence。实测同一 span 先 support 再 refute，返回仍是 stance:support + idempotent:true，singleRefute 规则对该 span 永远不可达
- Task: `TaskFlowDocs/achieved/2026-11-09-evidence-verdict-review/`
- Next action: None — completed and archived.

## C4 — riskLevel 不校验，绕过 highRiskInsufficient

- ID: TF-20261103-1d127c
- Status: done
- Goal: riskLevel 不校验，高风险 claim 绕过 highRiskInsufficient 规则：claim.ts:86 存任意字符串，policy.ts:104-111 只认字面量 high。实测 riskLevel:'HIGH' 原样入库且 claim-list 显示 HIGH，仍可走 dualSourceSupport 自动批准
- Task: `TaskFlowDocs/achieved/2026-11-09-claim-risk-validation/`
- Next action: None — completed and archived.

## C8 — session-delete --older 负值删光全部会话

- ID: TF-20261103-85fa15
- Status: done
- Goal: session-delete --older 接受负数且无确认：session.ts:127-142 的 if (olderHours) 对 -1 为真，(now-updatedAt) > 负数恒成立。实测 --older -1 删掉全部 2 个会话；--older 0 或 NaN 则静默删不掉，exit 0
- Task: `TaskFlowDocs/achieved/2026-11-09-session-delete-validation/`
- Next action: None — completed and archived.

## C7 — graph-add 覆盖结构性结果节点

- ID: TF-20261103-30a192
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: graph-add 会让语义实体覆盖结构性结果节点：graph-add.ts:64-80 直接使用 entity.id，与已有 r:/q:/d: 节点冲突时 mergeNodeAttributes 改写其 label 并报 entitiesAdded:0。实测真实结果节点被改名为 Fake Entity 且 graph-explore 找不到它
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C9 — graph-add 畸形输入抛未捕获 TypeError

- ID: TF-20261103-550f7c
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: graph-add 对畸形输入抛未捕获 TypeError：graph-add.ts:52,59 收到 {entities:'not-an-array'} 或 {entities:[null]} 时抛 Fatal error 到 stderr，stdout 为空、无 JSON envelope，Agent 无法解析
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C5 — 新 verdict 不清除旧 Review

- ID: TF-20261103-a2cd67
- Status: done
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-09
- Goal: 新 verdict 不清除旧 Review：evidence.ts:166-179 非 --complete 时只把 status 设为 verifying，旧 Review 仍留在 store，review-list 继续报 approved，即使已有反驳 verdict
- Task: `TaskFlowDocs/achieved/2026-11-09-evidence-verdict-review/`
- Next action: None — completed and archived.

## C6 — 跳过最后来源使 claim 永久卡在 verifying

- ID: TF-20261103-cd89a3
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 跳过最后一个来源会让 claim 永久卡在 verifying：session.ts:539-545 令证据失效并删掉 review，policy-aggregate 随后报 No claims with verdicts to aggregate 且 exit 0，没有路径把 claim 复位
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C10 — agent-inputs 路径校验在 Windows 上可绕过

- ID: TF-20261103-5db61c
- Status: done
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-09
- Goal: agent-inputs 路径包含校验在 Windows 上可绕过：session.ts:366-372 只用 path.relative 做 POSIX 判断，win32 下 relative('C:\sess\agent-inputs','\\srv\share\x.json') 原样返回 UNC 绝对路径，--data-file \\srv\share\evil.json 通过校验；C:foo 同理
- Task: PR #38 (1c0e273)：Windows 路径边界校验
- Next action: None — 已由合并的修复完成。

## C11 — SessionStateError 不产出 JSON envelope

- ID: TF-20261103-11b5ef
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: SessionStateError 未进入 envelope：entry.ts:20-24 只在顶层 catch 打 Fatal error 到 stderr，stdout 为空无 JSON；approve 流程里 approveResults 已提交后 injectApprovedResults 若抛错，失败发生在写入之后
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C12 — 参数校验晚于 initSessionDir 创建目录

- ID: TF-20261103-2a70e1
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 参数校验晚于 initSessionDir：claim.ts:39 / evidence.ts:86 / graph-add.ts:41 / results-add.ts:25 在 JSON 与字段校验前就 mkdir agent-inputs 和 meta.json，校验失败的 claim-add 也会留下会话目录
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C13 — 若干 CLI 参数未校验就原样存储

- ID: TF-20261103-5806a4
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 若干参数未校验就原样存储：evidence.ts:159 的 --stance 任意字符串入库（--stance bogus 也 exit 0）；evidence.ts:101 非字符串 contentHash 被丢弃而非拒绝；--confidence abc 得 NaN 被静默省略；results-add.ts:49 的 --kind 非 search 一律按 extracted 处理
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C14 — extract 丢弃真实抽取方法

- ID: TF-20261103-7bfb6a
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: extract 丢弃真实抽取方法：extract.ts:59 把所有非 jina/非 obscura 的结果标成 extractor:'default'，覆盖 ExtractedContent.method（defuddle/obscura），经 Obscura 兜底拿到的正文会被记成错误来源
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## C3 — 默认 md 的命令 -f json 永远失效（P1 的另一方向）

- ID: TF-20261103-a72e3c
- Status: done
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-claims-commands
- Added: 2026-11-03
- Updated: 2026-11-09
- Goal: 子命令格式失效的第二个方向：默认 md 的命令（graph-search/graph-explore/graph-drill/graph-traverse/graph-obfuscate/session-report/strategy-info/suggest-queries/graph-preprocess）加 -f json 永远拿不到 JSON，对 Agent 消费方比拿不到 md 更严重；与 P1 同一根因，修复需覆盖两个方向
- Task: PR #33 (045cf6a)：双向格式切换；TaskFlowDocs/achieved/2026-11-04-subcommand-format-flag/
- Next action: None — 已由合并的修复完成。

## D1 — 重复导入正文降级已批准结果并剪掉语义图

- ID: TF-20261103-46ed18
- Status: done
- Goal: 重复导入相同正文会把已批准结果降级为 pending，并不可逆地剪掉它的语义图：session.ts:441-444 的 extracted 分支无条件置 pending，即使正文/extractor/时间戳完全一致；changed 为真导致 revision 递增，第 481 行 repairInvalidDependents 随即按 sourceResultIds 剪除所有实体与边。实测 doc-search 或 results-add 重复导入后 status approved->pending、rev 2->3、entities 1->0，重新 approve 也不会恢复语义实体
- Task: `TaskFlowDocs/achieved/2026-11-03-session-reimport-downgrade/`
- Next action: None — completed and archived.

## D2 — 抽取结果按当前轮而非发现轮盖 round

- ID: TF-20261103-7f63b3
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 抽取结果的 round 盖成当前轮而非发现轮：session.ts:404,412 用 importRound=Math.max(1,round)，round 在本批不开新轮时等于 currentRounds。实测第 1 轮发现、第 2 轮搜索别的、随后导入正文，该结果 origins 变成 [1,2]，coverage 误报它重复出现在第 2 轮并让第 2 轮 repeatedFromEarlier=1，而第 2 轮从未返回它
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## D3 — withIndexLock 抢锁失败删掉他人的锁

- ID: TF-20261103-a83d77
- Status: done
- Goal: withIndexLock 抢锁失败时删掉别的进程正持有的锁：indexer.ts:70-89 的 finally 无条件 rmSync(.lock)，缺少 withSessionLock (session.ts:129-154) 那样的 acquired 标志。实测外部持有 .lock 时 refreshIndex 抛 INDEX_BUSY，同时那把锁被删除
- Task: `TaskFlowDocs/achieved/2026-11-09-index-lock-ownership/`
- Next action: None — completed and archived.

## D4 — graph-preprocess 的 md 渲染器会崩溃（被 P1 遮蔽）

- ID: TF-20261103-e0f05e
- Status: done
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-09
- Goal: graph-preprocess 的 md 渲染器会崩溃：runCli.ts:213 读 result.rounds.join，而 payload 的 resultProvenance 项没有 rounds 字段，一旦 -f md 生效即 TypeError；roundsCovered 又硬编码 0，表头永远是 Rounds: 0。这两个缺陷目前被 -f 失效遮蔽，修了 P1 才会暴露
- Task: PR #33 (045cf6a)：Markdown 渲染与轮次；TaskFlowDocs/achieved/2026-11-04-subcommand-format-flag/
- Next action: None — 已由合并的修复完成。

## D5 — Partial 索引重建丢弃配置的扩展名

- ID: TF-20261103-e2678c
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: Partial 索引重建丢弃配置的扩展名：indexer.ts:437-441 在 meta.partial 时调用 buildIndexFromScannedFiles(absRoot, scanFiles(absRoot))，不传 extensions 与内存预算，回落到 DEFAULT_OPTIONS 的 md,txt。实测 doc-index --type json 后再 refreshIndex，json 文档消失且 meta.source.extensions 变成 ['.md','.txt']
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## D6 — 冗余查询历史从图里读，未批准时为空

- ID: TF-20261103-0b46c5
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 冗余查询历史从图里读，恰恰在结果未批准时为空：runCli.ts:345-354 的 loadSessionQueryHistory 只遍历 graph 的 query 节点，而 query 节点仅由 buildApprovedStructuralEdges 为已批准结果创建。实测新会话连跑 3 轮搜索、query 节点为 0，--redundancy skip/warn/adjust 从不触发
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## D7 — Jina 限流扣掉抽取重试预算

- ID: TF-20261103-b34a9e
- Status: done
- Goal: Jina 限流扣掉抽取重试预算：session.ts:636-641 对合成的 Jina Reader rate limit reached 也递增 failureCount，而 extract.ts:64-79 把它报成 retryable:true；isPendingExtraction (session.ts:488-492) 在 failureCount>=2 时放弃。实测两次限流后该 URL 从 getPendingExtractionResults 中永久消失，遵循 retryable 的调用方反而丢 URL
- Task: `TaskFlowDocs/achieved/2026-11-10-extraction-rate-limit/`
- Next action: None — completed and archived.

## D8 — 本地文档模糊标题兜底是死代码

- ID: TF-20261103-b636fb
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 本地文档模糊标题兜底是死代码：searcher.ts:243 读 db.data?.documents，而 Orama 3.1.18 把文档存在 db.data.docs.docs。实测 db.data.documents === undefined、db.data.docs.docs 有数据；查询 tokioo 对标题 Tokio Runtime Guide 返回 0 命中
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## D9 — search-strategy 按最新支撑轮分桶

- ID: TF-20261103-ba958f
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: search-strategy 按最新支撑轮给实体分桶：search-strategy.ts:50-55 对每个实体取 Math.max(origin rounds)，被后一轮再次看到或批准的结果会把实体迁到最新桶、从首轮消失；computeGrowthRate 只比较最近两桶，饱和轮可读成 +19 增长。与 coverage.firstRound 的口径不一致
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## D10 — path 节点无生产路径，graph-traverse 恒失败

- ID: TF-20261103-9bc038
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: path 节点没有任何生产路径，graph-traverse 提示用户去做一件做不到的事：path-extraction.ts:266 的 extractPaths 在 src/ 无调用者（仅测试调用），graphPreprocess 从不调用它，所以 dg graph-traverse 恒返回 NO_PATHS 且 hint 无法成功；相关地 graph-explore.ts:430 的 graph.edges(prevId,eId) 未做存在性检查，路径引用已剪除实体时 graphology 抛 NotFoundGraphError，最终表现为裸 Fatal error
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## D11 — 一批已确认的小缺陷（7 项）

- ID: TF-20261103-761aa5
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: code-review:2026-11-03-deep
- Added: 2026-11-03
- Updated: 2026-11-03
- Goal: 一批已确认的小缺陷：graph-explore.ts:457-471 resultCount 按 mentions 入边自增而 resultIds 是 Set（一个结果同时提两个路径实体时 2 vs 1）；graph-sampling.ts:506 mixed 策略在没有 rngSeed 时固定播 42 且 CLI 从不传 seed，--strategy mixed 永远选 community_core_path；local-doc/searcher.ts:184 与 scanner.ts:146 frontmatter 标题重复拼接成 X — X；session.ts:651 对空字符串也赋值 excerpt，Jina/Obscura 的 excerpt:'' 会清掉搜索层摘要；graph-obfuscate.ts:48-55 --fallback-rules 用裸 writeFileSync 写 graph.json，绕开会话锁且非原子；extractor.ts:390-404 与 extract.ts:15-19 把 50-99 字符的 Defuddle 结果记为失败并丢弃可用文本；session.ts:654 写入的 contentLength 无人读取且 Defuddle 记词数、Jina/Obscura 记字符数
- Task: Not promoted.
- Next action: Clarify and promote when ready.

## SKILL.md 命令表漏了 doc-index / doc-search，且没有任何校验

- ID: TF-20261107-96407c
- Status: done
- Goal: `skills/digdig/SKILL.md:311-338` 的 Command Reference 表列了 24 个命令，而 `runCli.ts` 实际注册 27 个。差的是 `doc-index`、`doc-search`、`query-graph` 三个，但三者情况不同：`doc-index`/`doc-search` 在 `skills/digdig/references/SOP.md:398-430` 有完整章节（何时用、如何工作、Agent 决策表），只是没有进总表——只读 SKILL.md 的 Agent 不会发现这个能力存在；`query-graph` 在 `runCli.ts:809` 已标 `[DEPRECATED]`，`appendix.md:75` 也写了改用 `graph-explore` + `graph-drill`，不该进表。根因是命令表靠手抄、`--help` 由 commander 生成，两者之间没有任何校验。范围：补 `doc-index`/`doc-search` 两行进总表，并加一个测试断言 SKILL.md 的命令集合与 `runCli.ts` 注册的命令集合一致（允许一份显式豁免清单承载 `query-graph` 这类已废弃项）。
- Task: `TaskFlowDocs/achieved/2026-11-07-docs-command-table/`
- Next action: None — completed and archived.

## Query Plan 只活在 Agent 上下文里，CLI 不落地

- ID: TF-20261107-897767
- Status: cancelled
- Priority: normal
- Owner: Claude
- Source: direct user request
- Added: 2026-11-07
- Updated: 2026-11-07
- Goal: **2026-11-07 撤销，原判断方向错误。** 原条目主张「Query Plan 该由 CLI 持久化」，作为 Agent 判断「还缺什么」的落地方式。核对 `docs/agent_search_integrated_report_2026-10-27.md`（2026-10-29 补的 3.4 节）后确认这条方向被实测否掉了：3.4.5 明确写「不要在命令行内实现方面聚类」，执行摘要写「覆盖度不由命令行算法判定……该判断交给模型，命令侧只交付可数事实」。3.4.3 的实测显示小语料上 `tf × idf` 让最普遍的词排最前（`tokio`/`async`/`rust` 各 10/20 排在 `scheduler`/`epoll`/`cancellation` 各 5/20 之前），3.4.4 显示同义表述下词袋余弦 0.102 vs 跨方面 0.012、`cos ≥ 0.3` 聚类得到 12 个单点簇——词袋无法还原方面。所以 CLI 不该保存「缺口清单」，那是模型的产物。
- 真正该做的是 3.4.5 第 3 条列的四项「可数事实」，对照现状：按轮分组查询、每轮新增条数、标题清单、剔除跨轮高频词的候选词——`dg coverage` 的前三项已具备，第四项 `distinctiveTerms`（`cli/src/deep/coverage.ts:198-239`）已按单轮内 docFreq 排序且剔除跨轮词，符合要求。真正不合规的是 `cli/src/deep/tfidf.ts:119` 的 `tfidf: tfSum * idf`，即 3.4.3 实测的那个聚合方式，已另记为 `TF-20261107-tfidf`。
- Task: Not promoted.
- Next action: None — superseded by `TF-20261107-tfidf`; the "CLI persists the gap list" premise is refuted by the design report.

## tfidf 聚合排序让高频词压过 IDF，恰恰排掉了最不能区分方面的词

- ID: TF-20261107-b09652
- Status: cancelled
- Priority: normal
- Owner: Claude
- Source: design report review
- Added: 2026-11-07
- Updated: 2026-11-07
- Goal: **2026-11-07 撤销，处理对象已不存在。** 原条目要改的是 `cli/src/deep/tfidf.ts:119` 的 `tfidf: tfSum * idf` 排序，把它改成「IDF 优先并按需过滤」。该函数（`computeTfIdf`）已随 `TF-20261107-1aa3f8` 整体移除——`graph-preprocess` 不再输出 `tfidfTerms`，同一命令内的 `termFrequencies[]` 是整数 df、`resultProvenance[].title` 可直接读，SOP 已改指这两个字段。撤销前对原结论的两次实测修正，一并记录以免以后重走：①「把 `tfSum` 换成每文档平均频次就能修正排序」不成立，在 20 条结果 / 4 方面各 5 条 / 主题词覆盖 10 条的语料上，两组词项的比值从 1.33 变为 0.55（确实跨过了 1，相对次序反转），但整体上大量 `df=1` 词项根本不受这个归一化影响——真实会话 `ds_1784791971087_gb9ood` 的 501 个词项里 450 个是 `df=1`（89.8%），归一化对它们无效。②「按 IDF 排序」按字面实现会让结果更差：`df=1` 的 IDF 最高，真实会话上输出就是「把所有只出现一次的词打乱后输出」。原先归给 `docs/agent_search_integrated_report_2026-10-27.md` 3.4.3 的实测与 3.4.5 的「不要在命令行内实现方面聚类」，在该文件被新版 `docs/agent_search_integrated_report.md` 取代后已无法核对（新版无 3.4 节、无 R31–R40）；同一条判据实际来源是 `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/spec.md:214`，只适用于 `coverage.ts` 的 `distinctiveTerms`，那里未受影响。
- Task: None — superseded by `TF-20261107-1aa3f8`（已完成，`achieved/2026-11-07-tokenizer-tfidf/`）。
- Next action: None — `computeTfIdf` 已随 `achieved/2026-11-07-tokenizer-tfidf/` 移除。
## status 字段混了「Agent 是否认可」与「内容是否还是批准时的那份」

- ID: TF-20261107-23d219
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: design report review
- Added: 2026-11-07
- Updated: 2026-11-07
- Goal: `SessionResult.status` 是 `pending`/`approved` 二值，同时承担两个语义：Agent 对这条结果的采信决定，以及这条结果的内容是否仍是批准时的那一份。`repairInvalidDependents`（`cli/src/deep/session.ts:520-560`）用 `result.status !== 'approved'` 判定 `contentChanged`，于是**所有**通向非 approved 的路径被一视同仁：Agent 主动 skip、正文被重新抽取、被跳过的结果被重新导入。三者触发同一套级联——`evidences` 标 `invalid`、受影响的 `claim` 回 `verifying`、对应 `review` 直接删除、语义图里 `sourceResultIds` 含该 id 的节点与边物理删除、`path` 节点因实体消失而删除、孤立 `query`/`domain` 节点也删除。D1 只是这个模型的第一个受害者：当时（`TaskFlowDocs/achieved/2026-11-03-session-reimport-downgrade/`）的修法是加 guard `(bodyChanged || wasSkipped)`，**根因未动**，任何新增的降级路径都会复现同类破坏。`docs/agent_search_integrated_report_2026-10-27.md` 4.3 的数据契约把这件事拆成三个独立实体（`SubQuestion.status`、`Claim.status`、`Evidence`），可作为拆分参照。
- Task: Not promoted.
- Next action: 拆分字段——把「内容版本」独立出来（如 `contentRevision` 或 snapshot id），`repairInvalidDependents` 只在内容版本变化或显式 skip 时级联，而不是看 `status`。

## SessionResult 没有 snapshot 概念，证据定位无法在重抽取后重新对齐

- ID: TF-20261107-024a82
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: design report review
- Added: 2026-11-07
- Updated: 2026-11-07
- Goal: `SessionResult.content` 是裸字符串，没有 `normalized_text_hash`，没有 `extraction_version`。`EvidenceSpan`（`cli/src/claims/types.ts:46`）的 `charStart`/`charEnd` 是 UTF-16 偏移，正文重新抽取后偏移失效；现在只能靠 `contentHash` 校验失败来发现，**没有版本化的重定位机制**。`docs/agent_search_integrated_report_2026-10-27.md` 4.3 明确要求「重抽取或正文标准化版本变化时，应重新定位，不能沿用旧偏移」，并把 `Snapshot(id, url, final_url, mime, normalized_text_hash, extraction_version, access_level)` 列为一个独立实体。次要缺口：locator 只有文本偏移一种，报告还要求 PDF 页码/区域、表格行列、代码 commit+文件+行号、视频时间戳——「不应假装所有证据都能被表示为 UTF-8 文本中的一对 start/end」。
- Task: Not promoted.
- Next action: 先定 snapshot 的存储位置与版本语义（与 `TF-20261107-492224` 的三层拆分是同一件事），多 locator 类型留到之后。

## results.json 把三层存储混成一个文件

- ID: TF-20261107-492224
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: design report review
- Added: 2026-11-07
- Updated: 2026-11-07
- Goal: `results.json` 同时装着 `docs/agent_search_integrated_report_2026-10-27.md` 4.4 要求分开的三层：Search Cache（查询、候选摘要、后端状态）、Evidence Store（抓取快照、定位、哈希、出处）、Verified Knowledge（已审核且值得复用的结论）。报告要求三者各有不同的 TTL 与失效策略，混在一起就无法分别治理。现状后果可量化：`writeResults`（`cli/src/deep/session.ts:304`）每次全量重写整个文件，抽取正文后正文占比超过 90%，一个 200 条结果的会话就是数 MB；而 `loadSessionResults` 在 20 多处被调用，其中 `loadSessionGraph`、`mutateSessionGraph`、`mutateSessionState`、`approveResults` 每次还会附带跑一遍有副作用的 `repairInvalidDependents`。结论是**分层**而不是分片——分片只是手段，报告 4.4 要的是三层各自的生命周期。
- Task: Not promoted.
- Next action: 需要设计。这是 `TF-20261107-024a82`（snapshot）与 `TF-20261107-23d219`（status 拆分）的共同前置，三者应一起设计。

## 来源簇只按 hostname 判断，转载被当成独立来源

- ID: TF-20261107-ebc986
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: design report review
- Added: 2026-11-07
- Updated: 2026-11-07
- Goal: `computeSourceClusterId`（`cli/src/claims/deterministic-checks.ts:58-70`）把 publisher hostname 做 sha256 截 16 位当簇 ID。同一篇文章被 5 个站转载，5 个不同 hostname 就是 5 个「独立来源」，`policy.ts` 按来源域名数判定的规则（`dualSourceMixed`、`highRiskInsufficient`）因此会被骗过——`policy.ts:44` 的注释自己写的就是「Domain-level source independence」，即它知道这只是域名级而非内容级。`docs/agent_search_integrated_report_2026-10-27.md` 3.3 明写「证据数量不等于独立性：文章来源关系需要聚类；不能用 URL count 代替证据簇数」，2.6 节进一步要求「同一文章转载、共同通讯社稿、同一官方声明的多次改写应视作同一事实来源簇」。
- Task: Not promoted.
- Next action: 需要设计。真实来源簇识别需要正文相似度或 canonical URL 传播链，不是一行改动；先确认它在 Fast/Standard/Deep 哪一档启用（报告 4.1 里只有 Deep 有「来源簇与多样性约束」）。

## tokenize() 把含 CJK 的混合 token 整体当 CJK 分支处理，ASCII 部分被切成碎片且原词丢失

- ID: TF-20261107-1aa3f8
- Status: done
- Goal: `cli/src/deep/tfidf.ts:27` 的 `if (CJK_RANGE.test(cleaned))` 判断的是 token **含有** CJK，不是**全部由** CJK 组成。于是任何混入汉字的 token 整体走 bigram 分支，其中的 ASCII 段被切成两字片段，原词不输出。实测：`github中文社区` → `["gi","it","th","hu","ub","b中","中文","文社","社区"]`；`rust异步运行时` → `["ru","us","st","t异","异步","步运","运行","行时"]`，**`rust` 整个丢失**。三个消费者共用此函数（`tfidf.ts` 的 `computeTfIdf`、`coverage.ts` 的 `distinctiveTermsOf`、`co-occurrence.ts` 的 `buildCoOccurrence`/`computeCrossResultFrequency`）。真实会话 `ds_1784791971087_gb9ood`（10 条有正文的结果）实测：501 个词项里 71 个是纯 ASCII 碎片（长度 ≤2），按 ASCII/CJK 分段后降为 0。同一次实测里 3 轮中文会话的 `dg coverage` 输出 `ep`/`po`/`ol`/`ll` 四个碎片并因 `docFreq=3` 排在 `distinctiveTerms` 最前。
- Task: `TaskFlowDocs/achieved/2026-11-07-tokenizer-tfidf/`
- Next action: None — completed and archived.

## performance.bench.ts 用绝对毫秒阈值断言，在共享 CI runner 上会假失败

- ID: TF-20261107-97e119
- Status: inbox
- Priority: normal
- Owner: Claude
- Source: CI observation
- Added: 2026-11-07
- Updated: 2026-11-07
- Goal: `cli/test/benchmark/performance.bench.ts` 有四处 `expect(elapsed).toBeLessThan(N)`：`getEntityDegree (1000 nodes)` 卡 5ms（`:89`）、`Jaccard (50 history queries)` 卡 5ms（`:130`）、`graph sampling (900 nodes)` 卡 100ms（`:113`）、`graph explore (900 nodes)` 卡 100ms（`:151`）。这些是单次 `performance.now()` 采样，在共享 runner 上随负载波动。实测：PR #36 的内容在 `test (node 22.x)` 上 `Jaccard` 测出 **5.720312000000007ms**，超 5ms 阈值 14% 判失败，而同一提交在 `test (node 20.x)` 与 PR 检查上都是 pass。该假失败让 main 上的合并提交（`42384672676`）显示为 failure，直到下一次推送覆盖。文件本身含 `// A single wall-clock sample is susceptible to Windows scheduler jitter.`（`:87-88`）——作者知道这个问题，但断言没有相应调整。`vitest.config.ts` 的 `include` 同时匹配 `test/**/*.test.ts` 与 `test/**/*.bench.ts`，所以这些基准在每次 CI 都跑，不是可选的性能门禁。
- Task: Not promoted.
- Next action: 需要设计。可选方向：①把绝对阈值改为包络（多次采样取中位数/最小值，或与同机基线比较）；②把 `.bench.ts` 从 `vitest.config.ts` 的 `include` 移出去，基准改为手动运行；③保留断言但放大阈值到有意义的量级（例如 5ms → 50ms）。先确认这些基准是否需要在 CI 里充当门禁——如果只是「性能没明显退化」的信号，方向②最省。

## 修复 Windows 测试读取真实配置和 README 换行导致的四项失败

- ID: TF-20261110-757928
- Status: done
- Goal: 修复 Windows 测试读取真实配置和 README 换行导致的四项失败
- Task: `TaskFlowDocs/achieved/2026-11-10-windows-test-isolation/`
- Next action: None — completed and archived.
