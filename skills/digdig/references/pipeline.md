# Search Pipeline - How Results Flow Through the System

## One Pool, One Pipeline

All results, whether from `dg` search, external tools (tavily/exa), or any other source, go into **the same `results.json` pool** in the session directory. There is no separate path for external results. Everything follows the same flow:

```text
results.json pool (all deduped results)
  status: pending | approved

pending
  -> Agent runs --quality
  -> Agent writes selected {id, revision} objects
  -> Agent approves with --approve-file

approved
  -> CLI injects structural query->result->domain edges
  -> Agent uses graph-add for semantic entities and relations

L2/L3 only
  -> Agent runs claim-add
  -> CLI auto evidence-searches
  -> Agent runs evidence-verify
  -> CLI policy-aggregates
  -> Agent adjusts final output and cites approved claims only
```

## How Results Enter the Pool

| Source | Command | Status |
|--------|---------|--------|
| SearXNG search (default backend) | `dg --session <session> "query"` | pending |
| Ollama web search (L1) | `dg --session <session> --engines ollama "query"` | pending |
| DeepSeek Search (L1) | `dg --session <session> --engines deepseek "query"` | pending |
| External search | `dg results-add <session> --kind search --tool <tool> --query "source query" --data-file <session-input>` | pending, requires extraction |
| External extracted body | `dg results-add <session> --kind extracted --tool <tool> --query "source query" --data-file <session-input>` | pending approval |
| Content extraction | `dg extract --session <session>` | updates content, same status |
| Entity/edge injection | `dg graph-add <session> --data-file <session-input>` | entities/edges only |

> **Key rule**: `graph-add` does NOT accept results. Results must be in the pool first, approved, and injected into graph. Only then can `graph-add` reference result nodes in edges.

## Accumulation & Batch Processing

Results accumulate as pending. A warning fires at **>=30 pending results**, prompting a review pass. This batch approach:

- Reduces token spend (one assessment per batch, not per result)
- Gives the Agent more context for quality decisions (sees all pending together)
- Lets external and dg results be evaluated together

There is no hard upper limit; the Agent decides when to assess. The 30-count is a warning, not a block.

## Pending Review

`dg --session <session> --quality` outputs counted facts:

1. **Session counts**: `total`, `extracted`, `unextracted`, `sources`, `sourceList`
2. **Pending results list**: each with stable `id`, `revision`, title, URL, source, domain, body length, whether it is extracted, whether it is verified, and the round that first saw it

There is no score and no verdict. `extracted` and `verified` are separate
facts: a record can carry readable text and still lack the extractor metadata
approval requires.

The Agent examines the pending list and writes selected `{id, revision}` objects to the approval file. Do not approve by index.

## Approval & Graph Injection

```bash
dg --session <session> --quality --approve-file ./.digdig/sessions/<session>/agent-inputs/approve.json
```

This single command:
1. Marks selected `{id, revision}` results as `approved`
2. Injects them into the graph (structural layer: query->result->domain edges)
3. Reports how many nodes/edges were added

After approval, the result nodes exist in the graph and can be referenced by `graph-add` edges.

## Adding Entities & Edges (After Approval)

Once results are in the graph, run `graph-preprocess` and use `graph-add` for the semantic layer. Every entity and edge requires currently approved `sourceResultIds` from the supporting `resultProvenance` rows; result edges must use `resultProvenance[].id`, not a URL-derived guess. Give a new entity an explicit `id` when an edge in the same request references it.

```bash
dg graph-add <session> --data-file ./.digdig/sessions/<session>/agent-inputs/graph.json
```

Edges can reference any existing node type: `e:` (entity), `r:` (result), `q:` (query), `d:` (domain), `p:` (path).

## Claim-Evidence-Review Pipeline (L2/L3 Only)

After the knowledge graph is built, the Agent can run the claim audit pipeline to verify individual statements before output. This is a **post-search** step; it does not modify the search pool or graph. Re-extract any chosen evidence URL first if it lacks `extractedAt`; verification rejects evidence without a real extraction time.

```
Synthesize draft -> claim-add -> evidence-search (auto) ->
evidence-verify -> policy-aggregate (auto) -> Agent adjusts output
```

See [Claim-Evidence-Review Audit](claim-evidence-review.md) for the full procedure.

## Content Extraction

`dg extract --session <session>` reads only unextracted, unskipped URLs with fewer than two failures, fetches page content, and writes it back. It does NOT add new results. Explicit session URLs can be re-extracted. This means:

- Extract at any time, even before approval
- After extraction, the review has richer content data
- Do not re-extract an already captured body unless the Agent explicitly selects that URL

## Session-Scoped JSON Input

All structured write inputs must be UTF-8 JSON files below `.digdig/sessions/<session>/agent-inputs/`. Inline JSON and files outside the owning session are rejected. This avoids PowerShell argument escaping, keeps concurrent sessions from sharing a fixed temporary filename, and leaves inputs available for inspection and retry.
