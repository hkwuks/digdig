import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runClaimAdd } from '../../src/commands/claim.js';
import { loadClaims, saveClaims } from '../../src/claims/store.js';
import { readSessionJsonInput } from '../../src/commands/json-input.js';
import { readRecords } from '../../src/deep/session-store-claims.js';

vi.mock('../../src/deep/session.js', () => ({ resolveSessionPath: () => 'session', initSessionDir: vi.fn(), mutateSessionState: (_: unknown, fn: () => unknown) => fn() }));
vi.mock('../../src/commands/json-input.js', () => ({ isJsonObject: (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v), readSessionJsonInput: vi.fn() }));
vi.mock('../../src/claims/deterministic-checks.js', () => ({ searchCandidates: () => [] }));
vi.mock('../../src/claims/store.js', async original => ({ ...await original<typeof import('../../src/claims/store.js')>(), saveClaims: vi.fn() }));
vi.mock('../../src/deep/session-store.js', () => ({ withSessionRead: (_: unknown, fn: (db: unknown) => unknown) => fn({}) }));
vi.mock('../../src/deep/session-store-claims.js', () => ({ readRecords: vi.fn(() => []), writeRecords: vi.fn() }));

describe('claim risk validation', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'log').mockImplementation(() => {}); });

  it('normalizes case before saving', async () => {
    vi.mocked(readSessionJsonInput).mockReturnValue({ ok: true, source: '--claim-file', value: { text: 'claim', riskLevel: 'HIGH' } } as never);
    expect(await runClaimAdd('session', { claimFile: 'input' })).toBe(0);
    expect(vi.mocked(saveClaims).mock.calls[0][1][0].riskLevel).toBe('high');
  });

  it('defaults an omitted risk to medium', async () => {
    vi.mocked(readSessionJsonInput).mockReturnValue({ ok: true, source: '--claim-file', value: { text: 'claim' } } as never);
    expect(await runClaimAdd('session', { claimFile: 'input' })).toBe(0);
    expect(vi.mocked(saveClaims).mock.calls[0][1][0].riskLevel).toBe('medium');
  });

  it('rejects a whole batch when one risk is invalid', async () => {
    vi.mocked(readSessionJsonInput).mockReturnValue({ ok: true, source: '--claims-file', value: [{ text: 'a', riskLevel: 'HIGH' }, { text: 'b', riskLevel: 'critical' }] } as never);
    expect(await runClaimAdd('session', { claimsFile: 'input' })).toBe(1);
    expect(saveClaims).not.toHaveBeenCalled();
  });

  it.each(['critical', '', null, 1])('rejects invalid input %s without saving', async riskLevel => {
    vi.mocked(readSessionJsonInput).mockReturnValue({ ok: true, source: '--claim-file', value: { text: 'claim', riskLevel } } as never);
    expect(await runClaimAdd('session', { claimFile: 'input' })).toBe(1);
    expect(saveClaims).not.toHaveBeenCalled();
  });

  it('rejects an invalid historical risk level without changing it', () => {
    vi.mocked(readRecords).mockReturnValue([{ id: 'cl_1', riskLevel: 'HIGH' }]);
    expect(() => loadClaims('session')).toThrow('Invalid riskLevel');
    expect(saveClaims).not.toHaveBeenCalled();
  });
});
