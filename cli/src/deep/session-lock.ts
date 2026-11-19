import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';

export class SessionStateError extends Error {
    constructor(readonly code: 'SESSION_BUSY' | 'SESSION_CORRUPTED' | 'SESSION_STORAGE_ERROR' | 'SESSION_MIGRATION_FAILED', message: string) {
        super(message);
    }
}

export function classifySqliteError(error: unknown): unknown {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ERR_SQLITE_ERROR') return error;
    const detail = 'errcode' in error && typeof error.errcode === 'number' ? error.errcode & 255 : 0;
    return new SessionStateError(detail === 5 || detail === 6 ? 'SESSION_BUSY' : 'SESSION_STORAGE_ERROR',
        error instanceof Error ? error.message : 'SQLite operation failed');
}

export function withSessionLock<T>(sessionDir: string, action: () => T): T {
    mkdirSync(sessionDir, { recursive: true });
    const lockDir = join(sessionDir, '.lock');
    const marker = join(lockDir, 'digdig-migration-lock');
    const guard = new DatabaseSync(join(sessionDir, '.migration-lock.sqlite'), { timeout: 0 });
    let acquired = false;
    try {
        try { guard.exec('BEGIN IMMEDIATE'); }
        catch (error) { throw classifySqliteError(error); }
        try {
            mkdirSync(lockDir);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            let recoverable = false;
            try {
                const entries = readdirSync(lockDir);
                recoverable = entries.length === 1 && entries[0] === 'digdig-migration-lock'
                    && readFileSync(marker, 'utf8') === 'digdig migration lock v1';
            } catch { /* Unknown or incomplete locks must not be removed. */ }
            if (!recoverable) {
                throw new SessionStateError('SESSION_BUSY', `Session is busy: ${sessionDir}. If no process is using it, remove the legacy .lock directory.`);
            }
            rmSync(lockDir, { recursive: true });
            mkdirSync(lockDir);
        }
        acquired = true;
        writeFileSync(marker, 'digdig migration lock v1', { flag: 'wx' });
        return action();
    } finally {
        if (acquired) {
            try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* lock cleanup is best effort */ }
        }
        guard.close();
    }
}
