# SXNG DeepSearch SOP

> **Proactive Deep Search**: When the user asks a question that requires multi-angle comparison, research, cross-validation, or any topic where simple search might not suffice, go straight to `--session` deep search. Do not start with simple search and "upgrade" later; creating a session from the first round costs nothing and gives you quality assessment, redundancy checks, and knowledge graph from the start. When uncertain between L1 and L2, choose L2.
>
> **Before using this SOP**: Read `skills/digdig/references/pipeline.md` first; it explains the data flow (single pending pool, batch approval, graph injection order). This SOP assumes you understand that pipeline.

> Standard Operating Procedure for multi-round deep research (Session + Knowledge Graph + Quality Assessment + Recovery)

## 1. Core Philosophy

**Search != Answer**. A single search returns raw information, not verified facts. This SOP ensures output quality through **multi-round iteration + knowledge graph + quality assessment + recovery strategies**.

**Workflow**:

```
Intent Analysis -> Query Planning (with coverage status) -> Multi-source Search -> Content Extraction -> Quality Assessment -> Graph Building -> Recovery/Suggestions -> Loop or Output
```

---

## 2. Trigger Conditions

### When to Use Deep Search (`--session`)

| Scenario | Example |
|----------|---------|
| Multi-dimensional information synthesis | "2026 mainstream vector database comparison" |
| Scattered information requiring cross-validation | "PostgreSQL vs MySQL performance benchmarks" |
| Tech selection / research report | "Rust async ecosystem analysis" |
| Tracking topic evolution | "AI reasoning model development history" |
| Initial search yields insufficient results | Fewer than 5 relevant results |

### When to Use Simple Search (no `--session`)

**Only use simple search when the question is a trivial single-fact lookup with no need for cross-validation.** If there's any chance more depth is needed, start with `--session`; it doesn't cost extra and preserves options.

| Scenario | Example |
|----------|---------|
| Specific fact lookup | "Python dict get method usage" |
| Locating official docs | "FastAPI official documentation URL" |
| Error resolution | "Docker port already allocated fix" |
| Latest version number | "React latest version" |

---

## 3. Complexity Levels (L1/L2/L3)

Choose tool sequences based on problem complexity:

### L1: Single Fact (1-2 search rounds)

**Characteristics**:
- Unique, uncontroversial answer
- 1-2 keywords cover the topic
- No deep comparison needed

**Tool Sequence**:

```bash
# Step 1: Single search
dg "FastAPI latest version" -l 5

# Step 2 (optional): Extract official page for verification
dg extract --urls "https://pypi.org/project/fastapi/"
```

**Stop Conditions**:
- Found >= 1 authoritative source (official docs / PyPI / GitHub)
- No conflicting information

---

### L2: Multi-angle Comparison (2-4 search rounds)

**Characteristics**:
- Comparing 2-5 candidates
- Multiple dimensions needed (performance / features / pricing)
- Information requires cross-validation

**Query Plan**: Before the first search, create the same working-note Query Plan used by L3: list each comparison dimension, required evidence, initial `unsearched` status, and its next gap.

**Tool Sequence**:

```bash
# Step 1: Create Session
dg --session new --owner "agent-1" --desc "Vector DB comparison" "vector database 2026 Pinecone Weaviate Qdrant comparison"

# Step 2: Extract, then preprocess the extracted content
dg extract --session <session>
dg graph-preprocess <session> --format json
# For a JS-heavy page, select the concrete session URL and use Obscura:
# dg extract --session <session> --urls "https://example.com/page" --obscura

# Step 3: Quality assessment + approve selected {id, revision} objects into the structural graph
dg --session <session> --quality
dg --session <session> --quality --approve-file .\.digdig\sessions\<session>\agent-inputs\approve.json

# Step 4: Agent writes graph.json with approved sourceResultIds, then builds the semantic graph.
dg graph-add <session> --data-file .\.digdig\sessions\<session>\agent-inputs\graph.json

# Step 5: If a Query Plan gap remains, get suggestions + supplementary search
dg suggest-queries <session> --format json
dg --session <session> --queries "Pinecone pricing 2026,Weaviate vs Qdrant benchmark" --redundancy warn

# Return to Steps 2-4 for every new result batch: extract, preprocess,
# approve, then add any needed entities or edges.

# Step 6: Explore graph to verify coverage
dg graph-explore <session> --seed "Pinecone" --format json
```

**Stop Conditions**:
- Quality assessment verdict is good or acceptable
- Each candidate has >= 2 independent sources
- Key entities connected in graph
- Every core Query Plan row is `covered`, or any `blocked` row is disclosed in the output

---

### L3: Deep Research (4+ search rounds)

**Characteristics**:
- Research-grade report
- Systematic coverage of subtopics required
- Information may conflict, requiring adjudication

**Standard Operating Procedure (8-Phase SOP)**:

#### Phase 1: Intent Analysis & Initial Search

Sessions are stored under `.digdig/sessions/` by default.

**Output**:
- Core question in one sentence
- Decomposed into 3-7 sub-queries
- Query Plan: each sub-question's required evidence and initial `unsearched` status

Before searching, create this plan in the Agent's working notes. It is not persisted by the CLI:

| Sub-question / Claim | Required evidence | Status | Next query, if needed |
|---|---|---|---|
| `<question>` | official / independent / counter-evidence / current source | unsearched | `<query only when a gap exists>` |

```bash
dg --session new --owner "researcher" --desc "RAG Vector DB deep research" --queries "vector database 2026 ranking,vector DB for RAG comparison"
```

#### Phase 2: Preprocessing & Entity Discovery

```bash
# Extract key page content
dg extract --session <session>

# Get TF-IDF terms, co-occurrence pairs, existing entities from extracted content
dg graph-preprocess <session> --format json
```

**Agent Decision Logic**:
- Select terms with tfidf > threshold that are not in existing entity list
- Prioritize terms with high co-occurrence count (high connectivity)
- Avoid overly broad terms

#### Phase 3: Quality Assessment & Agent Approval

Approve the extracted results before adding semantic entities or edges. This creates the structural result nodes that later edges can reference.

```bash
dg --session <session> --quality
dg --session <session> --quality --approve-file .\.digdig\sessions\<session>\agent-inputs\approve.json
```

#### Phase 4: Build Knowledge Graph

> **Before Phase 4**: Approved results must already exist in the graph via `--quality --approve-file`. `graph-add` only accepts entities and edges; results go through the pending pipeline first.

```bash
dg graph-add <session> --data-file .\.digdig\sessions\<session>\agent-inputs\graph.json
```

The knowledge graph has two layers:
- **Structural** (auto-built via --approve-file): query->result->domain nodes and edges
- **Semantic** (added by you via `graph-add`): entity nodes with custom relation edges

When adding edges, `source`/`target` must reference existing node IDs. Run `graph-preprocess` after extraction and use `resultProvenance[].id` for result nodes; never construct a result ID from its URL. Every entity and edge needs currently approved `sourceResultIds` from those provenance rows. When an edge references a newly created entity in the same request, set an explicit `id` such as `e:entity-name`. Node ID prefix rules:

| Prefix | Type | Format | Example |
|--------|------|--------|---------|
| `e:` | Entity | explicit ID when an edge needs it | `e:tokio` |
| `r:` | Result | generated ID | `resultProvenance[].id` |
| `q:` | Query | generated ID | graph structural node |
| `d:` | Domain | generated ID | graph structural node |
| `p:` | Path | `p:<type>_<num>` | `p:chain_001` |

References to non-existent nodes are skipped and reported in `skippedEdges`.

**External Search Results Integration**: When you use other search tools (tavily, exa, open-web-search, etc.) during a deep search session, use `results-add` to inject results. They go through the same pipeline as digdig-native results: **pending -> quality assessment -> approval -> graph injection**. Use `graph-add` only for entities/edges after approval.

```bash
# Step 1: Save external discovery JSON under the session, then import it (becomes pending).
dg results-add <session> --kind search --tool exa --query "external source query" --data-file .\.digdig\sessions\<session>\agent-inputs\external-search.json

# Step 2: Extract, then run quality assessment and approve (injects into graph)
dg extract --session <session>
dg --session <session> --quality
dg --session <session> --quality --approve-file .\.digdig\sessions\<session>\agent-inputs\approve.json

# Step 3: Save entities and edges with approved sourceResultIds, then add them.
dg graph-add <session> --data-file .\.digdig\sessions\<session>\agent-inputs\graph.json
```

The origin `tool` (`"digdig"` | `"tavily"` | `"exa"` | `"open-web-search"` | ...) records which tool produced each result. digdig-native results default to `"digdig"`. External results participate equally in quality assessment, path discovery, and domain diversity; the graph treats them identically regardless of source.

> **Note**: `results-add --kind search` marks discoveries as `pending` and they require extraction. `--kind extracted` accepts an external body with `content` and `extractor`, then it awaits approval. Neither kind enters the graph until Agent approval via `--quality --approve-file`.

> **Two-layer quality assessment:**
> 1. **Programmatic pre-filter**: CLI computes 3 indicators (contentDepth, sourceDiversity, novelty) to flag obviously poor batches
> 2. **Agent final review**: Agent sees each pending result's title, content preview, source, and domain; then decides which `{id, revision}` objects to keep
>
> Results are accumulated as `pending`; they are not in the knowledge graph until approved by the Agent via `--approve-file`. External results injected via `results-add` also go through pending first.

3 independent indicators for programmatic pre-filter (each with its own threshold):

| Indicator | Purpose | Threshold |
|-----------|---------|-----------|
| contentDepth | Filter empty/very short extractions | >= 150 chars average |
| sourceDiversity | Ensure not all from same domain | >= 3 distinct domains |
| novelty | Prevent circular/redundant results | >= 30% novel (Jaccard) |

| Verdict | Meaning | Agent Action |
|---------|---------|-------------|
| good | All pre-filters pass | Review and approve likely good results |
| acceptable | 1 pre-filter failed | Review carefully; some results may still be valuable |
| poor | >=2 pre-filters failed | Strong signal to reformulate query or adjust strategy |

> **Agent decision criteria** (based on per-result data in `--quality` output):
> - **Relevance**: Does the content preview address the query?
> - **Authority**: Is the source credible (official docs, academic, known expert)?
> - **Depth**: Is the content substantive or superficial?
> - **Redundancy**: Does it add new information vs. already-approved results?
> - **Recency**: Is the information current enough for the query?

**Query Plan update (mandatory):** Mark each sub-question as `covered`, `partial`, or `blocked` only from approved and, where needed, extracted results. Record the concrete missing item for every non-covered row: an official source, independent confirmation, counter-evidence, a current version, or a resolved conflict.

#### Phase 5: Query Suggestions

```bash
dg suggest-queries <session> --format json
```

**Agent Decision Logic**:
- `topEntities` has high degree x frequency but unexplored entities: search using them as keywords
- `unexploredDomains` is non-empty: choose query terms related to new domains
- `qualityLastRound.failedIndicators` contains "sourceDiversity": add `-e` flag to use different engines
- Choose only a query that closes one recorded Query Plan gap. If no gap remains, stop rather than searching for more supporting material.
- When the gap is an official source, target the official publisher; when it is independence, seek a non-cross-posted source; when it is a conflict, seek the primary record or retain the disagreement.

#### Phase 6: Continue Search (with Redundancy Check)

```bash
dg "follow-up query" --session <session> --redundancy warn
```

Before this command, update the Query Plan and state which row and evidence gap the query addresses. Then return to Phase 2. Stop when all core rows are `covered`, the round budget is exhausted, or remaining core rows are explicitly `blocked` and will be disclosed.

#### Phase 7: Recovery Analysis (when consecutive poor quality)

```bash
dg recovery-analysis <session> --format json
```

| Strategy | Applicable Scenario | Agent Action |
|----------|---------------------|-------------|
| reformulate | Query too specific, too few results | Remove qualifiers, use broader terms |
| engine_rotation | Current engine missed results | Switch engine combination (e.g., google -> arxiv+github) |
| category_shift | Current category has poor results | Switch to different category (e.g., general -> it) |
| backtrack | >=2 consecutive poor rounds | Return to last good quality round, explore different direction |

When `--quality` is consecutively `poor`, or `sourceDiversity` / `contentDepth`
fails across multiple rounds, consider adding Tavily, Exa, or similar external
search tools in addition to changing engines/categories, then inject those
results into the current session with `results-add`.

Also check search stage suggestions:

```bash
dg strategy-info <session> --format json
```

- `broad_exploration`: First 2-3 rounds, use general engines
- `targeted_deep_dive`: After entity growth slows, switch to specialized engines (arxiv, github, semantic_scholar)

### Search Backend Failure Recovery

**Scenario**: SearXNG (or the current search backend) returns 0 results, errors out, or times out. The session itself is healthy; only the search source failed.

**Correct Response**:

1. **Switch backends, not sessions.** Use alternative search tools (tavily, exa, open-web-search, web search MCP tools) to get results.
2. **Inject all results into the current session** via `results-add`, retaining the query that produced them:
   ```bash
    dg results-add <session> --kind search --tool <tool> --query "failed-backend query" --data-file .digdig/sessions/<session>/agent-inputs/fallback-search.json
   ```
3. **Continue the normal pipeline**: extract -> `--quality` -> `--approve-file` -> graph-preprocess -> `graph-add`.

**What NOT to do**:

| Don't | Do |
|----------|------|
| Create a new session for the same topic | Reuse the existing session |
| Output search results directly without injecting | Always inject via `results-add` |
| Abandon the session because "SearXNG is down" | The session owns the state, not the backend |
| Use a different search flow that bypasses the session's pipeline | Every result goes through the same pending -> approve -> graph flow |

**Rule**: A backend failure is NOT session corruption. The session stores state; it is decoupled from any single search source. Only abandon a session when its data files are actually corrupted (`results.json` unreadable), never because a backend returned errors.

#### Phase 8: Graph Exploration (navigate knowledge space after quality is good)

```bash
# Discover entities
dg graph-search <session> --keyword <term> --format json

# View entity relations
dg graph-explore <session> --seed <entity> --format json

# Drill into specific relations
dg graph-drill <session> --seed <entity> --relations <list> --format json

# Traverse reasoning paths
dg graph-traverse <session> --path <path-id> --format json
```

**Agent Decision Logic**:
1. Check recommended commands in `suggestedNextSteps`
2. Evaluate weight and target score of each relation
3. Choose the relation direction with highest weight that hasn't been visited
4. Use `graph-drill` to get specific triples
5. If dead end, use alternativePaths suggestions

#### View Full Session Report

```bash
dg session-report <session> --format json
```

---

## 4. Search Planning Framework

### 4.1 Intent Analysis

Extract from user question:

| Field | Description | Example |
|-------|-------------|---------|
| `core_question` | One-sentence restatement | "Best vector DB for RAG in 2026 Q2?" |
| `query_type` | factual/comparative/exploratory | "comparative" |
| `time_sensitivity` | realtime/recent/historical | "recent" |
| `terms_to_verify` | Terms to verify first | ["RAG workload", "HNSW"] |

### 4.2 Query Decomposition Principles

- **Non-overlapping**: Sub-queries should not duplicate each other
- **Dependency annotation**: When B depends on A's results, annotate `depends_on: [A]`
- **Quantity limit**: 3-7 sub-queries; if exceeded, split the topic
- **Evidence requirement**: For every sub-query, state whether completion requires an official source, independent confirmation, counter-evidence, or recency verification.
- **Closure rule**: A sub-query is `covered` only after its required evidence is approved; otherwise it remains `partial` or `blocked` with a named gap.

### 4.3 Strategy Selection

| Strategy | Applicable Scenario |
|----------|---------------------|
| `broad_exploration` | Exploratory ("what are the options"), first 2-3 rounds |
| `targeted_deep_dive` | Analytical (candidates identified, need details), after entity growth slows |

Use `strategy-info` command to determine current stage.

---

## 4. Local Document Search (doc-index / doc-search)

### When to use

- User explicitly asks to search local documents/notes/manuals
- User provides a document path in their request
- Web search results are insufficient for the topic and you have relevant local docs
- Topic relates to private/internal information unlikely to be on the web

### How it works

1. `doc-search <session> <query> --path <path>`:
   - If path not indexed: auto-indexes before searching (no separate index step needed)
   - Searches index with BM25 field-weighted search (title:3, headings:2, content:1)
   - Results injected into session as `source: "local"` (pending state)
   - Does NOT increment session round counter (merged with current web round)

2. Results follow the same pipeline: pending -> quality -> approve -> graph

### Agent Decision Flow

| Signal | Action |
|--------|--------|
| User says "search my docs/notes at <path>" | Run `doc-search <session> <query> --path <path>` |
| User mentions local docs but no path | ASK: "Which directory are your documents in?" |
| Topic matches previously indexed path | Run `doc-search` against that path |
| General web question, no mention of local docs | Do NOT search local docs |

### Quality Assessment Note

Local-only results (`source: "local"`) will have `sourceDiversity: 1` because all results share the same domain-less source. This is correct behavior; pure local search is not diverse enough to pass quality. Always combine with web results for adequate source diversity.

---

## Claim-Evidence-Review Audit (L2/L3 Only)

After completing Phase 1-8 and synthesizing a draft, run the
[Claim-Evidence-Review Audit](claim-evidence-review.md) before final output.
L1 searches have no session or approved-results pool, so they do not run it.

---

## 5. Self-Check List

Before outputting final answer, verify:

- [ ] Every factual conclusion has `[Title](URL)` citation
- [ ] Single-source conclusions are marked **Confidence: Low** (see [Cross-Validation](evidence-standards.md#2-cross-validation))
- [ ] Source disagreements show evidence from both sides (see [Conflict Resolution](evidence-standards.md#3-conflict-resolution))
- [ ] Used `dg extract` to extract key page content
- [ ] L2/L3 levels used `--session` and knowledge graph
- [ ] L3 level used `--quality` assessment and decided next steps accordingly
- [ ] **L2/L3: ran Claim-Evidence-Review pipeline** (`claim-add` -> `evidence-verify` -> review)
- [ ] **Final output only cites `approved` claims** (`needsReview` claims either dropped or marked as uncertain)
- [ ] No evidence-free phrases like "it is generally believed" / "reports indicate"
- [ ] Graph coverage verified via `graph-explore`

---

> **Further Reading**:
> - [Evidence Standards](evidence-standards.md): source credibility tiers, cross-validation rules, conflict resolution, citation format
> - [Appendix: Example & Anti-Patterns](appendix.md): complete L3 walkthrough and common mistakes to avoid
