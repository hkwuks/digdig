/**
 * Claude Code PostToolUse bridge: MCP tool result → dg session.
 *
 * Why this exists, and how it differs from the Codex bridge: the Codex one
 * (`skills/digdig/references/codex-mcp-bridge.md`) asks the *model* to write a
 * `functions.exec` snippet that moves the tool result into a file. That works,
 * but the model pays to author and run the snippet, and can get it wrong.
 * Claude Code has no such sandbox — but it does let a `PostToolUse` hook
 * replace a tool's output before the model ever sees it:
 *
 *   "hookSpecificOutput.updatedToolOutput replaces the tool's output with the
 *    provided value before it is sent to Claude."
 *   — https://docs.claude.com/en/docs/claude-code/hooks
 *
 * So the page body goes straight into the session and the model receives one
 * line of counts. Nothing here is an MCP feature, and this does not let dg
 * inherit the host's credentials: the MCP call still happens in the host, and
 * the host still pays for it.
 *
 * Contract this relies on (verified against the docs, not assumed):
 * - stdin carries `tool_name`, `tool_input`, `tool_response`, and for MCP
 *   servers `mcp_server`. `tool_response` is the complete result.
 * - `updatedToolOutput` must match the shape of the tool's own output.
 * - `PostToolUse` fires on success only; a failed call cannot be rewritten.
 */
import { execFile } from 'child_process';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Where in the raw tool response to find the importable records.
 *
 * The response is provider-shaped, so the path cannot be hardcoded once for
 * every server. `text` is a convenience for the common case: every MCP tool
 * this bridge knows of returns `[{type: 'text', text}]`, and Exa's text begins
 * with `# Title` followed by `URL: <url>`.
 */
export interface ToolMapping {
    /** `search` keeps the text as an excerpt; `extracted` treats it as a body. */
    kind: 'search' | 'extracted';
    /** Dotted path to a string, or to an array of `{type, text}` blocks. */
    textPath: string;
    /** Dotted path to the source URL. Omitted means: parse `URL: <url>` from the text. */
    urlPath?: string;
    /** Dotted path to the title. Omitted means: first `# heading` of the text. */
    titlePath?: string;
    /** `tool` recorded as the result's origin. Defaults to the MCP server name. */
    tool?: string;
}

export interface BridgeConfig {
    /** The dg session directory results are imported into. */
    session: string;
    /**
     * Target session is declared explicitly rather than inferred.
     *
     * A Claude Code `session_id` identifies a conversation, not a dg session,
     * and guessing would silently scatter results across directories the Agent
     * never opens. An absent mapping is therefore a no-op, not a default.
     */
    tools: Record<string, ToolMapping>;
}

export interface HookInput {
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_response?: unknown;
    cwd?: string;
}

/** What `results-add` reports back, all of which is safe to show the model. */
export interface ImportSummary {
    added?: number;
    updated?: number;
    total?: number;
}

/**
 * Why a hook run did nothing.
 *
 * Every branch is a deliberate no-op: the bridge must never corrupt a tool
 * result it does not fully understand, so an unrecognised shape leaves the
 * original output untouched and says so.
 */
type Skip = 'not-mapped' | 'no-config' | 'no-session' | 'no-records' | 'import-failed';

export interface HookOutcome {
    /** Replacement for the model-visible output; absent means leave it alone. */
    updatedToolOutput?: unknown;
    /** Explanation surfaced next to the (unchanged) tool result. */
    notice?: string;
}

/** Read a dotted path; `a.b.0.c` indexes arrays. Returns undefined on any miss. */
function at(value: unknown, path: string): unknown {
    let cursor = value;
    for (const key of path.split('.')) {
        if (cursor === null || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[key];
    }
    return cursor;
}

/**
 * Flatten an MCP content array to plain text.
 *
 * MCP tools return `[{type: 'text', text}]`. A bare string is accepted too, so
 * a mapping does not have to know which of the two its server uses.
 */
function asText(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return undefined;
    const blocks = value.flatMap(block => {
        if (typeof block === 'string') return [block];
        if (block && typeof block === 'object' && (block as any).type === 'text' && typeof (block as any).text === 'string') {
            return [(block as any).text as string];
        }
        return [];
    });
    const text = blocks.join('\n').trim();
    return text || undefined;
}

/** `https://example.com` from a text whose second line is `URL: ...`. */
function urlFromText(text: string): string | undefined {
    for (const line of text.split(/\r?\n/)) {
        const match = /^URL:\s*(\S+)\s*$/.exec(line.trim());
        if (match) return match[1];
    }
    return undefined;
}

/** `Example Domain` from a leading `# Example Domain`. */
function titleFromText(text: string): string | undefined {
    const first = (text.split(/\r?\n/)[0] ?? '').replace(/^#+\s*/, '').trim();
    return first || undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv, cwd: string): BridgeConfig | undefined {
    const path = env.DIGDIG_MCP_BRIDGE_CONFIG ?? join(cwd, '.digdig', 'mcp-bridge.json');
    let raw: string;
    try { raw = readFileSync(path, 'utf8'); } catch { return undefined; }
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return undefined; }
    if (!parsed || typeof parsed !== 'object') return undefined;
    if (typeof parsed.session !== 'string' || !parsed.session.trim()) return undefined;
    if (!parsed.tools || typeof parsed.tools !== 'object') return undefined;
    const tools: Record<string, ToolMapping> = {};
    for (const [name, value] of Object.entries(parsed.tools as Record<string, any>)) {
        if (!value || typeof value !== 'object') continue;
        const kind = value.kind === 'extracted' ? 'extracted' : value.kind === 'search' ? 'search' : undefined;
        if (!kind || typeof value.textPath !== 'string' || !value.textPath) continue;
        tools[name] = {
            kind,
            textPath: value.textPath,
            urlPath: typeof value.urlPath === 'string' ? value.urlPath : undefined,
            titlePath: typeof value.titlePath === 'string' ? value.titlePath : undefined,
            tool: typeof value.tool === 'string' ? value.tool : undefined,
        };
    }
    return { session: resolve(parsed.session), tools };
}

/**
 * Turn one tool response into importable records.
 *
 * A record that loses its url or title is dropped rather than guessed: a result
 * with a fabricated URL would enter the graph as a real source.
 */
export function toRecords(input: HookInput, mapping: ToolMapping): Record<string, unknown>[] {
    const text = asText(at(input.tool_response, mapping.textPath));
    if (!text) return [];
    const url = (mapping.urlPath ? at(input.tool_response, mapping.urlPath) : undefined) ?? urlFromText(text);
    const title = (mapping.titlePath ? at(input.tool_response, mapping.titlePath) : undefined) ?? titleFromText(text);
    if (typeof url !== 'string' || typeof title !== 'string') return [];
    const server = input.tool_name?.replace(/^mcp__/, '').split('__')[0];
    const tool = mapping.tool ?? server ?? 'mcp';
    const query = typeof (input.tool_input as any)?.query === 'string'
        ? (input.tool_input as any).query as string
        : url;
    const base: Record<string, unknown> = { url, title, tool, query };
    if (mapping.kind === 'search') return [{ ...base, excerpt: text }];
    // `extracted` requires a nonempty body and an extractor; the MCP server
    // that returned it is the extractor of record.
    return [{ ...base, content: text, extractor: tool, extractedAt: Date.now() }];
}

/**
 * Replace the model-visible output, keeping the tool's own shape.
 *
 * `updatedToolOutput` is rejected or mis-rendered if its shape does not match
 * what the tool returns, so the summary is delivered as the same
 * `[{type: 'text', text}]` array rather than a bare string.
 */
function summaryOutput(input: HookInput, summary: ImportSummary): unknown {
    const line = `dg: imported into session (added ${summary.added ?? 0}, updated ${summary.updated ?? 0}, total ${summary.total ?? 0}). Page text is in the session, not in this message.`;
    if (Array.isArray(input.tool_response)) return [{ type: 'text', text: line }];
    if (typeof input.tool_response === 'string') return line;
    return { content: [{ type: 'text', text: line }] };
}

/** Stage the records, import them, and report what happened. */
async function importRecords(session: string, mapping: ToolMapping, records: Record<string, unknown>[], input: HookInput, env: NodeJS.ProcessEnv): Promise<HookOutcome> {
    try {
        mkdirSync(join(session, 'agent-inputs'), { recursive: true });
    } catch {
        return { notice: 'dg MCP bridge: session directory is not writable; nothing imported.' };
    }
    const file = join(session, 'agent-inputs', `mcp-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
    try {
        writeFileSync(file, JSON.stringify(records), { encoding: 'utf8', flag: 'wx' });
    } catch {
        return { notice: 'dg MCP bridge: could not stage the input file; nothing imported.' };
    }

    // `process.argv[1]` is dist/hooks/claude-mcp-bridge.js, so the CLI entry
    // is one directory above the hook's own directory.
    const entry = env.DIGDIG_BRIDGE_CLI ?? join(dirname(dirname(resolve(process.argv[1] ?? '.'))), 'index.js');
    let summary: ImportSummary | undefined;
    try {
        const { stdout } = await execFileAsync(
            process.execPath,
            [entry, 'results-add', session, '--kind', mapping.kind, '--data-file', file],
            { timeout: 30_000 },
        );
        const envelope = JSON.parse(stdout);
        if (envelope?.status === 'ok') summary = envelope.data ?? {};
    } catch {
        // Fall through: the file stays in place either way.
    }

    if (!summary) {
        // The input file is left in place: the records are still there to
        // inspect and retry, and deleting them would destroy the only copy.
        return { notice: 'dg MCP bridge: import failed; the input file is kept in the session agent-inputs for retry.' };
    }
    try { unlinkSync(file); } catch { /* Retention is harmless; the record is already in the session. */ }
    return { updatedToolOutput: summaryOutput(input, summary) };
}

export async function runHook(input: HookInput, env: NodeJS.ProcessEnv = process.env): Promise<HookOutcome> {
    if (input.hook_event_name !== undefined && input.hook_event_name !== 'PostToolUse') return {};
    const toolName = input.tool_name ?? '';
    const config = loadConfig(env, input.cwd ?? process.cwd());
    if (!config) return { notice: 'dg MCP bridge: no config found; nothing imported.' };
    const mapping = config.tools[toolName];
    if (!mapping) return {};

    const records = toRecords(input, mapping);
    if (!records.length) {
        return { notice: 'dg MCP bridge: the tool response had no url/title the mapping could read; nothing imported.' };
    }
    return importRecords(config.session, mapping, records, input, env);
}

/** Claude Code's hook protocol: JSON in on stdin, JSON out on stdout. */
async function main(): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    let input: HookInput;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { process.exitCode = 0; return; }
    const outcome = await runHook(input);
    if (outcome.updatedToolOutput !== undefined) {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PostToolUse',
                updatedToolOutput: outcome.updatedToolOutput,
                ...(outcome.notice ? { additionalContext: outcome.notice } : {}),
            },
        }));
    } else if (outcome.notice) {
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: outcome.notice },
        }));
    }
    process.exitCode = 0;
}

// Run only when invoked as a program. The tests import `runHook` directly, and
// a module-level check on argv[1] is what keeps those imports from reading
// stdin and hanging.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
