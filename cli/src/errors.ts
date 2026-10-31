/**
 * Search failures, classified by cause.
 *
 * Why this type exists: `runSearch`'s catch used to mark every failure
 * `retryable: true` and hint at SearXNG. A real DeepSeek 401 was therefore
 * reported as retryable and blamed on a server the request never contacted —
 * an Agent reading that envelope retries a permanently broken request forever.
 *
 * The root cause was not the catch. Each provider flattened the HTTP status
 * into a sentence and threw it away:
 *
 *   SearXNG  → Error(`Search failed: ${statusText || message}`)   status gone
 *   DeepSeek → Error(`DeepSeek search failed: HTTP ${status} ...`) status gone
 *   Ollama   → nothing at all; axios's raw AxiosError escaped
 *
 * So a caller could only classify by parsing message text, which is exactly
 * what error classification should not do. This type keeps the status as a
 * fact, and derives the two answers the envelope needs instead of storing
 * them — a stored `retryable` is a second place to get it wrong.
 */

export type SearchErrorCode =
    /** 401 / 403 — the credential is wrong or missing. Never retryable. */
    | 'AUTH_FAILED'
    /** 429 — ask again later. */
    | 'RATE_LIMITED'
    /** 5xx — the provider broke; the request was fine. */
    | 'SERVER_ERROR'
    /** No response at all: DNS, timeout, refused connection, broken TLS. */
    | 'NETWORK_ERROR'
    /** Other 4xx — the request or endpoint is wrong. Retrying repeats it. */
    | 'BAD_REQUEST'
    /** A 2xx body that does not have the shape this client requires. */
    | 'BAD_RESPONSE';

/**
 * Which provider failed, so a hint can name the right one.
 *
 * `searxng` is the only value for which a SearXNG hint is ever appropriate;
 * that asymmetry is the bug this type was built to fix.
 */
export type SearchProvider = 'searxng' | 'deepseek' | 'ollama';

const KEY_VARIABLE: Record<SearchProvider, string | null> = {
    searxng: null,
    deepseek: 'DEEPSEEK_API_KEY',
    ollama: 'OLLAMA_API_KEY',
};

const CONFIG_KEY: Record<SearchProvider, string | null> = {
    searxng: null,
    deepseek: 'deepseekApiKey',
    ollama: 'ollamaApiKey',
};

const LABEL: Record<SearchProvider, string> = {
    searxng: 'SearXNG',
    deepseek: 'DeepSeek',
    ollama: 'Ollama',
};

export class SearchError extends Error {
    constructor(
        readonly code: SearchErrorCode,
        message: string,
        readonly provider: SearchProvider,
        /** The HTTP status, absent for transport failures. */
        readonly status?: number,
    ) {
        super(message);
        this.name = 'SearchError';
    }

    /**
     * Whether re-running the same request could succeed.
     *
     * Derived, not stored. The three retryable codes are the ones where the
     * request itself was acceptable: the credential may be fixed, the rate
     * limit may reset, the server may recover. `AUTH_FAILED`, `BAD_REQUEST`
     * and `BAD_RESPONSE` will fail identically every time.
     */
    get retryable(): boolean {
        return this.code === 'RATE_LIMITED'
            || this.code === 'SERVER_ERROR'
            || this.code === 'NETWORK_ERROR';
    }

    /**
     * What the caller should do about it.
     *
     * Every branch names only the subsystem that actually failed. The SearXNG
     * wording appears solely for `searxng`, which is the whole point: before
     * this type, a DeepSeek 401 told the caller to check SearXNG.
     */
    get hint(): string {
        const label = LABEL[this.provider];

        switch (this.code) {
            case 'AUTH_FAILED': {
                const variable = KEY_VARIABLE[this.provider];
                if (!variable) {
                    return `${label} rejected the request as unauthorised. Check the server's access policy or any reverse proxy in front of it.`;
                }
                const configKey = CONFIG_KEY[this.provider];
                return `${label} rejected the API key. Set ${variable} or update "${configKey}" in digdig.config.json. Retrying will not help.`;
            }
            case 'RATE_LIMITED':
                return `${label} is rate limiting this client. Wait, then retry; lowering --limit may also help.`;
            case 'SERVER_ERROR':
                return `${label} returned a server error. This is on the provider's side, not the request — retry later.`;
            case 'NETWORK_ERROR':
                if (this.provider === 'searxng') {
                    return 'Could not reach the SearXNG server. Check that it is running at the configured baseUrl, and check your network connection.';
                }
                return `Could not reach ${label}. Check your network connection.`;
            case 'BAD_REQUEST': {
                const status = this.status === undefined ? '' : ` (HTTP ${this.status})`;
                return `${label} rejected the request${status}. Check the query, the engine names, and the endpoint. Retrying the same request will not help.`;
            }
            case 'BAD_RESPONSE':
                return `${label} returned a response this client cannot read. Retrying is unlikely to change the body; check whether the provider's API changed.`;
        }
    }
}

/** Map an HTTP status to a code. The one place the mapping lives. */
export function codeFromStatus(status: number): SearchErrorCode {
    if (status === 401 || status === 403) return 'AUTH_FAILED';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVER_ERROR';
    return 'BAD_REQUEST';
}

/**
 * Build a SearchError from a response status.
 *
 * `message` is passed through untouched: callers already produce the text
 * their tests assert on, and this type adds facts rather than rewriting them.
 */
export function searchErrorFromStatus(
    provider: SearchProvider,
    status: number,
    message: string,
): SearchError {
    return new SearchError(codeFromStatus(status), message, provider, status);
}
