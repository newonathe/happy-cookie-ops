/** Test-only real Workerd -> loopback TLS -> Docker-private provider lifecycle. */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { createServer as createHttpsServer, get as httpsGet } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPrivateProviderTransport } from '../tests/integration/auth/private-provider-fetch.ts';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const pages = path.join(root, 'spikes', 'pages');
const output = path.join(root, 'build', 'pages-spike', 'public');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const MAX_BODY = 1024 * 1024;
const RPC = new Set([
  'bff_session_create',
  'bff_session_read',
  'bff_session_acquire_refresh',
  'bff_session_finalize_refresh',
  'bff_session_begin_revoke',
  'bff_session_claim_cleanup',
  'bff_session_complete_cleanup',
  'consume_rate_limit'
]);
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error('fixture_config_missing');
  return value;
};
const fixture = {
  dbId: required('HCO_MP08N_DB_ID'),
  authName: required('HCO_MP08N_AUTH_NAME'),
  restName: required('HCO_MP08N_REST_NAME')
};
const email = required('HCO_MP08N_EMAIL');
const password = required('HCO_MP08N_PASSWORD');
const userId = required('HCO_MP08N_USER_ID');
const serviceKey = required('HCO_MP08N_SERVICE_JWT');
const caPath = required('HCO_MP08N_CA_PATH');
const certPath = required('HCO_MP08N_CERT_PATH');
const keyPath = required('HCO_MP08N_KEY_PATH');
const statePath = required('HCO_MP08N_STATE_PATH');
const ca = await readFile(caPath);
const cryptoKey = randomBytes(32).toString('base64url');
if ((await readdir(pages)).some((name) => name.startsWith('.dev.vars') || name.startsWith('.env')))
  throw new Error('fixture_env_file_present');
const transport = createPrivateProviderTransport(fixture);
let gateway;
let child;
const gatewaySockets = new Set();
let stage = 'start';
const statuses = {};
const times = {};
const gatewayCounts = { requests: 0, denied: 0, upstream_errors: 0, tls_errors: 0 };

function assert(value, marker) {
  if (!value) throw new Error(marker);
}
function allowed(pathname, method) {
  if (
    method === 'POST' &&
    (pathname === '/auth/v1/token?grant_type=password' ||
      pathname === '/auth/v1/token?grant_type=refresh_token' ||
      pathname === '/auth/v1/logout?scope=local')
  )
    return true;
  if (method === 'GET' && pathname === '/auth/v1/user') return true;
  const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(pathname);
  return method === 'POST' && rpc !== null && RPC.has(rpc[1]);
}
function loopback(address) {
  return address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}
function gatewayReply(response, status) {
  response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
  response.end('{"code":"fixture_denied"}');
}
async function startGateway() {
  const server = createHttpsServer(
    { key: await readFile(keyPath), cert: await readFile(certPath), minVersion: 'TLSv1.2' },
    async (request, response) => {
      gatewayCounts.requests += 1;
      const port = server.address()?.port;
      const target = request.url ?? '';
      if (
        !loopback(request.socket.remoteAddress) ||
        request.headers.host !== `127.0.0.1:${port}` ||
        request.rawHeaders.filter(
          (value, index) => index % 2 === 0 && value.toLowerCase() === 'host'
        ).length !== 1 ||
        !allowed(target, request.method) ||
        request.headers['transfer-encoding'] ||
        Number(request.headers['content-length'] ?? 0) > MAX_BODY
      ) {
        gatewayCounts.denied += 1;
        gatewayReply(response, 403);
        request.destroy();
        return;
      }
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of request) {
          size += chunk.length;
          if (size > MAX_BODY) throw new Error('fixture_body_oversized');
          chunks.push(chunk);
        }
        const headerNames = [
          'authorization',
          'apikey',
          'content-type',
          'accept',
          'accept-profile',
          'content-profile'
        ];
        const headers = Object.fromEntries(
          headerNames.flatMap((name) =>
            typeof request.headers[name] === 'string' ? [[name, request.headers[name]]] : []
          )
        );
        const upstream = await transport.fetch(`https://provider.example.test${target}`, {
          method: request.method,
          headers,
          body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
          signal: AbortSignal.timeout(4500)
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        assert(body.length <= MAX_BODY, 'fixture_response_oversized');
        response.writeHead(upstream.status, {
          'Cache-Control': 'no-store',
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json'
        });
        response.end(body);
      } catch {
        gatewayCounts.upstream_errors += 1;
        if (!response.headersSent) gatewayReply(response, 502);
        else response.destroy();
      }
    }
  );
  server.on('connection', (socket) => {
    gatewaySockets.add(socket);
    socket.once('close', () => gatewaySockets.delete(socket));
  });
  server.on('tlsClientError', () => {
    gatewayCounts.tls_errors += 1;
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  gateway = server;
  return server.address().port;
}
async function unusedPort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function negativeTls(port) {
  return await new Promise((resolve) => {
    const socket = tlsConnect({
      host: '127.0.0.1',
      port,
      servername: '127.0.0.1',
      ca: [],
      rejectUnauthorized: true,
      timeout: 3000
    });
    socket.once('secureConnect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function positiveHttps(port) {
  return await new Promise((resolve) => {
    const request = httpsGet(
      `https://127.0.0.1:${port}/__probe`,
      { ca, timeout: 3000 },
      (response) => {
        response.resume();
        resolve(response.statusCode === 403);
      }
    );
    request.once('error', () => resolve(false));
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}
function environment(bindings) {
  const names = [
    'APPDATA',
    'COMSPEC',
    'LOCALAPPDATA',
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'WINDIR'
  ];
  return {
    ...Object.fromEntries(
      names.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
    ),
    ...bindings,
    CI: '1',
    NODE_ENV: 'test',
    NO_PROXY: '127.0.0.1,localhost',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
    NODE_EXTRA_CA_CERTS: caPath,
    WRANGLER_SEND_METRICS: 'false'
  };
}
function stopTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', timeout: 5000 });
  else child.kill('SIGTERM');
}
async function closeChild() {
  if (!child) return;
  if (child.exitCode === null) stopTree(child.pid);
  if (child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('wrangler_cleanup_timeout')), 6000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
async function request(origin, target, method = 'GET', cookie, csrf, body, overrideOrigin) {
  const headers = { Origin: overrideOrigin ?? origin, 'x-hc-request': '1' };
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['x-hc-csrf'] = csrf;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  return await fetch(`${origin}${target}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    signal: AbortSignal.timeout(6000)
  });
}
async function checked(response, secrets) {
  const body = await response.text();
  assert(
    response.headers.get('cache-control') === 'no-store' &&
      response.headers.get('pragma') === 'no-cache' &&
      response.headers.get('x-content-type-options') === 'nosniff' &&
      response.headers.get('referrer-policy') === 'no-referrer',
    'response_headers_invalid'
  );
  assert(
    secrets.every((value) => !value || !body.includes(value)),
    'response_secret_reflection'
  );
  return body;
}
async function ready(origin) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('wrangler_exited_before_ready');
    try {
      if (
        (await fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(2000) })).status ===
        200
      )
        return;
    } catch {
      /* still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('wrangler_ready_timeout');
}

try {
  stage = 'gateway';
  const gatewayPort = await startGateway();
  assert(await negativeTls(gatewayPort), 'tls_negative_control_failed');
  assert(
    (await positiveHttps(gatewayPort)) &&
      gatewayCounts.requests === 1 &&
      gatewayCounts.denied === 1,
    'tls_positive_control_failed'
  );
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const bindings = {
    APP_ORIGIN: origin,
    SUPABASE_URL: `https://127.0.0.1:${gatewayPort}`,
    SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'p'.repeat(32)}`,
    SUPABASE_SERVICE_KEY: serviceKey,
    SUPABASE_SERVICE_KEY_KIND: 'legacy_jwt',
    SESSION_CRYPTO_CONFIG_JSON: JSON.stringify({
      activeKeyId: 'fixture',
      keys: { fixture: cryptoKey }
    }),
    HCO_LOCAL_TRUSTED_CALLER_ID: 'local:fixture'
  };
  stage = 'wrangler';
  child = spawn(
    process.execPath,
    [
      wrangler,
      'pages',
      'dev',
      output,
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      statePath,
      '--log-level',
      'error'
    ],
    { cwd: pages, env: environment(bindings), stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', () => undefined);
  child.on('error', () => undefined);
  await ready(origin);
  const secrets = [
    password,
    serviceKey,
    cryptoKey,
    'access_token',
    'refresh_token',
    'credential_envelope'
  ];
  stage = 'denials';
  let result = await request(
    origin,
    '/api/v1/session/login',
    'POST',
    undefined,
    undefined,
    { email, password },
    'https://wrong.example.test'
  );
  statuses.denied_origin = result.status;
  assert(result.status === 403, 'origin_denial_failed');
  await checked(result, secrets);
  result = await request(origin, '/api/v1/session/login');
  statuses.denied_method = result.status;
  assert(result.status === 405, 'method_denial_failed');
  await checked(result, secrets);
  stage = 'login';
  let started = performance.now();
  result = await request(origin, '/api/v1/session/login', 'POST', undefined, undefined, {
    email,
    password
  });
  times.login_ms = Math.round(performance.now() - started);
  statuses.login = result.status;
  assert(result.status === 200, `login_http_${result.status}`);
  const setCookie = result.headers.get('set-cookie') ?? '';
  assert(
    /^__Host-hc-session=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Strict; Path=\//.test(
      setCookie
    ),
    'cookie_contract_failed'
  );
  const cookie = setCookie.split(';', 1)[0];
  secrets.push(cookie.slice('__Host-hc-session='.length));
  const login = JSON.parse(await checked(result, secrets));
  assert(
    login.profile?.id === userId &&
      login.profile?.role === 'owner' &&
      /^[A-Za-z0-9_-]{43}$/.test(login.csrfToken ?? ''),
    'login_projection_invalid'
  );
  stage = 'read';
  result = await request(origin, '/api/v1/session', 'GET', cookie);
  statuses.read = result.status;
  assert(result.status === 200, 'read_http_invalid');
  const read = JSON.parse(await checked(result, secrets));
  assert(
    read.profile?.role === 'owner' && read.csrfToken === login.csrfToken,
    'read_projection_invalid'
  );
  result = await request(origin, '/api/v1/session/refresh', 'POST', cookie, 'A'.repeat(43));
  statuses.denied_csrf = result.status;
  assert(result.status === 403, 'csrf_denial_failed');
  await checked(result, secrets);
  stage = 'refresh';
  started = performance.now();
  result = await request(origin, '/api/v1/session/refresh', 'POST', cookie, login.csrfToken);
  times.refresh_ms = Math.round(performance.now() - started);
  statuses.refresh = result.status;
  assert(
    result.status === 200 && result.headers.get('set-cookie') === null,
    `refresh_http_${result.status}`
  );
  const refreshed = JSON.parse(await checked(result, secrets));
  assert(refreshed.csrfToken === login.csrfToken, 'refresh_projection_invalid');
  stage = 'role_change';
  // Python owns the SQL mutation; a pipe-only protocol keeps database credentials out of this process.
  process.stdout.write('RUNTIME_ROLE_CHANGE\n');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('role_change_timeout')), 15000);
    process.stdin.once('data', (chunk) => {
      clearTimeout(timer);
      chunk.toString('utf8').trim() === 'ROLE_CHANGED'
        ? resolve()
        : reject(new Error('role_change_failed'));
    });
  });
  result = await request(origin, '/api/v1/session', 'GET', cookie);
  statuses.changed_role = result.status;
  assert(
    result.status === 200 && JSON.parse(await checked(result, secrets)).profile?.role === 'helper',
    'role_projection_invalid'
  );
  stage = 'logout';
  result = await request(origin, '/api/v1/session/logout', 'POST', cookie, login.csrfToken);
  statuses.logout = result.status;
  assert(
    result.status === 204 && (result.headers.get('set-cookie') ?? '').includes('Max-Age=0'),
    'logout_invalid'
  );
  await checked(result, secrets);
  result = await request(origin, '/api/v1/session', 'GET', cookie);
  statuses.post_logout = result.status;
  assert(result.status === 401, 'post_logout_denial_failed');
  await checked(result, secrets);
  console.log(
    'RUNTIME_RECEIPT ' +
      JSON.stringify({
        statuses,
        times,
        tls_negative_control: true,
        gateway_loopback: true,
        wrangler_loopback: true,
        provider_calls: transport.timings().length
      })
  );
} catch (error) {
  console.log(
    'RUNTIME_FAIL ' +
      stage +
      ':' +
      (error instanceof Error && /^[a-z_]+(?:_http_\d{3})?$/.test(error.message)
        ? error.message
        : 'unclassified') +
      ':g' +
      gatewayCounts.requests +
      ':p' +
      transport.timings().length +
      ':d' +
      gatewayCounts.denied +
      ':u' +
      gatewayCounts.upstream_errors +
      ':t' +
      gatewayCounts.tls_errors
  );
  process.exitCode = 1;
} finally {
  try {
    await closeChild();
  } catch {
    process.exitCode = 1;
  }
  if (gateway) {
    for (const socket of gatewaySockets) socket.destroy();
    await new Promise((resolve) => gateway.close(resolve));
  }
  try {
    await transport.close();
  } catch {
    process.exitCode = 1;
  }
}
