import { createPersistentSessionAuthority } from '../../../../src/lib/auth/persistent-session-authority';
import { createSessionCrypto } from '../../../../src/lib/auth/session-crypto';
import { handleSessionRequest } from '../../../../src/lib/auth/session-handler';
import { createSupabaseAuthTransport } from '../../../../src/lib/auth/supabase-auth-transport';
import { createPagesServiceRpc } from './service-rpc';

type PagesSessionEnv = Record<string, unknown>;

export interface PagesSessionContext {
  request: Request;
  env: PagesSessionEnv;
  waitUntil(task: Promise<void>): void;
}

const rateRules = {
  session: { key: 'auth:session', limit: 60, windowSeconds: 60 },
  login: { key: 'auth:signin', limit: 10, windowSeconds: 900 },
  refresh: { key: 'auth:refresh', limit: 12, windowSeconds: 60 },
  logout: { key: 'auth:signout', limit: 12, windowSeconds: 60 }
} as const;

const ipCharacters = /^[0-9a-fA-F:.]{3,45}$/;
const localCaller = /^local:[A-Za-z0-9_-]{1,40}$/;

function exactOrigin(value: unknown, allowLoopback: boolean): string {
  if (typeof value !== 'string') throw new Error('invalid_configuration');
  const url = new URL(value);
  if (url.origin !== value) throw new Error('invalid_configuration');
  if (url.protocol === 'https:') return value;
  if (allowLoopback && url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return value;
  throw new Error('invalid_configuration');
}

function requiredString(env: PagesSessionEnv, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error('invalid_configuration');
  return value;
}

function callerId(context: PagesSessionContext, appOrigin: string): string {
  const configuredLocal = context.env.HCO_LOCAL_TRUSTED_CALLER_ID;
  if (configuredLocal !== undefined) {
    if (!appOrigin.startsWith('http://') || typeof configuredLocal !== 'string' ||
        !localCaller.test(configuredLocal)) throw new Error('invalid_configuration');
    return configuredLocal;
  }

  // The property is set on incoming Cloudflare Requests, not by browser headers.
  const cf = (context.request as Request & { cf?: unknown }).cf;
  const edgeIp = context.request.headers.get('cf-connecting-ip');
  if (cf === null || typeof cf !== 'object' || edgeIp === null || !ipCharacters.test(edgeIp))
    throw new Error('invalid_configuration');
  return `edge:${edgeIp.toLowerCase()}`;
}

function unavailable(): Response {
  return new Response(JSON.stringify({ code: 'dependency_unavailable' }), {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

/** Secrets enter only through this Pages Function composition boundary. */
export async function handlePagesSessionRequest(
  context: PagesSessionContext,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<Response> {
  try {
    const appOrigin = exactOrigin(context.env.APP_ORIGIN, true);
    const supabaseOrigin = exactOrigin(context.env.SUPABASE_URL, false);
    const publishableKey = requiredString(context.env, 'SUPABASE_PUBLISHABLE_KEY');
    const serviceKey = requiredString(context.env, 'SUPABASE_SERVICE_KEY');
    const keyKind = requiredString(context.env, 'SUPABASE_SERVICE_KEY_KIND');
    if (keyKind !== 'sb_secret' && keyKind !== 'legacy_jwt') throw new Error('invalid_configuration');
    if (keyKind === 'legacy_jwt' && !appOrigin.startsWith('http://')) throw new Error('invalid_configuration');
    const caller = callerId(context, appOrigin);
    const cryptoConfig = JSON.parse(requiredString(context.env, 'SESSION_CRYPTO_CONFIG_JSON')) as unknown;
    const crypto = await createSessionCrypto(cryptoConfig);
    const auth = createSupabaseAuthTransport({ origin: supabaseOrigin, publishableKey, fetch: fetchFn });
    const rpc = createPagesServiceRpc({ origin: supabaseOrigin, serviceKey, keyKind, fetch: fetchFn });
    const authority = createPersistentSessionAuthority({
      rpc, auth, crypto, rateRules,
      trustedCallerId: () => caller,
      deferRecovery: task => context.waitUntil(task)
    });
    return await handleSessionRequest(context.request, { origin: appOrigin, authority });
  } catch {
    return unavailable();
  }
}

export const pagesSessionRateRules = rateRules;
