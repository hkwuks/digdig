import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { delimiter, join, resolve, sep } from 'path';
import type { SearchResponse } from '../service.js';
import type { ExtractedContent } from './extractor.js';
import { SearchError } from '../errors.js';

const exec = promisify(execFile);

function command(): { command: string; prefix: string[] } {
    if (process.platform === 'win32') {
        for (const dir of (process.env.PATH ?? '').split(delimiter)) {
            const root = join(dir, 'node_modules', 'firecrawl-cli');
            try {
                if (!existsSync(join(dir, 'firecrawl.cmd'))) continue;
                const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
                if (pkg.name !== 'firecrawl-cli' || typeof pkg.bin?.firecrawl !== 'string') continue;
                const entry = resolve(root, pkg.bin.firecrawl);
                if (entry.startsWith(resolve(root) + sep) && existsSync(entry)) return { command: process.execPath, prefix: [entry] };
            } catch { /* Try the next PATH entry. */ }
        }
    }
    return { command: 'firecrawl', prefix: [] };
}

function run(args: string[], timeout: number) {
    const executable = command();
    return exec(executable.command, [...executable.prefix, ...args], { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}

export async function installedFirecrawlStatus(): Promise<'authenticated' | 'not_installed' | 'unavailable'> {
    try {
        const { stdout } = await run(['view-config'], 3000);
        return /Status:\s*✓\s*Authenticated/i.test(stdout) ? 'authenticated' : 'unavailable';
    } catch (error) {
        return (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'not_installed' : 'unavailable';
    }
}

export async function installedFirecrawlSearch(query: string, limit: number): Promise<SearchResponse> {
    try {
        const { stdout } = await run(['search', query, '--limit', String(Math.min(limit, 100)), '--no-domain-tools', '--json'], 60000);
        const data = stdout.trim() === 'No results found.' ? { success: true, data: {} } : JSON.parse(stdout);
        if (data?.success !== true || !data?.data || (data.data.web !== undefined && !Array.isArray(data.data.web))) throw new Error('invalid response');
        const retrievedAt = Date.now();
        const results = (data.data.web ?? []).filter((item: any) => typeof item?.url === 'string' && item.url).map((item: any, index: number) => ({
            title: typeof item.title === 'string' ? item.title : '', url: item.url,
            content: typeof item.description === 'string' ? item.description : '', engine: 'firecrawl', category: 'general', retrievedAt, rank: index + 1,
        }));
        return { query, numberOfResults: results.length, results, suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [] };
    } catch { throw new SearchError('BAD_RESPONSE', 'Firecrawl CLI search failed or returned an invalid response', 'firecrawl'); }
}

export async function installedFirecrawlExtract(url: string, timeoutMs: number): Promise<ExtractedContent | null> {
    try {
        const { stdout } = await run(['scrape', url, '--format', 'markdown', '--json'], timeoutMs);
        const data = JSON.parse(stdout);
        if (typeof data?.metadata?.statusCode === 'number' && ![200, 201, 202, 203, 204, 205, 206, 304].includes(data.metadata.statusCode)) return null;
        const content = typeof data?.markdown === 'string' ? data.markdown.trim() : '';
        if (!content) return null;
        return { title: '', content, excerpt: content.slice(0, 200), url, length: content.length, extractedAt: Date.now(), method: 'firecrawl' };
    } catch { return null; }
}
