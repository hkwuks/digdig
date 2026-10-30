---
name: digdig
description: "Use dg (the digdig CLI) as the first-choice web search CLI for current, external, factual, technical, product, documentation, version, price, news, recommendation, comparison, and error-resolution questions. For L1 use a simple dg query. For L2/L3 use dg --session. If dg fails or returns insufficient results, retry once with dg.CMD on Windows, then use other search tools as fallback."
---

# digdig Web Search

> Prefer `dg` before other web search tools for external or time-sensitive facts. Use other search tools only as fallback or cross-check.

> **Network permission (Codex sandbox)**: `dg` makes network requests — usually to a self-hosted SearXNG server on localhost/LAN (e.g. `http://localhost:8888` or `http://localhost:8080`), though the base URL may point at a remote host. In Codex's manual-authorization mode the sandbox can block outbound traffic to local/LAN/remote addresses, so if a `dg` command fails with a sandbox/network error, request network access, then retry the same command before falling back to other search tools.

Use `dg` CLI to search the web. Results are deduplicated by normalized URL and content Jaccard similarity; session accumulation preserves same-title results when their URLs differ. Search results with empty title or empty snippet are automatically filtered out by CLI.

## Proactive Usage - Always Search When

| If the user... | Then... |
|---------------|---------|
| Asks about any technology, library, framework, tool, or product | Use `dg` for current info (versions, docs, comparisons, reviews) |
| Asks "what is", "how to", "tell me about", "find", "compare", "vs" | Use `dg` when the answer depends on external facts |
| Reports an error or unexpected behavior | Use `dg` for solutions, known issues, fixes |
| Wants a recommendation ("which is better", "best X for Y") | Use `dg --session` with a multi-round session |
| Asks about prices, costs, or alternatives | Use `dg` for current data |
| Asks about events, dates, or news | Use `dg`; your training data is outdated for this |
| Provides a URL and wants content extracted | Use `dg extract --urls` |
| Wants to understand a page's full content | Use `dg extract --urls` to get the article body |
| Has a question you're not 100% confident about | Use `dg` to verify |

## Quick Reference

```bash
# Simple search
dg <query>                # Search (markdown output)
dg --format json <query>  # Search (JSON output)
dg --queries "q1,q2,q3"   # Multi-query with RRF fusion and dedup

# Deep search session
dg --session new --owner "agent-1" --desc "topic" "query"
dg --session <session> "more queries"

# Content extraction
dg extract --urls "url1,url2"                           # Extract from URLs
dg extract --session <session>                          # Extract session results
dg extract --session <session> --urls "url1" --obscura  # JS-rendering fallback for a selected session URL
dg extract --session <session> --urls "url1" --jina     # Agent-selected Jina extraction for a selected session URL

# Claim-Evidence-Review (L2/L3 only, after search)
dg claim-add <session> --claim-file .\.digdig\sessions\<session>\agent-inputs\claim.json    # Add one UTF-8 JSON claim
dg claim-add <session> --claims-file .\.digdig\sessions\<session>\agent-inputs\claims.json  # Add UTF-8 JSON claim array
dg claim-list <session>                                                                     # List claims
dg evidence-search <session> --claim-id <id>                                                # Search evidence candidates (read-only)
dg evidence-verify <session> --claim-id <id> --evidence-file .\.digdig\sessions\<session>\agent-inputs\evidence.json --stance support --reason "..." --complete
dg evidence-list <session> --claim-id <id>  # List evidence for a claim
dg verdict-list <session> --claim-id <id>   # List verdicts for a claim
dg policy-aggregate <session>               # Manual policy aggregation
dg review-list <session>                    # List reviews

# Quality & iteration
dg --session <session> --quality  # Assess result quality & list pending
# Save selected {id, revision} objects from quality output, then approve them.
dg --session <session> --quality --approve-file .\.digdig\sessions\<session>\agent-inputs\approve.json
dg suggest-queries <session>    # Get query suggestions
dg coverage <session>           # What this session has looked at, as counted facts
dg strategy-info <session>      # Check search stage
dg recovery-analysis <session>  # Get recovery strategies
dg session-report <session>     # Full session report

# Knowledge graph
dg graph-preprocess <session>                                                                                                                # TF-IDF + co-occurrence analysis
dg results-add <session> --kind search --tool exa --query "source query" --data-file .\.digdig\sessions\<session>\agent-inputs\results.json  # Append external discovery as pending
dg graph-add <session> --data-file .\.digdig\sessions\<session>\agent-inputs\graph-data.json                                                 # Add entities/edges (after approval)
dg graph-search <session> --keyword "x"                                                                                                      # Discover entities
dg graph-search <session> --keyword "x" --limit 5                                                                                            # Limit results
dg graph-explore <session> --seed "x"                                                                                                        # View entity relations
dg graph-drill <session> --seed "x" --relations "r1,r2"                                                                                      # Follow relations
dg graph-traverse <session> --path "p:chain_001"                                                                                             # Traverse reasoning paths
dg graph-obfuscate <session> --list                                                                                                          # List obfuscation candidates

# Local document search
dg doc-index <path>                         # Index documents (auto-triggered by doc-search)
dg doc-search <session> <query> --path <p>  # Search indexed docs & inject into session

# Utility
dg init                       # Interactive setup (includes Ollama/DeepSeek keys)
dg session-list               # List workspace sessions
dg session-delete --older 24  # Delete old sessions
dg --engines-list             # List available engines (includes ollama/deepseek if configured)
dg --categories-list          # List available categories
dg --health                   # Check server status
```

## Search Options

| Option | Example | Purpose |
|--------|---------|---------|
| `-e, --engines` | `-e google,github` | Specific search engines (`ollama` / `deepseek` route to those backends instead of SearXNG) |
| `-c, --categories` | `-c it,science` | Filter by category |
| `-l, --limit` | `-l 20` | Max results (default: 10) |
| `-p, --page` | `-p 2` | Pagination |
| `--lang` | `--lang zh` | Result language |
| `--time` | `--time week` | Filter: day/week/month/year/all |
| `--format` | `--format json` | Output format: md (default), json |
| `--queries` | `--queries "q1,q2,q3"` | Multi-query with RRF fusion |
| `--merge` | `--merge prev.json` | Merge new results with previous search JSON |
| `--session` | `--session new` | Session dir or "new" to auto-create |
| `--owner` | `--owner "agent-1"` | Session owner |
| `--desc` | `--desc "research topic"` | Session description |
| `--redundancy` | `--redundancy warn` | Redundancy check: warn / adjust / skip |
| `--quality` | `--quality` | Assess result quality (requires --session) |
| `--approve-file <path>` | `--approve-file .digdig/sessions/<session>/agent-inputs/approve.json` | Approve only verified `{id, revision}` selections (requires --quality) |
| `--skip-file` / `--unskip-file` | `--skip-file <path>` | Skip or restore `{id, revision}` selections |
| `--threshold-override` | `--threshold-override '{"contentDepth":100}'` | Override quality thresholds (JSON) |

## Extract

Extract full article content from web pages. Use `--obscura` as a fallback for JS-heavy pages. Jina is rate-limited: inspect the default extraction first, then let the Agent decide whether a specific URL needs `--jina`.

```bash
dg extract --urls "https://example.com/a,https://example.com/b"
dg extract --session <session-name>
dg extract --urls "https://spa-site.com" --obscura
# After reviewing the default extraction, use Jina only for a selected URL and merge it back to the session.
dg extract --urls "https://spa-site.com" --session <session-name> --jina
```

| Option | Purpose |
|--------|---------|
| `--obscura` | JS-rendering fallback for SPA pages |
| `--jina` | Extract explicitly supplied URLs with Jina Reader; combine with `--session` to merge the selected results |

## Deep Search

Deep search enables multi-round iterative research with session accumulation, quality assessment, recovery strategies, and knowledge graph navigation.

> Read the [SOP](references/SOP.md) for core procedures and [Evidence Standards](references/evidence-standards.md) for source quality rules before starting. For the final L2/L3 claim audit, read [Claim-Evidence-Review Audit](references/claim-evidence-review.md) after synthesizing the draft.

> **Session Continuity Rule (Hard Requirement)**
>
> Once a deep search session is created, **ALL results from ALL search backends MUST go into that same session** via `results-add`. The session is the state container; abandoning it discards the knowledge graph, quality history, redundancy state, and strategy progression.
>
> **Allowed:**
> - Switch search backends when one fails (dg -> tavily -> exa -> open-web-search)
> - Inject external results into the current session via `results-add`
> - Extract content from URLs independently and add to the session
>
> **Forbidden:**
> - Create a **new session** for the same topic while an active session exists
> - Abandon the session and output results outside it
> - Use a different search flow that bypasses the existing session
>
> **Exception**: Only create a new session if the current one is **corrupted** (e.g. `results.json` is unreadable). A search backend returning 0 results or errors is NOT corruption; switch backends, not sessions.

### Query Plan (L2/L3 Hard Requirement)

For L2/L3 research, keep a small **Query Plan in the Agent's working notes**. It combines the initial query decomposition with execution-time coverage tracking; it is not a new CLI command or session file.

| Sub-question / Claim | Required evidence | Status | Next query, if needed |
|---|---|---|---|
| What must be answered? | official / independent / counter-evidence / date-sensitive source | unsearched / partial / covered / blocked | query only for the recorded gap |

- Before the first query, decompose the task into 3-7 non-overlapping sub-questions and record the evidence requirement for each.
- Before every follow-up query, update the plan from approved results and Claim review. A new query must close a recorded gap (for example: missing official source, independent confirmation, counter-evidence, current version, or unresolved conflict).
- Do not treat a search result as coverage until it is extracted when needed and approved; a rejected or pending result can only motivate the next query.
- Before final output, disclose any core sub-question still marked `partial` or `blocked`. Do not make a definitive conclusion for a Claim that lacks its required evidence.

### Pipeline Overview

All results go into the same pool, same pipeline:

```text
dg search or results-add -> results.json (pending)
dg extract --session     -> writes content + extractedAt on success
dg --quality             -> Agent reviews pending results
dg --approve-file        -> approved results enter the structural graph
dg graph-add             -> Agent adds semantic entities/edges
L2/L3 only:
  claim-add -> evidence-verify -> policy-aggregate -> review
  Agent adjusts final output and cites only approved claims.
```

- **All results** (dg + external) become `pending` in the same `results.json`
- **Extract** does not add results. A successful session merge writes both `content` and `extractedAt`.
- **Approve** accepts only entries reported as `verified: true`, then injects them into graph (structural edges).
- **Failed extraction** stays pending. It cannot be approved or graph-injected until a later extraction succeeds.
- **graph-add** only adds entities/edges; results go through approve first
- **Claim pipeline** (L2/L3 only): before a Claim can use a result as evidence, extract that URL in the session so the evidence records its actual `extractedAt`; then Agent submits claims -> CLI auto-searches evidence -> Agent verifies -> CLI aggregates policy -> Agent adjusts output

### Quick Start

```bash
# Create session and search
dg --session new --owner "agent-1" --desc "topic" "query"
# Output includes session path, use it for subsequent commands

# Extract content from results. Inspect `stats.success`, `stats.failed`, and
# `session.updated`; a failed URL remains pending.
dg extract --session <session>

# Assess quality, then approve only listed entries with verified: true.
dg --session <session> --quality
dg --session <session> --quality --approve-file .\.digdig\sessions\<session>\agent-inputs\approve.json

# Preprocess session content, then add entities/edges to the graph.
dg graph-preprocess <session>
dg graph-add <session> --data-file .\.digdig\sessions\<session>\agent-inputs\graph-data.json

# Get suggestions if quality needs improvement
dg suggest-queries <session>

# Continue searching with redundancy check
dg "follow-up" --session <session> --redundancy warn
```

### Session Management

Sessions are stored under `.digdig/sessions/` in the current working directory. 

```bash
dg session-list               # List all sessions
dg session-delete <name>      # Delete a session
dg session-delete --older 24  # Delete sessions older than 24h
```

### Quality Assessment

```bash
dg --session <session> --quality
```

Returns 3 independent diagnostics: contentDepth, sourceDiversity, novelty. Verdict: good / acceptable / poor. Based on verdict, use `suggest-queries` or `recovery-analysis` for next steps. Quality does not verify factual correctness, relevance, source authority, or Claim support.

All results accumulate as *pending* in the same pool. At **>=30 pending**, CLI warns the Agent to assess. The Agent runs quality, reviews the pending results, and approves by writing selected `{id, revision}` objects:

```bash
# View pending results with id, revision, verification state, and quality score
dg --session <session> --quality

# Save selected {id, revision} objects only when their JSON output says verified: true.
# Any unverified, duplicate, stale, or invalid selection makes the whole request fail without writes.
dg --session <session> --quality --approve-file .\.digdig\sessions\<session>\agent-inputs\approve.json
```

One `--approve-file` call processes selected results from all sources together.

### Knowledge Graph

Two layers:
- **Structural** (auto-built via `--approve-file`): query->result->domain nodes and edges
- **Semantic** (added by you via `graph-add`): entity nodes with custom relation edges

Results must be approved first so they exist in the structural layer. Then use `graph-add` to add entities/edges referencing those result nodes.

```bash
# Correct order:
# 1. Search or results-add
dg --session <session> "query"
dg results-add <session> --kind search --tool exa --query "source query" --data-file .\.digdig\sessions\<session>\agent-inputs\external-results.json

# 2. Extract, and check that stats.success and session.updated are nonzero
dg extract --session <session>

# 3. Inspect quality output; approve only verified pending results. This builds the structural graph.
dg --session <session> --quality --approve-file .\.digdig\sessions\<session>\agent-inputs\approve.json

# 4. Preprocess session content, then add graph JSON from a file.
dg graph-preprocess <session>
dg graph-add <session> --data-file .\.digdig\sessions\<session>\agent-inputs\graph-data.json
```

**External results**: Import search discovery with `results-add --kind search` -> `extract` -> `--approve-file` -> `graph-add`. If the external tool already returned a body, import it with `--kind extracted`, non-empty `content`, and `extractor`; it awaits approval without re-extraction.

### Structured JSON Input

All structured writes use exactly one UTF-8 JSON file (UTF-8 BOM accepted) under `.digdig/sessions/<session>/agent-inputs/`. Inline JSON and files outside the owning session are rejected before state changes.

| Command | File option |
|---|---|
| External results | `results-add --data-file <path>` |
| Graph entities/edges | `graph-add --data-file <path>` |
| Approval / skip / restore | `--approve-file` / `--skip-file` / `--unskip-file <path>` |
| One Claim / batch Claims | `claim-add --claim-file` / `--claims-file <path>` |
| Evidence verification | `evidence-verify --evidence-file <path>` |

The file must remain inside the owning session's `agent-inputs` directory; it is retained until the user explicitly deletes the session.

Create Agent-produced files under `.digdig/sessions/<session>/agent-inputs/`, never at the project root. Session-local inputs isolate parallel sessions; session locks protect state mutations. Do not delete the directory or its contents unless the user explicitly asks.

When adding edges, `source`/`target` must reference existing node IDs. Do not hand-build IDs from a URL: use the `id` returned in `graph-preprocess.resultProvenance`. Every new entity and edge needs one or more currently approved `sourceResultIds`. If an edge references an entity created in the same `graph-add` call, give that entity an explicit `id` and use the same value in the edge.

| Prefix | Type | Format | Example |
|--------|------|--------|---------|
| `e:` | Entity | explicit ID when an edge needs it | `e:tokio` |
| `r:` | Result | generated ID | `graph-preprocess.resultProvenance[].id` |
| `q:` | Query | generated ID | graph structural node |
| `d:` | Domain | generated ID | graph structural node |
| `p:` | Path | `p:<type>_<num>` | `p:chain_001` |

Graph navigation commands: `graph-search` (discover), `graph-explore` (view relations), `graph-drill` (follow specific relations), `graph-traverse` (reasoning paths).

### When to Stop

For L2/L3, stop only when all core Query Plan rows are `covered`, or remaining rows are explicitly `blocked` and will be disclosed. A good quality verdict, 3+ rounds, or fewer than 3 new results are signals to reassess the plan; they do not override an unresolved core evidence gap.

## When to Use

**Simple Search** (`dg <query>`): specific facts, API docs, error solutions, finding a URL.

**Deep Search** (`--session`): multi-dimensional comparison, cross-validation needed, research reports, or initial search reveals incomplete information.

See SOP for detailed L1/L2/L3 complexity guidelines.

## Command Reference

| Command | Purpose |
|---------|---------|
| `dg <query>` | Search the web |
| `dg extract` | Extract page content |
| `dg results-add` | Append external results as pending |
| `dg graph-preprocess` | TF-IDF + co-occurrence analysis |
| `dg graph-add` | Add entities/edges to graph |
| `dg graph-search` | Discover entities by keyword |
| `dg graph-explore` | View entity relations |
| `dg graph-drill` | Follow specific relations |
| `dg graph-traverse` | Traverse reasoning path |
| `dg graph-obfuscate` | Entity obfuscation (experimental) |
| `dg suggest-queries` | Query suggestions for next round |
| `dg coverage` | Whole-session view: rounds, queries, new vs repeated, round-local terms, untouched primary sources |
| `dg strategy-info` | Current search stage |
| `dg recovery-analysis` | Recovery strategy analysis |
| `dg session-report` | Full session history |
| `dg session-list` | List all sessions |
| `dg session-delete` | Delete sessions |
| `dg init` | Interactive setup |
| `dg claim-add` | Submit claims (single or batch, auto evidence-search) |
| `dg claim-list` | List claims |
| `dg evidence-search` | Search candidate evidence (read-only) |
| `dg evidence-verify` | Confirm evidence + submit stance (+ optional auto-policy) |
| `dg evidence-list` | List evidence for a claim |
| `dg verdict-list` | List verdicts for a claim |
| `dg policy-aggregate` | Run policy aggregation manually |
| `dg review-list` | List reviews |

## Tips

- Default format: search and graph nav -> md; analysis commands -> json. Override with `-f` or `--format`.
- Search results with empty title or empty snippet are automatically filtered out by CLI
- Use `--time week/day` for recent information
- If searches fail, retry the same command with the required sandbox/network permission before using fallback tools
- Use `--quality` after accumulating enough pending results (>=30 triggers a warning)
- Use `--redundancy warn` to avoid repeating similar queries
- **Ollama web search**: If `ollamaApiKey` is configured (via `dg init` or `OLLAMA_API_KEY` env var), `ollama` appears in `--engines-list`. L1: use `--engines ollama` to search via Ollama. L2/L3: Agent uses `results-add --tool ollama --kind search` to inject Ollama results into the session pipeline. Ollama is **not** an automatic fallback — an unreachable SearXNG fails the search rather than switching backends.
- **DeepSeek Search**: Same rules with `deepseekApiKey` / `DEEPSEEK_API_KEY` and `--engines deepseek`. Billed per successful request, so prefer it for targeted L1 lookups rather than broad exploration.

## Result Quality Filtering

When presenting search results to the user, apply lightweight quality judgment based on your own understanding. This is not a separate step; just a natural part of reading and outputting results.

**Filter out** results that clearly fall into these categories:

- The title and snippet are both unrelated to the query intent (not just missing keywords; semantically off-topic)
- The snippet is pure SEO stuffing: keyword repetition with no factual content
- The page is a known low-quality aggregator (mirrors, scrapers, parked domains) and adds no value beyond what other results already provide

**Do NOT filter** results that are:

- Partially relevant or tangentially related; they may provide useful context
- Written in a different style or tone than expected; relevance matters more than presentation
- Missing some query terms but still on-topic; semantic match > keyword match
- From lesser-known sources; small blogs and forums often have the best answers

**Principle: keep liberally, filter conservatively.** When uncertain about a result's relevance, always keep it. It is better to show a slightly noisy result than to hide a useful one.
