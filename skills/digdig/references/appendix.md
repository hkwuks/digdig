# Appendix: Complete Example and Anti-Patterns

> Worked examples and common mistakes for deep search sessions.
>
> This is a reference companion to the [SOP](SOP.md). Read the SOP first for the operational procedure.

## 1. Complete L3 Example: "2026 Vector Database Deep Comparison"

```bash
# Phase 1: Create Session
dg --session new --owner "researcher" --desc "Vector DB deep research 2026" --queries "vector database 2026 ranking,vector DB for RAG comparison"
# Use the session name printed by the previous command as <session>.

# Phase 2: Extract + preprocess
dg extract --session <session>
dg graph-preprocess <session> --format json

# Phase 3: Quality assessment + approve selected {id, revision} objects into the structural graph
dg --session <session> --quality
# Save selected objects from quality output to approve.json, then approve and inject into graph:
dg --session <session> --quality --approve-file ./.digdig/sessions/<session>/agent-inputs/approve.json

# Phase 4: Save semantic entities and edges with approved sourceResultIds from
# graph-preprocess in graph.json, then add them after result nodes exist.
dg graph-add <session> --data-file ./.digdig/sessions/<session>/agent-inputs/graph.json

# Phase 5-6: If quality not met, supplementary search
dg suggest-queries <session> --format json
dg --session <session> --queries "Qdrant rust implementation,HNSW vs IVF performance" --redundancy warn

# Re-extract + assess + approve + preprocess + add entities
dg extract --session <session>
dg --session <session> --quality
dg --session <session> --quality --approve-file ./.digdig/sessions/<session>/agent-inputs/approve-round-2.json
dg graph-preprocess <session> --format json
dg graph-add <session> --data-file ./.digdig/sessions/<session>/agent-inputs/graph-round-2.json

# Phase 7: Recovery when rounds stop producing
dg coverage <session> --format json
dg strategy-info <session> --format json

# Phase 8: Graph exploration
dg graph-search <session> --keyword "vector"
dg graph-explore <session> --seed "Pinecone" --format json
dg graph-drill <session> --seed "Pinecone" --relations "uses,competitor" --format json

# Phase 9: Claim-Evidence-Review (after draft, before output).
# Save claims and each {resultId, quote, charStart, charEnd} evidence object under agent-inputs.
dg claim-add <session> --claims-file ./.digdig/sessions/<session>/agent-inputs/claims.json
dg evidence-verify <session> --claim-id "cl_001" --evidence-file ./.digdig/sessions/<session>/agent-inputs/evidence-cl_001.json --stance support --reason "Official site confirms" --complete
dg evidence-verify <session> --claim-id "cl_002" --evidence-file ./.digdig/sessions/<session>/agent-inputs/evidence-cl_002.json --stance support --reason "..." --complete
dg evidence-verify <session> --claim-id "cl_003" --evidence-file ./.digdig/sessions/<session>/agent-inputs/evidence-cl_003.json --stance insufficient --reason "No benchmark data found" --complete

# Phase 10: Agent adjusts output based on review results
# cl_001: approved (cite), cl_002: approved (cite), cl_003: needsReview (do not cite or mark uncertain)
```

---

## 2. Anti-Patterns (Don'ts)

| Anti-Pattern | Correct Approach |
|-------------|-----------------|
| Drawing conclusions from a single search | Use `--session` multi-round iteration for L2/L3 |
| Using only one source | Cross-validate each fact with >= 2 independent sources |
| Ignoring source quality | Distinguish white list / grey zone / black list sources |
| Hiding information disagreements | Present disagreements and explain judgment basis |
| Fabricating citation links | Only use URLs actually visited |
| Reading summaries without extracting content | Use `extract` for key sources |
| Building knowledge graph without querying it | Use `graph-explore` to verify coverage |
| Continuing search without reviewing pending facts | Read `--quality` and `coverage` each round, decide accordingly |
| Repeating queries wasting rounds | Use `--redundancy warn` to check redundancy |
| Not recovering when rounds stop producing | Read `coverage` for per-round new/repeated counts and change direction |
| Deleting sessions without user approval | Keep session inputs unless the user explicitly asks to delete them |
| Using `query-graph` | Deprecated, use `graph-explore` + `graph-drill` |
| Search backend fails -> abandon session | Switch backend (`-e ollama` / `-e deepseek`, or ollama/tavily/exa), inject via `results-add`, keep session |
| SearXNG returns 0 results -> create new session | The session is decoupled from any backend; use `results-add` instead |
| Inline JSON or a project-root temp file | Put UTF-8 JSON in `.digdig/sessions/<session>/agent-inputs/` and use `--*-file` |
| Treating a search excerpt as a body | Import it with `--kind search`, then extract; use `--kind extracted` only for actual external bodies |

---

> **Back to**: [SOP](SOP.md): core operational procedure
