import { mkdirSync, rmSync } from 'fs';
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
    try {
        mkdirSync(lockDir);
    } catch (error) {
        // A lock's age cannot prove its holder is dead or that the directory is unchanged.
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new SessionStateError('SESSION_BUSY', `Session is busy: ${sessionDir}`);
        }
        throw error;
    }
    try {
        return action();
    } finally {
        try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* lock cleanup is best effort */ }
    }
}
