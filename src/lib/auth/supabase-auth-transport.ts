import { z } from 'zod';
import { readBoundedJson } from './request-policy';

/**
 * Static, non-descriptive failure for every invalid configuration/input,
 * unexpected provider shape, network error, or parse error. Never carries a
 * `cause` — callers must not infer network detail or remote state from this
 * transport. Reaching the provider and returning a non-204/2xx status is not
 * proof of, and this class makes no claim about, immediate JWT revocation.
 */
export class AuthTransportError extends Error {
  readonly code = 'auth_dependency_unavailable';
  static readonly message = 'auth_dependency_unavailable';

  constructor() {
    super(AuthTransportError.message);
    this.name = 'AuthTransportError';
  }
}

/** Exact pinned-provider 403 bad_jwt on local logout; it never proves expiry or revocation. */
export class AuthLogoutAccessTokenRejectedError extends AuthTransportError {
  constructor() { super(); this.name = 'AuthLogoutAccessTokenRejectedError'; }
}

function fail(): never {
  throw new AuthTransportError();
}

const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{1,200}$/;
const TOKEN_PATTERN = /^[\x21-\x7E]{1,16384}$/;
const JWT_PART = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_BODY_BYTES = 65536;

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024)
});

const authSuccessSchema = z.object({
  access_token: z.string().regex(TOKEN_PATTERN),
  refresh_token: z.string().regex(TOKEN_PATTERN),
  token_type: z.literal('bearer'),
  expires_in: z.number().int().positive().max(2147483647),
  user: z.object({ id: z.string().uuid() })
});

const userSuccessSchema = z.object({ id: z.string().uuid() });
// Hosted gateways may use the legacy string code; pinned GoTrue v2.196.0
// returns a numeric HTTP code plus a stable string error_code.
const providerErrorSchema = z.union([
  z.object({ code: z.string() }),
  z.object({ code: z.number().int(), error_code: z.string() })
]);

function providerErrorCode(error: z.infer<typeof providerErrorSchema>, status: number): string {
  if (typeof error.code === 'string') return error.code;
  if ('error_code' in error && error.code === status) return error.error_code;
  return fail();
}

export interface SupabaseAuthTransportConfig {
  origin: string;
  publishableKey: string;
  fetch: typeof globalThis.fetch;
}

export interface AuthTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

export interface VerifiedProviderBinding {
  userId: string;
  providerSessionId: string;
}

/** Read claims only after /user has authenticated this exact access token. */
function sessionClaims(accessToken: string): VerifiedProviderBinding {
  const parts = accessToken.split('.');
  if (parts.length !== 3 || parts.some(part => !JWT_PART.test(part))) fail();
  try {
    const encoded = parts[1];
    if (encoded.length > 8192 || encoded.length % 4 === 1) fail();
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const canonical = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (canonical !== encoded) fail();
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) fail();
    const claims = payload as Record<string, unknown>;
    if (typeof claims.sub !== 'string' || !UUID_PATTERN.test(claims.sub) ||
        typeof claims.session_id !== 'string' || !UUID_PATTERN.test(claims.session_id)) fail();
    return { userId: claims.sub, providerSessionId: claims.session_id };
  } catch { fail(); }
}

function validateConfig(config: SupabaseAuthTransportConfig): {
  origin: string;
  publishableKey: string;
} {
  let url: URL;
  try {
    url = new URL(config.origin);
  } catch {
    return fail();
  }
  if (url.protocol !== 'https:') fail();
  if (url.origin !== config.origin) fail();
  if (!PUBLISHABLE_KEY_PATTERN.test(config.publishableKey)) fail();
  return { origin: config.origin, publishableKey: config.publishableKey };
}

function validateToken(token: string): string {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) fail();
  return token;
}

function cancelBestEffort(response: Response): void {
  if (response.body === null) return;
  try {
    void response.body.cancel().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

async function readJson<T>(
  response: Response,
  schema: z.ZodType<T>,
  signal: AbortSignal
): Promise<T> {
  try {
    return await readBoundedJson(
      {
        headers: new Headers({ 'content-type': response.headers.get('content-type') ?? '' }),
        body: response.body,
        bodyUsed: response.bodyUsed
      },
      schema,
      MAX_BODY_BYTES,
      signal
    );
  } catch {
    cancelBestEffort(response);
    return fail();
  }
}

async function doFetch(
  fetchFn: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal
): Promise<Response> {
  if (signal.aborted) fail();
  let response: Response;
  try {
    response = await fetchFn(url, { ...init, cache: 'no-store', redirect: 'manual', signal });
  } catch {
    return fail();
  }
  if (signal.aborted) { cancelBestEffort(response); fail(); }
  return response;
}

export function createSupabaseAuthTransport(config: SupabaseAuthTransportConfig) {
  const { origin, publishableKey } = validateConfig(config);
  const fetchFn = config.fetch;
  const baseHeaders = { apikey: publishableKey, Accept: 'application/json' };

  async function exchangeToken(
    grantType: 'password' | 'refresh_token',
    body: Record<string, string>,
    signal: AbortSignal
  ): Promise<AuthTokenResult | null> {
    const url = `${origin}/auth/v1/token?grant_type=${grantType}`;
    const response = await doFetch(
      fetchFn,
      url,
      {
        method: 'POST',
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      signal
    );

    if (response.status === 200) {
      const parsed = await readJson(response, authSuccessSchema, signal);
      if (signal.aborted) fail();
      return {
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token,
        expiresIn: parsed.expires_in,
        userId: parsed.user.id
      };
    }

    if (response.status === 400) {
      const parsed = await readJson(response, providerErrorSchema, signal);
      if (signal.aborted) fail();
      const expectedCodes =
        grantType === 'password'
          ? ['invalid_credentials']
          : ['refresh_token_not_found', 'refresh_token_already_used'];
      if (expectedCodes.includes(providerErrorCode(parsed, response.status))) return null;
      fail();
    }

    cancelBestEffort(response);
    fail();
  }

  async function getUser(accessToken: string, signal: AbortSignal): Promise<{ id: string } | null> {
    const token = validateToken(accessToken);
    const response = await doFetch(
      fetchFn,
      `${origin}/auth/v1/user`,
      { method: 'GET', headers: { ...baseHeaders, Authorization: `Bearer ${token}` } },
      signal
    );
    if (response.status === 200) {
      const parsed = await readJson(response, userSuccessSchema, signal);
      if (signal.aborted) fail();
      return { id: parsed.id };
    }
    if (response.status === 401 || response.status === 403) {
      const parsed = await readJson(response, providerErrorSchema, signal);
      if (signal.aborted) fail();
      const code = providerErrorCode(parsed, response.status);
      if ((response.status === 401 && (code === 'bad_jwt' || code === 'session_not_found')) ||
          (response.status === 403 && code === 'session_not_found')) return null;
      fail();
    }
    cancelBestEffort(response);
    fail();
  }

  return {
    async login(
      credentials: { email: string; password: string },
      signal: AbortSignal
    ): Promise<AuthTokenResult | null> {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) fail();
      return exchangeToken(
        'password',
        { email: parsed.data.email, password: parsed.data.password },
        signal
      );
    },

    async refresh(refreshToken: string, signal: AbortSignal): Promise<AuthTokenResult | null> {
      const token = validateToken(refreshToken);
      return exchangeToken('refresh_token', { refresh_token: token }, signal);
    },

    user: getUser,

    async verifyBinding(result: AuthTokenResult, signal: AbortSignal): Promise<VerifiedProviderBinding | null> {
      if (result === null || typeof result !== 'object' ||
          typeof result.accessToken !== 'string' || typeof result.userId !== 'string' ||
          !UUID_PATTERN.test(result.userId)) fail();
      const user = await getUser(result.accessToken, signal);
      if (user === null) return null;
      if (signal.aborted) fail();
      const claims = sessionClaims(result.accessToken);
      if (user.id !== result.userId || claims.userId !== user.id) fail();
      return claims;
    },

    async logout(accessToken: string, signal: AbortSignal): Promise<void> {
      const token = validateToken(accessToken);
      const response = await doFetch(
        fetchFn,
        `${origin}/auth/v1/logout?scope=local`,
        { method: 'POST', headers: { ...baseHeaders, Authorization: `Bearer ${token}` } },
        signal
      );

      if (signal.aborted) fail();
      if (response.status === 204) return;
      if (response.status === 403) {
        const parsed = await readJson(response, providerErrorSchema, signal);
        if (signal.aborted) fail();
        if (typeof parsed.code === 'number' && parsed.code === 403 && providerErrorCode(parsed, response.status) === 'session_not_found') return;
        if (typeof parsed.code === 'number' && parsed.code === 403 && providerErrorCode(parsed, response.status) === 'bad_jwt') throw new AuthLogoutAccessTokenRejectedError();
      }
      cancelBestEffort(response);
      fail();
    }
  };
}
