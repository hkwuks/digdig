import { readFileSync } from 'fs';
import { validateSessionInputFile } from '../deep/session.js';

export interface JsonInputSource {
    option: string;
    value?: string;
    file?: boolean;
    /** Read the whole of stdin instead of a file path. Mutually exclusive with `value`. */
    stdin?: boolean;
}

export type JsonInputResult =
    | { ok: true; source: string; value: unknown }
    | { ok: false; code: 'MISSING_JSON_INPUT' | 'MULTIPLE_JSON_INPUTS' | 'JSON_FILE_OUTSIDE_SESSION' | 'JSON_FILE_READ_FAILED' | 'UNSUPPORTED_JSON_ENCODING' | 'STDIN_EMPTY' | 'INVALID_JSON'; message: string };

export function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string, source: string): JsonInputResult {
    try {
        return { ok: true, source, value: JSON.parse(raw) };
    } catch {
        return { ok: false, code: 'INVALID_JSON', message: `${source} must contain valid JSON` };
    }
}

/** Shared by both sources: a BOM-leading UTF-16 file and stdin are rejected the same way. */
function decodeUtf8(raw: Buffer, source: string): { ok: true; text: string } | { ok: false; code: 'UNSUPPORTED_JSON_ENCODING'; message: string } {
    if ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff)) {
        return { ok: false, code: 'UNSUPPORTED_JSON_ENCODING', message: `${source} must be UTF-8 JSON` };
    }
    try {
        return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^﻿/, '') };
    } catch {
        return { ok: false, code: 'UNSUPPORTED_JSON_ENCODING', message: `${source} must be UTF-8 JSON` };
    }
}

/** Read exactly one UTF-8 JSON document: either a session-scoped file or all of stdin. */
export function readSessionJsonInput(sessionDir: string, sources: JsonInputSource[]): JsonInputResult {
    const supplied = sources.filter(source => source.value !== undefined || source.stdin);
    if (supplied.length === 0) {
        return { ok: false, code: 'MISSING_JSON_INPUT', message: `Provide exactly one of: ${sources.map(source => source.option).join(', ')}` };
    }
    if (supplied.length > 1) {
        return { ok: false, code: 'MULTIPLE_JSON_INPUTS', message: `Use only one of: ${sources.map(source => source.option).join(', ')}` };
    }

    const source = supplied[0];
    if (source.stdin) {
        let raw: Buffer;
        try {
            raw = readFileSync(0);
        } catch {
            return { ok: false, code: 'STDIN_EMPTY', message: `${source.option} could not read stdin` };
        }
        if (!raw.length) {
            return { ok: false, code: 'STDIN_EMPTY', message: `${source.option} received no input on stdin` };
        }
        const text = decodeUtf8(raw, source.option);
        return text.ok ? parseJson(text.text, source.option) : text;
    }
    if (!source.file) {
        return { ok: false, code: 'JSON_FILE_OUTSIDE_SESSION', message: `${source.option} is not supported; write UTF-8 JSON under ${sessionDir}\\agent-inputs and pass its file option` };
    }

    const file = validateSessionInputFile(sessionDir, source.value!);
    if (!file) {
        return { ok: false, code: 'JSON_FILE_OUTSIDE_SESSION', message: `${source.option} must point inside ${sessionDir}\\agent-inputs` };
    }

    let raw: Buffer;
    try {
        raw = readFileSync(file);
    } catch {
        return { ok: false, code: 'JSON_FILE_READ_FAILED', message: `Cannot read JSON file from ${source.option}: ${source.value}` };
    }

    const text = decodeUtf8(raw, source.option);
    return text.ok ? parseJson(text.text, source.option) : text;
}
