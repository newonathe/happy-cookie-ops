import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const standalone = resolve(root, '.next/standalone');
const evidencePath = resolve(import.meta.dirname, 'MP-06d-http-probe.json');
const node = process.env.MP06D_NODE ?? 'C:/Users/ethan/dev/happy-cookie-tools/node-v24.20.0-win-x64/node.exe';
const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function ephemeralPort() {
  const holder = createServer();
  await new Promise((done, fail) => holder.once('error', fail).listen(0, '127.0.0.1', done));
  const { port } = holder.address();
  await new Promise((done) => holder.close(done));
  return port;
}

async function request(url, name, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(5000) });
  const text = await response.text();
  const json = JSON.parse(text);
  if (response.status !== 503 || response.headers.get('cache-control') !== 'no-store' || JSON.stringify(json) !== JSON.stringify({ error: 'sync_unavailable', accepted: [] })) {
    throw new Error(`${name} failed contract: ${response.status} ${response.headers.get('cache-control')} ${text}`);
  }
  return { name, request_bytes: Buffer.byteLength(body), status: response.status, cache_control: response.headers.get('cache-control'), response: json };
}

const result = { status: 'FAIL', at: new Date().toISOString(), environment: { host: '127.0.0.1', supabase_values_explicitly_empty: true }, probes: [] };
let child;
let ownedChildTerminated = false;
try {
  const port = await ephemeralPort();
  result.port = port;
  result.build_id = (await readFile(resolve(root, '.next/BUILD_ID'), 'utf8')).trim();
  result.source_hashes = {
    route_ts_sha256: await sha256(resolve(root, 'src/app/api/sync/route.ts')),
    middleware_ts_sha256: await sha256(resolve(root, 'src/middleware.ts')),
    standalone_server_js_sha256: await sha256(resolve(standalone, 'server.js')),
  };
  child = spawn(node, ['server.js'], {
    cwd: standalone,
    env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(port), NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SERVICE_KEY: '', SUPABASE_SECRET_KEY: '' },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/api/sync`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await fetch(url, { method: 'POST', body: '', signal: AbortSignal.timeout(5000) }); break; } catch { if (attempt === 39) throw new Error('standalone server did not become reachable'); await wait(250); }
  }
  result.probes.push(await request(url, 'ordinary_json', JSON.stringify({ sales: [{ clientId: 'synthetic-sale-1' }] })));
  result.probes.push(await request(url, 'malformed_json', '{not-json'));
  result.probes.push(await request(url, 'one_mebibyte_synthetic', 'x'.repeat(1024 * 1024)));
  result.status = 'PASS';
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill();
    await new Promise((done) => child.once('exit', done));
  }
  ownedChildTerminated = Boolean(child) && (child.exitCode !== null || child.signalCode !== null);
  result.owned_child_terminated = ownedChildTerminated;
  if (!ownedChildTerminated) {
    result.status = 'FAIL';
    result.error ??= 'owned standalone child did not terminate';
  }
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}
if (result.status !== 'PASS') process.exitCode = 1;
