import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PROVIDER_ORIGIN = 'https://provider.example.test';
const RPC_NAMES = new Set([
  'bff_session_create', 'bff_session_read', 'bff_session_acquire_refresh',
  'bff_session_finalize_refresh', 'bff_session_begin_revoke',
  'bff_session_claim_cleanup', 'bff_session_complete_cleanup',
  'bff_session_save_cleanup_rotation', 'bff_session_complete_if_provider_absent', 'consume_rate_limit'
]);
const CONTAINER_ID = /^[a-f0-9]{64}$/;
const CONTAINER_NAME = /^hcb-auth-[a-z0-9-]{1,100}$/;
const MAX_MESSAGE_BYTES = 1024 * 1024;
const REQUEST_HEADERS = ['authorization', 'apikey', 'content-type', 'accept', 'accept-profile', 'content-profile'] as const;

interface PrivateProviderFixture { dbId: string; authName: string; restName: string; }
interface ProviderTiming { operation: string; elapsedMs: number; outcome: string; }
interface PrivateProviderTransport { fetch: typeof globalThis.fetch; timings(): ProviderTiming[]; close(): Promise<void>; }
interface Target { service: 'auth' | 'rest'; path: string; }
interface ProviderReply { id: string; status?: number; headers?: Record<string, string>; body?: string; error?: string; }

const PYTHON_BRIDGE = String.raw`
import base64, http.client, json, re, sys
MAX = 1048576
AUTH, REST = sys.argv[1], sys.argv[2]
NAME = re.compile(r'^hcb-auth-[a-z0-9-]{1,100}$')
RPCS = {'bff_session_create','bff_session_read','bff_session_acquire_refresh','bff_session_finalize_refresh','bff_session_begin_revoke','bff_session_claim_cleanup','bff_session_complete_cleanup','bff_session_save_cleanup_rotation','bff_session_complete_if_provider_absent','consume_rate_limit'}
if not NAME.fullmatch(AUTH) or not NAME.fullmatch(REST): sys.exit(2)
def deny(value):
  if not isinstance(value, dict): raise ValueError('message')
  ident, service, path, method = value.get('id'), value.get('service'), value.get('path'), value.get('method')
  if not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f-]{36}', ident): raise ValueError('id')
  if service not in ('auth','rest') or not isinstance(path, str) or len(path) > 512 or method not in ('GET','POST'): raise ValueError('target')
  auth_paths = {('/token?grant_type=password','POST'),('/token?grant_type=refresh_token','POST'),('/user','GET'),('/logout?scope=local','POST')}
  if service == 'auth' and (path, method) not in auth_paths: raise ValueError('route')
  if service == 'rest' and (method != 'POST' or not re.fullmatch(r'/rpc/[a-z_]+', path) or path[5:] not in RPCS): raise ValueError('route')
  headers, body = value.get('headers', {}), value.get('body', '')
  if not isinstance(headers, dict) or set(headers) - {'authorization','apikey','content-type','accept','accept-profile','content-profile'}: raise ValueError('headers')
  if any(not isinstance(k, str) or not isinstance(v, str) or len(v) > 16384 or '\r' in v or '\n' in v for k,v in headers.items()): raise ValueError('headers')
  if not isinstance(body, str) or len(body) > (MAX * 4 // 3 + 8): raise ValueError('body')
  raw = base64.b64decode(body.encode('ascii'), validate=True) if body else b''
  if len(raw) > MAX: raise ValueError('body')
  return ident, AUTH if service == 'auth' else REST, 9999 if service == 'auth' else 3000, path, method, headers, raw
for line in sys.stdin:
  ident = None
  try:
    if len(line.encode('utf-8')) > (MAX * 4 // 3 + 65536): raise ValueError('oversized')
    value = json.loads(line); ident, host, port, path, method, headers, body = deny(value)
    conn = http.client.HTTPConnection(host, port, timeout=4)
    try:
      conn.request(method, path, body=body if method == 'POST' else None, headers=headers)
      response = conn.getresponse(); payload = response.read(MAX + 1)
    finally:
      conn.close()
    if len(payload) > MAX: raise ValueError('oversized')
    content_type = response.getheader('Content-Type')
    print(json.dumps({'id': ident, 'status': response.status, 'headers': ({'content-type': content_type} if content_type else {}), 'body': base64.b64encode(payload).decode('ascii')}, separators=(',',':')), flush=True)
  except Exception:
    print(json.dumps({'id': ident if isinstance(ident, str) else '', 'error': 'fixture_transport_unavailable'}, separators=(',',':')), flush=True)
`;

function route(url: URL): Target {
  if (url.origin !== PROVIDER_ORIGIN || url.hash || url.username || url.password) throw new Error('fixture_target_denied');
  if (url.pathname === '/auth/v1/token' && (url.search === '?grant_type=password' || url.search === '?grant_type=refresh_token')) return { service: 'auth', path: `/token${url.search}` };
  if (url.pathname === '/auth/v1/user' && url.search === '') return { service: 'auth', path: '/user' };
  if (url.pathname === '/auth/v1/logout' && url.search === '?scope=local') return { service: 'auth', path: `/logout${url.search}` };
  const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
  if (rpc && RPC_NAMES.has(rpc[1] ?? '') && url.search === '') return { service: 'rest', path: `/rpc/${rpc[1]}` };
  throw new Error('fixture_target_denied');
}

function childEnvironment(): NodeJS.ProcessEnv {
  const names = ['PATH', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE'];
  return { NODE_ENV: 'test', DOCKER_HOST: 'npipe:////./pipe/docker_engine',
    ...Object.fromEntries(names.flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]])) };
}

function response(reply: ProviderReply): Response {
  if (!Number.isInteger(reply.status) || reply.status! < 100 || reply.status! > 599 || typeof reply.body !== 'string') throw new Error('fixture_http_invalid');
  let body: Buffer;
  try { body = Buffer.from(reply.body, 'base64'); } catch { throw new Error('fixture_http_invalid'); }
  if (body.length > MAX_MESSAGE_BYTES) throw new Error('fixture_http_invalid');
  const contentType = reply.headers?.['content-type'];
  return new Response(reply.status === 204 || reply.status === 304 ? null : new Uint8Array(body), {
    status: reply.status, headers: typeof contentType === 'string' ? { 'Content-Type': contentType } : undefined
  });
}

/** Test-only persistent Docker-private provider bridge. */
export function createPrivateProviderTransport(fixture: PrivateProviderFixture): PrivateProviderTransport {
  if (!CONTAINER_ID.test(fixture.dbId) || !CONTAINER_NAME.test(fixture.authName) || !CONTAINER_NAME.test(fixture.restName)) throw new Error('fixture_identity_invalid');
  const child = spawn('docker', ['--context', 'default', 'exec', '-i', fixture.dbId, 'python3', '-u', '-c', PYTHON_BRIDGE, fixture.authName, fixture.restName],
    { env: childEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map<string, { resolve(value: Response): void; reject(reason: Error): void; timer: NodeJS.Timeout; abort(): void }>();
  const completed: ProviderTiming[] = [];
  let closed = false, childClosed = false, stdout = Buffer.alloc(0), stderrBytes = 0;
  const rejectAll = (reason: string): void => {
    for (const [id, item] of pending) { pending.delete(id); clearTimeout(item.timer); item.abort(); item.reject(new Error(reason)); }
  };
  const failChild = (): void => { if (!closed) rejectAll('fixture_transport_unavailable'); };
  child.on('error', failChild); child.on('close', () => { childClosed = true; failChild(); });
  child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > MAX_MESSAGE_BYTES) { child.kill(); failChild(); } });
  child.stdout.on('data', (chunk: Buffer) => {
    stdout = Buffer.concat([stdout, chunk]);
    if (stdout.length > MAX_MESSAGE_BYTES) { child.kill(); failChild(); return; }
    for (;;) {
      const newline = stdout.indexOf(10); if (newline < 0) return;
      const raw = stdout.subarray(0, newline); stdout = stdout.subarray(newline + 1);
      try {
        const reply = JSON.parse(raw.toString('utf8')) as ProviderReply;
        if (typeof reply.id !== 'string' || reply.id.length > 64) throw new Error('fixture_http_invalid');
        const item = pending.get(reply.id); if (!item) throw new Error('fixture_http_invalid');
        pending.delete(reply.id); clearTimeout(item.timer); item.abort();
        if (reply.error) item.reject(new Error('fixture_transport_unavailable')); else item.resolve(response(reply));
      } catch { child.kill(); failChild(); return; }
    }
  });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (closed) throw new Error('fixture_transport_closed');
    const request = new Request(input, init), target = route(new URL(request.url));
    if (request.signal.aborted) throw new Error('fixture_transport_aborted');
    if (request.method !== 'GET' && request.method !== 'POST') throw new Error('fixture_method_denied');
    const body = request.body === null ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
    if (body.length > MAX_MESSAGE_BYTES) throw new Error('fixture_body_oversized');
    const headers = Object.fromEntries(REQUEST_HEADERS.flatMap(name => request.headers.get(name) === null ? [] : [[name, request.headers.get(name)!]]));
    const id = randomUUID();
    const started = performance.now();
    const operation = `${target.service}_${target.path.replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`;
    const record = (outcome: string): void => {
      if (completed.length < 32) completed.push({ operation, elapsedMs: Math.round(performance.now() - started), outcome });
    };
    return await new Promise<Response>((resolve, reject) => {
      const onAbort = (): void => { const item = pending.get(id); if (item) { pending.delete(id); clearTimeout(item.timer); record('aborted'); reject(new Error('fixture_transport_aborted')); } };
      const timer = setTimeout(onAbort, 4500);
      pending.set(id, { resolve: value => { record(`http_${value.status}`); resolve(value); },
        reject: reason => { record('failed'); reject(reason); }, timer,
        abort: () => request.signal.removeEventListener('abort', onAbort) });
      request.signal.addEventListener('abort', onAbort, { once: true });
      const message = JSON.stringify({ id, service: target.service, path: target.path, method: request.method, headers, body: body.toString('base64') }) + '\n';
      if (Buffer.byteLength(message) > MAX_MESSAGE_BYTES * 4 / 3 + 65536) { onAbort(); return; }
      child.stdin.write(message, error => { if (error) onAbort(); });
    });
  };
  const close = async (): Promise<void> => {
    if (closed) return; closed = true; rejectAll('fixture_transport_closed'); child.stdin.end();
    if (childClosed) return;
    await new Promise<void>((resolve, reject) => {
      const killTimer = setTimeout(() => child.kill(), 2000);
      const deadline = setTimeout(() => reject(new Error('fixture_child_cleanup_timeout')), 7000);
      child.once('close', () => { clearTimeout(killTimer); clearTimeout(deadline); resolve(); });
    });
  };
  return { fetch, timings: () => completed.slice(), close };
}
