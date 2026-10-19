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
digdig claim-add <session> --claims-file ./.digdig/sessions/<session>/agent-inputs/claims.json
# Returns claims and evidence candidates for every claim.

# Step 2: Save {resultId, quote, charStart, charEnd} as UTF-8 JSON under this
# session. For each claim, confirm evidence and submit a stance.
digdig evidence-verify <session> --claim-id "cl_001" --evidence-file ./.digdig/sessions/<session>/agent-inputs/evidence-cl_001.json --stance "support" --reason "Official docs confirm directly" --complete
# Returns evidence, verdict, and review; --complete triggers aggregation.

# Repeat Step 2 for cl_002 and cl_003.
```

For the three-claim example, this uses four CLI calls: one batch `claim-add`
and three `evidence-verify` calls. Evidence is anchored to an approved `resultId`,
not a URL; only verified extracted bodies are eligible.

## Review Decision

```text
Review result: approved
  -> cite it

Review result: needsReview
  -> revise the claim and re-verify, or preserve conflicting evidence in output
  -> if no action is taken, drop it and do not cite it
```
