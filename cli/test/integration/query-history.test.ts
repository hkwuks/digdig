import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import { openSessionDatabase } from '../../src/deep/session-db.js';
import { initSessionDir, loadSessionQueryHistory, loadSessionRounds, recordSuccessfulQuery } from '../../src/deep/session.js';

describe('persistent query history', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dg-query-db-')); initSessionDir(dir); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('upgrades an existing v3 session without changing its data', () => {
        const db = new DatabaseSync(join(dir, 'session.sqlite'));
        db.exec('DROP TABLE search_queries; PRAGMA user_version = 3');
        db.close();
        expect(loadSessionQueryHistory(dir)).toEqual([]);
        recordSuccessfulQuery(dir, 'new query');
        const reopened = new DatabaseSync(join(dir, 'session.sqlite'));
        try {
            expect(reopened.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
            expect(reopened.prepare('SELECT query, round FROM search_queries').all()).toEqual([{ query: 'new query', round: 1 }]);
            expect(reopened.prepare("SELECT 1 FROM session_meta WHERE key = 'migration_complete'").get()).toBeDefined();
        } finally { reopened.close(); }
    });

    it('rolls back both the query and round when persisting a success fails', () => {
        const db = new DatabaseSync(join(dir, 'session.sqlite'));
        db.exec("CREATE TRIGGER reject_query BEFORE INSERT ON search_queries BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
        db.close();
        expect(() => recordSuccessfulQuery(dir, 'query')).toThrow();
        expect(loadSessionRounds(dir)).toBe(0);
        expect(loadSessionQueryHistory(dir)).toEqual([]);
    });

    it('rolls back an interrupted v3 schema upgrade and can retry', async () => {
        const file = join(dir, 'session.sqlite');
        const legacy = new DatabaseSync(file);
        legacy.exec('DROP TABLE search_queries; PRAGMA user_version = 3');
        legacy.close();
        const script = `
            import { DatabaseSync } from 'node:sqlite'; import { writeSync } from 'node:fs';
            const exec = DatabaseSync.prototype.exec;
            DatabaseSync.prototype.exec = function(sql) {
                const result = exec.call(this, sql);
                if (sql.startsWith('CREATE TABLE search_queries')) { writeSync(1, 'CREATED\\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000); }
                return result;
            };
            const { openSessionDatabase } = await import('./src/deep/session-db.ts'); openSessionDatabase(process.argv[1]);
        `;
        const worker = spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', script, file], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
        const exited = new Promise<void>(resolve => worker.once('exit', () => resolve()));
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { worker.kill(); reject(new Error('upgrade did not create the table')); }, 15000);
            worker.stdout.on('data', chunk => { if (String(chunk).includes('CREATED')) { clearTimeout(timeout); resolve(); } });
            worker.once('error', reject);
            worker.once('exit', code => { if (code !== null) { clearTimeout(timeout); reject(new Error(`upgrade exited early: ${code}`)); } });
        });
        worker.kill(); await exited;
        const before = new DatabaseSync(file);
        expect(before.prepare('PRAGMA user_version').get()?.user_version).toBe(3);
        expect(before.prepare("SELECT name FROM sqlite_master WHERE name = 'search_queries'").get()).toBeUndefined();
        before.close();
        const upgraded = openSessionDatabase(file);
        try { expect(upgraded.prepare('PRAGMA user_version').get()?.user_version).toBe(4); }
        finally { upgraded.close(); }
    }, 30000);

    it('allocates distinct rounds to concurrent successful searches', async () => {
        const script = `
            import { registerHooks } from 'node:module'; import { readFileSync } from 'node:fs'; import ts from 'typescript';
            registerHooks({ resolve(specifier, context, next) {
                if (specifier.endsWith('.js') && context.parentURL?.includes('/src/')) return next(specifier.slice(0, -3) + '.ts', context);
                return next(specifier, context);
            }, load(url, context, next) {
                if (url.includes('/src/') && url.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
                return next(url, context);
            } });
            const { recordSuccessfulQuery } = await import('./src/deep/session.ts');
            for (let i = 0; i < 40; i++) {
                try { recordSuccessfulQuery(process.argv[1], process.argv[2]); process.exit(0); }
                catch (error) { if (error.code !== 'SESSION_BUSY') throw error; await new Promise(resolve => setTimeout(resolve, 50)); }
            }
            process.exit(3);
        `;
        const run = (query: string) => new Promise<number | null>((resolve, reject) => {
            const worker = spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', script, dir, query], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] });
            let errors = '';
            worker.stderr.on('data', chunk => { errors += String(chunk); });
            worker.once('error', reject);
            worker.once('exit', code => code === 0 ? resolve(code) : reject(new Error(errors)));
        });
        expect(await Promise.all([run('alpha'), run('beta')])).toEqual([0, 0]);
        expect(loadSessionRounds(dir)).toBe(2);
        expect(loadSessionQueryHistory(dir).sort()).toEqual(['alpha', 'beta']);
        const db = new DatabaseSync(join(dir, 'session.sqlite'));
        try { expect(db.prepare('SELECT round FROM search_queries ORDER BY round').all()).toEqual([{ round: 1 }, { round: 2 }]); }
        finally { db.close(); }
    }, 30000);
});
