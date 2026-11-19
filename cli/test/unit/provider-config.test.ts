import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/legacy.js', async original => ({
    ...await original<typeof import('../../src/legacy.js')>(),
    resolveConfigPath: () => null,
}));

describe('provider API key configuration', () => {
    beforeEach(() => {
        vi.resetModules();
        for (const key of ['DIGDIG_OLLAMA_API_KEY', 'SEARXNG_OLLAMA_API_KEY', 'DIGDIG_DEEPSEEK_API_KEY', 'SEARXNG_DEEPSEEK_API_KEY']) vi.stubEnv(key, '');
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

    it('accepts the documented standard provider environment variables', async () => {
        vi.stubEnv('OLLAMA_API_KEY', 'ollama-test');
        vi.stubEnv('DEEPSEEK_API_KEY', 'deepseek-test');
        const { config } = await import('../../src/config.js');
        expect(config.ollamaApiKey).toBe('ollama-test');
        expect(config.deepseekApiKey).toBe('deepseek-test');
    });

    it('keeps project-prefixed environment variables higher priority', async () => {
        vi.stubEnv('OLLAMA_API_KEY', 'standard');
        vi.stubEnv('DEEPSEEK_API_KEY', 'standard');
        vi.stubEnv('DIGDIG_OLLAMA_API_KEY', 'project-ollama');
        vi.stubEnv('DIGDIG_DEEPSEEK_API_KEY', 'project-deepseek');
        const { config } = await import('../../src/config.js');
        expect(config.ollamaApiKey).toBe('project-ollama');
        expect(config.deepseekApiKey).toBe('project-deepseek');
    });
});
