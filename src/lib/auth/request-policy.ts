import type { z } from 'zod';

type RequestPolicyCode =
  | 'invalid_configuration'
  | 'method_not_allowed'
  | 'forbidden'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'bad_request';

const STATUS_BY_CODE: Record<RequestPolicyCode, number> = {
  invalid_configuration: 503,
  method_not_allowed: 405,
  forbidden: 403,
  unsupported_media_type: 415,
  payload_too_large: 413,
  bad_request: 400
};

export class SessionRequestError extends Error {
  readonly code: RequestPolicyCode;
  readonly status: number;
  constructor(code: RequestPolicyCode, status: number) {
    super(code);
    this.name = 'SessionRequestError';
    this.code = code;
    this.status = status;
  }
}

function fail(code: RequestPolicyCode): never {
  throw new SessionRequestError(code, STATUS_BY_CODE[code]);
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function validateTrustedOrigin(trustedOrigin: string): void {
  if (safeOrigin(trustedOrigin) !== trustedOrigin) fail('invalid_configuration');
  const url = new URL(trustedOrigin);
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return;
  fail('invalid_configuration');
}

export function assertSameOriginMutation(request: Request, trustedOrigin: string): void {
  validateTrustedOrigin(trustedOrigin);
  if (request.method !== 'POST') fail('method_not_allowed');
  if (safeOrigin(request.url) !== trustedOrigin) fail('forbidden');
  if (request.headers.get('origin') !== trustedOrigin) fail('forbidden');
  if (request.headers.get('x-hc-request') !== '1') fail('forbidden');
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite !== null && secFetchSite !== 'same-origin') fail('forbidden');
}

/** GET never refreshes or mutates a session; a same-origin header is still required. */
export function assertSameOriginRead(request: Request, trustedOrigin: string): void {
  validateTrustedOrigin(trustedOrigin);
  if (request.method !== 'GET') fail('method_not_allowed');
  if (safeOrigin(request.url) !== trustedOrigin) fail('forbidden');
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== trustedOrigin) fail('forbidden');
  if (request.headers.get('x-hc-request') !== '1') fail('forbidden');
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') fail('forbidden');
}

const CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i;
const CONTENT_LENGTH_PATTERN = /^[0-9]+$/;

export async function readBoundedJson<T>(
  request: Pick<Request, 'headers' | 'body' | 'bodyUsed'>,
  schema: z.ZodType<T>,
  maxBytes = 4096,
  signal?: AbortSignal
): Promise<T> {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 65536)
    fail('invalid_configuration');
  const contentType = request.headers.get('content-type');
  if (contentType === null || !CONTENT_TYPE_PATTERN.test(contentType))
    fail('unsupported_media_type');
  const contentEncoding = request.headers.get('content-encoding');
  if (contentEncoding !== null && contentEncoding.trim().toLowerCase() !== 'identity') {
    fail('unsupported_media_type');
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!CONTENT_LENGTH_PATTERN.test(contentLength)) fail('bad_request');
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared)) fail('bad_request');
    if (declared > maxBytes) fail('payload_too_large');
  }
  if (request.body === null || request.bodyUsed) fail('bad_request');

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = request.body.getReader(); } catch { return fail('bad_request'); }
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        fail('payload_too_large');
      }
      chunks.push(result.value);
    }
  } catch (err) {
    if (err instanceof SessionRequestError) throw err;
    fail('bad_request');
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: ReturnType<typeof schema.safeParse>;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(combined);
    parsed = schema.safeParse(JSON.parse(text));
  } catch {
    fail('bad_request');
  }
  if (!parsed.success) fail('bad_request');
  return parsed.data;
}

/** expectedToken must come from the verified server session, never another request field. */
export function assertSessionCsrf(request: Request, expectedToken: string): void {
  const tokenShape = /^[A-Za-z0-9_-]{43}$/;
  if (!tokenShape.test(expectedToken)) fail('invalid_configuration');
  const supplied = request.headers.get('x-hc-csrf');
  if (supplied === null || !tokenShape.test(supplied)) fail('forbidden');
  let difference = 0;
  for (let i = 0; i < 43; i++) difference |= supplied.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  if (difference !== 0) fail('forbidden');
}
