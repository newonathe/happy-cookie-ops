// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  handlePagesSessionRequest,
  pagesSessionRateRules
} from '../../spikes/pages/functions/lib/session-composition';
import { handleApiRequest } from '../../spikes/pages/functions/api/[[path]]';

const origin = 'http://127.0.0.1:8788';
const userId = '00000000-0000-4000-8000-000000000001';
const providerId = '00000000-0000-4000-8000-000000000002';
const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
const localEnv = {
  APP_ORIGIN: origin,
  SUPABASE_URL: 'https://provider.example.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'p'.repeat(32),
  SUPABASE_SERVICE_KEY: 'sb_secret_' + 's'.repeat(32),
  SUPABASE_SERVICE_KEY_KIND: 'sb_secret',
  SESSION_CRYPTO_CONFIG_JSON: JSON.stringify({ activeKeyId: 'k1', keys: { k1: key } }),
  HCO_LOCAL_TRUSTED_CALLER_ID: 'local:fixture'
};

function sessionRequest(path = '/api/v1/session', init?: RequestInit): Request {
  return new Request(`${origin}${path}`, {
    headers: { 'x-hc-request': '1', ...(init?.headers as Record<string, string> | undefined) },
    ...init
  });
}

function allowRpc(request: Request): Response {
  const name = new URL(request.url).pathname.split('/').pop();
  if (name === 'consume_rate_limit')
    return Response.json([{ allowed: true, remaining: 9, reset_at: new Date().toISOString() }]);
  throw new Error(`unexpected RPC ${name}`);
}

describe('Pages session composition', () => {
  it('keeps health and all non-session APIs isolated from session configuration', async () => {
    const health = await handleApiRequest(new Request(`${origin}/api/v1/health`));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ readiness: false, auth: 'not-checked' });
    const sync = await handleApiRequest(new Request(`${origin}/api/sync`, { method: 'POST' }));
    expect(sync.status).toBe(503);
    expect(await sync.json()).toMatchObject({ error: 'api_unavailable' });
    const unknown = await handleApiRequest(new Request(`${origin}/api/v1/session/unknown`));
    expect(unknown.status).toBe(503);
  });

  it('fails closed without secret bindings and does not echo a request canary', async () => {
    const request = sessionRequest('/api/v1/session/login', {
      method: 'POST',
      headers: { origin, 'x-hc-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.test', password: 'PASSWORD_CANARY' })
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(await response.text()).not.toContain('CANARY');
  });

  it('uses only the fixed local caller and never forwarded headers', async () => {
    const calls: Request[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      return allowRpc(request);
    }) as typeof globalThis.fetch;
    const request = sessionRequest('/api/v1/session', {
      headers: { 'x-hc-request': '1', 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' }
    });
    const response = await handlePagesSessionRequest(
      { request, env: localEnv, waitUntil: () => undefined },
      fetchFn
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('apikey')).toBe(localEnv.SUPABASE_SERVICE_KEY);
    expect(calls[0]?.headers.get('authorization')).toBeNull();
    expect(await calls[0]?.json()).toMatchObject({ p_key: 'auth:session:local:fixture' });
  });

  it('rejects spoofed edge headers without Cloudflare request metadata', async () => {
    const fetchFn = vi.fn(async () =>
      allowRpc(new Request('https://provider.example.test/rest/v1/rpc/consume_rate_limit'))
    ) as typeof globalThis.fetch;
    const env: Record<string, unknown> = { ...localEnv };
    delete env.HCO_LOCAL_TRUSTED_CALLER_ID;
    const request = sessionRequest('/api/v1/session', {
      headers: {
        'x-hc-request': '1',
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '8.8.8.8'
      }
    });
    const response = await handlePagesSessionRequest(
      { request, env, waitUntil: () => undefined },
      fetchFn
    );
    expect(response.status).toBe(503);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses Cloudflare request metadata with its single edge IP, ignoring forwarded chains', async () => {
    const calls: Request[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const outgoing = new Request(input, init);
      calls.push(outgoing);
      return allowRpc(outgoing);
    }) as typeof globalThis.fetch;
    const env: Record<string, unknown> = { ...localEnv };
    delete env.HCO_LOCAL_TRUSTED_CALLER_ID;
    const request = new Request('https://app.example.test/api/v1/session', {
      headers: {
        'x-hc-request': '1',
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '8.8.8.8'
      }
    });
    Object.defineProperty(request, 'cf', { value: { asn: 64500 } });
    const response = await handlePagesSessionRequest(
      {
        request,
        env: { ...env, APP_ORIGIN: 'https://app.example.test' },
        waitUntil: () => undefined
      },
      fetchFn
    );
    expect(response.status).toBe(401);
    expect(await calls[0]?.json()).toMatchObject({ p_key: 'auth:session:edge:203.0.113.7' });
  });

  it('keeps configured origin and local-only legacy credentials fail closed', async () => {
    const foreign = { ...localEnv, APP_ORIGIN: 'https://other.example.test' };
    const fetchFn = vi.fn(async () => {
      throw new Error('FETCH_CANARY');
    }) as typeof globalThis.fetch;
    const response = await handlePagesSessionRequest(
      { request: sessionRequest(), env: foreign, waitUntil: () => undefined },
      fetchFn
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('CANARY');
    const legacy = {
      ...localEnv,
      APP_ORIGIN: 'https://app.example.test',
      SUPABASE_SERVICE_KEY_KIND: 'legacy_jwt'
    };
    const legacyResponse = await handlePagesSessionRequest(
      { request: sessionRequest(), env: legacy, waitUntil: () => undefined },
      fetchFn
    );
    expect(legacyResponse.status).toBe(503);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the established login limit and explicit read/refresh/logout rules', () => {
    expect(pagesSessionRateRules.login).toEqual({
      key: 'auth:signin',
      limit: 10,
      windowSeconds: 900
    });
    expect(pagesSessionRateRules.session).toEqual({
      key: 'auth:session',
      limit: 60,
      windowSeconds: 60
    });
    expect(pagesSessionRateRules.refresh.limit).toBe(12);
    expect(pagesSessionRateRules.logout.limit).toBe(12);
  });

  it('dispatches a real synthetic provider login without leaking provider tokens', async () => {
    const jwtPayload = btoa(JSON.stringify({ sub: userId, session_id: providerId }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const access = `a.${jwtPayload}.b`;
    const calls: Request[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      const url = new URL(request.url);
      if (url.pathname.endsWith('/consume_rate_limit')) return allowRpc(request);
      if (url.pathname.endsWith('/auth/v1/token'))
        return Response.json({
          access_token: access,
          refresh_token: 'REFRESH_CANARY',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: userId }
        });
      if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: userId });
      if (url.pathname.endsWith('/bff_session_create')) {
        const args = (await request.json()) as { p_csrf_token: string };
        return Response.json([
          {
            p_role: 'owner',
            p_csrf_token_out: args.p_csrf_token,
            p_expires_at: Math.floor(Date.now() / 1000) + 3600
          }
        ]);
      }
      throw new Error('UNEXPECTED_CALL_CANARY');
    }) as typeof globalThis.fetch;
    const request = sessionRequest('/api/v1/session/login', {
      method: 'POST',
      headers: { origin, 'x-hc-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.test', password: 'PASSWORD_CANARY' })
    });
    const response = await handlePagesSessionRequest(
      { request, env: localEnv, waitUntil: () => undefined },
      fetchFn
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('__Host-hc-session=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    const body = await response.text();
    expect(body).toContain('"role":"owner"');
    expect(body).not.toMatch(/CANARY|Bearer|refresh_token|access_token/);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/rest/v1/rpc/consume_rate_limit',
      '/auth/v1/token',
      '/auth/v1/user',
      '/rest/v1/rpc/bff_session_create'
    ]);
  });

  it('hands provider cleanup to waitUntil when binding denies issued login tokens', async () => {
    const tasks: Promise<void>[] = [];
    const paths: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const outgoing = new Request(input, init);
      const path = new URL(outgoing.url).pathname;
      paths.push(path);
      if (path.endsWith('/consume_rate_limit')) return allowRpc(outgoing);
      if (path.endsWith('/auth/v1/token'))
        return Response.json({
          access_token: 'ACCESS_CANARY',
          refresh_token: 'REFRESH_CANARY',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: userId }
        });
      if (path.endsWith('/auth/v1/user'))
        return Response.json(
          { code: 403, error_code: 'session_not_found', msg: 'gone' },
          { status: 403 }
        );
      if (path.endsWith('/auth/v1/logout')) return new Response(null, { status: 204 });
      throw new Error('UNEXPECTED_CALL_CANARY');
    }) as typeof globalThis.fetch;
    const request = sessionRequest('/api/v1/session/login', {
      method: 'POST',
      headers: { origin, 'x-hc-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.test', password: 'PASSWORD_CANARY' })
    });
    const response = await handlePagesSessionRequest(
      {
        request,
        env: localEnv,
        waitUntil: (task) => {
          tasks.push(task);
        }
      },
      fetchFn
    );
    expect(response.status).toBe(401);
    expect(tasks).toHaveLength(1);
    await Promise.all(tasks);
    expect(paths).toContain('/auth/v1/logout');
    expect(await response.text()).not.toMatch(/CANARY|access_token|refresh_token/);
  });
});
