import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { delimiter, join, resolve, sep } from 'path';
import type { ExtractedContent } from './extractor.js';
import type { SearchResponse } from '../service.js';
import { SearchError } from '../errors.js';

const exec = promisify(execFile);

function tavilyCommand(): { command: string; prefix: string[] } {
    if (process.platform === 'win32') {
        for (const dir of (process.env.PATH ?? '').split(delimiter)) {
            const root = join(dir, 'node_modules', '@tavily', 'cli');
            try {
                if (!existsSync(join(dir, 'tvly.cmd'))) continue;
                const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
                if (pkg.name !== '@tavily/cli' || typeof pkg.bin?.tvly !== 'string') continue;
                const entry = resolve(root, pkg.bin.tvly);
                if (!entry.startsWith(resolve(root) + sep) || !existsSync(entry)) continue;
                return { command: process.execPath, prefix: [entry] };
            } catch { /* Check the next PATH entry. */ }
        }
    }
    return { command: 'tvly', prefix: [] };
}

function runTavily(args: string[], timeout: number) {
    const { command, prefix } = tavilyCommand();
    return exec(command, [...prefix, ...args], { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}

export async function installedTavilyReady(): Promise<boolean> {
    try {
        const result = await runTavily(['--status', '--json'], 3000);
        const status = JSON.parse(result.stdout);
        return typeof status?.version === 'string' && typeof status?.authenticated === 'boolean';
    } catch { return false; }
}

export async function installedTavilyExtract(url: string, timeoutMs: number): Promise<ExtractedContent | null> {
    try {
        const result = await runTavily(['extract', url, '--json'], timeoutMs);
        const data = JSON.parse(result.stdout);
        const content = data?.results?.[0]?.raw_content;
        if (typeof content !== 'string' || !content.trim()) return null;
        return { title: '', content, excerpt: content.slice(0, 200), url, length: content.length, extractedAt: Date.now(), method: 'tavily' };
    } catch { return null; }
}

export async function installedTavilySearch(query: string, limit: number): Promise<SearchResponse> {
    try {
        const result = await runTavily(['search', query, '--json', '--max-results', String(Math.min(limit, 20))], 15000);
        const data = JSON.parse(result.stdout);
        if (!Array.isArray(data?.results)) throw new Error('invalid response');
        const retrievedAt = Date.now();
        const results = data.results.filter((item: any) => typeof item?.url === 'string' && item.url).map((item: any, index: number) => ({
            title: typeof item.title === 'string' ? item.title : '', url: item.url,
            content: typeof item.content === 'string' ? item.content : '', engine: 'tavily', category: 'general', retrievedAt, rank: index + 1,
        }));
        return { query, numberOfResults: results.length, results, suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [] };
    } catch {
        throw new SearchError('BAD_RESPONSE', 'Tavily CLI search failed or returned an invalid response', 'tavily');
    }
}
