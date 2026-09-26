/** Local scheduled Workerd -> TLS gateway -> owned Docker-private provider. */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPrivateProviderTransport } from '../tests/integration/auth/private-provider-fetch.ts';
import { createSessionCrypto } from '../src/lib/auth/session-crypto.ts';
import { createSupabaseAuthTransport } from '../src/lib/auth/supabase-auth-transport.ts';
import { createPagesServiceRpc } from '../spikes/pages/functions/lib/service-rpc.ts';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const spike = path.join(root, 'spikes', 'cleanup-worker');
const required = name => { const value = process.env[name]; if (!value) throw new Error('fixture_config_missing'); return value; };
const fixture = { dbId: required('HCO_CLEANUP_DB_ID'), authName: required('HCO_CLEANUP_AUTH_NAME'),
  restName: required('HCO_CLEANUP_REST_NAME') };
const serviceJwt = required('HCO_CLEANUP_SERVICE_JWT');
const caPath = required('HCO_CLEANUP_CA');
const ca = await readFile(caPath);
const secretKey = `sb_secret_${randomBytes(24).toString('base64url')}`;
const publishableKey = `sb_publishable_${randomBytes(24).toString('base64url')}`;
const cryptoConfig = { activeKeyId: 'fixture', keys: { fixture: randomBytes(32).toString('base64url') } };
const transport = createPrivateProviderTransport(fixture);
const allowedRpcs = new Set(['bff_session_claim_cleanup', 'bff_session_complete_cleanup',
  'bff_session_save_cleanup_rotation', 'bff_session_complete_if_provider_absent']);
const maxBody = 1024 * 1024;
let gateway, worker, stage = 'preflight', logText = '';
let providerCalls = 0;
const sockets = new Set();
const assert = (condition, marker) => { if (!condition) throw new Error(marker); };
const loopback = value => value === '127.0.0.1' || value === '::ffff:127.0.0.1';
const events = () => [...logText.matchAll(/\{[^\r\n]*"event":"scheduled_cleanup"[^\r\n]*\}/g)]
  .flatMap(match => { try { return [JSON.parse(match[0])]; } catch { return []; } });

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
async function unusedPort() {
  const server = createNetServer();
  const port = await listen(server);
  await new Promise(resolve => server.close(resolve));
  return port;
}
function deny(response) {
  response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end('{"code":"fixture_denied"}');
}
async function gatewayStart() {
  const server = createHttpsServer({ key: await readFile(required('HCO_CLEANUP_KEY')),
    cert: await readFile(required('HCO_CLEANUP_CERT')), minVersion: 'TLSv1.2' },
  async (request, response) => {
    const port = server.address()?.port;
    const target = request.url ?? '';
    const rpcName = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(target)?.[1];
    const authRoute = (target === '/auth/v1/logout?scope=local' && request.method === 'POST') ||
      (target === '/auth/v1/token?grant_type=refresh_token' && request.method === 'POST') ||
      (target === '/auth/v1/user' && request.method === 'GET');
    const rpcRoute = request.method === 'POST' && allowedRpcs.has(rpcName);
    if (!loopback(request.socket.remoteAddress) || request.headers.host !== `127.0.0.1:${port}` ||
        request.rawHeaders.filter((name, index) => index % 2 === 0 && name.toLowerCase() === 'host').length !== 1 ||
        (!authRoute && !rpcRoute) || request.headers['transfer-encoding'] ||
        Number(request.headers['content-length'] ?? 0) > maxBody ||
        (rpcRoute && (request.headers.apikey !== secretKey || request.headers.authorization))) {
      deny(response); request.resume(); return;
    }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > maxBody) throw new Error('body_large'); chunks.push(chunk); }
      const names = ['authorization', 'apikey', 'content-type', 'accept', 'accept-profile', 'content-profile'];
      const headers = Object.fromEntries(names.flatMap(name =>
        typeof request.headers[name] === 'string' ? [[name, request.headers[name]]] : []));
      // The pinned PostgREST fixture understands a legacy JWT, while the Worker accepts
      // only sb_secret. Translate one synthetic key here, after exact gateway validation.
      if (rpcRoute) { headers.apikey = serviceJwt; headers.authorization = `Bearer ${serviceJwt}`; }
      const upstream = await transport.fetch(`https://provider.example.test${target}`, {
        method: request.method, headers, body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
        signal: AbortSignal.timeout(4500)
      });
      providerCalls++;
      const body = Buffer.from(await upstream.arrayBuffer());
      assert(body.length <= maxBody, 'upstream_large');
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store' });
      response.end(body);
    } catch { if (!response.headersSent) deny(response); else response.destroy(); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  const port = await listen(server); gateway = server; return port;
}
async function negativeTls(port) {
  return await new Promise(resolve => {
    const socket = tlsConnect({ host: '127.0.0.1', port, servername: '127.0.0.1',
      ca: [], rejectUnauthorized: true, timeout: 3000 });
    socket.once('secureConnect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => {
      socket.destroy();
      resolve(error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        error.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
        error.code === 'SELF_SIGNED_CERT_IN_CHAIN');
    });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
async function badKeyDenied(port) {
  return await new Promise(resolve => {
    const request = httpsRequest(`https://127.0.0.1:${port}/rest/v1/rpc/bff_session_claim_cleanup`,
      { ca, method: 'POST', headers: { apikey: `${secretKey}x`, 'Content-Type': 'application/json' },
        timeout: 3000 }, response => { response.resume(); resolve(response.statusCode === 403); });
    request.once('error', () => resolve(false));
    request.once('timeout', () => { request.destroy(); resolve(false); });
    request.end('{}');
  });
}
function childEnv(bindings) {
  const names = ['APPDATA', 'COMSPEC', 'LOCALAPPDATA', 'PATH', 'PATHEXT', 'SYSTEMROOT',
    'TEMP', 'TMP', 'USERPROFILE', 'WINDIR'];
  return { ...Object.fromEntries(names.flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]])),
    ...bindings, CI: '1', NODE_ENV: 'test', NO_PROXY: '127.0.0.1,localhost',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
    NODE_EXTRA_CA_CERTS: caPath, WRANGLER_SEND_METRICS: 'false' };
}
async function ready(origin) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (worker.exitCode !== null) throw new Error('wrangler_exited');
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1500) })).status === 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('wrangler_ready_timeout');
}
async function dispatch(origin, index, expected) {
  const response = await fetch(`${origin}/cdn-cgi/local/scheduled?format=json`,
    { signal: AbortSignal.timeout(30000) });
  const body = await response.json();
  assert(response.status === 200 && body.outcome === 'ok', 'scheduled_response_invalid');
  const until = Date.now() + 3000;
  while (events().length <= index && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
  const captured = events();
  assert(captured.length > index, 'scheduled_log_missing');
  assert(captured.length === index + 1, 'scheduled_log_count_invalid');
  const event = captured[index];
  assert(JSON.stringify(event) === JSON.stringify({
    event: 'scheduled_cleanup', outcome: 'success', ...expected }), 'scheduled_log_invalid');
}
async function closeWorker() {
  if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('worker_cleanup_timeout')), 6000);
    worker.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(worker.pid), '/t', '/f'],
    { stdio: 'ignore', timeout: 5000 });
  else worker.kill('SIGTERM');
  await exited;
}

try {
  assert(!(await readdir(spike)).some(name => name.startsWith('.env') || name.startsWith('.dev.vars')),
    'fixture_env_file_present');
  stage = 'gateway';
  const gatewayPort = await gatewayStart();
  assert(await negativeTls(gatewayPort), 'tls_negative_control');
  assert(await badKeyDenied(gatewayPort), 'bad_key_accepted');
  stage = 'worker';
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  worker = spawn(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    'dev', '--config', path.join(spike, 'wrangler.jsonc'), '--test-scheduled', '--local',
    '--ip', '127.0.0.1', '--port', String(port), '--persist-to', required('HCO_CLEANUP_STATE')],
  { cwd: root, env: childEnv({
      SUPABASE_URL: `https://127.0.0.1:${gatewayPort}`,
      SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_SERVICE_KEY: secretKey,
      SUPABASE_SERVICE_KEY_KIND: 'sb_secret', SESSION_CRYPTO_CONFIG_JSON: JSON.stringify(cryptoConfig)
    }), stdio: ['ignore', 'pipe', 'pipe'] });
  const collect = chunk => { logText += chunk.toString('utf8'); if (logText.length > maxBody) worker.kill(); };
  worker.stdout.on('data', collect); worker.stderr.on('data', collect);
  worker.on('error', () => undefined);
  await ready(origin);
  const empty = { claimed: 0, completed: 0, failed: 0, timedOut: 0 };
  const revoked = { claimed: 1, completed: 1, failed: 0, timedOut: 0 };
  await dispatch(origin, 0, empty);
  stage = 'seed';
  const crypto = await createSessionCrypto(cryptoConfig);
  const auth = createSupabaseAuthTransport({ origin: 'https://provider.example.test',
    publishableKey, fetch: transport.fetch });
  const tokens = await auth.login({ email: required('HCO_CLEANUP_EMAIL'),
    password: required('HCO_CLEANUP_PASSWORD') }, AbortSignal.timeout(6000));
  assert(tokens !== null, 'provider_login_denied');
  const binding = await auth.verifyBinding(tokens, AbortSignal.timeout(6000));
  assert(binding !== null, 'provider_binding_invalid');
  const sessionHash = await crypto.hashIdentifier(crypto.newIdentifier());
  const envelope = await crypto.seal({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
    { sessionHash, userId: binding.userId, version: 0 });
  const rpc = createPagesServiceRpc({ origin: 'https://provider.example.test', serviceKey: serviceJwt,
    keyKind: 'legacy_jwt', fetch: transport.fetch });
  const created = await rpc('bff_session_create', { p_session_hash: sessionHash,
    p_csrf_token: crypto.newIdentifier(), p_user_id: binding.userId,
    p_provider_session_id: binding.providerSessionId, p_credential_envelope: envelope },
  AbortSignal.timeout(6000));
  assert(created.data.length === 1, 'bff_create_invalid');
  const pending = await rpc('bff_session_begin_revoke', { p_session_hash: sessionHash },
    AbortSignal.timeout(6000));
  assert(pending.data.length === 1, 'bff_revoke_invalid');
  stage = 'scheduled';
  await dispatch(origin, 1, empty);
  await new Promise(resolve => setTimeout(resolve, 31_000));
  await dispatch(origin, 2, revoked);
  assert(providerCalls >= 3 && providerCalls <= 12, 'provider_call_budget_invalid');
  assert(!logText.includes(serviceJwt) && !logText.includes(secretKey) &&
    !logText.includes(tokens.accessToken) && !logText.includes(tokens.refreshToken) &&
    !logText.includes(envelope), 'secret_in_worker_log');
  console.log('CLEANUP_RECEIPT ' + JSON.stringify({ empty, cooldown: empty, revoked, negative_key_denied: true,
    tls_negative_control: true, ordinary_fetch_status: 500, gateway_loopback: true,
    wrangler_loopback: true, provider_calls: providerCalls }));
} catch (error) {
  console.log('CLEANUP_FAIL ' + stage + ':' + (error instanceof Error && /^[a-z_]+$/.test(error.message)
    ? error.message : 'unclassified'));
  process.exitCode = 1;
} finally {
  try { await closeWorker(); } catch { process.exitCode = 1; }
  if (gateway) { for (const socket of sockets) socket.destroy(); await new Promise(resolve => gateway.close(resolve)); }
  try { await transport.close(); } catch { process.exitCode = 1; }
}
