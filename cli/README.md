# 🔍 digdig

> 📖 **完整文档请访问 GitHub**: https://github.com/hkwuks/digdig#readme
> 
> 本 README 为快速参考，详细的安装指南（包括 SearXNG 自托管配置、Docker 部署、settings.yml 配置等）请参阅 GitHub 文档。

<p align="center">
  <b>A multi-backend web search CLI for agents</b><br>
  SearXNG · Ollama · DeepSeek — privacy-respecting search from your terminal
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/digdig">
    <img src="https://img.shields.io/npm/v/digdig?style=flat-square&color=cb3837" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/digdig">
    <img src="https://img.shields.io/npm/dm/digdig?style=flat-square&color=cb3837" alt="npm downloads">
  </a>
  <a href="https://github.com/hkwuks/digdig/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/hkwuks/digdig?style=flat-square&color=green" alt="license">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="node version">
</p>

## ✨ Features

- 🔎 **Multi-Engine Search** — Search across Google, Bing, DuckDuckGo, GitHub, StackOverflow, and 30+ engines simultaneously
- 🔌 **Pluggable Backends** — SearXNG is the default; select Ollama web search or DeepSeek Search with `-e ollama` / `-e deepseek`. No backend is an automatic fallback for another.
- 🔌 **Pluggable Backends** — SearXNG is the default; select Ollama web search or DeepSeek Search with `-e ollama` / `-e deepseek`. No backend is an automatic fallback for another.
- 🔄 **Dynamic Discovery** — Auto-fetches available engines and categories from your SearXNG server
- 📄 **Multiple Formats** — Markdown (LLM-optimized) or JSON output
- 🧠 **Deep Search** — Multi-round iterative research with session accumulation, quality assessment, and recovery strategies
- 🔍 **Content Extraction** — Extract full article content from URLs or session results, with Obscura fallback and Agent-selected Jina Reader extraction
- 🗂️ **Session Management** — Separates search discovery from extracted bodies; stable result IDs and revisions prevent stale approvals in parallel work
- 🔗 **External Result Fusion** — Import external search or extraction output from session-scoped JSON files, without PowerShell inline-JSON escaping risks
- ⭐ **Quality Assessment** — 3 independent indicators: content depth, source diversity, and novelty
- 🕸️ **Knowledge Graph** — Structural (query→result→domain) + semantic (entity relations with approved result-ID provenance) graph layers
- 🔄 **Query Redundancy Check** — Word-level or character-bigram Jaccard detects repeated queries
- 💡 **Agent-First Design** — Outputs structured analysis data (quality, suggestions, recovery) for LLM Agent decision-making
- 📁 **Local Document Search** — Index and BM25-search local Markdown/text files; results auto-injected into the session pipeline as `source: "local"`
- ✅ **Claim—Evidence—Review Pipeline** — L2/L3 only: submit atomic claims, auto-search evidence, verify with stance, then policy-aggregate by publisher-domain diversity for auto-approval or Agent review

## 📦 Installation

> ⚠️ **完整安装指南**: [GitHub - Installation](https://github.com/hkwuks/digdig#installation)
> 
> 包含 SearXNG 自托管配置、Docker 部署、30+ 搜索引擎 settings.yml 配置等。

```bash
npm install -g digdig
```

This installs three names for the same program: **`dg`** (recommended, short), **`digdig`** (explicit), and the transitional **`sxng`** alias.

> ⚠️ **Upgrading from `sxng-cli`?** The new package is `digdig`; version numbers restart, so `digdig@0.0.2` is newer than `sxng-cli@1.3.2`. Uninstall the old package first. The `sxng` command, `.sxng/` sessions, `sxng.config.json`, and `SEARXNG_*` variables keep working (with a `[deprecation]` line on stderr) until `0.5.0`.

```bash
npx skills add hkwuks/digdig
```

> ⚠️ **Skill 同步**：更新 `digdig` 后，请同步更新 `digdig` skill 以保持功能一致：
>
> ```bash
> npx skills update hkwuks/digdig
> ```

Or from source:

```bash
git clone https://github.com/hkwuks/digdig.git
cd digdig/cli
npm install
npm run build
npm link
```

### Obscura (Optional — for JS-heavy pages)

Content extraction uses **Defuddle + linkedom** by default. For JS-rendered pages (SPAs), enable [Obscura](https://github.com/h4ckf0r0day/obscura). When `--obscura` is used and the binary is absent, digdig automatically downloads the matching release asset from the official GitHub HTTPS download endpoint.

```bash
# Linux x86_64
curl -LO https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz
tar xzf obscura-x86_64-linux.tar.gz
cp obscura ~/.local/bin/

# Verify
obscura --version
```

## 🚀 Quick Start

1. **Configure the CLI:**
   ```bash
   dg init
   ```
   Or set environment variable:
   ```bash
   export DIGDIG_BASE_URL=http://your-searxng-instance:8080
   ```

2. **Perform a search:**
   ```bash
   dg "TypeScript tutorial"
   ```

## 📖 Usage

### Commands

| Command | Description |
|---------|-------------|
| `dg init` | Interactive configuration setup |
| `dg <query>` | Perform a web search |
| `dg --queries "q1,q2"` | Multi-query search with RRF fusion |
| `dg extract --urls <urls>` | Extract content from web pages |
| `dg extract --session <name>` | Extract session results and merge content |
| `dg extract --obscura` | JS-rendering fallback for SPA pages |
| `dg extract --urls <url> --session <name> --jina` | Agent-selected Jina Reader extraction for explicit URLs, merged into a session |
| `dg --session new` | Create deep search session |
| `dg --session <name> --quality` | Assess result quality, list pending results |
| `dg --session <name> --quality --approve-file <path>` | Approve verified pending results selected by `{id, revision}` JSON |
| `dg suggest-queries <session>` | Get query suggestion data for Agent |
| `dg strategy-info <session>` | Check current search stage |
| `dg recovery-analysis <session>` | Get recovery strategies for poor quality |
| `dg session-report <session>` | Full session analysis report |
| `dg session-list` | List all sessions |
| `dg session-delete <name>` | Delete a session |
| `dg graph-preprocess <session>` | TF-IDF + co-occurrence + result provenance analysis |
| `dg graph-add <session> --data-file <path>` | Add semantic entities/edges backed by approved result IDs |
| `dg graph-search <session>` | Discover entities by keyword |
| `dg graph-explore <session>` | View entity relations |
| `dg graph-drill <session>` | Follow specific relations |
| `dg graph-traverse <session>` | Traverse reasoning paths |
| `dg graph-obfuscate <session>` | List obfuscation candidates |
| `dg results-add <session> --kind <search|extracted> --data-file <path>` | Import external discovery or extracted bodies from session-scoped UTF-8 JSON |
| `dg doc-index <path>` | Index local documents for BM25 search |
| `dg doc-search <session> <query> --path <path>` | Search indexed docs and inject results into session |
| `dg claim-add <session> --claims-file <path>` | Submit atomic claims from UTF-8 JSON (single or batch, auto evidence-search) |
| `dg claim-list <session>` | List claims |
| `dg evidence-search <session> --claim-id <id>` | Search candidate evidence (read-only) |
| `dg evidence-verify <session> --claim-id <id> --evidence-file <path>` | Confirm UTF-8 JSON evidence + submit stance (+ optional auto-policy) |
| `dg evidence-list <session> --claim-id <id>` | List evidence for a claim |
| `dg verdict-list <session> --claim-id <id>` | List verdicts for a claim |
| `dg policy-aggregate <session>` | Run policy aggregation manually |
| `dg review-list <session>` | List reviews |
| `dg --health` | Check the SearXNG backend health (Ollama/DeepSeek have no health endpoint) |
| `dg --engines-list` | List available search engines (includes `ollama` if configured) |
| `dg --categories-list` | List available categories |

### Search Options

| Option | Description |
|--------|-------------|
| `-e, --engines <list>` | Comma-separated list of search engines (e.g., `google,github`); `ollama` and `deepseek` route to those providers instead of SearXNG |
| `-c, --categories <list>` | Comma-separated list of categories (e.g., `it,science`) |
| `-l, --limit <n>` | Maximum number of results (default: 10) |
| `-p, --page <n>` | Page number for pagination |
| `--lang <code>` | Language code (e.g., `en`, `zh`, `ja`) |
| `--time <range>` | Time range: `day`, `week`, `month`, `year`, `all` |
| `-f, --format <fmt>` | Output format: `md` (default) or `json` |
| `--queries <list>` | Multi-query with RRF fusion (e.g., `q1,q2,q3`) |
| `--session <session-name>` | Session directory or `new` for deep search |
| `--owner <session-name>` | Session owner identifier |
| `--desc <text>` | Session description |
| `--redundancy <action>` | Query redundancy check: `warn`, `adjust`, `skip` |
| `--quality` | Assess result quality (requires --session) |
| `--approve-file <path>` | Approve `{id, revision}` selections from this session's `agent-inputs` directory |
| `--skip-file <path>` / `--unskip-file <path>` | Skip or restore `{id, revision}` selections from this session's `agent-inputs` directory |
| `--threshold-override <json>` | Override quality thresholds (JSON) |
| `--merge <file>` | Merge new results with previous search JSON |

### Examples

```bash
# Basic search (outputs Markdown by default)
dg "machine learning"

# Output as JSON
dg --format json "machine learning"

# Search with specific engines
dg --engines google,duckduckgo "privacy tools"

# Search IT and Science categories
dg --categories it,science "kubernetes tutorial"

# Limit results and filter by time
dg --limit 5 --time week "latest AI news"

# Multi-query search with RRF fusion
dg --queries "tokio tutorial,rust async basics,async-std guide"

# List available engines (fetched from server)
dg --engines-list
```

## ⚙️ Configuration

Configuration priority (highest to lowest):
1. Environment variables
2. Local config file (`./digdig.config.json`)
3. Global config file (`~/digdig/digdig.config.json`)
4. Default values

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DIGDIG_BASE_URL` | SearXNG server URL | *(required)* |
| `DIGDIG_DEFAULT_ENGINE` | Default search engine | *(none)* |
| `DIGDIG_ALLOWED_ENGINES` | Comma-separated allowed engines | *(all)* |
| `DIGDIG_DEFAULT_LIMIT` | Default result limit | `10` |
| `DIGDIG_DEFAULT_FORMAT` | Default output format (`md` or `json`) | `md` |
| `DIGDIG_USE_PROXY` | Use proxy (`true`/`false`) | `false` |
| `DIGDIG_PROXY_URL` | Proxy URL | *(none)* |
| `DIGDIG_TIMEOUT` | Request timeout in ms | `10000` |
| `DIGDIG_REDUNDANCY_THRESHOLD` | Word-level Jaccard threshold for redundancy | `0.7` |
| `DIGDIG_REDUNDANCY_BIGRAM_THRESHOLD` | Bigram-level Jaccard threshold (short queries) | `0.5` |
| `OLLAMA_API_KEY` | [Ollama web search](https://ollama.com) API key; enable with `-e ollama` (not an automatic fallback) | *(none)* |
| `DEEPSEEK_API_KEY` | [DeepSeek Search](https://api-docs.deepseek.com/api/search) API key (optional backend; billed per successful request) | *(none)* |

> `SEARXNG_*` variable names are still read until `0.5.0` and emit one `[deprecation]` line on stderr; `DIGDIG_*` wins when both are set.

### Config File

Create `digdig.config.json`:

```json
{
  "baseUrl": "http://localhost:8080",
  "defaultEngine": "",
  "allowedEngines": [],
  "defaultLimit": 10,
  "defaultFormat": "md",
  "useProxy": false,
  "proxyUrl": "",
  "timeout": 10000,
  "ollamaApiKey": "",
  "deepseekApiKey": "",
  "redundancyThreshold": 0.7,
  "redundancyBigramThreshold": 0.5
}
```

## 🧠 Deep Search

Deep search enables multi-round iterative research with session accumulation, quality assessment, agent-controlled graph injection, and recovery strategies.

### Workflow

```
Search → Extract → Quality Assess → Approve → Build Graph → (Loop or Explore)
                                                                         ↓
                                          (L2/L3) Claim—Evidence—Review → Final Output
```

### Quick Example

```bash
# 1. Create a session and search
dg --session new --owner "agent-1" --desc "Rust async study" "rust async ecosystem"
# Outputs session path, e.g. .digdig/sessions/ds_1712345678_abcdef

# 2. Extract content from results
dg extract --session ds_1712345678_abcdef

# 3. Check extraction output: stats.success and session.updated identify
#    results that received source text; failed URLs remain pending.

# 4. Assess quality and see each result's verified state
dg --session ds_1712345678_abcdef --quality

# 5. Copy selected {id, revision} objects from quality output into
#    .digdig/sessions/ds_1712345678_abcdef/agent-inputs/approve.json, then approve them.
dg --session ds_1712345678_abcdef --quality --approve-file .\.digdig\sessions\ds_1712345678_abcdef\agent-inputs\approve.json

# 6. Preprocess session content for entity discovery and provenance
dg graph-preprocess ds_1712345678_abcdef

# 7. Put complex graph JSON in this session's Agent scratch directory, then add semantic edges
dg graph-add ds_1712345678_abcdef --data-file .\.digdig\sessions\ds_1712345678_abcdef\agent-inputs\graph-data.json

# 8. Continue research with redundancy check
dg --session ds_1712345678_abcdef --queries "tokio vs async-std,benchmark 2026" --redundancy warn
```

### Quality and Evidence Semantics

- Extracted web content is deduplicated by normalized URL, then by full-text character 5-gram Jaccard similarity. Query redundancy uses a separate word-level or character-bigram Jaccard check.
- `--quality` assesses the newest recorded round against earlier approved results. A URL already seen in an earlier round is non-novel, even when it reappears in the newest round.
- Quality is a diagnostic, not a fact verifier. A search discovery can be approved only after `extract` writes a non-empty body and extraction timestamp. An explicitly imported external body must provide non-empty `content` and an `extractor`; absent `extractedAt` is recorded as its import time.
- Claim policy treats two normalized publisher domains as two sources. It does not infer corporate ownership, editorial relationships, or syndication across domains.

### Session Management

| Command | Description |
|---------|-------------|
| `dg --session new` | Create new auto-named session |
| `dg --session <session-name>` | Use session by name |
| `dg session-list` | List all sessions with stats |
| `dg session-delete <session-name>` | Delete specific session |
| `dg session-delete --older <hours>` | Delete old sessions |

**Session Path Resolution:**
- Pure name (e.g., `my-session`) → `.digdig/sessions/my-session`
- Full path (e.g., `/custom/path/session`) → used as-is
- `new` → auto-generate unique name under `.digdig/sessions/`

### Knowledge Graph

Two layers:

**Structural** (auto-built):
| Prefix | Type | Example |
|--------|------|---------|
| `q:` | Query node | `q:rust_async` |
| `r:` | Result node | `r:https://example.com/page` |
| `d:` | Domain node | `d:github_com` |

**Semantic** (via `graph-add`):
| Prefix | Type | Example |
|--------|------|---------|
| `e:` | Entity node | `e:tokio` |
| `p:` | Path node | `p:chain_001` |

Graph navigation commands: `graph-search` (discover entities), `graph-explore` (view relations), `graph-drill` (follow specific relations), `graph-traverse` (traverse reasoning paths).

`graph-preprocess` returns `resultProvenance` (`id`, `revision`, `url`, `title`, `approval`) for every extracted body. For each semantic entity or edge, copy one or more currently approved `id` values into `sourceResultIds`. This keeps semantic facts traceable to the exact approved bodies rather than a search round.

### External Search Results

Results from other search tools (Tavily, Exa, etc.) can be injected into any active session via `results-add`, following the same pipeline as native dg results:

```powershell
# Import search discovery; its excerpts remain summaries and require extraction.
dg results-add <session-name> --kind search --tool exa --query "async runtime" `
  --data-file .\.digdig\sessions\<session-name>\agent-inputs\exa-search.json
```

Search imports become `pending` and require `extract --session`; inspect `stats.success`, `stats.failed`, and `session.updated`, then approve only entries whose quality output reports `verified: true`. An external tool that already returned a body must instead use `--kind extracted` with non-empty `content` and `extractor`; it becomes pending approval without another extraction. A failed extraction remains pending and cannot enter the graph. `tool` and `query` record the discovery provenance.

### Structured JSON Input

All structured writes use a UTF-8 JSON file under `.digdig/sessions/<session-name>/agent-inputs/`. This avoids PowerShell quoting and Windows command-line length limits, keeps concurrent sessions isolated, and gives each command one inspectable input artifact. The CLI rejects inline JSON and files outside the owning session.

| Command | Required file option |
|---|---|
| External search or extracted bodies | `results-add --data-file <path>` |
| Graph entities/edges | `graph-add --data-file <path>` |
| Approval, skip, restore selections | `--approve-file` / `--skip-file` / `--unskip-file <path>` |
| One/batch Claim | `claim-add --claim-file` / `--claims-file <path>` |
| Evidence verification | `evidence-verify --evidence-file <path>` |

The file must be UTF-8 (a UTF-8 BOM is accepted). Missing, malformed, cross-session, or out-of-directory input fails before state changes. The CLI never deletes Agent input files automatically; `session-delete` removes the entire session only when explicitly requested.

### Claim—Evidence—Review Pipeline (L2/L3 Only)

After search, extraction, and graph building, the Agent can run the claim audit pipeline to verify individual statements before final output. CLI does the deterministic work (evidence anchoring, hash verification, Jaccard matching, policy rules); the Agent does all semantic reasoning (claim extraction, stance judgement, final output decisions).

**Workflow:**

```
Agent writes draft → claim-add (auto evidence-search) → 
evidence-verify (with --complete auto-policy) → Review → Agent adjusts output
```

**Quick Example:**

```powershell
# 1. Put claims from your draft in the session's UTF-8 Agent input directory, then submit it.
dg claim-add my-session --claims-file .\.digdig\sessions\my-session\agent-inputs\claims.json
# → returns claims with IDs + auto-discovered evidence candidates

# 2. Put {resultId, quote, charStart, charEnd} in the session's UTF-8 Agent input directory.
dg evidence-verify my-session --claim-id "cl_001" \
  --evidence-file .\.digdig\sessions\my-session\agent-inputs\evidence.json \
  --stance support --reason "Official docs confirm" --complete
# → returns evidence + verdict + review (decision: approved / needsReview)

# 3. Check final reviews
dg review-list my-session
```

**Key Principles:**
- **Deterministic checks**: CLI validates `resultId` against approved extracted results, UTF-16 offsets within range, and the SHA256 hash of the quoted source span
- **No embedded LLM**: All semantic work (claim extraction, stance) is done by the Agent outside the CLI
- **Policy rules**: 7 rules (singleRefute → highRiskInsufficient → dualSourceSupport → dualSourceMixed → singleSource → allInsufficient → fallback) — pure rule engine, no model calls
- **`--complete` flag**: Evidence + verdict + auto-policy in one call

| Commands | Purpose |
|----------|---------|
| `claim-add` | Submit claims (auto-triggers evidence search) |
| `evidence-verify` | Confirm evidence + submit stance + optional auto-policy |
| `policy-aggregate` | Manual re-aggregation |
| `claim-list` / `evidence-list` / `verdict-list` / `review-list` | Query pipeline state |

The pipeline is **only available for L2/L3 deep search sessions** — L1 simple searches have no session or approved results pool.

### Local Document Search

`doc-index` and `doc-search` enable BM25 full-text search over local documents, with results flowing directly into the session pipeline:

```bash
# Index (auto-triggered by doc-search)
dg doc-index ./docs

# Search and inject into session
dg doc-search <session-name> "query" --path ./docs
```

**How it works:** auto-indexing on first use (Orama BM25, title×3 / headings×2 / content×1), each matched chunk is injected as an `extracted` result with `extractor: "local-index"`, then follows `--quality` → `--approve-file` → `graph-add`. Use `graph-preprocess` before adding new entities so approved IDs become `sourceResultIds`. Local searches do **not** increment the round counter.

**Quality note:** Pure local search yields `sourceDiversity: 1`. Combine with web results for adequate diversity.

### Known Limitations

- Session result and graph mutations use a per-session lock plus atomic replacement; Claim, Evidence, and Review files still have no cross-file transaction.
- URL extraction is not an SSRF security boundary; use only trusted public URLs.
- Local document scanning has no defined symbolic-link boundary or cycle policy.
- Index rebuilds overwrite the current persistence files; an interruption or disk failure can require re-indexing.

See the local, not-yet-published PRD-005 design-improvements document for the deferred remediation plan.

## 💡 Projects Using digdig

digdig's deep search workflow (session accumulation, quality assessment, knowledge graph, claim–evidence–review) is used by projects that need persistent, multi-round research capabilities:

- **[1052 OS](https://github.com/1052666/1052-OS)** — A personal AI operating system. Its `search-pack` integrates persistent research sessions, quality assessment, content extraction, and a claim–evidence–review pipeline, all powered by the same deep search concepts that drive digdig.

> Open a PR to add your project here.

## 🔗 Links

- **GitHub:** https://github.com/hkwuks/digdig
- **npm:** https://www.npmjs.com/package/digdig
- **SearXNG:** https://github.com/searxng/searxng

## 📄 License

MIT
