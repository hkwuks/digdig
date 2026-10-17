/**
 * DeepSeek Search Adapter
 *
 * Maps DeepSeek's standalone Search REST API to the same SearchResponse
 * interface used by SearXNGService, so it can serve as a drop-in provider.
 */

import axios, { AxiosInstance } from 'axios';
import { SearchResult, SearchResponse } from './service.js';

export interface DeepSeekServiceOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

interface DeepSeekSearchItem {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  date?: string | null;
}

export class DeepSeekService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(opts: DeepSeekServiceOptions) {
    this.apiKey = opts.apiKey;
    this.client = axios.create({
      baseURL: opts.baseUrl || 'https://api.deepseek.com',
      timeout: opts.timeout ?? 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async search(options: { query: string; limit?: number }): Promise<SearchResponse> {
    // count accepts 1-50 (default 10). The query is passed through untruncated:
    // the 128-character limit is the server's to enforce, and silently cutting
    // a query here would change what the user asked for.
    const count = Math.min(options.limit ?? 10, 50);

    let payload: { results?: DeepSeekSearchItem[] };
    try {
      const response = await this.client.post('/v1/tools/search', {
        query: options.query,
        count,
      }, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      payload = response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status !== undefined) {
          const statusText = error.response?.statusText;
          throw new Error(`DeepSeek search failed: HTTP ${status}${statusText ? ` ${statusText}` : ''}`);
        }
        throw new Error(`DeepSeek search failed: ${error.message}`);
      }
      throw error;
    }

    const raw = payload?.results;
    if (!Array.isArray(raw)) {
      throw new Error('DeepSeek search returned an unexpected response body');
    }

    const retrievedAt = Date.now();
    const results: SearchResult[] = raw.map((item, index) => ({
      title: item.title || '',
      url: item.url || '',
      // `summary` is the model-facing long abstract; `snippet` is the UI-facing
      // short one. `content` stays unmapped because it requires need_content and
      // duplicates what the extract pipeline fetches on demand.
      content: item.summary || item.snippet || '',
      engine: 'deepseek',
      category: 'general',
      publishedDate: item.date ?? undefined,
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
