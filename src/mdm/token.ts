// Ready-made helper: gets and caches an OAuth2 client_credentials token from the
// MDM provider. You can use it as is, wrap it, or replace it.

export interface TokenProviderOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Renew this many seconds before the token expires. */
  skewSeconds?: number;
  fetchFn?: typeof fetch;
}

export class TokenProvider {
  private token: { value: string; expiresAt: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(private readonly opts: TokenProviderOptions) {}

  async get(): Promise<string> {
    const skewMs = (this.opts.skewSeconds ?? 30) * 1000;
    if (this.token && this.token.expiresAt - skewMs > Date.now()) return this.token.value;
    this.inflight ??= this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Call after a 401 so the next get() fetches a fresh token. */
  invalidate(): void {
    this.token = null;
  }

  private async fetchToken(): Promise<string> {
    const fetchFn = this.opts.fetchFn ?? fetch;
    const res = await fetchFn(`${this.opts.baseUrl}/ws/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`MDM token request failed: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}
