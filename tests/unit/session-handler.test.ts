// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSessionRequest, type SessionAuthority, type SessionRecord } from '@/lib/auth/session-handler';

const origin = 'https://ops.example.test';
const sid = 'a'.repeat(43), csrf = 'b'.repeat(43);
const session = (): SessionRecord => ({ sessionId: sid, csrfToken: csrf, expiresAt: 2000, profile: { id: '00000000-0000-4000-8000-000000000001', role: 'owner', active: true } });
function setup() {
  const authority: SessionAuthority = {
    limit: vi.fn(async () => true), login: vi.fn(async () => session()),
    read: vi.fn(async () => session()), refresh: vi.fn(async () => session()),
    logout: vi.fn(async () => undefined)
  };
  return { authority, options: { origin, authority, now: () => 1000 } };
}
function request(action = 'session', changes: RequestInit = {}) {
  const method = action === 'session' ? 'GET' : 'POST';
  return new Request(origin + '/api/v1/session' + (action === 'session' ? '' : '/' + action), {
    method, headers: { Origin: origin, 'X-HC-Request': '1', 'X-HC-CSRF': csrf, Cookie: '__Host-hc-session=' + sid, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: action === 'login' ? '{"email":"staff@example.test","password":"SECRET"}' : '{}' } : {}), ...changes
  });
}
async function code(response: Response, status: number, expected: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  const value = await response.json(); expect(value.code).toBe(expected);
  expect(value.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(value)).not.toContain('SECRET');
}
afterEach(() => vi.useRealTimers());

describe('HTTP session lifecycle with explicitly injected test authority', () => {
  it('logs in with bounded credentials and returns only the safe session projection', async () => {
    const { authority, options } = setup(); const res = await handleSessionRequest(request('login'), options);
    expect(res.status).toBe(200); expect(authority.login).toHaveBeenCalledWith({ email: 'staff@example.test', password: 'SECRET' }, expect.any(AbortSignal));
    expect(await res.json()).toEqual({ profile: { id: session().profile.id, role: 'owner' }, csrfToken: csrf, expiresAt: 2000 });
    const cookie = res.headers.get('set-cookie');
    for (const part of ['__Host-hc-session=' + sid, 'Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=1000']) expect(cookie).toContain(part);
    expect(cookie).not.toContain('Domain='); expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('reads the active session without mutating cookies or refreshing', async () => {
    const { authority, options } = setup(); const req = request(); req.headers.delete('origin');
    const res = await handleSessionRequest(req, options); expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull(); expect(authority.refresh).not.toHaveBeenCalled();
    expect(Object.keys(await res.json()).sort()).toEqual(['csrfToken', 'expiresAt', 'profile']);
  });
  it('refreshes only after checking the bound CSRF token', async () => {
    const { authority, options } = setup(); const res = await handleSessionRequest(request('refresh'), options);
    expect(res.status).toBe(200); expect(res.headers.get('set-cookie')).toBeNull();
    expect(authority.refresh).toHaveBeenCalledWith(sid, expect.any(AbortSignal));
  });
  it.each([
    { sessionId: 'c'.repeat(43) },
    { csrfToken: 'd'.repeat(43) },
    { expiresAt: 2001 }
  ])('rejects routine refresh that changes cookie, CSRF or absolute expiry', async (change) => {
    const { authority, options } = setup();
    vi.mocked(authority.refresh).mockResolvedValue({ ...session(), ...change });
    const res = await handleSessionRequest(request('refresh'), options);
    await code(res, 503, 'dependency_unavailable');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
  it('waits for acknowledged server logout before clearing the cookie', async () => {
    const { authority, options } = setup(); let finish: (() => void) | undefined;
    vi.mocked(authority.logout).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    let resolved = false; const pending = handleSessionRequest(request('logout'), options).then((r) => { resolved = true; return r; });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); expect(resolved).toBe(false);
    finish?.(); const res = await pending; expect(res.status).toBe(204); expect(await res.text()).toBe(''); expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it.each(['session', 'login', 'refresh', 'logout'])('rejects cross-origin %s before authority use', async (action) => {
    const { authority, options } = setup(); const req = request(action); req.headers.set('origin', 'https://evil.test');
    await code(await handleSessionRequest(req, options), 403, 'forbidden'); expect(authority.limit).not.toHaveBeenCalled();
  });
  it.each(['', '__Host-hc-session=bad', '__Host-hc-session='+sid+'; __Host-hc-session='+sid, 'x='+ 'z'.repeat(8192)])('rejects missing, malformed or ambiguous cookies %#', async (cookie) => {
    const { authority, options } = setup(); const req = request(); req.headers.set('cookie', cookie);
    const res = await handleSessionRequest(req, options); expect(res.status).toBe(401); expect(res.headers.get('set-cookie')).toContain('Max-Age=0'); expect(authority.read).not.toHaveBeenCalled();
  });
  it('rejects an expired or revoked session and clears the cookie', async () => {
    for (const record of [null, { ...session(), expiresAt: 999 }]) {
      const { authority, options } = setup(); vi.mocked(authority.read).mockResolvedValue(record);
      const res = await handleSessionRequest(request(), options); expect(res.status).toBe(401); expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    }
  });
  it.each(['refresh', 'logout'])('rejects mismatched CSRF for %s before mutation', async (action) => {
    const { authority, options } = setup(); const req = request(action); req.headers.set('x-hc-csrf', 'd'.repeat(43));
    await code(await handleSessionRequest(req, options), 403, 'forbidden'); expect(authority.refresh).not.toHaveBeenCalled(); expect(authority.logout).not.toHaveBeenCalled();
  });
  it('throttles before reading credentials', async () => {
    const { authority, options } = setup(); vi.mocked(authority.limit).mockResolvedValue(false); const req = request('login');
    const res = await handleSessionRequest(req, options); expect(res.status).toBe(429); expect(req.bodyUsed).toBe(false); expect(authority.login).not.toHaveBeenCalled();
  });
  it.each(['{"email":"bad","password":"SECRET"}', '{"email":"staff@example.test","password":"SECRET","role":"owner"}', 'null'])('rejects invalid login body %#', async (body) => {
    const { authority, options } = setup(); await code(await handleSessionRequest(request('login', { body }), options), 400, 'bad_request'); expect(authority.login).not.toHaveBeenCalled();
  });
  it.each(['refresh', 'logout'])('rejects extra %s fields', async (action) => {
    const { authority, options } = setup(); await code(await handleSessionRequest(request(action, { body: '{"role":"owner"}' }), options), 400, 'bad_request'); expect(authority.refresh).not.toHaveBeenCalled(); expect(authority.logout).not.toHaveBeenCalled();
  });
  it('rejects oversize credentials', async () => {
    const { authority, options } = setup(); await code(await handleSessionRequest(request('login', { body: 'x'.repeat(5000) }), options), 413, 'payload_too_large'); expect(authority.login).not.toHaveBeenCalled();
  });
  it('sanitizes provider exceptions and does not pretend failed logout succeeded', async () => {
    const { authority, options } = setup(); vi.mocked(authority.logout).mockRejectedValue(new Error('SECRET'));
    const res = await handleSessionRequest(request('logout'), options); await code(res, 503, 'dependency_unavailable'); expect(res.headers.get('set-cookie')).toBeNull();
  });
  it('denies invalid provider records instead of projecting unexpected fields', async () => {
    const { authority, options } = setup(); vi.mocked(authority.read).mockResolvedValue({ ...session(), sessionId: 'c'.repeat(43) });
    await code(await handleSessionRequest(request(), options), 503, 'dependency_unavailable');
  });
  it('bounds dependency waiting and aborts the authority signal', async () => {
    vi.useFakeTimers(); const { authority, options } = setup(); let signal: AbortSignal | undefined;
    vi.mocked(authority.limit).mockImplementation((_r, _a, s) => { signal = s; return new Promise<boolean>(() => {}); });
    const pending = handleSessionRequest(request(), options); await vi.advanceTimersByTimeAsync(5001);
    await code(await pending, 503, 'dependency_unavailable'); expect(signal?.aborted).toBe(true);
  });
  it('returns safe method and path errors without CORS or authority access', async () => {
    const { authority, options } = setup(); const wrong = await handleSessionRequest(request('session', { method: 'OPTIONS' }), options);
    expect(wrong.status).toBe(405); expect(wrong.headers.get('allow')).toBe('GET'); expect(wrong.headers.get('access-control-allow-origin')).toBeNull();
    expect((await handleSessionRequest(request('unknown'), options)).status).toBe(404); expect(authority.limit).not.toHaveBeenCalled();
  });
});


it('does not start credential processing when a rate decision arrives after timeout', async () => {
  vi.useFakeTimers(); const { authority, options } = setup(); let finish: ((v: boolean) => void) | undefined;
  vi.mocked(authority.limit).mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const req = request('login'); const pending = handleSessionRequest(req, options);
  await vi.advanceTimersByTimeAsync(5001); expect((await pending).status).toBe(503);
  finish?.(true); await vi.advanceTimersByTimeAsync(1);
  expect(req.bodyUsed).toBe(false); expect(authority.login).not.toHaveBeenCalled();
});
it('rejects a bare duplicate session cookie name', async () => {
  const { authority, options } = setup(); const req = request(); req.headers.set('cookie', '__Host-hc-session; __Host-hc-session=' + sid);
  expect((await handleSessionRequest(req, options)).status).toBe(401); expect(authority.read).not.toHaveBeenCalled();
});
it('rejects refresh principal substitution but permits an authoritative role change', async () => {
  const { authority, options } = setup(); vi.mocked(authority.refresh).mockResolvedValue({ ...session(), profile: { ...session().profile, id: '00000000-0000-4000-8000-000000000002' } });
  expect((await handleSessionRequest(request('refresh'), options)).status).toBe(503);
  vi.mocked(authority.refresh).mockResolvedValue({ ...session(), profile: { ...session().profile, role: 'helper' } });
  const res = await handleSessionRequest(request('refresh'), options); expect(res.status).toBe(200); expect((await res.json()).profile.role).toBe('helper');
});
it.each([NaN, Infinity, -1, 1.5])('fails closed on invalid clock %s', async (value) => {
  const { options } = setup(); expect((await handleSessionRequest(request(), { ...options, now: () => value })).status).toBe(503);
});
it('requires GET origin/customheader/metadata defenses and emits a throttle hint', async () => {
  for (const header of ['x-hc-request', 'sec-fetch-site']) {
    const { authority, options } = setup(); const req = request();
    if (header === 'x-hc-request') req.headers.delete(header); else req.headers.set(header, 'same-site');
    expect((await handleSessionRequest(req, options)).status).toBe(403); expect(authority.limit).not.toHaveBeenCalled();
  }
  const { authority, options } = setup(); vi.mocked(authority.limit).mockResolvedValue(false);
  expect((await handleSessionRequest(request(), options)).headers.get('retry-after')).toBe('60');
});

it('cancels a stalled credential body at the shared deadline', async () => {
  vi.useFakeTimers(); const { authority, options } = setup(); const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const pending = handleSessionRequest(request('login', { body, ...{ duplex: 'half' } }), options);
  await vi.advanceTimersByTimeAsync(5001); await code(await pending, 503, 'dependency_unavailable');
  expect(cancel).toHaveBeenCalledOnce(); expect(authority.login).not.toHaveBeenCalled();
});

it.each(['session', 'login', 'refresh'])('rejects reuse of the opaque credential as CSRF token during %s', async (action) => {
  const { authority, options } = setup(); const broken = { ...session(), csrfToken: sid };
  if (action === 'session') vi.mocked(authority.read).mockResolvedValue(broken);
  else if (action === 'login') vi.mocked(authority.login).mockResolvedValue(broken);
  else vi.mocked(authority.refresh).mockResolvedValue(broken);
  const res = await handleSessionRequest(request(action), options); expect(res.status).toBe(503);
  expect(res.headers.get('set-cookie')).toBeNull(); expect(await res.text()).not.toContain(sid);
});
it.each(['session', 'refresh', 'logout'])('checks expiry after the authority read for %s', async (action) => {
  const { authority, options } = setup(); let stamp = 1000;
  vi.mocked(authority.read).mockImplementation(async () => { stamp = 2001; return session(); });
  const res = await handleSessionRequest(request(action), { ...options, now: () => stamp });
  expect(res.status).toBe(401); expect(authority.refresh).not.toHaveBeenCalled(); expect(authority.logout).not.toHaveBeenCalled();
});
