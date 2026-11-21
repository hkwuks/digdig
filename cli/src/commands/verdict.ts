/**
 * verdict-list — Verdict query subcommand.
 * Writing verdicts is done through evidence-verify, not here.
 */

import {
  loadVerdicts,
  ClaimsStateError,
  assertClaimsStoreReadable,
} from '../claims/store.js';
import { resolveSessionPath } from '../deep/session.js';
import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';

export async function runVerdictList(
  session: string,
  options: {
    claimId: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  let verdicts;
  try {
    assertClaimsStoreReadable(sessionDir);
    verdicts = loadVerdicts(sessionDir).filter(v => v.claimId === options.claimId);
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify(createErrorEnvelope('CLAIMS_STATE_CORRUPTED', error.message), null, 2));
      return 1;
    }
    throw error;
  }

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    if (verdicts.length === 0) {
      console.log('No verdicts found for this claim.');
      return 0;
    }
    console.log('## Verdicts\n');
    console.log('| ID | Stance | Confidence | Reason |');
    console.log('|----|--------|------------|--------|');
    for (const v of verdicts) {
      console.log(`| ${v.id} | ${v.stance} | ${v.confidence ?? '-'} | ${v.reason.slice(0, 60)} |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ verdicts }), null, 2));
  }

  return 0;
}
