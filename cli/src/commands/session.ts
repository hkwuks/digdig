/**
 * Session management subcommands - list, delete
 */

import { readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { createSuccessEnvelope } from '../protocol.js';
import { resolveStatePath } from '../legacy.js';

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

/** Load session meta.json */
export function loadSessionMeta(sessionDir: string): SessionMeta | null {
    const file = join(sessionDir, 'meta.json');
    try {
        const raw = readFileSync(file, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
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

        let rounds = 0;
        let results = 0;
        try {
            const raw = readFileSync(join(sessionDir, 'results.json'), 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.status === 'ok' && parsed.data) {
                rounds = parsed.data.rounds || 0;
                results = parsed.data.results?.length || 0;
            }
        } catch { /* empty */ }

        let nodes = 0;
        let edges = 0;
        try {
            const raw = readFileSync(join(sessionDir, 'graph.json'), 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.status === 'ok' && parsed.data?.stats) {
                nodes = parsed.data.stats.nodes || 0;
                edges = parsed.data.stats.edges || 0;
            }
        } catch { /* empty */ }

        sessions.push({ name: entry.name, path: sessionDir, meta, rounds, results, nodes, edges });
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
export async function runSessionDelete(names: string[], olderHours?: number, rootDir?: string): Promise<number> {
    const root = rootDir || getDefaultSessionRoot();

    if (olderHours) {
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
