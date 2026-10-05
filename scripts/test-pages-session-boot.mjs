import { createServer } from 'node:net';
import { mkdir, readdir, realpath } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const configDir = path.join(root, 'spikes', 'pages');
const output = path.join(root, 'build', 'pages-spike', 'public');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const state = path.join(root, 'build', 'pages-spike', 'wrangler-session-boot');
if (
  (await readdir(configDir)).some((name) => name.startsWith('.dev.vars') || name.startsWith('.env'))
)
  throw new Error('Session boot fixture must contain no environment files.');
await mkdir(state, { recursive: true });

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('No local port.'));
    server.close((error) => (error ? reject(error) : resolve(address.port)));
  });
});
const appOrigin = `http://127.0.0.1:${port}`;
const syntheticKey = Buffer.alloc(32, 7).toString('base64url');
const bindings = {
  APP_ORIGIN: appOrigin,
  SUPABASE_URL: 'https://provider.example.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'p'.repeat(32),
  SUPABASE_SERVICE_KEY: 'sb_secret_' + 's'.repeat(32),
  SUPABASE_SERVICE_KEY_KIND: 'sb_secret',
  SESSION_CRYPTO_CONFIG_JSON: JSON.stringify({
    activeKeyId: 'fixture',
    keys: { fixture: syntheticKey }
  }),
  HCO_LOCAL_TRUSTED_CALLER_ID: 'local:fixture'
};
const envNames = [
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
const localEnv = Object.fromEntries(
  envNames.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
);
const args = [
  wrangler,
  'pages',
  'dev',
  output,
  '--ip',
  '127.0.0.1',
  '--port',
  String(port),
  '--persist-to',
  state,
  '--log-level',
  'error',
  ...Object.entries(bindings).map(([name, value]) => `--binding=${name}=${value}`)
];
const child = spawn(process.execPath, args, {
  cwd: configDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...localEnv,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    CI: '1',
    NO_PROXY: '127.0.0.1,localhost',
    WRANGLER_SEND_METRICS: 'false'
  }
});
let spawnError;
child.on('error', (error) => {
  spawnError = error;
});
// Drain both pipes without persisting synthetic bindings or internal logs.
child.stdout.on('data', () => undefined);
child.stderr.on('data', () => undefined);

async function request(pathname, init) {
  return fetch(`${appOrigin}${pathname}`, { ...init, signal: AbortSignal.timeout(5000) });
}
async function ready() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null)
      throw new Error('Configured Wrangler exited before readiness.');
    try {
      if ((await request('/api/v1/health')).status === 200) return;
    } catch {
      /* booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Configured Wrangler did not become ready.');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await ready();
  const deniedRead = await request('/api/v1/session');
  const deniedLogin = await request('/api/v1/session/login', {
    method: 'POST',
    headers: {
      Origin: 'https://wrong.example.test',
      'x-hc-request': '1',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'fixture@example.test', password: 'SYNTHETIC_ONLY' })
  });
  const wrongMethod = await request('/api/v1/session/login', { method: 'GET' });
  const sync = await request('/api/sync', { method: 'POST', body: '{}' });
  assert(
    deniedRead.status === 403 &&
      deniedLogin.status === 403 &&
      wrongMethod.status === 405 &&
      sync.status === 503,
    'Configured Pages dispatch did not enforce expected boundary status.'
  );
  for (const response of [deniedRead, deniedLogin, wrongMethod, sync]) {
    const body = await response.text();
    assert(
      response.headers.get('cache-control') === 'no-store' &&
        !body.includes('SYNTHETIC_ONLY') &&
        !body.includes(bindings.SUPABASE_SERVICE_KEY) &&
        !body.includes(syntheticKey),
      'Configured Pages response leaked fixture material or cache policy.'
    );
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      scope: 'synthetic configured Workerd boot; no provider call',
      checks: {
        read: deniedRead.status,
        login: deniedLogin.status,
        wrong_method: wrongMethod.status,
        sync: sync.status
      }
    })
  );
} finally {
  if (child.exitCode === null && !child.killed && child.pid) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        timeout: 5000
      });
    else child.kill('SIGTERM');
  }
  if (child.exitCode === null && !spawnError)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        reject(new Error('Configured Wrangler cleanup timed out.'));
      }, 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
}
