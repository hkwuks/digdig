# Claim-Evidence-Review Audit (L2/L3 Only)

Run this only after completing Phase 1-8 of the deep-search SOP and synthesizing
a draft from approved results and the knowledge graph, before the final answer.
L1 searches have no session or approved-results pool, so they do not run it.

## Timeline

```
Phase 1-8: deep-search SOP
-> Synthesize draft from approved results + knowledge graph
-> Claim-Evidence-Review (two steps)
-> Adjust final output from the Review
-> Final output (cite approved claims only)
```

## CLI Interaction

```bash
# Step 1: Save all claims as UTF-8 JSON under this session, then submit them.
dg claim-add <session> --claims-file ./.digdig/sessions/<session>/agent-inputs/claims.json
# Returns claims and evidence candidates for every claim.

# Step 2: Save {resultId, quote, charStart, charEnd} as UTF-8 JSON under this
# session. For each claim, confirm evidence and submit a stance.
dg evidence-verify <session> --claim-id "cl_001" --evidence-file ./.digdig/sessions/<session>/agent-inputs/evidence-cl_001.json --stance "support" --reason "Official docs confirm directly" --complete
# Returns evidence, verdict, and review; --complete triggers aggregation.

# Repeat Step 2 for cl_002 and cl_003.
```

For the three-claim example, this uses four CLI calls: one batch `claim-add`
and three `evidence-verify` calls. Evidence is anchored to an approved `resultId`,
not a URL; only verified extracted bodies are eligible.

Different domains do not prove independence. Inspect `dg source-relations <session> --claim-id cl_001` and evaluate provenance. Identical or similar captured bodies are hints only, not proof of complete content or common origin. Record an Agent judgment with evidence-specific result and snapshot IDs from `dg evidence-list`:

```json
{"action":"record","left":{"resultId":"r1","snapshotId":"s1"},"right":{"resultId":"r2","snapshotId":"s2"},"relation":"independent","reason":"Independent original interviews, verified by ..."}
```

Save the UTF-8 JSON inside the session's `agent-inputs`, then run `dg source-relations <session> --claim-id cl_001 --data-file <path>` followed by `dg policy-aggregate <session> --claim-id cl_001`. Use `relation: "same"` when warranted. To correct a judgment, submit `{"action":"revoke","id":"<relation-id>","reason":"<why>"}`; history remains visible. Unknown relationships require review; only sources with valid supporting verdicts count. A changed body invalidates judgments tied to its old snapshot. Upgrading an old session moves legacy automatic approvals to history for re-review.

## Review Decision

```text
Review result: approved
  -> cite it

Review result: needsReview
  -> revise the claim and re-verify, or preserve conflicting evidence in output
  -> if no action is taken, drop it and do not cite it
```
