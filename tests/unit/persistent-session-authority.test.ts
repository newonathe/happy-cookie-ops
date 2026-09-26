// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPersistentSessionAuthority,
  PersistentSessionAuthorityError,
  type PersistentSessionAuthorityDependencies
} from '@/lib/auth/persistent-session-authority';
import { AuthLogoutAccessTokenRejectedError } from '@/lib/auth/supabase-auth-transport';

const USER = '00000000-0000-4000-8000-000000000001';
const PROVIDER = '00000000-0000-4000-8000-000000000002';
const SESSION_ID = 'a'.repeat(43);
const CSRF = 'b'.repeat(43);
const HASH = 'c'.repeat(64);
const ENVELOPE = 'sealed';
const READ_ROW = { p_user_id: USER, p_role: 'owner', p_csrf_token: CSRF, p_expires_at: 2000 };
const ACQUIRE_ROW = {
  p_user_id: USER, p_provider_session_id: PROVIDER, p_credential_envelope: ENVELOPE,
  p_credentials_version: 0, p_next_credentials_version: 1, p_refresh_fence: 1,
  p_lease_until: '2026-01-01T00:00:30Z'
};
const REVOKE_ROW = {
  p_user_id: USER, p_provider_session_id: PROVIDER, p_credential_envelope: ENVELOPE,
  p_credentials_version: 0, p_refresh_fence: 2
};
const RULES = {
  session: { key: 'session', limit: 1, windowSeconds: 60 },
  login: { key: 'login', limit: 1, windowSeconds: 60 },
  refresh: { key: 'refresh', limit: 1, windowSeconds: 60 },
  logout: { key: 'logout', limit: 1, windowSeconds: 60 }
} as const;
const signal = () => new AbortController().signal;

function defaultRpc(name: string): { data: unknown; error: unknown | null } {
  if (name === 'consume_rate_limit') return { data: [{ allowed: true, remaining: 0, reset_at: '2026-01-01T00:00:00Z' }], error: null };
  if (name === 'bff_session_create') return { data: [{ p_role: 'owner', p_csrf_token_out: CSRF, p_expires_at: 2000 }], error: null };
  if (name === 'bff_session_read') return { data: [READ_ROW], error: null };
  if (name === 'bff_session_acquire_refresh') return { data: [ACQUIRE_ROW], error: null };
  if (name === 'bff_session_finalize_refresh') return { data: [{ p_role: 'owner', p_csrf_token: CSRF, p_expires_at: 2000 }], error: null };
  if (name === 'bff_session_begin_revoke') return { data: [REVOKE_ROW], error: null };
  if (name === 'bff_session_complete_cleanup') return { data: [{ p_completed_at: '2026-01-01T00:00:01Z' }], error: null };
  if (name === 'bff_session_save_cleanup_rotation') return { data: [{ p_saved_credentials_version: 1 }], error: null };
  return { data: [], error: null };
}

function setup() {
  const rpc = vi.fn(async (...request: [name: string, args?: unknown]) => defaultRpc(request[0]));
  const auth = {
    login: vi.fn(async () => ({ accessToken: 'LOGIN_ACCESS', refreshToken: 'LOGIN_REFRESH', expiresIn: 60, userId: USER })),
    refresh: vi.fn(async () => ({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH', expiresIn: 60, userId: USER })),
    verifyBinding: vi.fn(async () => ({ userId: USER, providerSessionId: PROVIDER })),
    logout: vi.fn(async (accessToken: string, abortSignal: AbortSignal) => { void accessToken; void abortSignal; })
  };
  const crypto = {
    newIdentifier: vi.fn().mockReturnValueOnce(SESSION_ID).mockReturnValueOnce(CSRF),
    hashIdentifier: vi.fn(async () => HASH),
    seal: vi.fn(async () => ENVELOPE),
    open: vi.fn(async () => ({ accessToken: 'DURABLE_ACCESS', refreshToken: 'DURABLE_REFRESH' }))
  };
  const recoveryTasks: Promise<void>[] = [];
  const deferRecovery = vi.fn((task: Promise<void>) => { recoveryTasks.push(task); });
  const deps = {
    rpc: rpc as unknown as PersistentSessionAuthorityDependencies['rpc'], auth,
    crypto: crypto as unknown as PersistentSessionAuthorityDependencies['crypto'],
    trustedCallerId: vi.fn(() => 'edge:fixture'), rateRules: RULES, deferRecovery
  };
  return { ...deps, rpc, auth, crypto, recoveryTasks, authority: createPersistentSessionAuthority(deps) };
}

async function drain(context: ReturnType<typeof setup>): Promise<void> {
  await Promise.all([...context.recoveryTasks]);
}

async function rejectsStatic(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    name: 'PersistentSessionAuthorityError', code: 'session_dependency_unavailable',
    message: 'session_dependency_unavailable'
  });
}

afterEach(() => { vi.useRealTimers(); });

describe('persistent SessionAuthority adapter', () => {
  it('creates opaque state only after verified provider binding', async () => {
    const context = setup();
    const result = await context.authority.login({ email: 'staff@example.test', password: 'PASSWORD_CANARY' }, signal());
    expect(result).toEqual({ sessionId: SESSION_ID, csrfToken: CSRF, expiresAt: 2000,
      profile: { id: USER, role: 'owner', active: true } });
    expect(JSON.stringify(result)).not.toMatch(/CANARY|ACCESS|REFRESH/);
    expect(context.crypto.seal).toHaveBeenCalledWith(
      { accessToken: 'LOGIN_ACCESS', refreshToken: 'LOGIN_REFRESH' },
      { sessionHash: HASH, userId: USER, version: 0 });
  });

  it('returns null for password denial without recovery', async () => {
    const context = setup(); context.auth.login.mockResolvedValueOnce(null as never);
    await expect(context.authority.login({ email: 'a@b.co', password: 'x' }, signal())).resolves.toBeNull();
    expect(context.deferRecovery).not.toHaveBeenCalled();
  });

  it('schedules and awaits cleanup for binding denial', async () => {
    const context = setup(); context.auth.verifyBinding.mockResolvedValueOnce(null as never);
    await expect(context.authority.login({ email: 'a@b.co', password: 'x' }, signal())).resolves.toBeNull();
    expect(context.recoveryTasks).toHaveLength(1); await drain(context);
    expect(context.auth.logout).toHaveBeenCalledWith('LOGIN_ACCESS', expect.any(AbortSignal));
  });

  it('recovers an abort immediately after provider login returns tokens', async () => {
    const context = setup(); const controller = new AbortController();
    context.auth.login.mockImplementationOnce(async () => {
      controller.abort();
      return { accessToken: 'LOGIN_ACCESS', refreshToken: 'LOGIN_REFRESH', expiresIn: 60, userId: USER };
    });
    await rejectsStatic(context.authority.login({ email: 'a@b.co', password: 'x' }, controller.signal));
    await drain(context);
    expect(context.auth.logout).toHaveBeenCalledWith('LOGIN_ACCESS', expect.objectContaining({ aborted: false }));
  });

  it('reconciles an ambiguous create using the current durable envelope', async () => {
    const context = setup();
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_create'
      ? { data: null, error: { opaque: 'CREATE_CANARY' } } : defaultRpc(name));
    await rejectsStatic(context.authority.login({ email: 'a@b.co', password: 'x' }, signal())); await drain(context);
    const names = context.rpc.mock.calls.map(call => call[0]);
    expect(names).toContain('bff_session_begin_revoke'); expect(names).toContain('bff_session_complete_cleanup');
    expect(context.auth.logout).toHaveBeenCalledWith('LOGIN_ACCESS', expect.any(AbortSignal));
    expect(context.auth.logout).toHaveBeenCalledWith('DURABLE_ACCESS', expect.any(AbortSignal));
  });

  it('still revokes the issued token when durable recovery cannot start', async () => {
    const context = setup(); context.crypto.seal.mockRejectedValueOnce(new Error('SEAL_CANARY'));
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_begin_revoke'
      ? { data: null, error: { opaque: 'DB_CANARY' } } : defaultRpc(name));
    await rejectsStatic(context.authority.login({ email: 'a@b.co', password: 'x' }, signal())); await drain(context);
    expect(context.auth.logout).toHaveBeenCalledWith('LOGIN_ACCESS', expect.any(AbortSignal));
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it('maps scheduler and dependency canaries to one static error', async () => {
    const context = setup();
    context.deferRecovery.mockImplementationOnce(() => { throw new Error('SCHEDULER_CANARY'); });
    context.auth.verifyBinding.mockRejectedValueOnce(new Error('BINDING_CANARY'));
    try { await context.authority.login({ email: 'a@b.co', password: 'PASSWORD_CANARY' }, signal()); }
    catch (error) {
      expect(error).toBeInstanceOf(PersistentSessionAuthorityError);
      expect(String(error)).not.toContain('CANARY'); return;
    }
    throw new Error('expected rejection');
  });

  it('fails rate checks closed and ignores spoofed forwarded headers', async () => {
    const context = setup(); context.rpc.mockResolvedValueOnce({ data: null, error: { secret: 'NOPE' } });
    await rejectsStatic(context.authority.limit(
      new Request('https://x', { headers: { 'x-forwarded-for': 'spoof' } }), 'login', signal()));
    expect(context.trustedCallerId).toHaveBeenCalled();
  });

  it('handles explicit rate denial and rejects invalid caller and timestamp', async () => {
    const denied = setup(); denied.rpc.mockResolvedValueOnce({ data: [{ allowed: false, remaining: 0,
      reset_at: '2026-01-01T00:00:00Z' }], error: null });
    await expect(denied.authority.limit(new Request('https://x'), 'login', signal())).resolves.toBe(false);
    const caller = setup(); caller.trustedCallerId.mockReturnValueOnce('bad caller');
    await rejectsStatic(caller.authority.limit(new Request('https://x'), 'login', signal()));
    const timestamp = setup(); timestamp.rpc.mockResolvedValueOnce({ data: [{ allowed: true, remaining: 0,
      reset_at: 'not-a-date' }], error: null });
    await rejectsStatic(timestamp.authority.limit(new Request('https://x'), 'login', signal()));
  });

  it('reads a hashed opaque ID without provider traffic', async () => {
    const context = setup();
    await expect(context.authority.read(SESSION_ID, signal())).resolves.toMatchObject({
      sessionId: SESSION_ID, profile: { id: USER } });
    expect(context.auth.refresh).not.toHaveBeenCalled();
    expect(context.crypto.hashIdentifier).toHaveBeenCalledWith(SESSION_ID);
  });

  it('disambiguates an empty refresh lease with durable read state', async () => {
    const live = setup(); live.rpc.mockImplementation(async (name: string) =>
      name === 'bff_session_acquire_refresh' ? { data: [], error: null } : defaultRpc(name));
    await rejectsStatic(live.authority.refresh(SESSION_ID, signal()));
    const absent = setup(); absent.rpc.mockResolvedValue({ data: [], error: null });
    await expect(absent.authority.refresh(SESSION_ID, signal())).resolves.toBeNull();
  });

  it('refreshes exact binding and preserves browser identity', async () => {
    const context = setup();
    await expect(context.authority.refresh(SESSION_ID, signal())).resolves.toEqual({
      sessionId: SESSION_ID, csrfToken: CSRF, expiresAt: 2000,
      profile: { id: USER, role: 'owner', active: true } });
    expect(context.crypto.seal).toHaveBeenCalledWith(
      { accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' },
      { sessionHash: HASH, userId: USER, version: 1 });
    expect(context.deferRecovery).not.toHaveBeenCalled();
  });

  it('rejects a nonsequential credential version before provider refresh', async () => {
    const context = setup(); context.rpc.mockImplementation(async (name: string) =>
      name === 'bff_session_acquire_refresh' ? { data: [{ ...ACQUIRE_ROW,
        p_credentials_version: 1, p_next_credentials_version: 1 }], error: null } : defaultRpc(name));
    await rejectsStatic(context.authority.refresh(SESSION_ID, signal()));
    expect(context.auth.refresh).not.toHaveBeenCalled();
  });

  it('schedules durable cleanup when provider refresh denies', async () => {
    const context = setup(); context.auth.refresh.mockResolvedValueOnce(null as never);
    await expect(context.authority.refresh(SESSION_ID, signal())).resolves.toBeNull(); await drain(context);
    const names = context.rpc.mock.calls.map(call => call[0]);
    expect(names).toContain('bff_session_begin_revoke'); expect(names).toContain('bff_session_complete_cleanup');
  });

  it('schedules durable cleanup when refresh transport rejects after a possible rotation', async () => {
    const context = setup(); context.auth.refresh.mockRejectedValueOnce(new Error('LATE_ABORT_CANARY'));
    await rejectsStatic(context.authority.refresh(SESSION_ID, signal())); await drain(context);
    const names = context.rpc.mock.calls.map(call => call[0]);
    expect(names).toContain('bff_session_begin_revoke'); expect(names).toContain('bff_session_complete_cleanup');
    expect(context.auth.logout).toHaveBeenCalledWith('DURABLE_ACCESS', expect.any(AbortSignal));
  });

  it('recovers an abort or seal failure after refresh token issuance', async () => {
    for (const mode of ['abort', 'seal'] as const) {
      const context = setup(); const controller = new AbortController();
      if (mode === 'abort') context.auth.refresh.mockImplementationOnce(async () => {
        controller.abort();
        return { accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH', expiresIn: 60, userId: USER };
      });
      else context.crypto.seal.mockRejectedValueOnce(new Error('SEAL_CANARY'));
      await rejectsStatic(context.authority.refresh(SESSION_ID, controller.signal)); await drain(context);
      expect(context.auth.logout).toHaveBeenCalledWith('NEW_ACCESS', expect.any(AbortSignal));
      expect(context.auth.logout).toHaveBeenCalledWith('DURABLE_ACCESS', expect.any(AbortSignal));
    }
  });

  it.each([
    ['errored', { data: null, error: { opaque: 'CANARY' } }],
    ['empty', { data: [], error: null }],
    ['multiple', { data: [{ p_role: 'owner' }, { p_role: 'owner' }], error: null }],
    ['malformed', { data: [{ p_role: 'owner' }], error: null }]
  ])('recovers a %s finalize response', async (_name, result) => {
    const context = setup(); context.rpc.mockImplementation(async (name: string) =>
      name === 'bff_session_finalize_refresh' ? result : defaultRpc(name));
    await rejectsStatic(context.authority.refresh(SESSION_ID, signal())); await drain(context);
    const names = context.rpc.mock.calls.map(call => call[0]);
    expect(names).toContain('bff_session_begin_revoke'); expect(names).toContain('bff_session_complete_cleanup');
  });

  it('recovers when post-finalize consistency read is absent', async () => {
    const context = setup(); context.rpc.mockImplementation(async (name: string) =>
      name === 'bff_session_read' ? { data: [], error: null } : defaultRpc(name));
    await rejectsStatic(context.authority.refresh(SESSION_ID, signal())); await drain(context);
    expect(context.auth.logout).toHaveBeenCalledWith('NEW_ACCESS', expect.any(AbortSignal));
    expect(context.rpc.mock.calls.map(call => call[0])).toContain('bff_session_complete_cleanup');
  });

  it('attempts issued logout when begin revoke or envelope open fails', async () => {
    const begin = setup(); begin.auth.verifyBinding.mockResolvedValueOnce({ userId: PROVIDER, providerSessionId: PROVIDER });
    begin.rpc.mockImplementation(async (name: string) => name === 'bff_session_begin_revoke'
      ? { data: null, error: { opaque: 'DB_CANARY' } } : defaultRpc(name));
    await rejectsStatic(begin.authority.refresh(SESSION_ID, signal())); await drain(begin);
    expect(begin.auth.logout).toHaveBeenCalledWith('NEW_ACCESS', expect.any(AbortSignal));
    const opened = setup(); opened.auth.verifyBinding.mockResolvedValueOnce({ userId: PROVIDER, providerSessionId: PROVIDER });
    opened.crypto.open.mockResolvedValueOnce({ accessToken: 'DURABLE_ACCESS', refreshToken: 'DURABLE_REFRESH' })
      .mockRejectedValueOnce(new Error('ENVELOPE_CANARY'));
    await rejectsStatic(opened.authority.refresh(SESSION_ID, signal())); await drain(opened);
    expect(opened.auth.logout).toHaveBeenCalledWith('NEW_ACCESS', expect.any(AbortSignal));
    expect(opened.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it('attempts both logouts and completes only when both succeed', async () => {
    for (const failedToken of ['NEW_ACCESS', 'DURABLE_ACCESS']) {
      const context = setup(); context.auth.verifyBinding.mockResolvedValueOnce({ userId: PROVIDER, providerSessionId: PROVIDER });
      context.auth.logout.mockImplementation(async value => { if (value === failedToken) throw new Error('LOGOUT_CANARY'); });
      await rejectsStatic(context.authority.refresh(SESSION_ID, signal())); await drain(context);
      expect(context.auth.logout).toHaveBeenCalledWith('NEW_ACCESS', expect.any(AbortSignal));
      expect(context.auth.logout).toHaveBeenCalledWith('DURABLE_ACCESS', expect.any(AbortSignal));
      expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
    }
  });

  it('bounds deferred recovery with an independent abort signal', async () => {
    vi.useFakeTimers(); const context = setup(); context.auth.verifyBinding.mockResolvedValueOnce(null as never);
    context.auth.logout.mockImplementation(async (_token, recoverySignal) => {
      if (recoverySignal.aborted) throw new Error('aborted');
      await new Promise<void>((_resolve, reject) =>
        recoverySignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    await expect(context.authority.login({ email: 'a@b.co', password: 'x' }, signal())).resolves.toBeNull();
    const settled = drain(context); await vi.advanceTimersByTimeAsync(3000); await settled;
    expect(context.auth.logout.mock.calls[0]?.[1].aborted).toBe(true);
  });

  it('revokes before logout and leaves cleanup pending on provider failure', async () => {
    const context = setup(); context.auth.logout.mockRejectedValueOnce(new Error('TOKEN_CANARY'));
    await rejectsStatic(context.authority.logout(SESSION_ID, signal()));
    const names = context.rpc.mock.calls.map(call => call[0]);
    expect(names).toContain('bff_session_begin_revoke'); expect(names).not.toContain('bff_session_complete_cleanup');
  });

  it('recovers a rejected stored access token by binding, fencing and saving one rotation before logout', async () => {
    const context = setup();
    context.auth.logout.mockRejectedValueOnce(new AuthLogoutAccessTokenRejectedError());
    await expect(context.authority.logout(SESSION_ID, signal())).resolves.toBeUndefined();
    expect(context.auth.refresh).toHaveBeenCalledWith('DURABLE_REFRESH', expect.any(AbortSignal));
    expect(context.auth.verifyBinding).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'NEW_ACCESS' }), expect.any(AbortSignal));
    expect(context.crypto.seal).toHaveBeenCalledWith(
      { accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' },
      { sessionHash: HASH, userId: USER, version: 1 });
    const saveCall = context.rpc.mock.calls.find(call => call[0] === 'bff_session_save_cleanup_rotation');
    expect(saveCall?.[1]).toMatchObject({ p_session_hash: HASH, p_refresh_fence: 2,
      p_user_id: USER, p_provider_session_id: PROVIDER, p_credentials_version: 0,
      p_next_credentials_version: 1, p_credential_envelope: ENVELOPE });
    expect(context.auth.logout.mock.calls.map(call => call[0])).toEqual(['DURABLE_ACCESS', 'NEW_ACCESS']);
    expect(context.rpc.mock.calls.map(call => call[0]).indexOf('bff_session_save_cleanup_rotation'))
      .toBeLessThan(context.rpc.mock.calls.map(call => call[0]).indexOf('bff_session_complete_cleanup'));
  });

  it('keeps cleanup pending when a rotated credential cannot be durably saved', async () => {
    const context = setup();
    context.auth.logout.mockRejectedValueOnce(new AuthLogoutAccessTokenRejectedError());
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_save_cleanup_rotation'
      ? { data: [], error: null } : defaultRpc(name));
    await rejectsStatic(context.authority.logout(SESSION_ID, signal()));
    expect(context.auth.logout.mock.calls.map(call => call[0])).toEqual(['DURABLE_ACCESS']);
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it.each([false, true])('uses exact Auth-row absence, not refresh denial, to finish cleanup (absent=%s)', async absent => {
    const context = setup();
    context.auth.logout.mockRejectedValueOnce(new AuthLogoutAccessTokenRejectedError());
    context.auth.refresh.mockResolvedValueOnce(null as never);
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_complete_if_provider_absent'
      ? { data: absent ? [{ p_completed_at: '2026-01-01T00:00:01Z' }] : [], error: null }
      : defaultRpc(name));
    if (absent) await expect(context.authority.logout(SESSION_ID, signal())).resolves.toBeUndefined();
    else await rejectsStatic(context.authority.logout(SESSION_ID, signal()));
    expect(context.rpc.mock.calls.find(call => call[0] === 'bff_session_complete_if_provider_absent')?.[1])
      .toMatchObject({ p_session_hash: HASH, p_refresh_fence: 2, p_user_id: USER,
        p_provider_session_id: PROVIDER });
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it('resolves ambiguous logout only when the exact provider session is absent', async () => {
    const context = setup(); context.auth.logout.mockRejectedValueOnce(new Error('NETWORK_CANARY'));
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_complete_if_provider_absent'
      ? { data: [{ p_completed_at: '2026-01-01T00:00:01Z' }], error: null } : defaultRpc(name));
    await expect(context.authority.logout(SESSION_ID, signal())).resolves.toBeUndefined();
    expect(context.auth.refresh).not.toHaveBeenCalled();
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it('retains pending credentials when the first provider logout times out with its row still present', async () => {
    const context = setup();
    context.auth.logout.mockRejectedValueOnce(new Error('TIMEOUT_BEFORE_ROTATION'));
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_complete_if_provider_absent'
      ? { data: [], error: null } : defaultRpc(name));
    await rejectsStatic(context.authority.logout(SESSION_ID, signal()));
    expect(context.auth.refresh).not.toHaveBeenCalled();
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it('retains the saved rotation when a later provider logout times out and its Auth row remains', async () => {
    const context = setup();
    context.auth.logout.mockRejectedValueOnce(new AuthLogoutAccessTokenRejectedError())
      .mockRejectedValueOnce(new Error('TIMEOUT_AFTER_ROTATION'));
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_complete_if_provider_absent'
      ? { data: [], error: null } : defaultRpc(name));
    await rejectsStatic(context.authority.logout(SESSION_ID, signal()));
    expect(context.rpc.mock.calls.map(call => call[0])).toContain('bff_session_save_cleanup_rotation');
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it('rejects a rotated token bound to another provider session before saving or logout', async () => {
    const context = setup();
    context.auth.logout.mockRejectedValueOnce(new AuthLogoutAccessTokenRejectedError());
    context.auth.verifyBinding.mockResolvedValueOnce({ userId: USER, providerSessionId: USER });
    await rejectsStatic(context.authority.logout(SESSION_ID, signal()));
    expect(context.rpc.mock.calls.map(call => call[0])).toContain('bff_session_complete_if_provider_absent');
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_save_cleanup_rotation');
    expect(context.auth.logout.mock.calls.map(call => call[0])).toEqual(['DURABLE_ACCESS']);
  });

  it('can finish a lost post-rotation logout response only after the exact Auth row disappears', async () => {
    const context = setup();
    context.auth.logout.mockRejectedValueOnce(new AuthLogoutAccessTokenRejectedError())
      .mockRejectedValueOnce(new Error('LOST_RESPONSE_CANARY'));
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_complete_if_provider_absent'
      ? { data: [{ p_completed_at: '2026-01-01T00:00:01Z' }], error: null } : defaultRpc(name));
    await expect(context.authority.logout(SESSION_ID, signal())).resolves.toBeUndefined();
    expect(context.rpc.mock.calls.map(call => call[0])).toContain('bff_session_save_cleanup_rotation');
    expect(context.rpc.mock.calls.map(call => call[0])).not.toContain('bff_session_complete_cleanup');
  });

  it('validates an entire cleanup claim batch before provider work', async () => {
    const context = setup(); const row = { p_session_hash: HASH, ...REVOKE_ROW };
    context.rpc.mockResolvedValueOnce({ data: [row, row], error: null });
    await rejectsStatic(context.authority.claimCleanup(2, signal()));
    expect(context.auth.logout).not.toHaveBeenCalled();
  });

  it('continues to a later claimed row after one provider failure and returns aggregate counts', async () => {
    const context = setup();
    const rows = [{ p_session_hash: HASH, ...REVOKE_ROW },
      { p_session_hash: 'd'.repeat(64), ...REVOKE_ROW }];
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_claim_cleanup'
      ? { data: rows, error: null } : defaultRpc(name));
    context.auth.logout.mockRejectedValueOnce(new Error('FIRST_ROW_CANARY'));
    await expect(context.authority.claimCleanup(2, signal())).resolves.toEqual({
      claimed: 2, completed: 1, failed: 1, timedOut: 0
    });
    expect(context.auth.logout).toHaveBeenCalledTimes(2);
    expect(context.rpc.mock.calls.filter(call => call[0] === 'bff_session_complete_cleanup')).toHaveLength(1);
  });

  it('gives a hung claimed row its own deadline without aborting the next row', async () => {
    vi.useFakeTimers();
    const context = setup();
    const rows = [{ p_session_hash: HASH, ...REVOKE_ROW },
      { p_session_hash: 'd'.repeat(64), ...REVOKE_ROW }];
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_claim_cleanup'
      ? { data: rows, error: null } : defaultRpc(name));
    context.auth.logout.mockImplementationOnce(async (_token, rowSignal) => {
      await new Promise<void>((_resolve, reject) =>
        rowSignal.addEventListener('abort', () => reject(new Error('ROW_ABORTED')), { once: true }));
    });
    const result = context.authority.claimCleanup(2, signal());
    await vi.advanceTimersByTimeAsync(6000);
    await expect(result).resolves.toEqual({ claimed: 2, completed: 1, failed: 1, timedOut: 1 });
    expect(context.auth.logout.mock.calls[0]?.[1].aborted).toBe(true);
    expect(context.auth.logout.mock.calls[1]?.[1].aborted).toBe(false);
  });

  it('limits a scheduled batch to three claims before making any RPC', async () => {
    const context = setup();
    await rejectsStatic(context.authority.claimCleanup(4, signal()));
    expect(context.rpc).not.toHaveBeenCalled();
  });

  it('stops the whole invocation at its deadline before starting another claimed row', async () => {
    vi.useFakeTimers();
    const context = setup();
    const rows = [{ p_session_hash: HASH, ...REVOKE_ROW },
      { p_session_hash: 'd'.repeat(64), ...REVOKE_ROW }];
    context.rpc.mockImplementation(async (name: string) => name === 'bff_session_claim_cleanup'
      ? new Promise(resolve => setTimeout(() => resolve({ data: rows, error: null }), 20000))
      : defaultRpc(name));
    context.auth.logout.mockImplementationOnce(async (_token, rowSignal) => {
      await new Promise<void>((_resolve, reject) =>
        rowSignal.addEventListener('abort', () => reject(new Error('ROW_ABORTED')), { once: true }));
    });
    const result = context.authority.claimCleanup(2, signal());
    const rejection = expect(result).rejects.toBeInstanceOf(PersistentSessionAuthorityError);
    await vi.advanceTimersByTimeAsync(25000);
    await rejection;
    expect(context.auth.logout).toHaveBeenCalledTimes(1);
  });
});
