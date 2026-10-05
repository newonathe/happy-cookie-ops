/** Test-only, non-secret probe of actual local Pages Function outbound networking. */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer, get as httpsGet } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const parent = path.join(root, 'build', 'pages-spike');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const openssl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
const counts = { http: 0, https: 0, tls_errors: 0 };
let scratch;
let httpServer;
let httpsServer;
let child;
let stage = 'preflight';

function assert(value, code) {
  if (!value) throw new Error(code);
}
function runOpenSSL(args) {
  const result = spawnSync(openssl, args, { cwd: scratch, stdio: 'ignore', timeout: 15000 });
  assert(result.status === 0, 'certificate_generation_failed');
}
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}
async function freePort() {
  const server = createNetServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}
async function stopChild() {
  if (!child) return;
  if (child.exitCode === null && child.pid) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        timeout: 5000
      });
    else child.kill('SIGTERM');
  }
  if (child.exitCode === null)
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('wrangler_cleanup_timeout')), 6000)
      )
    ]);
  child = undefined;
}
async function nodeTrustedControl(port, ca) {
  return await new Promise((resolve) => {
    const request = httpsGet(
      `https://127.0.0.1:${port}/ping`,
      { ca, timeout: 3000 },
      (response) => {
        response.resume();
        resolve(response.statusCode === 204);
      }
    );
    request.once('error', () => resolve(false));
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}
async function wranglerRun(caPath) {
  const appPort = await freePort();
  const allow = [
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
  const env = Object.fromEntries(
    allow.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
  );
  Object.assign(env, {
    CI: '1',
    NO_PROXY: '127.0.0.1,localhost',
    WRANGLER_SEND_METRICS: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    HCO_PROBE_BINDING: 'nonsecret'
  });
  if (caPath) env.NODE_EXTRA_CA_CERTS = caPath;
  child = spawn(
    process.execPath,
    [
      wrangler,
      'pages',
      'dev',
      path.join(scratch, 'public'),
      '--ip',
      '127.0.0.1',
      '--port',
      String(appPort),
      '--persist-to',
      path.join(scratch, `state-${randomUUID()}`),
      '--compatibility-date',
      '2026-09-08',
      '--log-level',
      'error'
    ],
    { cwd: scratch, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', () => undefined);
  child.on('error', () => undefined);
  try {
    const origin = `http://127.0.0.1:${appPort}`;
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      assert(child.exitCode === null, 'wrangler_exited_before_ready');
      try {
        const response = await fetch(`${origin}/health.txt`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* waiting for the exact child */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(ready, 'wrangler_ready_timeout');
    const response = await fetch(`${origin}/api/probe`, { signal: AbortSignal.timeout(10000) });
    assert(response.status === 200, `probe_http_${response.status}`);
    const payload = await response.json();
    assert(
      typeof payload.http === 'number' &&
        typeof payload.https === 'number' &&
        ['post', 'headers', 'cache', 'redirect', 'manual', 'full', 'full_manual'].every(
          (name) => typeof payload.rpc_statuses?.[name] === 'number'
        ) &&
        typeof payload.process_binding_visible === 'boolean',
      'probe_shape_invalid'
    );
    return {
      http: payload.http,
      https: payload.https,
      rpc_statuses: payload.rpc_statuses,
      process_binding_visible: payload.process_binding_visible
    };
  } finally {
    await stopChild();
  }
}

try {
  await mkdir(parent, { recursive: true });
  for (const directory of [path.join(root, 'build'), parent]) {
    assert(
      !(await lstat(directory)).isSymbolicLink() && (await realpath(directory)) === directory,
      'scratch_parent_invalid'
    );
  }
  assert(
    (await readdir(parent)).every((name) => name !== '.dev.vars' && name !== '.env'),
    'environment_file_present'
  );
  scratch = await mkdtemp(path.join(parent, '.mp08n3-network-'));
  assert(
    (await realpath(scratch)) === scratch && path.dirname(scratch) === parent,
    'scratch_path_invalid'
  );
  const caKey = path.join(scratch, 'ca-key.pem');
  const caCert = path.join(scratch, 'ca.pem');
  const leafKey = path.join(scratch, 'leaf-key.pem');
  const csr = path.join(scratch, 'leaf.csr');
  const leafCert = path.join(scratch, 'leaf.pem');
  const ext = path.join(scratch, 'leaf-ext.cnf');
  await writeFile(ext, 'subjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\n');
  runOpenSSL([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-sha256',
    '-nodes',
    '-keyout',
    caKey,
    '-out',
    caCert,
    '-days',
    '1',
    '-subj',
    '/CN=HCO local probe CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE'
  ]);
  runOpenSSL([
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-sha256',
    '-nodes',
    '-keyout',
    leafKey,
    '-out',
    csr,
    '-subj',
    '/CN=127.0.0.1'
  ]);
  runOpenSSL([
    'x509',
    '-req',
    '-in',
    csr,
    '-CA',
    caCert,
    '-CAkey',
    caKey,
    '-CAcreateserial',
    '-out',
    leafCert,
    '-days',
    '1',
    '-sha256',
    '-extfile',
    ext
  ]);
  stage = 'targets';
  httpServer = createHttpServer((_request, response) => {
    counts.http++;
    response.writeHead(204);
    response.end();
  });
  httpsServer = createHttpsServer(
    { key: await readFile(leafKey), cert: await readFile(leafCert) },
    (_request, response) => {
      counts.https++;
      response.writeHead(204);
      response.end();
    }
  );
  httpsServer.on('tlsClientError', () => {
    counts.tls_errors++;
  });
  const httpPort = await listen(httpServer);
  const httpsPort = await listen(httpsServer);
  stage = 'node_control';
  assert(
    await nodeTrustedControl(httpsPort, await readFile(caCert)),
    'node_trusted_control_failed'
  );
  await mkdir(path.join(scratch, 'functions', 'api'), { recursive: true });
  await mkdir(path.join(scratch, 'public'), { recursive: true });
  await writeFile(path.join(scratch, 'public', 'health.txt'), 'ready');
  await writeFile(
    path.join(scratch, 'functions', 'api', 'probe.js'),
    `export async function onRequest(context) {\n` +
      `  const statuses = [];\n` +
      `  for (const url of ['http://127.0.0.1:${httpPort}/ping', 'https://127.0.0.1:${httpsPort}/ping']) {\n` +
      `    try { const result = await fetch(url, { signal: AbortSignal.timeout(4000) }); statuses.push(result.status); }\n` +
      `    catch { statuses.push(0); }\n` +
      `  }\n` +
      `  const rpcStatuses = {};\n` +
      `  const base = { method: 'POST', body: '{}' };\n` +
      `  const headers = { apikey: 'nonsecret', Authorization: 'Bearer nonsecret', Accept: 'application/json', 'Content-Type': 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public' };\n` +
      `  const variants = { post: base, headers: { ...base, headers }, cache: { ...base, cache: 'no-store' }, redirect: { ...base, redirect: 'error' }, manual: { ...base, redirect: 'manual' }, full: { ...base, headers, cache: 'no-store', redirect: 'error' }, full_manual: { ...base, headers, cache: 'no-store', redirect: 'manual' } };\n` +
      `  for (const [name, options] of Object.entries(variants)) {\n` +
      `    try { const result = await fetch('https://127.0.0.1:${httpsPort}/rest/v1/rpc/consume_rate_limit', { ...options, signal: AbortSignal.timeout(4000) }); rpcStatuses[name] = result.status; }\n` +
      `    catch { rpcStatuses[name] = 0; }\n` +
      `  }\n` +
      `  return Response.json({ http: statuses[0], https: statuses[1], rpc_statuses: rpcStatuses, process_binding_visible: context.env.HCO_PROBE_BINDING === 'nonsecret' });\n` +
      `}\n`
  );
  stage = 'workerd_trusted';
  const trusted = await wranglerRun(caCert);
  let untrusted = null;
  if (trusted.https === 204 && counts.https >= 2) {
    stage = 'workerd_untrusted';
    untrusted = await wranglerRun();
    assert(untrusted.https === 0, 'tls_negative_control_failed');
  }
  console.log(
    JSON.stringify({
      result:
        trusted.http === 204 && trusted.https === 204 && untrusted?.https === 0
          ? 'trusted_workerd_https_pass'
          : 'workerd_https_unproven',
      node_trusted_control: true,
      workerd_trusted: trusted,
      workerd_untrusted: untrusted,
      target_counts: counts
    })
  );
  if (trusted.https !== 204) process.exitCode = 2;
} catch (error) {
  console.log(
    JSON.stringify({
      result: 'probe_failed',
      stage,
      error:
        error instanceof Error && /^[a-z_]+(?:_http_\d{3})?$/.test(error.message)
          ? error.message
          : 'unclassified',
      target_counts: counts
    })
  );
  process.exitCode = 1;
} finally {
  try {
    await stopChild();
  } catch {
    process.exitCode = 1;
  }
  await Promise.all([closeServer(httpServer), closeServer(httpsServer)]);
  if (scratch) {
    const exact = await realpath(scratch);
    assert(
      exact === scratch &&
        path.dirname(exact) === parent &&
        path.basename(exact).startsWith('.mp08n3-network-'),
      'scratch_cleanup_guard_failed'
    );
    await rm(exact, { recursive: true, force: false, maxRetries: 20, retryDelay: 250 });
  }
}
