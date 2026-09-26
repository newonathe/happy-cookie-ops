import type { Database } from '../../../../src/lib/types/database';

type Functions = Database['public']['Functions'];
export type ServiceRpcName = Extract<keyof Functions,
  'bff_session_create' | 'bff_session_read' | 'bff_session_acquire_refresh' |
  'bff_session_finalize_refresh' | 'bff_session_begin_revoke' |
  'bff_session_claim_cleanup' | 'bff_session_complete_cleanup' |
  'bff_session_save_cleanup_rotation' | 'bff_session_complete_if_provider_absent' | 'consume_rate_limit'>;

const ALLOWED = new Set<ServiceRpcName>([
  'bff_session_create', 'bff_session_read', 'bff_session_acquire_refresh',
  'bff_session_finalize_refresh', 'bff_session_begin_revoke',
  'bff_session_claim_cleanup', 'bff_session_complete_cleanup',
  'bff_session_save_cleanup_rotation', 'bff_session_complete_if_provider_absent', 'consume_rate_limit'
]);
const SECRET_KEY = /^sb_secret_[A-Za-z0-9_-]{1,200}$/;
const LEGACY_JWT = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class ServiceRpcError extends Error {
  readonly code = 'service_rpc_unavailable';
  constructor() { super('service_rpc_unavailable'); this.name = 'ServiceRpcError'; }
}

export interface ServiceRpcConfig {
  origin: string;
  serviceKey: string;
  keyKind: 'sb_secret' | 'legacy_jwt';
  fetch: typeof globalThis.fetch;
}

export type ServiceRpc = <Name extends ServiceRpcName>(
  name: Name,
  args: Functions[Name]['Args'],
  signal: AbortSignal
) => Promise<{ data: Functions[Name]['Returns']; error: null }>;

function fail(): never { throw new ServiceRpcError(); }

function validate(config: ServiceRpcConfig): { origin: string; headers: Headers; fetch: typeof globalThis.fetch } {
  let url: URL;
  try { url = new URL(config.origin); } catch { return fail(); }
  if (url.protocol !== 'https:' || url.origin !== config.origin || url.username || url.password ||
      typeof config.fetch !== 'function') fail();
  const keyValid = config.keyKind === 'sb_secret'
    ? SECRET_KEY.test(config.serviceKey)
    : config.keyKind === 'legacy_jwt' && LEGACY_JWT.test(config.serviceKey);
  if (!keyValid) fail();
  const headers = new Headers({
    apikey: config.serviceKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Profile': 'public',
    'Content-Profile': 'public'
  });
  if (config.keyKind === 'legacy_jwt') headers.set('Authorization', `Bearer ${config.serviceKey}`);
  return { origin: config.origin, headers, fetch: config.fetch };
}

async function readJsonArray(response: Response, signal: AbortSignal): Promise<unknown[]> {
  if (!response.ok || !JSON_CONTENT_TYPE.test(response.headers.get('content-type') ?? '') || response.body === null) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) fail();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { cancel(); fail(); }
      chunks.push(next.value);
    }
    if (signal.aborted) fail();
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (!Array.isArray(parsed)) fail();
    return parsed;
  } catch (error) {
    if (error instanceof ServiceRpcError) throw error;
    fail();
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function createPagesServiceRpc(config: ServiceRpcConfig): ServiceRpc {
  const validated = validate(config);
  const fetchFn = validated.fetch;
  return async <Name extends ServiceRpcName>(name: Name, args: Functions[Name]['Args'], signal: AbortSignal) => {
    if (!ALLOWED.has(name) || signal.aborted) fail();
    let response: Response;
    try {
      response = await fetchFn(`${validated.origin}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: new Headers(validated.headers), body: JSON.stringify(args),
        cache: 'no-store', redirect: 'manual', signal
      });
    } catch { fail(); }
    if (signal.aborted) { void response.body?.cancel().catch(() => undefined); fail(); }
    return { data: await readJsonArray(response, signal) as Functions[Name]['Returns'], error: null };
  };
}
