/**
 * Session management subcommands - list, delete
 */

import { readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { resolveStatePath } from '../legacy.js';
import { withSessionRead } from '../deep/session-store.js';
import { SessionStateError } from '../deep/session-lock.js';

export interface SessionMeta {
    owner: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    query?: string;
}

/** Default session root directory */
export function getDefaultSessionRoot(): string {
    return resolveStatePath('sessions');
}

/** Load session metadata without creating a missing session. */
export function loadSessionMeta(sessionDir: string): SessionMeta | null {
    return withSessionRead(sessionDir, db => {
        const row = db.prepare("SELECT data FROM session_meta WHERE key = 'meta'").get();
        if (!row) return null;
        try {
            const value = JSON.parse(String(row.data));
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid metadata');
            return value as SessionMeta;
        } catch {
            throw new SessionStateError('SESSION_CORRUPTED', `Cannot read session metadata: ${sessionDir}`);
        }
    }) ?? null;
}

/** List all sessions under a root directory */
export function listSessions(rootDir: string): Array<{
    name: string;
    path: string;
    meta: SessionMeta | null;
    rounds: number;
    results: number;
    nodes: number;
    edges: number;
}> {
    try {
        if (!statSync(rootDir).isDirectory()) return [];
    } catch {
        return [];
    }

    const sessions: Array<{
        name: string;
        path: string;
        meta: SessionMeta | null;
        rounds: number;
        results: number;
        nodes: number;
        edges: number;
    }> = [];

    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const sessionDir = join(rootDir, entry.name);
        const meta = loadSessionMeta(sessionDir);

        const counts = withSessionRead(sessionDir, db => {
            const round = db.prepare("SELECT data FROM session_meta WHERE key = 'rounds'").get();
            const count = db.prepare('SELECT count(*) AS count FROM results').get();
            const graph = db.prepare('SELECT data FROM graph_snapshot WHERE id = 1').get();
            const stats = graph ? JSON.parse(String(graph.data)).data?.stats : undefined;
            return { rounds: round ? Number(JSON.parse(String(round.data))) : 0, results: Number(count?.count ?? 0), nodes: stats?.nodes ?? 0, edges: stats?.edges ?? 0 };
        }) ?? { rounds: 0, results: 0, nodes: 0, edges: 0 };
        sessions.push({ name: entry.name, path: sessionDir, meta, ...counts });
    }

    return sessions.sort((a, b) => {
        const aTime = a.meta?.updatedAt || a.meta?.createdAt || 0;
        const bTime = b.meta?.updatedAt || b.meta?.createdAt || 0;
        return bTime - aTime;
    });
}

export async function runSessionList(rootDir?: string): Promise<number> {
    const root = rootDir || getDefaultSessionRoot();
    const sessions = listSessions(root);

    const envelope = createSuccessEnvelope({
        sessions: sessions.map(s => ({
            name: s.name,
            path: s.path,
            owner: s.meta?.owner || '',
            description: s.meta?.description || '',
            createdAt: s.meta?.createdAt || 0,
            updatedAt: s.meta?.updatedAt || 0,
            rounds: s.rounds,
            results: s.results,
            nodes: s.nodes,
            edges: s.edges,
        })),
        total: sessions.length,
        root,
    });

    console.log(JSON.stringify(envelope, null, 2));
    return 0;
}

/** Delete sessions by name, or by age with --older <hours> */
export async function runSessionDelete(names: string[], olderInput?: string, rootDir?: string): Promise<number> {
    const root = rootDir || getDefaultSessionRoot();
    const olderHours = olderInput === undefined ? undefined : Number(olderInput);

    if (olderInput !== undefined && (!olderInput.trim() || !Number.isFinite(olderHours) || olderHours! <= 0 || names.length > 0)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_ARGUMENT', '--older must be a positive finite number and cannot be combined with session names'), null, 2));
        return 1;
    }

    if (olderHours !== undefined) {
        // Delete sessions older than N hours
        const sessions = listSessions(root);
        const now = Date.now();
        const maxAgeMs = olderHours * 3600 * 1000;
        let deleted = 0;
        const deletedNames: string[] = [];

        for (const s of sessions) {
            const updatedAt = s.meta?.updatedAt || s.meta?.createdAt || 0;
            if (updatedAt > 0 && (now - updatedAt) > maxAgeMs) {
                rmSync(s.path, { recursive: true, force: true });
                deleted++;
                deletedNames.push(s.name);
            }
        }

        const envelope = createSuccessEnvelope({
            deleted,
            deletedNames,
            remaining: sessions.length - deleted,
            olderHours,
        });
        console.log(JSON.stringify(envelope, null, 2));
        return 0;
    }

    // Delete specific sessions by name
    if (names.length === 0) {
        const envelope = createSuccessEnvelope({ deleted: 0, notFound: [] });
        console.log(JSON.stringify(envelope, null, 2));
        return 0;
    }

    let deleted = 0;
    const notFound: string[] = [];

    for (const name of names) {
        // Delete only sessions named directly under the configured root.
        if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
            notFound.push(name);
            continue;
        }

        const sessionDir = join(root, name);
        try {
            if (statSync(sessionDir).isDirectory()) {
                rmSync(sessionDir, { recursive: true, force: true });
                deleted++;
            } else {
                notFound.push(name);
            }
        } catch {
            notFound.push(name);
        }
    }

    const envelope = createSuccessEnvelope({ deleted, notFound });
    console.log(JSON.stringify(envelope, null, 2));
    return notFound.length > 0 ? 1 : 0;
}
