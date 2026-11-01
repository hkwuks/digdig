/**
 * Ollama Web Search Adapter
 *
 * Maps Ollama's web_search REST API to the same SearchResponse interface
 * used by SearXNGService, so it can be selected explicitly with `-e ollama`.
 */

import axios, { AxiosInstance } from 'axios';
import { SearchResult, SearchResponse } from './service.js';
import { SearchError, searchErrorFromStatus } from './errors.js';

export interface OllamaServiceOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export class OllamaService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(opts: OllamaServiceOptions) {
    this.apiKey = opts.apiKey;
    this.client = axios.create({
      baseURL: opts.baseUrl || 'https://ollama.com',
      timeout: opts.timeout ?? 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async search(options: { query: string; limit?: number }): Promise<SearchResponse> {
    const maxResults = Math.min(options.limit ?? 5, 10);

    // This method used to have no try/catch at all, so axios's raw AxiosError
    // escaped to the caller, which reported it as `Request failed with status
    // code 401` — axios's wording, and with no way to tell an auth failure from
    // a rate limit. The other two providers flatten the status into a message;
    // this one wraps it in the same type so the three agree on shape.
    let response;
    try {
      response = await this.client.post('/api/web_search', {
        query: options.query,
        max_results: maxResults,
      }, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = status === undefined
          ? `Ollama search failed: ${error.message}`
          : `Ollama search failed: HTTP ${status}${error.response?.statusText ? ` ${error.response.statusText}` : ''}`;
        throw status === undefined
          ? new SearchError('NETWORK_ERROR', message, 'ollama')
          : searchErrorFromStatus('ollama', status, message);
      }
      throw error;
    }

    const raw: Array<{ title?: string; url?: string; content?: string }> =
      response.data?.results ?? [];

    const retrievedAt = Date.now();
    const results: SearchResult[] = raw.map((item, index) => ({
        title: item.title || '',
        url: item.url || '',
        content: item.content || '',
        engine: 'ollama',
        category: 'general',
        retrievedAt,
        rank: index + 1,
    }));

    return {
      query: options.query,
      numberOfResults: results.length,
      results,
      suggestions: [],
      answers: [],
      corrections: [],
      infoboxes: [],
      unresponsiveEngines: [],
    };
  }
}
