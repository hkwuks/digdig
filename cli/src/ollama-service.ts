/**
 * Ollama Web Search Adapter
 *
 * Maps Ollama's web_search REST API to the same SearchResponse interface
 * used by SearXNGService, so it can serve as a drop-in fallback.
 */

import axios, { AxiosInstance } from 'axios';
import { SearchResult, SearchResponse } from './service.js';

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

    const response = await this.client.post('/api/web_search', {
      query: options.query,
      max_results: maxResults,
    }, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

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
