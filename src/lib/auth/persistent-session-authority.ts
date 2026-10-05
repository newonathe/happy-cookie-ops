import { z } from 'zod';
import type { Database } from '@/lib/types/database';
import type { SessionAuthority, SessionRecord } from './session-handler';
import { createSessionCrypto } from './session-crypto';
import {
  AuthLogoutAccessTokenRejectedError,
  createSupabaseAuthTransport
} from './supabase-auth-transport';

type Functions = Database['public']['Functions'];
type SessionRpcName = Extract<
  keyof Functions,
  | 'bff_session_create'
  | 'bff_session_read'
  | 'bff_session_acquire_refresh'
  | 'bff_session_finalize_refresh'
  | 'bff_session_begin_revoke'
  | 'bff_session_claim_cleanup'
  | 'bff_session_complete_cleanup'
  | 'bff_session_save_cleanup_rotation'
  | 'bff_session_complete_if_provider_absent'
  | 'consume_rate_limit'
>;
type SessionRpc = <Name extends SessionRpcName>(
  name: Name,
  args: Functions[Name]['Args'],
  signal: AbortSignal
) => Promise<{ data: Functions[Name]['Returns'] | null; error: unknown | null }>;
type AuthTransport = ReturnType<typeof createSupabaseAuthTransport>;
type SessionCrypto = Awaited<ReturnType<typeof createSessionCrypto>>;
type Action = 'session' | 'login' | 'refresh' | 'logout';

const token = /^[A-Za-z0-9_-]{43}$/;
const hash = /^[a-f0-9]{64}$/;
const trustedIdentifier = /^[A-Za-z0-9:._-]{1,512}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const role = z.enum(['owner', 'helper', 'support']);
const expiration = z.number().int().nonnegative();
const timestamp = z
  .string()
  .min(1)
  .refine((value) => Number.isFinite(Date.parse(value)), 'timestamp');

const readRow = z
  .object({
    p_user_id: z.string().regex(uuid),
    p_role: role,
    p_csrf_token: z.string().regex(token),
    p_expires_at: expiration
  })
  .strict();
const createRow = z
  .object({ p_role: role, p_csrf_token_out: z.string().regex(token), p_expires_at: expiration })
  .strict();
const acquireRow = z
  .object({
    p_user_id: z.string().regex(uuid),
    p_provider_session_id: z.string().regex(uuid),
    p_credential_envelope: z.string().min(1).max(90000),
    p_credentials_version: z.number().int().nonnegative(),
    p_next_credentials_version: z.number().int().nonnegative(),
    p_refresh_fence: z.number().int().nonnegative(),
    p_lease_until: timestamp
  })
  .strict();
const finalizeRow = z
  .object({ p_role: role, p_csrf_token: z.string().regex(token), p_expires_at: expiration })
  .strict();
const revokeRow = z
  .object({
    p_user_id: z.string().regex(uuid),
    p_provider_session_id: z.string().regex(uuid),
    p_credential_envelope: z.string().min(1).max(90000),
    p_credentials_version: z.number().int().nonnegative(),
    p_refresh_fence: z.number().int().nonnegative()
  })
  .strict();
const cleanupRow = revokeRow.extend({ p_session_hash: z.string().regex(hash) }).strict();
const completedRow = z.object({ p_completed_at: timestamp }).strict();
const savedCleanupRow = z
  .object({ p_saved_credentials_version: z.number().int().nonnegative() })
  .strict();
const rateRow = z
  .object({ allowed: z.boolean(), remaining: z.number().int(), reset_at: timestamp })
  .strict();

export class PersistentSessionAuthorityError extends Error {
  readonly code = 'session_dependency_unavailable';
  constructor() {
    super('session_dependency_unavailable');
    this.name = 'PersistentSessionAuthorityError';
  }
}

function fail(): never {
  throw new PersistentSessionAuthorityError();
}
function active(signal: AbortSignal): void {
  if (signal.aborted) fail();
}
function secure<T>(fn: () => T): T {
  try {
    return fn();
  } catch {
    return fail();
  }
}
async function secureAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fail();
  }
}
function one<T>(value: unknown, schema: z.ZodType<T>): T | null {
  if (!Array.isArray(value)) fail();
  if (value.length === 0) return null;
  if (value.length !== 1) fail();
  const parsed = schema.safeParse(value[0]);
  if (!parsed.success) fail();
  return parsed.data;
}

export interface AuthRateRule {
  key: string;
  limit: number;
  windowSeconds: number;
}
export interface PersistentSessionAuthorityDependencies {
  rpc: SessionRpc;
  auth: Pick<AuthTransport, 'login' | 'refresh' | 'verifyBinding' | 'logout'>;
  crypto: SessionCrypto;
  trustedCallerId(request: Request): string | null;
  rateRules: Readonly<Record<Action, AuthRateRule>>;
  deferRecovery(task: Promise<void>): void;
}

export interface PersistentSessionAuthority extends SessionAuthority {
  claimCleanup(
    limit: number,
    signal: AbortSignal
  ): Promise<{
    claimed: number;
    completed: number;
    failed: number;
    timedOut: number;
  }>;
}

export function createPersistentSessionAuthority(
  deps: PersistentSessionAuthorityDependencies
): PersistentSessionAuthority {
  const schedule = (task: Promise<void>): void => {
    const contained = task.catch(() => undefined);
    try {
      deps.deferRecovery(contained);
    } catch {
      fail();
    }
  };
  const scheduleRecovery = (operation: (signal: AbortSignal) => Promise<void>): void => {
    const controller = new AbortController();
    let timer!: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new PersistentSessionAuthorityError());
      }, 3000);
    });
    schedule(
      Promise.race([operation(controller.signal), deadline]).finally(() => clearTimeout(timer))
    );
  };
  const call = async <Name extends SessionRpcName>(
    name: Name,
    args: Functions[Name]['Args'],
    signal: AbortSignal
  ) => {
    active(signal);
    let result: { data: Functions[Name]['Returns'] | null; error: unknown | null };
    try {
      result = await deps.rpc(name, args, signal);
    } catch {
      fail();
    }
    active(signal);
    if (result.error !== null) fail();
    return result.data;
  };
  const record = (
    sessionId: string,
    row: z.infer<typeof readRow> | z.infer<typeof finalizeRow>
  ): SessionRecord => ({
    sessionId,
    csrfToken: row.p_csrf_token,
    expiresAt: row.p_expires_at,
    profile: { id: 'p_user_id' in row ? row.p_user_id : '', role: row.p_role, active: true }
  });
  const finishCleanup = async (
    sessionHash: string,
    fence: number,
    signal: AbortSignal
  ): Promise<void> => {
    const done = one(
      await call(
        'bff_session_complete_cleanup',
        { p_session_hash: sessionHash, p_refresh_fence: fence },
        signal
      ),
      completedRow
    );
    if (done === null) fail();
  };
  const finishIfProviderAbsent = async (
    sessionHash: string,
    row: z.infer<typeof revokeRow>,
    signal: AbortSignal
  ): Promise<boolean> => {
    const done = one(
      await call(
        'bff_session_complete_if_provider_absent',
        {
          p_session_hash: sessionHash,
          p_refresh_fence: row.p_refresh_fence,
          p_user_id: row.p_user_id,
          p_provider_session_id: row.p_provider_session_id
        },
        signal
      ),
      completedRow
    );
    return done !== null;
  };
  const cleanup = async (
    sessionHash: string,
    row: z.infer<typeof revokeRow>,
    signal: AbortSignal
  ): Promise<void> => {
    const credentials = await secureAsync(() =>
      deps.crypto.open(row.p_credential_envelope, {
        sessionHash,
        userId: row.p_user_id,
        version: row.p_credentials_version
      })
    );
    active(signal);
    try {
      await deps.auth.logout(credentials.accessToken, signal);
    } catch (error) {
      if (!(error instanceof AuthLogoutAccessTokenRejectedError)) {
        if (await finishIfProviderAbsent(sessionHash, row, signal)) return;
        fail();
      }
      let tokens: Awaited<ReturnType<AuthTransport['refresh']>>;
      try {
        tokens = await deps.auth.refresh(credentials.refreshToken, signal);
      } catch {
        if (await finishIfProviderAbsent(sessionHash, row, signal)) return;
        fail();
      }
      if (tokens === null) {
        if (await finishIfProviderAbsent(sessionHash, row, signal)) return;
        fail();
      }
      let binding: Awaited<ReturnType<AuthTransport['verifyBinding']>>;
      try {
        binding = await deps.auth.verifyBinding(tokens, signal);
      } catch {
        if (await finishIfProviderAbsent(sessionHash, row, signal)) return;
        fail();
      }
      if (binding === null) {
        if (await finishIfProviderAbsent(sessionHash, row, signal)) return;
        fail();
      }
      if (
        binding.userId !== row.p_user_id ||
        binding.providerSessionId !== row.p_provider_session_id
      ) {
        if (await finishIfProviderAbsent(sessionHash, row, signal)) return;
        fail();
      }
      const nextVersion = row.p_credentials_version + 1;
      if (!Number.isSafeInteger(nextVersion) || nextVersion > 2147483647) fail();
      const envelope = await secureAsync(() =>
        deps.crypto.seal(
          {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
          },
          { sessionHash, userId: row.p_user_id, version: nextVersion }
        )
      );
      const saved = one(
        await call(
          'bff_session_save_cleanup_rotation',
          {
            p_session_hash: sessionHash,
            p_refresh_fence: row.p_refresh_fence,
            p_user_id: row.p_user_id,
            p_provider_session_id: row.p_provider_session_id,
            p_credentials_version: row.p_credentials_version,
            p_next_credentials_version: nextVersion,
            p_credential_envelope: envelope
          },
          signal
        ),
        savedCleanupRow
      );
      if (saved === null || saved.p_saved_credentials_version !== nextVersion) fail();
      try {
        await deps.auth.logout(tokens.accessToken, signal);
      } catch {
        if (await finishIfProviderAbsent(sessionHash, row, signal)) return;
        fail();
      }
    }
    active(signal);
    await finishCleanup(sessionHash, row.p_refresh_fence, signal);
  };
  const beginRevoke = async (
    sessionHash: string,
    signal: AbortSignal
  ): Promise<z.infer<typeof revokeRow>> => {
    const row = one(
      await call('bff_session_begin_revoke', { p_session_hash: sessionHash }, signal),
      revokeRow
    );
    if (row === null) fail();
    return row;
  };
  const revoke = async (sessionHash: string, signal: AbortSignal): Promise<void> => {
    const row = await beginRevoke(sessionHash, signal);
    await cleanup(sessionHash, row, signal);
  };
  const deferSessionRecovery = (accessToken: string, sessionHash?: string): void => {
    scheduleRecovery(async (recoverySignal) => {
      let row: z.infer<typeof revokeRow> | null = null;
      if (sessionHash) {
        try {
          row = await beginRevoke(sessionHash, recoverySignal);
        } catch {
          row = null;
        }
      }
      let issued = false,
        durableComplete = sessionHash === undefined;
      try {
        await deps.auth.logout(accessToken, recoverySignal);
        issued = true;
      } catch {
        /* contained */
      }
      if (row) {
        let current = false;
        try {
          const value = await secureAsync(() =>
            deps.crypto.open(row.p_credential_envelope, {
              sessionHash: sessionHash!,
              userId: row.p_user_id,
              version: row.p_credentials_version
            })
          );
          await deps.auth.logout(value.accessToken, recoverySignal);
          current = true;
        } catch {
          current = false;
        }
        if (issued && current) {
          const done = one(
            await call(
              'bff_session_complete_cleanup',
              { p_session_hash: sessionHash!, p_refresh_fence: row.p_refresh_fence },
              recoverySignal
            ),
            completedRow
          );
          if (done === null) fail();
          durableComplete = true;
        }
      }
      if (!issued || !durableComplete) fail();
    });
  };

  return {
    async limit(request, action, signal) {
      active(signal);
      let caller: string | null;
      try {
        caller = deps.trustedCallerId(request);
      } catch {
        fail();
      }
      const rule = deps.rateRules[action];
      if (
        typeof caller !== 'string' ||
        !trustedIdentifier.test(caller) ||
        !rule ||
        !Number.isSafeInteger(rule.limit) ||
        rule.limit < 1 ||
        !Number.isSafeInteger(rule.windowSeconds) ||
        rule.windowSeconds < 1 ||
        typeof rule.key !== 'string' ||
        rule.key.length > 128 ||
        !trustedIdentifier.test(rule.key)
      )
        fail();
      const row = one(
        await call(
          'consume_rate_limit',
          { p_key: `${rule.key}:${caller}`, p_limit: rule.limit, p_window_s: rule.windowSeconds },
          signal
        ),
        rateRow
      );
      if (row === null || Number.isNaN(Date.parse(row.reset_at))) fail();
      return row.allowed;
    },
    async login(credentials, signal) {
      active(signal);
      let tokens: Awaited<ReturnType<AuthTransport['login']>>;
      try {
        tokens = await deps.auth.login(credentials, signal);
      } catch {
        fail();
      }
      if (tokens === null) return null;
      let recoveryScheduled = false;
      let sessionHash: string | undefined;
      const recover = () => {
        recoveryScheduled = true;
        deferSessionRecovery(tokens.accessToken, sessionHash);
      };
      try {
        active(signal);
        const binding = await deps.auth.verifyBinding(tokens, signal);
        active(signal);
        if (binding === null) {
          recover();
          return null;
        }
        const sessionId = secure(() => deps.crypto.newIdentifier()),
          csrfToken = secure(() => deps.crypto.newIdentifier());
        if (!token.test(sessionId) || !token.test(csrfToken) || sessionId === csrfToken) fail();
        sessionHash = await secureAsync(() => deps.crypto.hashIdentifier(sessionId));
        active(signal);
        if (!hash.test(sessionHash)) fail();
        const envelope = await secureAsync(() =>
          deps.crypto.seal(
            { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
            { sessionHash: sessionHash!, userId: binding.userId, version: 0 }
          )
        );
        active(signal);
        const row = one(
          await call(
            'bff_session_create',
            {
              p_session_hash: sessionHash,
              p_csrf_token: csrfToken,
              p_user_id: binding.userId,
              p_provider_session_id: binding.providerSessionId,
              p_credential_envelope: envelope
            },
            signal
          ),
          createRow
        );
        if (row === null || row.p_csrf_token_out !== csrfToken) fail();
        active(signal);
        return {
          sessionId,
          csrfToken,
          expiresAt: row.p_expires_at,
          profile: { id: binding.userId, role: row.p_role, active: true }
        };
      } catch {
        if (!recoveryScheduled) recover();
        fail();
      }
    },
    async read(sessionId, signal) {
      if (!token.test(sessionId)) fail();
      const sessionHash = await secureAsync(() => deps.crypto.hashIdentifier(sessionId));
      active(signal);
      if (!hash.test(sessionHash)) fail();
      const row = one(
        await call('bff_session_read', { p_session_hash: sessionHash }, signal),
        readRow
      );
      return row === null ? null : record(sessionId, row);
    },
    async refresh(sessionId, signal) {
      if (!token.test(sessionId)) fail();
      const sessionHash = await secureAsync(() => deps.crypto.hashIdentifier(sessionId));
      active(signal);
      if (!hash.test(sessionHash)) fail();
      const acquired = one(
        await call('bff_session_acquire_refresh', { p_session_hash: sessionHash }, signal),
        acquireRow
      );
      if (acquired === null) {
        const current = one(
          await call('bff_session_read', { p_session_hash: sessionHash }, signal),
          readRow
        );
        if (current === null) return null;
        fail();
      }
      if (
        !Number.isSafeInteger(acquired.p_credentials_version) ||
        !Number.isSafeInteger(acquired.p_next_credentials_version) ||
        acquired.p_next_credentials_version !== acquired.p_credentials_version + 1
      )
        fail();
      const old = await secureAsync(() =>
        deps.crypto.open(acquired.p_credential_envelope, {
          sessionHash,
          userId: acquired.p_user_id,
          version: acquired.p_credentials_version
        })
      );
      active(signal);
      let tokens: Awaited<ReturnType<AuthTransport['refresh']>>;
      try {
        tokens = await deps.auth.refresh(old.refreshToken, signal);
      } catch {
        deferSessionRecovery(old.accessToken, sessionHash);
        fail();
      }
      if (tokens === null) {
        deferSessionRecovery(old.accessToken, sessionHash);
        return null;
      }
      let recoveryScheduled = false;
      const recover = () => {
        recoveryScheduled = true;
        deferSessionRecovery(tokens.accessToken, sessionHash);
      };
      try {
        active(signal);
        const binding = await deps.auth.verifyBinding(tokens, signal);
        active(signal);
        if (
          binding === null ||
          binding.userId !== acquired.p_user_id ||
          binding.providerSessionId !== acquired.p_provider_session_id
        )
          fail();
        const envelope = await secureAsync(() =>
          deps.crypto.seal(
            { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
            {
              sessionHash,
              userId: acquired.p_user_id,
              version: acquired.p_next_credentials_version
            }
          )
        );
        active(signal);
        const finalized = await deps.rpc(
          'bff_session_finalize_refresh',
          {
            p_session_hash: sessionHash,
            p_refresh_fence: acquired.p_refresh_fence,
            p_user_id: acquired.p_user_id,
            p_provider_session_id: acquired.p_provider_session_id,
            p_next_credentials_version: acquired.p_next_credentials_version,
            p_credential_envelope: envelope
          },
          signal
        );
        active(signal);
        if (
          finalized.error !== null ||
          !Array.isArray(finalized.data) ||
          finalized.data.length !== 1
        )
          fail();
        const parsedFinalize = finalizeRow.safeParse(finalized.data[0]);
        if (!parsedFinalize.success) fail();
        const row = parsedFinalize.data;
        const current = one(
          await call('bff_session_read', { p_session_hash: sessionHash }, signal),
          readRow
        );
        if (
          current === null ||
          current.p_user_id !== acquired.p_user_id ||
          current.p_csrf_token !== row.p_csrf_token ||
          current.p_expires_at !== row.p_expires_at ||
          current.p_role !== row.p_role
        )
          fail();
        active(signal);
        return record(sessionId, current);
      } catch {
        if (!recoveryScheduled) recover();
        fail();
      }
    },
    async logout(sessionId, signal) {
      if (!token.test(sessionId)) fail();
      const sessionHash = await secureAsync(() => deps.crypto.hashIdentifier(sessionId));
      active(signal);
      if (!hash.test(sessionHash)) fail();
      await revoke(sessionHash, signal);
    },
    async claimCleanup(limit, callerSignal) {
      // Keep one invocation within a small, predictable provider request budget.
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 3) fail();
      active(callerSignal);
      const invocation = new AbortController();
      const signal = invocation.signal;
      let rejectDeadline!: (reason: PersistentSessionAuthorityError) => void;
      const abortInvocation = () => {
        invocation.abort();
        rejectDeadline(new PersistentSessionAuthorityError());
      };
      let timer!: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_resolve, reject) => {
        rejectDeadline = reject;
        timer = setTimeout(abortInvocation, 25000);
      });
      callerSignal.addEventListener('abort', abortInvocation, { once: true });
      const run = async () => {
        const rows = await call('bff_session_claim_cleanup', { p_limit: limit }, signal);
        if (!Array.isArray(rows) || rows.length > limit) fail();
        const claimed = new Set<string>();
        const parsedRows: z.infer<typeof cleanupRow>[] = [];
        for (const raw of rows) {
          const parsed = cleanupRow.safeParse(raw);
          if (!parsed.success) fail();
          if (claimed.has(parsed.data.p_session_hash)) fail();
          claimed.add(parsed.data.p_session_hash);
          parsedRows.push(parsed.data);
        }
        let completed = 0,
          failed = 0,
          timedOut = 0;
        for (const parsed of parsedRows) {
          active(signal);
          const controller = new AbortController();
          const abortRow = () => controller.abort();
          signal.addEventListener('abort', abortRow, { once: true });
          let timer!: ReturnType<typeof setTimeout>;
          let expired = false;
          const deadline = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              expired = true;
              controller.abort();
              reject(new PersistentSessionAuthorityError());
            }, 6000);
          });
          try {
            await Promise.race([
              cleanup(parsed.p_session_hash, parsed, controller.signal),
              deadline
            ]);
            completed++;
          } catch {
            failed++;
            if (expired) timedOut++;
          } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', abortRow);
          }
          active(signal);
        }
        return { claimed: parsedRows.length, completed, failed, timedOut };
      };
      try {
        return await Promise.race([run(), deadline]);
      } finally {
        clearTimeout(timer);
        invocation.abort();
        callerSignal.removeEventListener('abort', abortInvocation);
      }
    }
  };
}
