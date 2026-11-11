import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const state = vi.hoisted(() => ({ root: '' }));
vi.mock('../../src/commands/session.js', () => ({ getDefaultSessionRoot: () => state.root }));

import { resolveGraphInput } from '../../src/commands/graph-input.js';

describe('legacy graph file routing', () => {
    const dirs: string[] = [];
    afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

    it('recognizes graph-only files in the standard session root while keeping custom files standalone', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dg-graph-routing-'));
        dirs.push(dir);
        state.root = join(dir, 'sessions');
        const session = join(state.root, 'example');
        const custom = join(dir, 'custom');
        mkdirSync(session, { recursive: true });
        mkdirSync(custom);
        const sessionFile = join(session, 'graph.json');
        const customFile = join(custom, 'graph.json');
        writeFileSync(sessionFile, '{}');
        writeFileSync(customFile, '{}');
        expect(resolveGraphInput(sessionFile)).toEqual({ graphFile: sessionFile, sessionDir: session });
        expect(resolveGraphInput(customFile)).toEqual({ graphFile: customFile });
        expect(resolveGraphInput(custom)).toEqual({ graphFile: customFile, sessionDir: custom });
    });
});
