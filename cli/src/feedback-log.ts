import { randomUUID } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import { appendFile, mkdir, open, rename, stat, unlink } from 'fs/promises';
import { SEARCH_ERROR_CODES, SEARCH_PROVIDERS } from './errors.js';
import { SESSION_ERROR_CODES } from './deep/session-lock.js';

const MAX_BYTES = 10 * 1024 * 1024;
const runId = randomUUID();
const events = ['search', 'validation', 'redundancy', 'provider', 'fusion', 'session', 'extract', 'extract_batch', 'extract_method'] as const;
const statuses = ['start', 'ok', 'error', 'skip'] as const;

/**
 * The provider vocabulary, derived rather than copied.
 *
 * Every value here comes from a list that some other module already owns, so a
 * new provider or error code cannot silently go unrecorded. This file used to
 * keep its own hand-written copies; `exa`, `tavily` and `firecrawl` were added
 * to the classifier in 0.1.0 and had to be added here by hand to match, which
 * is exactly the drift this arrangement removes.
 */
const providers = [...SEARCH_PROVIDERS, 'defuddle', 'obscura', 'unknown'] as const;

/**
 * The error vocabulary, likewise derived.
 *
 * `INVALID_LIMIT`, `MISSING_QUERY`, `INVALID_ENGINES` and
 * `PROVIDER_NOT_CONFIGURED` are the validation-stage envelope codes; the log
 * records which one an invocation failed on instead of collapsing all four
 * into a single `validation` string. `unknown` stays as the classifier's floor
 * for anything unclassified.
 */
const errors = [...SEARCH_ERROR_CODES, ...SESSION_ERROR_CODES, 'INVALID_LIMIT', 'MISSING_QUERY', 'INVALID_ENGINES', 'PROVIDER_NOT_CONFIGURED', 'unknown'] as const;
type Event = typeof events[number];
type Status = typeof statuses[number];
type Provider = typeof providers[number];
type ErrorCode = typeof errors[number];
export type LogFields = { durationMs?: number; count?: number; total?: number; failed?: number; provider?: Provider; error?: ErrorCode };
let queue: string[] = [];
let writing = false;

async function writeBatch(lines: string[]): Promise<void> {
    const dir = join(homedir(), 'digdig', 'logs');
    const path = join(dir, 'feedback.jsonl');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const lockPath = join(dir, '.feedback.lock');
    const lock = await open(lockPath, 'wx', 0o600);
    try {
        for (const line of lines) {
            const size = await stat(path).then(s => s.size, () => 0);
            if (size + Buffer.byteLength(line) > MAX_BYTES) {
                for (let n = 3; n >= 1; n--) {
                    await rename(`${path}.${n}`, `${path}.${n + 1}`).catch(error => {
                        if (error.code !== 'ENOENT') throw error;
                    });
                }
                await rename(path, `${path}.1`).catch(error => {
                    if (error.code !== 'ENOENT') throw error;
                });
            }
            await appendFile(path, line, { mode: 0o600 });
        }
    } finally {
        await lock.close();
        await unlink(lockPath).catch(() => {});
    }
}

function drain(): void {
    if (writing || !queue.length) return;
    writing = true;
    const batch = queue;
    queue = [];
    void writeBatch(batch).catch(() => {}).finally(() => {
        writing = false;
        drain();
    });
}

export function feedbackLog(event: Event, status: Status, fields: LogFields = {}): void {
    if (process.env.DIGDIG_LOG !== '1' || !events.includes(event) || !statuses.includes(status)) return;
    const record: Record<string, string | number> = { time: new Date().toISOString(), runId, event, status };
    for (const key of ['durationMs', 'count', 'total', 'failed'] as const) {
        const value = fields[key];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) record[key] = Math.floor(value);
    }
    if (fields.provider && providers.includes(fields.provider)) record.provider = fields.provider;
    if (fields.error && errors.includes(fields.error)) record.error = fields.error;
    // shortcut: events beyond the bounded queue are dropped; upgrade to a durable spool if complete audit records are needed.
    if (queue.length >= 1000) return;
    queue.push(`${JSON.stringify(record)}\n`);
    drain();
}

export function feedbackError(error: unknown): ErrorCode {
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : undefined;
    return typeof code === 'string' && errors.includes(code as ErrorCode) ? code as ErrorCode : 'unknown';
}
