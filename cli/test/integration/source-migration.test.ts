import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'child_process';
import { openSessionDatabase } from '../../src/deep/session-db.js';
import { openSessionStore } from '../../src/deep/session-migrate.js';

describe('source independence migration', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dg-source-migrate-'));
    file = join(dir, 'session.sqlite');
    const db = new DatabaseSync(file);
    db.exec(`CREATE TABLE session_meta (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL, origins_present INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE origins (result_id TEXT NOT NULL, ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(result_id, ordinal));
      CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE body_versions (id TEXT PRIMARY KEY, result_id TEXT NOT NULL, content_hash TEXT NOT NULL, content TEXT NOT NULL, UNIQUE(result_id, content_hash));
      CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, result_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE verdicts (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE verdict_evidence (verdict_id TEXT NOT NULL, evidence_id TEXT NOT NULL, PRIMARY KEY(verdict_id, evidence_id));
      CREATE TABLE reviews (claim_id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE review_history (id INTEGER PRIMARY KEY, claim_id TEXT NOT NULL, data TEXT NOT NULL, invalidated_at INTEGER NOT NULL);
      CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
      PRAGMA user_version = 2;`);
    const putClaim = db.prepare('INSERT INTO claims VALUES (?, ?)');
    const putReview = db.prepare('INSERT INTO reviews VALUES (?, ?)');
    for (const [id, autoPass] of [['auto', true], ['manual', false]] as const) {
      putClaim.run(id, JSON.stringify({ id, status: 'reviewed' }));
      putReview.run(id, JSON.stringify({ claimId: id, decision: 'approved', autoPass, matchedRule: autoPass ? 'dualSourceSupport' : 'manual' }));
    }
    db.close();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('archives legacy automatic approvals and keeps manual reviews', () => {
    const db = openSessionDatabase(file);
    try {
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
      expect(db.prepare('SELECT claim_id FROM reviews ORDER BY claim_id').all()).toEqual([{ claim_id: 'manual' }]);
      expect(JSON.parse(String(db.prepare('SELECT data FROM review_history WHERE claim_id = ?').get('auto')?.data))).toMatchObject({ decision: 'approved', autoPass: true });
      expect(JSON.parse(String(db.prepare('SELECT data FROM claims WHERE id = ?').get('auto')?.data)).status).not.toBe('reviewed');
    } finally { db.close(); }
  });

  it('rolls back the entire upgrade when an old review cannot be parsed', () => {
    const db = new DatabaseSync(file);
    db.prepare('UPDATE reviews SET data = ? WHERE claim_id = ?').run('{invalid', 'auto');
    db.close();
    let error: unknown;
    let unexpected: DatabaseSync | undefined;
    try { unexpected = openSessionDatabase(file); } catch (caught) { error = caught; } finally { unexpected?.close(); }
    expect(error).toBeDefined();
    const reopened = new DatabaseSync(file);
    try {
      expect(reopened.prepare('PRAGMA user_version').get()?.user_version).toBe(2);
      expect(reopened.prepare('SELECT count(*) AS n FROM reviews').get()?.n).toBe(2);
      expect(reopened.prepare('SELECT count(*) AS n FROM review_history').get()?.n).toBe(0);
    } finally { reopened.close(); }
  });

  it('rolls back an interrupted v2 upgrade and retries safely', async () => {
    const script = `
      import { DatabaseSync } from 'node:sqlite'; import { writeSync } from 'node:fs';
      const prepare = DatabaseSync.prototype.prepare;
      DatabaseSync.prototype.prepare = function(sql) {
        const statement = prepare.call(this, sql);
        if (!sql.startsWith('INSERT INTO review_history')) return statement;
        return { run(...args) { const result = statement.run(...args); writeSync(1, 'ARCHIVED\\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000); return result; } };
      };
      const { openSessionDatabase } = await import('./src/deep/session-db.ts'); openSessionDatabase(process.argv[1]);`;
    const worker = spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', script, file], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise<void>(resolve => worker.once('exit', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { worker.kill(); reject(new Error('upgrade did not reach archive')); }, 15000);
      worker.stdout.on('data', chunk => { if (String(chunk).includes('ARCHIVED')) { clearTimeout(timeout); resolve(); } });
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== null) { clearTimeout(timeout); reject(new Error(`upgrade exited early: ${code}`)); } });
    });
    worker.kill(); await exited;
    const before = new DatabaseSync(file);
    expect(before.prepare('PRAGMA user_version').get()?.user_version).toBe(2);
    expect(before.prepare('SELECT count(*) AS n FROM review_history').get()?.n).toBe(0);
    before.close();
    const upgraded = openSessionDatabase(file);
    expect(upgraded.prepare('SELECT count(*) AS n FROM review_history').get()?.n).toBe(1);
    upgraded.close();
  }, 30000);

  it('serializes simultaneous v2 upgrades without duplicating review history', async () => {
    const script = "const { openSessionDatabase } = await import('./src/deep/session-db.ts'); const db = openSessionDatabase(process.argv[1]); db.close();";
    const start = () => new Promise<number | null>((resolve, reject) => {
      const worker = spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', script, file], { cwd: process.cwd(), stdio: 'ignore' });
      worker.once('error', reject); worker.once('exit', resolve);
    });
    expect(await Promise.all([start(), start()])).toEqual([0, 0]);
    const db = openSessionDatabase(file);
    expect(db.prepare('SELECT count(*) AS n FROM review_history').get()?.n).toBe(1);
    db.close();
  }, 30000);
});

it('also invalidates old automatic reviews imported from legacy JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dg-source-json-'));
  try {
    mkdirSync(join(dir, 'claims'));
    writeFileSync(join(dir, 'claims', 'claims.json'), JSON.stringify({ status: 'ok', data: { items: [{ id: 'c1', riskLevel: 'low', status: 'reviewed' }] } }));
    writeFileSync(join(dir, 'claims', 'reviews.json'), JSON.stringify({ status: 'ok', data: { items: [{ claimId: 'c1', decision: 'approved', autoPass: true }] } }));
    const db = openSessionStore(dir, false)!;
    try {
      expect(db.prepare('SELECT count(*) AS n FROM reviews').get()?.n).toBe(0);
      expect(db.prepare('SELECT count(*) AS n FROM review_history').get()?.n).toBe(1);
    } finally { db.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
