import { createServiceClient } from '@/lib/supabase/service';

/**
 * Rate limiting for the public routes.
 *
 * The store is Postgres — see the migration for why not Redis. The point of this module
 * is that callers never learn which it is: if traffic ever justifies Upstash, replace
 * `consume` and nothing above it changes.
 *
 * Fails OPEN. A rate limiter that rejects real customers because the counter table is
 * unreachable has done more damage than the abuse it was guarding against. The failure
 * is logged so it does not stay invisible.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  /** True when the check itself failed and the request was let through regardless. */
  degraded: boolean;
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * The limits, in one place so they can be argued about.
 *
 * Each is set so that a real person cannot reach it and a script reaches it immediately.
 * A customer places one order and checks it twice; a bazaar phone posts a batch every few
 * minutes, not every second.
 */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  /** Placing an order. Ten a minute is a fumbling customer; the eleventh is a script. */
  'orders:create': { limit: 10, windowSeconds: 60 },

  /**
   * Order lookup. The tight one, because this is the enumeration surface: guessing order
   * numbers against a phone number is the only way to read someone else's order.
   */
  'orders:lookup': { limit: 8, windowSeconds: 60 },

  /** Offline sale intake. Generous — a bazaar phone catching up may post several batches. */
  'sync:post': { limit: 30, windowSeconds: 60 },

  /** Sign-in attempts, per IP. Brute force is the threat. */
  'auth:signin': { limit: 10, windowSeconds: 900 },

  /** Health checks, so a monitor cannot be turned into a load generator. */
  'health:get': { limit: 60, windowSeconds: 60 }
};

import { hasSupabaseConfig } from '@/lib/supabase/config';

// No counter table without a backend, and no backend on the first deploy. Disabled
// rather than failing open on every request, which would log an error per request.
const ENABLED = process.env.RATE_LIMIT_ENABLED !== '0' && hasSupabaseConfig();

/**
 * Identifies the caller. Prefer the authenticated user id; fall back to the client IP.
 *
 * On Vercel `x-forwarded-for` is a chain and only the FIRST entry is the real client —
 * taking the last gives you the proxy, which rate-limits every customer as one person.
 */
export function callerId(headers: Headers, userId?: string | null): string {
  if (userId) return 'user:' + userId;
  const forwarded = headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
  return 'ip:' + ip;
}

export async function checkRateLimit(
  rule: keyof typeof RATE_LIMITS | RateLimitRule,
  identifier: string,
  ruleName?: string
): Promise<RateLimitResult> {
  const config = typeof rule === 'string' ? RATE_LIMITS[rule] : rule;
  const name = typeof rule === 'string' ? rule : (ruleName ?? 'custom');
  if (!config) throw new Error('unknown rate limit rule: ' + String(rule));

  const fallback: RateLimitResult = {
    allowed: true,
    limit: config.limit,
    remaining: config.limit,
    resetAt: new Date(Date.now() + config.windowSeconds * 1000),
    degraded: false
  };
  if (!ENABLED) return fallback;

  try {
    const supabase = createServiceClient();
    // The result shape is inferred from the generated schema; retain the runtime guard.
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_key: name + ':' + identifier,
      p_limit: config.limit,
      p_window_s: config.windowSeconds
    });
    const row = data?.[0];
    if (error || !row || typeof row.allowed !== 'boolean') {
      throw error ?? new Error('consume_rate_limit returned an unexpected shape');
    }
    return {
      allowed: row.allowed,
      limit: config.limit,
      remaining: row.remaining,
      resetAt: new Date(row.reset_at),
      degraded: false
    };
  } catch (cause) {
    // Fail open, loudly. Silently failing closed would look like the app being broken.
    console.error('[rate-limit] check failed, allowing request', {
      rule: name,
      error: cause instanceof Error ? cause.message : 'unknown'
    });
    return { ...fallback, degraded: true };
  }
}

/** The standard headers, so a client can back off instead of retrying blindly. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000))
  };
}

/** The 429 body. The message is read by a customer, so it says what to do. */
export function tooManyRequests(result: RateLimitResult): Response {
  const seconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
  return Response.json(
    { error: 'Too many requests. Please wait a moment and try again.' },
    {
      status: 429,
      headers: { ...rateLimitHeaders(result), 'Retry-After': String(seconds) }
    }
  );
}
