/**
 * Claim add and list commands for the review pipeline.
 */

import {
  Claim,
} from '../claims/types.js';
import { EvidenceCandidate } from '../claims/deterministic-checks.js';
import {
  loadClaims,
  saveClaims,
  getClaimsByStatus,
  ClaimsStateError,
  assertClaimsStoreReadable,
} from '../claims/store.js';
import { searchCandidates } from '../claims/deterministic-checks.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { initSessionDir, mutateSessionState, resolveSessionPath } from '../deep/session.js';
import { isJsonObject, readSessionJsonInput } from './json-input.js';

interface ClaimInput {
  text: string;
  subject?: string;
  predicate?: string;
  object?: string;
  time?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export async function runClaimAdd(
  session: string,
  options: {
    claimFile?: string;
    claimsFile?: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  initSessionDir(sessionDir);

  // Parse input
  let inputs: ClaimInput[] = [];

  const input = readSessionJsonInput(sessionDir, [
    { option: '--claim-file', value: options.claimFile, file: true },
    { option: '--claims-file', value: options.claimsFile, file: true },
  ]);
  if (!input.ok) {
    console.log(JSON.stringify(createErrorEnvelope(input.code, input.message), null, 2));
    return 1;
  }

  const batchInput = input.source === '--claims-file';
  if (batchInput && !Array.isArray(input.value)) {
    console.log(JSON.stringify(createErrorEnvelope('INVALID_CLAIMS', '--claims-file must contain a JSON array'), null, 2));
    return 1;
  }
  inputs = batchInput ? input.value as ClaimInput[] : [input.value as ClaimInput];

  // Validate required fields
  for (let i = 0; i < inputs.length; i++) {
    if (!isJsonObject(inputs[i]) || !inputs[i].text || typeof inputs[i].text !== 'string') {
      console.log(JSON.stringify(createErrorEnvelope('MISSING_TEXT', `Entry ${i} is missing required field "text"`), null, 2));
      return 1;
    }
    const risk = inputs[i].riskLevel;
    if (risk !== undefined) {
      if (typeof risk !== 'string' || !['low', 'medium', 'high'].includes(risk.toLowerCase())) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_RISK_LEVEL', `Entry ${i}: riskLevel must be low, medium, or high`), null, 2));
        return 1;
      }
      inputs[i].riskLevel = risk.toLowerCase() as Claim['riskLevel'];
    }
  }

  let result: Record<string, any>;
  try {
    result = mutateSessionState(sessionDir, () => {
      assertClaimsStoreReadable(sessionDir);
      const existing = loadClaims(sessionDir);
      const now = Date.now();
      const newClaims: Claim[] = [];
      const candidates: Record<string, EvidenceCandidate[]> = {};

      for (const [index, input] of inputs.entries()) {
        const id = `cl_${String(existing.length + index + 1).padStart(3, '0')}`;
        const claim: Claim = {
          id,
          text: input.text,
          subject: input.subject,
          predicate: input.predicate,
          object: input.object,
          time: input.time,
          riskLevel: input.riskLevel || 'medium',
          status: 'pending',
          sessionDir,
          createdAt: now,
        };
        newClaims.push(claim);
        candidates[id] = searchCandidates(sessionDir, claim.text);
      }

      saveClaims(sessionDir, [...existing, ...newClaims]);
      return {
        claims: newClaims.map(c => ({ id: c.id, text: c.text, status: c.status })),
        candidates,
      };
    });
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify(createErrorEnvelope('CLAIMS_STATE_CORRUPTED', error.message), null, 2));
      return 1;
    }
    throw error;
  }

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    console.log('## Claim-Add Results\n');
    for (const c of result.claims) {
      console.log(`**${c.id}**: ${c.text}`);
      console.log(`- Status: ${c.status}`);
      const cs = result.candidates[c.id] || [];
      if (cs.length > 0) {
        console.log(`- Candidates: ${cs.length} found`);
        for (const cand of cs) {
          console.log(`  - [${cand.domain}] ${cand.quote.slice(0, 80)}...`);
        }
      } else {
        console.log('- Candidates: none');
      }
      console.log('');
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope(result), null, 2));
  }

  return 0;
}

export async function runClaimList(
  session: string,
  options: {
    status?: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);

  const statusFilter = options.status as Claim['status'] | undefined;
  let claims: Claim[];
  try {
    assertClaimsStoreReadable(sessionDir);
    claims = getClaimsByStatus(sessionDir, statusFilter);
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify(createErrorEnvelope('CLAIMS_STATE_CORRUPTED', error.message), null, 2));
      return 1;
    }
    throw error;
  }
  const outputFormat = options.format || 'json';

  if (outputFormat === 'md') {
    if (claims.length === 0) {
      console.log('No claims found.');
      return 0;
    }
    console.log('## Claims\n');
    console.log('| ID | Text | Status | Risk |');
    console.log('|---:|------|--------|------|');
    for (const c of claims) {
      console.log(`| ${c.id} | ${c.text} | ${c.status} | ${c.riskLevel} |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ claims }), null, 2));
  }

  return 0;
}
