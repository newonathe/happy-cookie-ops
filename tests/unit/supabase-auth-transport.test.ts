// @vitest-environment node
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseAuthTransport,
  AuthTransportError,
  AuthLogoutAccessTokenRejectedError
} from '@/lib/auth/supabase-auth-transport';

const origin = 'https://project.example.test';
const publishableKey = 'sb_publishable_fixture';
const id = '00000000-0000-4000-8000-000000000001';
const providerSessionId = '00000000-0000-4000-8000-000000000002';
const credentials = { email: 'staff@example.test', password: 'PASSWORD_CANARY' };
const payload = () => ({
  access_token: 'ACCESS_CANARY',
  refresh_token: 'REFRESH_CANARY',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id, role: 'untrusted', email: 'PRIVATE' },
  ignored: 'PRIVATE'
});
const signal = () => new AbortController().signal;
const jwt = (claims: unknown = { sub: id, session_id: providerSessionId }) =>
  `${btoa('{"alg":"HS256","typ":"JWT"}').replace(/=+$/, '')}.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.signature`;
const tokenResult = (overrides: Record<string, unknown> = {}) => ({
  accessToken: jwt(),
  refreshToken: 'REFRESH_CANARY',
  expiresIn: 3600,
  userId: id,
  ...overrides
});
function setup(response = Response.json(payload())) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  return { fetch, auth: createSupabaseAuthTransport({ origin, publishableKey, fetch }) };
}
async function safeFailure(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    name: expect.any(String),
    message: 'auth_dependency_unavailable'
  });
}
describe('server Auth transport', () => {
  it('projects credential exchange and sends only fixed target, headers and fields', async () => {
    const { auth, fetch } = setup();
    const abort = signal();
    expect(await auth.login(credentials, abort)).toEqual({
      accessToken: 'ACCESS_CANARY',
      refreshToken: 'REFRESH_CANARY',
      expiresIn: 3600,
      userId: id
    });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(origin + '/auth/v1/token?grant_type=password');
    expect(init).toMatchObject({
      method: 'POST',
      signal: abort,
      redirect: 'manual',
      cache: 'no-store'
    });
    const headers = new Headers(init?.headers);
    expect(headers.get('apikey')).toBe(publishableKey);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(credentials);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refreshes using the refresh grant only', async () => {
    const { auth, fetch } = setup();
    await auth.refresh('OLD_REFRESH', signal());
    expect(String(fetch.mock.calls[0][0])).toBe(origin + '/auth/v1/token?grant_type=refresh_token');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      refresh_token: 'OLD_REFRESH'
    });
  });
  it('user lookup projects identity only; logout explicitly uses local scope', async () => {
    const { auth, fetch } = setup(Response.json({ id, app_metadata: { role: 'owner' } }));
    expect(await auth.user('ACCESS_CANARY', signal())).toEqual({ id });
    expect(String(fetch.mock.calls[0][0])).toBe(origin + '/auth/v1/user');
    expect(fetch.mock.calls[0][1]?.method).toBe('GET');
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('authorization')).toBe(
      'Bearer ACCESS_CANARY'
    );
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await auth.logout('ACCESS_CANARY', signal());
    expect(String(fetch.mock.calls[1][0])).toBe(origin + '/auth/v1/logout?scope=local');
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      cache: 'no-store'
    });
    expect(fetch.mock.calls[1][1]?.body).toBeUndefined();
  });
  it('binds the exact token to an Auth-verified user and its session claim', async () => {
    const { auth, fetch } = setup(Response.json({ id, role: 'owner', email: 'PRIVATE' }));
    expect(await auth.verifyBinding(tokenResult(), signal())).toEqual({
      userId: id,
      providerSessionId
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe(origin + '/auth/v1/user');
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('authorization')).toBe(
      `Bearer ${jwt()}`
    );
  });
  it.each([
    tokenResult({ userId: providerSessionId }),
    tokenResult({ accessToken: jwt({ sub: providerSessionId, session_id: providerSessionId }) }),
    tokenResult({ accessToken: jwt({ sub: id }) }),
    tokenResult({ accessToken: jwt({ sub: id, session_id: 'bad' }) }),
    tokenResult({ accessToken: 'NOT_A_JWT' }),
    tokenResult({ accessToken: `x.${btoa('{broken').replace(/=+$/, '')}.z` })
  ])('rejects mismatched or malformed binding after Auth lookup', async (result) => {
    const { auth, fetch } = setup(Response.json({ id }));
    await safeFailure(auth.verifyBinding(result, signal()));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects an invalid exchange user ID before Auth lookup', async () => {
    const { auth, fetch } = setup(Response.json({ id }));
    await safeFailure(auth.verifyBinding(tokenResult({ userId: 'bad' }), signal()));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns null only for an exact Auth denial and fails closed on other statuses', async () => {
    const rejected = setup(Response.json({ code: 'session_not_found' }, { status: 401 }));
    expect(await rejected.auth.verifyBinding(tokenResult(), signal())).toBeNull();
    const pinnedGoTrue = setup(
      Response.json(
        { code: 403, error_code: 'session_not_found', msg: 'Session not found' },
        { status: 403 }
      )
    );
    expect(await pinnedGoTrue.auth.verifyBinding(tokenResult(), signal())).toBeNull();
    for (const body of [
      { code: 401, error_code: 'session_not_found' },
      { code: 403, error_code: 'user_banned' },
      { code: 403, error_code: 7 }
    ])
      await safeFailure(
        setup(Response.json(body, { status: 403 })).auth.verifyBinding(tokenResult(), signal())
      );
    const unavailable = setup(Response.json({ code: 'user_banned' }, { status: 403 }));
    await safeFailure(unavailable.auth.verifyBinding(tokenResult(), signal()));
  });
  it('rejects a late abort before releasing the verified binding', async () => {
    const controller = new AbortController();
    const { auth, fetch } = setup();
    fetch.mockImplementation(async () => {
      controller.abort();
      return Response.json({ id });
    });
    await safeFailure(auth.verifyBinding(tokenResult(), controller.signal));
  });
  it.each([
    'http://project.example.test',
    origin + '/',
    origin + '/path',
    origin + '?secret',
    'https://user:password@project.example.test',
    'not-url'
  ])('rejects noncanonical origin %s', (bad) => {
    expect(() =>
      createSupabaseAuthTransport({ origin: bad, publishableKey, fetch: vi.fn() })
    ).toThrow(AuthTransportError);
  });
  it.each(['eyJlegacy', 'sb_secret_CANARY', '', 'sb_publishable_bad\nheader'])(
    'rejects unsupported key format',
    (key) => {
      expect(() =>
        createSupabaseAuthTransport({ origin, publishableKey: key, fetch: vi.fn() })
      ).toThrow(AuthTransportError);
    }
  );
  it('rejects bad input and already-aborted operation before any fetch', async () => {
    const { auth, fetch } = setup();
    await safeFailure(auth.login({ ...credentials, email: 'bad' }, signal()));
    await safeFailure(auth.refresh('bad\r\ntoken', signal()));
    await safeFailure(auth.user('', signal()));
    const controller = new AbortController();
    controller.abort();
    await safeFailure(auth.login(credentials, controller.signal));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['login', 400, 'invalid_credentials'],
    ['refresh', 400, 'refresh_token_not_found'],
    ['refresh', 400, 'refresh_token_already_used'],
    ['user', 401, 'bad_jwt'],
    ['user', 401, 'session_not_found']
  ] as const)('recognizes only documented denial %s %s %s', async (action, status, code) => {
    const { auth } = setup(Response.json({ code, message: 'SECRET' }, { status }));
    const result =
      action === 'login' ? auth.login(credentials, signal()) : auth[action]('TOKEN', signal());
    expect(await result).toBeNull();
  });
  it.each([
    [401, 'invalid_credentials'],
    [400, 'bad_jwt'],
    [429, 'invalid_credentials'],
    [503, 'invalid_credentials'],
    [400, 'unknown']
  ] as const)('sanitizes other login error %s %s', async (status, code) => {
    const { auth, fetch } = setup(Response.json({ code, message: 'SECRET' }, { status }));
    await safeFailure(auth.login(credentials, signal()));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    {},
    { ...payload(), expires_in: 0 },
    { ...payload(), token_type: 'mac' },
    { ...payload(), user: { id: 'bad' } },
    { ...payload(), access_token: 'bad token' }
  ])('rejects malformed token payload', async (body) => {
    await safeFailure(setup(Response.json(body)).auth.login(credentials, signal()));
  });
  it.each([
    new Response('SECRET', { headers: { 'content-type': 'text/html' } }),
    new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    new Response(' '.repeat(65537), { headers: { 'content-type': 'application/json' } }),
    new Response(null, { status: 302, headers: { location: 'https://evil.example' } })
  ])('rejects malformed, oversized or redirected response', async (response) => {
    await safeFailure(setup(response).auth.login(credentials, signal()));
  });
  it('bounds decoded bytes independently of compressed wire headers', async () => {
    const headers = {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'content-length': '1'
    };
    expect(
      await setup(new Response(JSON.stringify(payload()), { headers })).auth.login(
        credentials,
        signal()
      )
    ).toHaveProperty('userId', id);
    await safeFailure(
      setup(new Response(' '.repeat(65537), { headers })).auth.login(credentials, signal())
    );
  });
  it('sanitizes network errors without retry or original cause', async () => {
    const { auth, fetch } = setup();
    fetch.mockRejectedValue(new Error('NETWORK_SECRET'));
    try {
      await auth.login(credentials, signal());
      throw new Error('should reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthTransportError);
      expect(String(error)).not.toContain('NETWORK_SECRET');
      expect(error).not.toHaveProperty('cause');
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not acknowledge logout when upstream fails or returns unexpected success', async () => {
    for (const status of [200, 401, 500])
      await safeFailure(
        setup(Response.json({ code: 'bad_jwt' }, { status })).auth.logout('TOKEN', signal())
      );
  });
  it('accepts only the measured numeric duplicate-local-logout denial', async () => {
    await expect(
      setup(
        Response.json(
          { code: 403, error_code: 'session_not_found', msg: 'PRIVATE' },
          { status: 403 }
        )
      ).auth.logout('TOKEN', signal())
    ).resolves.toBeUndefined();
    for (const body of [
      { code: 'session_not_found' },
      { code: 403, error_code: 'bad_jwt' },
      { code: 401, error_code: 'session_not_found' }
    ])
      await safeFailure(
        setup(Response.json(body, { status: body.code === 401 ? 401 : 403 })).auth.logout(
          'TOKEN',
          signal()
        )
      );
  });
  it('classifies only exact numeric 403 bad_jwt logout denial without leaking provider text', async () => {
    const exact = setup(
      Response.json({ code: 403, error_code: 'bad_jwt', msg: 'PRIVATE' }, { status: 403 })
    );
    try {
      await exact.auth.logout('TOKEN', signal());
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthLogoutAccessTokenRejectedError);
      expect(String(error)).not.toContain('PRIVATE');
      expect(error).not.toHaveProperty('cause');
    }
    const legacy = setup(Response.json({ code: 'bad_jwt', msg: 'PRIVATE' }, { status: 403 }));
    await expect(legacy.auth.logout('TOKEN', signal())).rejects.not.toBeInstanceOf(
      AuthLogoutAccessTokenRejectedError
    );
  });
  it('cancels stalled JSON reads on abort and never returns late credentials', async () => {
    const cancelled = vi.fn();
    const controller = new AbortController();
    const { auth } = setup(
      new Response(new ReadableStream({ cancel: cancelled }), {
        headers: { 'content-type': 'application/json' }
      })
    );
    const result = auth.login(credentials, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await safeFailure(result);
    expect(cancelled).toHaveBeenCalled();
  });
  it('reads actual Fetch-decoded gzip bytes from an owned loopback HTTP fixture', async () => {
    const wire = gzipSync(JSON.stringify(payload()));
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': wire.length
      });
      response.end(wire);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture address');
      // Only this test adapter rewrites the fixed provider URL to our owned local fixture.
      const localFetch: typeof globalThis.fetch = (_input, init) =>
        globalThis.fetch(`http://127.0.0.1:${address.port}`, init);
      const auth = createSupabaseAuthTransport({ origin, publishableKey, fetch: localFetch });
      expect(await auth.login(credentials, signal())).toHaveProperty('userId', id);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
  it('cancels unread bodies after invalid media type and late fetch abort', async () => {
    for (const lateAbort of [false, true]) {
      const cancelled = vi.fn();
      const controller = new AbortController();
      const response = new Response(new ReadableStream({ cancel: cancelled }), {
        headers: { 'content-type': 'text/html' }
      });
      const { auth, fetch } = setup(response);
      if (lateAbort)
        fetch.mockImplementation(async () => {
          controller.abort();
          return response;
        });
      await safeFailure(auth.login(credentials, controller.signal));
      expect(cancelled).toHaveBeenCalledOnce();
    }
  });

  it.each([null, true, 123])('rejects non-string tokens without coercion', async (value) => {
    const { auth, fetch } = setup();
    const token = value as unknown as string;
    await safeFailure(auth.refresh(token, signal()));
    await safeFailure(auth.user(token, signal()));
    await safeFailure(auth.logout(token, signal()));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not acknowledge logout if aborted between fetch and caller continuations', async () => {
    const { auth } = setup(new Response(null, { status: 204 }));
    const controller = new AbortController();
    const result = auth.logout('TOKEN', controller.signal);
    queueMicrotask(() => controller.abort());
    await safeFailure(result);
  });
});
