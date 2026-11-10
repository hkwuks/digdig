import { mkdirSync, rmSync, statSync } from 'fs';
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

const SESSION_LOCK_STALE_MS = 30_000;

export function withSessionLock<T>(sessionDir: string, action: () => T): T {
    mkdirSync(sessionDir, { recursive: true });
    const lockDir = join(sessionDir, '.lock');
    let acquired = false;
    try {
        try {
            mkdirSync(lockDir);
            acquired = true;
        } catch (error) {
            try {
                const age = Date.now() - statSync(lockDir).mtimeMs;
                if (age > SESSION_LOCK_STALE_MS) rmSync(lockDir, { recursive: true, force: true });
                else throw error;
                mkdirSync(lockDir);
                acquired = true;
            } catch {
                throw new SessionStateError('SESSION_BUSY', `Session is busy: ${sessionDir}`);
            }
        }
        return action();
    } finally {
        if (acquired) {
            try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* lock cleanup is best effort */ }
        }
    }
}
