// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { handlePagesSessionRequest } from '../../../spikes/pages/functions/lib/session-composition';
import { createPagesServiceRpc } from '../../../spikes/pages/functions/lib/service-rpc';
import { createPersistentSessionAuthority } from '../../../src/lib/auth/persistent-session-authority';
import { createSessionCrypto } from '../../../src/lib/auth/session-crypto';
import { createSupabaseAuthTransport } from '../../../src/lib/auth/supabase-auth-transport';
import { createPrivateProviderTransport } from './private-provider-fetch';

const origin = 'http://127.0.0.1:8788';
const providerOrigin = 'https://provider.example.test';

function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error('fixture_config_missing');
  return value;
}

function count(dbId: string, password: string, sql: string): number {
  const names = ['PATH', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP',
    'APPDATA', 'LOCALAPPDATA', 'USERPROFILE'];
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', DOCKER_HOST: 'npipe:////./pipe/docker_engine',
    PGPASSWORD: password, ...Object.fromEntries(names.flatMap(name =>
      process.env[name] === undefined ? [] : [[name, process.env[name]]])) };
  const result = spawnSync('docker', ['--context', 'default', 'exec', '-e', 'PGPASSWORD', '-i',
    dbId, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-A', '-t'],
  { env, input: sql, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || !/^\d+\s*$/.test(result.stdout)) throw new Error('fixture_sql_check_failed');
  return Number(result.stdout.trim());
}

function execSql(dbId: string, password: string, sql: string): void {
  count(dbId, password, `begin; ${sql}; select 1; commit;`);
}

function request(path: string, method: 'GET' | 'POST', cookie?: string, csrf?: string,
                 body?: Record<string, string>): Request {
  const headers: Record<string, string> = { origin, 'x-hc-request': '1' };
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-hc-csrf'] = csrf;
  if (method === 'POST') headers['content-type'] = 'application/json';
  return new Request(`${origin}${path}`, { method, headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
}

test('real private Auth and PostgREST complete the composed session lifecycle', async () => {
  const dbId = required('HCO_MP08N_DB_ID');
  const dbPassword = required('HCO_MP08N_DB_PASSWORD');
  const authName = required('HCO_MP08N_AUTH_NAME');
  const restName = required('HCO_MP08N_REST_NAME');
  const email = required('HCO_MP08N_EMAIL');
  const password = required('HCO_MP08N_PASSWORD');
  const userId = required('HCO_MP08N_USER_ID');
  const serviceKey = required('HCO_MP08N_SERVICE_JWT');
  const cryptoKey = randomBytes(32).toString('base64url');
  const transport = createPrivateProviderTransport({ dbId, authName, restName });
  const tasks: Promise<void>[] = [];
  const env = {
    APP_ORIGIN: origin,
    SUPABASE_URL: providerOrigin,
    SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'p'.repeat(32)}`,
    SUPABASE_SERVICE_KEY: serviceKey,
    SUPABASE_SERVICE_KEY_KIND: 'legacy_jwt',
    SESSION_CRYPTO_CONFIG_JSON: JSON.stringify({ activeKeyId: 'fixture', keys: { fixture: cryptoKey } }),
    HCO_LOCAL_TRUSTED_CALLER_ID: 'local:fixture'
  };
  const call = (req: Request) => handlePagesSessionRequest({ request: req, env,
    waitUntil: task => { tasks.push(task); } }, transport.fetch);
  const phaseMs: Record<string, number> = {};
  const timedCall = async (phase: 'login' | 'refresh', req: Request): Promise<Response> => {
    const started = performance.now();
    try { return await call(req); }
    finally { phaseMs[phase] = Math.round(performance.now() - started); }
  };

  let stage = 'preflight';
  try {
  const wrongOrigin = new Request(`${origin}/api/v1/session/login`, {
    method: 'POST', headers: { origin: 'https://wrong.example.test', 'x-hc-request': '1',
      'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  expect((await call(wrongOrigin)).status).toBe(403);
  expect((await call(request('/api/v1/session/login', 'GET'))).status).toBe(405);
  expect(count(dbId, dbPassword, 'select count(*) from hco_private.bff_sessions;')).toBe(0);

  stage = 'login';
  const login = await timedCall('login', request('/api/v1/session/login', 'POST', undefined, undefined, { email, password }));
  if (login.status !== 200) throw new Error(`fixture_login_http_${login.status}`);
  stage = 'login_projection';
  expect(login.headers.get('cache-control')).toBe('no-store');
  const setCookie = login.headers.get('set-cookie') ?? '';
  if (!/^__Host-hc-session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Strict; Path=\//.test(setCookie))
    throw new Error('fixture_cookie_contract_failed');
  const cookie = setCookie.split(';', 1)[0] ?? '';
  const loginText = await login.text();
  if ([password, serviceKey, cryptoKey, cookie.slice('__Host-hc-session='.length),
    'access_token', 'refresh_token', 'credential_envelope'].some(secret => loginText.includes(secret)))
    throw new Error('fixture_response_leak');
  const loginBody = JSON.parse(loginText) as { profile?: { id?: string; role?: string };
    csrfToken?: string; expiresAt?: number };
  expect(loginBody.profile?.id).toBe(userId);
  expect(loginBody.profile?.role).toBe('owner');
  if (!/^[A-Za-z0-9_-]{43}$/.test(loginBody.csrfToken ?? '') ||
      typeof loginBody.expiresAt !== 'number' || loginBody.expiresAt <= Date.now() / 1000)
    throw new Error('fixture_session_projection_invalid');
  stage = 'login_db';
  expect(count(dbId, dbPassword, `select count(*) from hco_private.bff_sessions b
    join auth.sessions s on s.id=b.provider_session_id where b.state='active'
    and b.credential_envelope is not null and b.cleanup_state='not_required';`)).toBe(1);

  stage = 'read_and_csrf';
  const read = await call(request('/api/v1/session', 'GET', cookie));
  expect(read.status).toBe(200);
  const readBody = await read.json() as { csrfToken?: string; profile?: { role?: string } };
  expect(readBody.csrfToken).toBe(loginBody.csrfToken);
  expect(readBody.profile?.role).toBe('owner');
  const badCsrf = await call(request('/api/v1/session/refresh', 'POST', cookie, 'A'.repeat(43)));
  expect(badCsrf.status).toBe(403);

  stage = 'refresh';
  const refresh = await timedCall('refresh', request('/api/v1/session/refresh', 'POST', cookie, loginBody.csrfToken));
  if (refresh.status !== 200) throw new Error(`fixture_refresh_http_${refresh.status}`);
  stage = 'refresh_projection';
  const refreshBody = await refresh.json() as { csrfToken?: string; expiresAt?: number };
  expect(refreshBody.csrfToken).toBe(loginBody.csrfToken);
  expect(refreshBody.expiresAt).toBe(loginBody.expiresAt);
  // Routine refresh preserves the existing cookie; it does not rotate it.
  expect(refresh.headers.get('set-cookie')).toBeNull();
  expect(count(dbId, dbPassword, `select count(*) from hco_private.bff_sessions
    where state='active' and credentials_version=1 and credential_envelope is not null;`)).toBe(1);

  stage = 'role_change';
  execSql(dbId, dbPassword, `update public.profiles set role='helper'::public.app_role
    where id=(select user_id from hco_private.bff_sessions limit 1)`);
  const changed = await call(request('/api/v1/session', 'GET', cookie));
  expect(changed.status).toBe(200);
  const changedBody = await changed.json() as { profile?: { role?: string } };
  expect(changedBody.profile?.role).toBe('helper');

  stage = 'logout';
  const logout = await call(request('/api/v1/session/logout', 'POST', cookie, loginBody.csrfToken));
  expect(logout.status).toBe(204);
  expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  expect((await call(request('/api/v1/session', 'GET', cookie))).status).toBe(401);
  expect(count(dbId, dbPassword, `select count(*) from hco_private.bff_sessions b
    left join auth.sessions s on s.id=b.provider_session_id where b.state='revoked'
    and b.cleanup_state='complete' and b.credential_envelope is null
    and b.cleanup_completed_at is not null and s.id is null;`)).toBe(1);
  await Promise.all(tasks);
  } catch (error) {
    if (error instanceof Error && /^fixture_(?:refresh|login)_http_\d{3}$/.test(error.message)) throw error;
    throw new Error(`fixture_stage_${stage}`);
  } finally {
    console.info('FIXTURE_TIMING ' + JSON.stringify({ phaseMs, providerCalls: transport.timings() }));
    await transport.close();
  }
});

test('real provider recovers a rotation after the save response is interrupted', async () => {
  const dbId = required('HCO_MP08N_DB_ID');
  const dbPassword = required('HCO_MP08N_DB_PASSWORD');
  const transport = createPrivateProviderTransport({
    dbId, authName: required('HCO_MP08N_AUTH_NAME'), restName: required('HCO_MP08N_REST_NAME')
  });
  const key = randomBytes(32).toString('base64url');
  const crypto = await createSessionCrypto({ activeKeyId: 'fixture', keys: { fixture: key } });
  const publishableKey = `sb_publishable_${'p'.repeat(32)}`;
  let injectedLogoutDenials = 0;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/auth/v1/logout?scope=local') && injectedLogoutDenials < 2) {
      injectedLogoutDenials++;
      return Response.json({ code: 403, error_code: 'bad_jwt', msg: 'fixture' }, { status: 403 });
    }
    return transport.fetch(input, init);
  };
  const auth = createSupabaseAuthTransport({ origin: providerOrigin, publishableKey, fetch });
  const realRpc = createPagesServiceRpc({ origin: providerOrigin,
    serviceKey: required('HCO_MP08N_SERVICE_JWT'), keyKind: 'legacy_jwt', fetch });
  let interruptSave = true;
  const rpc: Parameters<typeof createPersistentSessionAuthority>[0]['rpc'] = async (name, args, signal) => {
    if (name === 'bff_session_save_cleanup_rotation' && interruptSave) {
      interruptSave = false;
      return { data: null, error: { kind: 'fixture_save_interruption' } };
    }
    return realRpc(name, args, signal);
  };
  const rules = { session: { key: 'fixture:session', limit: 50, windowSeconds: 60 },
    login: { key: 'fixture:login', limit: 50, windowSeconds: 60 },
    refresh: { key: 'fixture:refresh', limit: 50, windowSeconds: 60 },
    logout: { key: 'fixture:logout', limit: 50, windowSeconds: 60 } };
  const tasks: Promise<void>[] = [];
  const authority = createPersistentSessionAuthority({ rpc, auth, crypto,
    trustedCallerId: () => 'local:recovery-fixture', rateRules: rules,
    deferRecovery: task => { tasks.push(task); } });
  const signal = new AbortController().signal;
  let stage = 'login';
  try {
    const record = await authority.login({ email: required('HCO_MP08N_EMAIL'),
      password: required('HCO_MP08N_PASSWORD') }, signal);
    if (record === null) throw new Error('fixture_login_denied');
    const sessionHash = await crypto.hashIdentifier(record.sessionId);
    stage = 'first_cleanup';
    await expect(authority.logout(record.sessionId, signal)).rejects.toMatchObject({
      code: 'session_dependency_unavailable' });
    expect(injectedLogoutDenials).toBe(1);
    expect(interruptSave).toBe(false);
    expect(count(dbId, dbPassword, `select count(*) from hco_private.bff_sessions b
      join auth.sessions s on s.id=b.provider_session_id where b.session_hash='${sessionHash}'
      and b.state='revoked' and b.cleanup_state='pending' and b.credentials_version=0
      and b.credential_envelope is not null;`)).toBe(1);
    stage = 'parent_replay';
    await new Promise(resolve => setTimeout(resolve, 11_000));
    execSql(dbId, dbPassword, `update hco_private.bff_sessions
      set cleanup_attempted_at=clock_timestamp()-interval '31 seconds'
      where session_hash='${sessionHash}' and state='revoked' and cleanup_state='pending'`);
    const result = await authority.claimCleanup(1, signal);
    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0, timedOut: 0 });
    expect(injectedLogoutDenials).toBe(2);
    expect(count(dbId, dbPassword, `select count(*) from hco_private.bff_sessions b
      left join auth.sessions s on s.id=b.provider_session_id where b.session_hash='${sessionHash}'
      and b.state='revoked' and b.cleanup_state='complete' and b.credentials_version=1
      and b.credential_envelope is null and s.id is null;`)).toBe(1);
    await Promise.all(tasks);
  } catch {
    throw new Error(`fixture_stage_${stage}`);
  } finally {
    await transport.close();
  }
});
