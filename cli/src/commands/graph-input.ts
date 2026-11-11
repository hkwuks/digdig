import { existsSync, statSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { getDefaultSessionRoot } from './session.js';

export function resolveGraphInput(input: string): { graphFile: string; sessionDir?: string } {
    const path = !input.includes('/') && !input.includes('\\') ? join(getDefaultSessionRoot(), input) : input;
    try {
        if (statSync(path).isDirectory()) return { graphFile: join(path, 'graph.json'), sessionDir: path };
    } catch { /* Preserve the original path for the caller's error. */ }
    const parent = dirname(path);
    const isSession = basename(path) === 'graph.json'
        && (relative(resolve(getDefaultSessionRoot()), resolve(dirname(parent))) === ''
            || ['session.sqlite', 'meta.json', 'results.json'].some(name => existsSync(join(parent, name))));
    return { graphFile: path, ...(isSession ? { sessionDir: parent } : {}) };
}
