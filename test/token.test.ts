import { describe, expect, it } from 'vitest';
import { TokenProvider } from '../src/mdm/token.js';

describe('TokenProvider', () => {
  it('caches the token until it is close to expiry', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response(JSON.stringify({ access_token: `t${calls}`, expires_in: 300 }), { status: 200 });
    }) as typeof fetch;
    const tp = new TokenProvider({ baseUrl: 'http://x', clientId: 'a', clientSecret: 'b', fetchFn });
    expect(await tp.get()).toBe('t1');
    expect(await tp.get()).toBe('t1');
    tp.invalidate();
    expect(await tp.get()).toBe('t2');
  });
});
