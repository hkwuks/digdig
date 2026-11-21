/**
 * Configuration
 *
 * Configuration priority (highest to lowest):
 * 1. Environment variables (`DIGDIG_*`, falling back to `SEARXNG_*` until 0.5.0)
 * 2. Local config file (./digdig.config.json, falling back to ./sxng.config.json)
 * 3. Global config file (~/digdig/digdig.config.json, falling back to ~/sxng-cli/)
 * 4. Default values
 *
 * Which file gets read, and which prefix an environment variable carries, is
 * `legacy.ts`'s decision. This file keeps deciding what a value means.
 */

import { readFileSync } from 'fs';
import { envRaw, resolveConfigPath } from './legacy.js';

export interface SearXNGConfig {
    baseUrl: string;
    defaultEngine: string;
    allowedEngines: string[];
    defaultLimit: number;
    defaultFormat: 'json' | 'md';
    useProxy: boolean;
    proxyUrl: string;
    timeout: number;
    ollamaApiKey: string;
    deepseekApiKey: string;
    redundancyThreshold: number;
    redundancyBigramThreshold: number;
}

const DEFAULT_CONFIG: SearXNGConfig = {
    baseUrl: '',
    defaultEngine: '',
    allowedEngines: [],
    defaultLimit: 10,
    defaultFormat: 'md',
    useProxy: false,
    proxyUrl: '',
    // Must outlast SearXNG's own `outgoing.max_request_timeout` (upstream
    // default 10.0s, and this repository's recommended settings.yml raises it
    // to 25.0). A client that gives up first reports a timeout while the
    // server is still working, which is indistinguishable from a dead server.
    timeout: 25000,
    ollamaApiKey: '',
    deepseekApiKey: '',
    redundancyThreshold: 0.7,
    redundancyBigramThreshold: 0.5,
};

/**
 * A bare name (`TIMEOUT`) is read under either prefix; the `SEARXNG_`/`DIGDIG_`
 * choice and its deprecation notice belong to `legacy.ts`, so the value
 * semantics below stay exactly what they were before the rename.
 */
function readOptionalEnv(name: string, defaultValue?: string): string | undefined {
    const value = envRaw(name)?.trim();
    return value ? value : defaultValue;
}

function readIntEnv(name: string, defaultValue: number): number {
    const value = envRaw(name);
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readBoolEnv(name: string, defaultValue: boolean): boolean {
    const value = envRaw(name);
    if (value === undefined) return defaultValue;
    return value === 'true' || value === '1';
}

function readFloatEnv(name: string, defaultValue: number): number {
    const value = envRaw(name);
    if (!value) return defaultValue;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function findConfigFile(): string | null {
    return resolveConfigPath();
}

function loadConfigFile(): Partial<SearXNGConfig> {
    const configPath = findConfigFile();
    if (!configPath) {
        return {};
    }

    try {
        const content = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        return parsed;
    } catch {
        return {};
    }
}

/**
 * Take a numeric field from the config file only if it really is a number.
 *
 * `JSON.parse` returns whatever the file says, and the `Partial<SearXNGConfig>`
 * annotation on `loadConfigFile` is an assertion, not a check: `"timeout": "abc"`
 * reached axios as a string. The environment-variable side already fell back to
 * the default on unparseable input; this is the same rule for the file side.
 *
 * Falling back rather than failing is deliberate — one typo in a shared config
 * file should not make the CLI unusable — so the fallback is reported on stderr,
 * which keeps the JSON envelope on stdout clean.
 */
function numericFromFile(name: string, value: unknown, defaultValue: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    console.warn(`[config] ${name} must be a number; ignoring ${JSON.stringify(value) ?? String(value)} and using ${defaultValue}`);
    return defaultValue;
}

function mergeConfig(): SearXNGConfig {
    const config: SearXNGConfig = { ...DEFAULT_CONFIG };

    const fileConfig = loadConfigFile();
    if (fileConfig.baseUrl !== undefined) config.baseUrl = fileConfig.baseUrl;
    if (fileConfig.defaultEngine !== undefined) config.defaultEngine = fileConfig.defaultEngine;
    if (fileConfig.allowedEngines !== undefined) config.allowedEngines = fileConfig.allowedEngines;
    if (fileConfig.defaultLimit !== undefined) config.defaultLimit = numericFromFile('defaultLimit', fileConfig.defaultLimit, DEFAULT_CONFIG.defaultLimit);
    if (fileConfig.defaultFormat !== undefined) config.defaultFormat = fileConfig.defaultFormat;
    if (fileConfig.useProxy !== undefined) config.useProxy = fileConfig.useProxy;
    if (fileConfig.proxyUrl !== undefined) config.proxyUrl = fileConfig.proxyUrl;
    if (fileConfig.timeout !== undefined) config.timeout = numericFromFile('timeout', fileConfig.timeout, DEFAULT_CONFIG.timeout);
    if (fileConfig.redundancyThreshold !== undefined) config.redundancyThreshold = numericFromFile('redundancyThreshold', fileConfig.redundancyThreshold, DEFAULT_CONFIG.redundancyThreshold);
    if (fileConfig.redundancyBigramThreshold !== undefined) config.redundancyBigramThreshold = numericFromFile('redundancyBigramThreshold', fileConfig.redundancyBigramThreshold, DEFAULT_CONFIG.redundancyBigramThreshold);
    if (fileConfig.ollamaApiKey !== undefined) config.ollamaApiKey = fileConfig.ollamaApiKey;
    if (fileConfig.deepseekApiKey !== undefined) config.deepseekApiKey = fileConfig.deepseekApiKey;

    const envBaseUrl = readOptionalEnv('BASE_URL');
    if (envBaseUrl) config.baseUrl = envBaseUrl;

    const envDefaultEngine = readOptionalEnv('DEFAULT_ENGINE');
    if (envDefaultEngine !== undefined) config.defaultEngine = envDefaultEngine;

    const envAllowedEngines = envRaw('ALLOWED_ENGINES');
    if (envAllowedEngines !== undefined) {
        config.allowedEngines = envAllowedEngines.split(',').map(e => e.trim()).filter(Boolean);
    }

    const envDefaultLimit = envRaw('DEFAULT_LIMIT');
    if (envDefaultLimit !== undefined) {
        config.defaultLimit = readIntEnv('DEFAULT_LIMIT', config.defaultLimit);
    }

    const envDefaultFormat = envRaw('DEFAULT_FORMAT');
    if (envDefaultFormat !== undefined && ['json', 'md'].includes(envDefaultFormat)) {
        config.defaultFormat = envDefaultFormat as SearXNGConfig['defaultFormat'];
    }

    const envUseProxy = envRaw('USE_PROXY');
    if (envUseProxy !== undefined) {
        config.useProxy = readBoolEnv('USE_PROXY', config.useProxy);
    }

    const envProxyUrl = readOptionalEnv('PROXY_URL');
    if (envProxyUrl) config.proxyUrl = envProxyUrl;

    const envTimeout = envRaw('TIMEOUT');
    if (envTimeout !== undefined) {
        config.timeout = readIntEnv('TIMEOUT', config.timeout);
    }

    const envRedundancyThreshold = envRaw('REDUNDANCY_THRESHOLD');
    if (envRedundancyThreshold !== undefined) {
        config.redundancyThreshold = readFloatEnv('REDUNDANCY_THRESHOLD', config.redundancyThreshold);
    }

    const envRedundancyBigramThreshold = envRaw('REDUNDANCY_BIGRAM_THRESHOLD');
    if (envRedundancyBigramThreshold !== undefined) {
        config.redundancyBigramThreshold = readFloatEnv('REDUNDANCY_BIGRAM_THRESHOLD', config.redundancyBigramThreshold);
    }

    const envOllamaApiKey = readOptionalEnv('OLLAMA_API_KEY') || process.env.OLLAMA_API_KEY?.trim();
    if (envOllamaApiKey) config.ollamaApiKey = envOllamaApiKey;

    const envDeepseekApiKey = readOptionalEnv('DEEPSEEK_API_KEY') || process.env.DEEPSEEK_API_KEY?.trim();
    if (envDeepseekApiKey) config.deepseekApiKey = envDeepseekApiKey;

    return config;
}

export const config: SearXNGConfig = mergeConfig();
