/**
 * SearXNG CLI - Configuration
 *
 * Configuration priority (highest to lowest):
 * 1. Environment variables
 * 2. Local config file (./sxng.config.json)
 * 3. Global config file (~/sxng-cli/sxng.config.json)
 * 4. Default values
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

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
    timeout: 10000,
    ollamaApiKey: '',
    deepseekApiKey: '',
    redundancyThreshold: 0.7,
    redundancyBigramThreshold: 0.5,
};

function readOptionalEnv(name: string, defaultValue?: string): string | undefined {
    const value = process.env[name]?.trim();
    return value ? value : defaultValue;
}

function readIntEnv(name: string, defaultValue: number): number {
    const value = process.env[name];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readBoolEnv(name: string, defaultValue: boolean): boolean {
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    return value === 'true' || value === '1';
}

function readFloatEnv(name: string, defaultValue: number): number {
    const value = process.env[name];
    if (!value) return defaultValue;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function findConfigFile(): string | null {
    // Check local config first (for project-specific overrides)
    const localConfig = './sxng.config.json';
    if (existsSync(localConfig)) {
        return localConfig;
    }

    // Check global config in ~/sxng-cli/
    const globalConfig = resolve(homedir(), 'sxng-cli', 'sxng.config.json');
    if (existsSync(globalConfig)) {
        return globalConfig;
    }

    return null;
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

function mergeConfig(): SearXNGConfig {
    const config: SearXNGConfig = { ...DEFAULT_CONFIG };

    const fileConfig = loadConfigFile();
    if (fileConfig.baseUrl !== undefined) config.baseUrl = fileConfig.baseUrl;
    if (fileConfig.defaultEngine !== undefined) config.defaultEngine = fileConfig.defaultEngine;
    if (fileConfig.allowedEngines !== undefined) config.allowedEngines = fileConfig.allowedEngines;
    if (fileConfig.defaultLimit !== undefined) config.defaultLimit = fileConfig.defaultLimit;
    if (fileConfig.defaultFormat !== undefined) config.defaultFormat = fileConfig.defaultFormat;
    if (fileConfig.useProxy !== undefined) config.useProxy = fileConfig.useProxy;
    if (fileConfig.proxyUrl !== undefined) config.proxyUrl = fileConfig.proxyUrl;
    if (fileConfig.timeout !== undefined) config.timeout = fileConfig.timeout;
    if (fileConfig.redundancyThreshold !== undefined) config.redundancyThreshold = fileConfig.redundancyThreshold;
    if (fileConfig.redundancyBigramThreshold !== undefined) config.redundancyBigramThreshold = fileConfig.redundancyBigramThreshold;
    if (fileConfig.ollamaApiKey !== undefined) config.ollamaApiKey = fileConfig.ollamaApiKey;
    if (fileConfig.deepseekApiKey !== undefined) config.deepseekApiKey = fileConfig.deepseekApiKey;

    const envBaseUrl = readOptionalEnv('SEARXNG_BASE_URL');
    if (envBaseUrl) config.baseUrl = envBaseUrl;

    const envDefaultEngine = readOptionalEnv('SEARXNG_DEFAULT_ENGINE');
    if (envDefaultEngine !== undefined) config.defaultEngine = envDefaultEngine;

    const envAllowedEngines = process.env.SEARXNG_ALLOWED_ENGINES;
    if (envAllowedEngines !== undefined) {
        config.allowedEngines = envAllowedEngines.split(',').map(e => e.trim()).filter(Boolean);
    }

    const envDefaultLimit = process.env.SEARXNG_DEFAULT_LIMIT;
    if (envDefaultLimit !== undefined) {
        config.defaultLimit = readIntEnv('SEARXNG_DEFAULT_LIMIT', config.defaultLimit);
    }

    const envDefaultFormat = process.env.SEARXNG_DEFAULT_FORMAT;
    if (envDefaultFormat !== undefined && ['json', 'md'].includes(envDefaultFormat)) {
        config.defaultFormat = envDefaultFormat as SearXNGConfig['defaultFormat'];
    }

    const envUseProxy = process.env.SEARXNG_USE_PROXY;
    if (envUseProxy !== undefined) {
        config.useProxy = readBoolEnv('SEARXNG_USE_PROXY', config.useProxy);
    }

    const envProxyUrl = readOptionalEnv('SEARXNG_PROXY_URL');
    if (envProxyUrl) config.proxyUrl = envProxyUrl;

    const envTimeout = process.env.SEARXNG_TIMEOUT;
    if (envTimeout !== undefined) {
        config.timeout = readIntEnv('SEARXNG_TIMEOUT', config.timeout);
    }

    const envRedundancyThreshold = process.env.SEARXNG_REDUNDANCY_THRESHOLD;
    if (envRedundancyThreshold !== undefined) {
        config.redundancyThreshold = readFloatEnv('SEARXNG_REDUNDANCY_THRESHOLD', config.redundancyThreshold);
    }

    const envRedundancyBigramThreshold = process.env.SEARXNG_REDUNDANCY_BIGRAM_THRESHOLD;
    if (envRedundancyBigramThreshold !== undefined) {
        config.redundancyBigramThreshold = readFloatEnv('SEARXNG_REDUNDANCY_BIGRAM_THRESHOLD', config.redundancyBigramThreshold);
    }

    const envOllamaApiKey = readOptionalEnv('OLLAMA_API_KEY');
    if (envOllamaApiKey) config.ollamaApiKey = envOllamaApiKey;

    const envDeepseekApiKey = readOptionalEnv('DEEPSEEK_API_KEY');
    if (envDeepseekApiKey) config.deepseekApiKey = envDeepseekApiKey;

    return config;
}

export const config: SearXNGConfig = mergeConfig();
