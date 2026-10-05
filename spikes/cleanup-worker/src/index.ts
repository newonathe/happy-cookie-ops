import { createPersistentSessionAuthority } from '../../../src/lib/auth/persistent-session-authority';
import { createSessionCrypto } from '../../../src/lib/auth/session-crypto';
import { createSupabaseAuthTransport } from '../../../src/lib/auth/supabase-auth-transport';
import { pagesSessionRateRules } from '../../pages/functions/lib/session-composition';
import { createPagesServiceRpc } from '../../pages/functions/lib/service-rpc';

export interface CleanupCounts {
  claimed: number;
  completed: number;
  failed: number;
  timedOut: number;
}

export type CleanupLogEvent =
  | ({ event: 'scheduled_cleanup'; outcome: 'success' | 'partial_failure' } & CleanupCounts)
  | {
      event: 'scheduled_cleanup';
      outcome: 'failure';
      errorClass: 'configuration' | 'dependency' | 'deadline';
    };

type ErrorClass = Extract<CleanupLogEvent, { outcome: 'failure' }>['errorClass'];

export class ScheduledCleanupError extends Error {
  readonly code = 'scheduled_cleanup_unavailable';
  constructor(readonly errorClass: ErrorClass) {
    super('scheduled_cleanup_unavailable');
    this.name = 'ScheduledCleanupError';
  }
}

const secretKey = /^sb_secret_[A-Za-z0-9_-]{1,200}$/;
const publishableKey = /^sb_publishable_[A-Za-z0-9_-]{1,200}$/;
const maxSubrequests = 40; // Leave headroom below the free Worker limit of 50.
const wallTimeMs = 24_500; // The authority also enforces its own 25-second limit.

function invalid(): never {
  throw new ScheduledCleanupError('configuration');
}

function required(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  return typeof value === 'string' && value.length > 0 ? value : invalid();
}

function providerOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) invalid();
  return value;
}

async function compose(env: Record<string, unknown>, fetchFn: typeof globalThis.fetch) {
  try {
    if (env === null || typeof env !== 'object' || typeof fetchFn !== 'function') invalid();
    const origin = providerOrigin(required(env, 'SUPABASE_URL'));
    const publicKey = required(env, 'SUPABASE_PUBLISHABLE_KEY');
    const serviceKey = required(env, 'SUPABASE_SERVICE_KEY');
    if (
      !publishableKey.test(publicKey) ||
      !secretKey.test(serviceKey) ||
      required(env, 'SUPABASE_SERVICE_KEY_KIND') !== 'sb_secret'
    )
      invalid();
    const cryptoConfig: unknown = JSON.parse(required(env, 'SESSION_CRYPTO_CONFIG_JSON'));
    const crypto = await createSessionCrypto(cryptoConfig);
    let subrequests = 0;
    const limitedFetch: typeof globalThis.fetch = (input, init) => {
      if (++subrequests > maxSubrequests) throw new ScheduledCleanupError('dependency');
      return fetchFn(input, init);
    };
    const auth = createSupabaseAuthTransport({
      origin,
      publishableKey: publicKey,
      fetch: limitedFetch
    });
    const rpc = createPagesServiceRpc({
      origin,
      serviceKey,
      keyKind: 'sb_secret',
      fetch: limitedFetch
    });
    return createPersistentSessionAuthority({
      rpc,
      auth,
      crypto,
      rateRules: pagesSessionRateRules,
      trustedCallerId: () => null,
      deferRecovery: () => {
        throw new ScheduledCleanupError('dependency');
      }
    });
  } catch {
    invalid();
  }
}

/** One bounded cleanup batch. The callback receives only allowlisted aggregate data. */
export async function runScheduledCleanup(
  env: Record<string, unknown>,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  log?: (event: CleanupLogEvent) => void
): Promise<CleanupCounts> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ScheduledCleanupError('deadline'));
    }, wallTimeMs);
  });
  const report = (event: CleanupLogEvent) => {
    try {
      log?.(event);
    } catch {
      /* Logging cannot change cleanup state. */
    }
  };
  try {
    const result = await Promise.race([
      (async () => (await compose(env, fetchFn)).claimCleanup(3, controller.signal))(),
      deadline
    ]);
    report({
      event: 'scheduled_cleanup',
      outcome: result.failed > 0 ? 'partial_failure' : 'success',
      ...result
    });
    return result;
  } catch (error) {
    const safe =
      error instanceof ScheduledCleanupError ? error : new ScheduledCleanupError('dependency');
    report({ event: 'scheduled_cleanup', outcome: 'failure', errorClass: safe.errorClass });
    throw safe;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

const worker = {
  async scheduled(_event: unknown, env: Record<string, unknown>): Promise<void> {
    const result = await runScheduledCleanup(env, globalThis.fetch, (event) =>
      console.info(JSON.stringify(event))
    );
    if (result.failed > 0) throw new ScheduledCleanupError('dependency');
  }
};

export default worker;
