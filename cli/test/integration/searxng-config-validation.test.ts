import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { config } from '../../src/config.js';
import { SearXNGService } from '../../src/service.js';
import { runCli } from '../../src/runCli.js';

vi.mock('axios');
const providerSearch = vi.fn();
vi.mock('../../src/deepseek-service.js', () => ({ DeepSeekService: class { search = providerSearch; } }));
vi.mock('../../src/ollama-service.js', () => ({ OllamaService: class { search = providerSearch; } }));

describe('SearXNG configuration validation', () => {
  const saved = { baseUrl: config.baseUrl, deepseekApiKey: config.deepseekApiKey, ollamaApiKey: config.ollamaApiKey, allowedEngines: config.allowedEngines, exitCode: process.exitCode };
  const get = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue({ get } as never);
    config.deepseekApiKey = 'test-key';
    config.ollamaApiKey = 'test-key';
    config.allowedEngines = [];
    process.exitCode = 0;
    providerSearch.mockResolvedValue({ query: 'q', numberOfResults: 1, results: [{ title: 'A', url: 'https://example.com', content: 'body', engine: 'deepseek', category: 'general' }], suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [] });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    config.baseUrl = saved.baseUrl;
    config.deepseekApiKey = saved.deepseekApiKey;
    config.ollamaApiKey = saved.ollamaApiKey;
    config.allowedEngines = saved.allowedEngines;
    process.exitCode = saved.exitCode;
    vi.restoreAllMocks();
  });

  it.each(['', 'not-a-url', 'http://localhost:99999', 'file:///tmp/test'])('rejects invalid baseUrl %j consistently', async baseUrl => {
    config.baseUrl = baseUrl;
    for (const args of [['q'], ['--health'], ['--engines-list'], ['--categories-list']]) {
      await runCli(args, new SearXNGService());
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'CONFIG_MISSING', retryable: false }, hint: expect.stringContaining('baseUrl') });
    }
    expect(get).not.toHaveBeenCalled();
  });

  it.each(['deepseek', 'ollama'])('allows provider-only %s search without SearXNG configuration', async provider => {
    config.baseUrl = '';
    await runCli(['q', '-e', provider, '--format', 'json'], new SearXNGService());
    expect(process.exitCode).toBe(0);
    expect(providerSearch).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects mixed search before calling any provider when baseUrl is invalid', async () => {
    config.baseUrl = '';
    await runCli(['q', '-e', 'deepseek,google', '--format', 'json'], new SearXNGService());
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ error: { code: 'CONFIG_MISSING', retryable: false } });
    expect(providerSearch).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});
