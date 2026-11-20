import { describe, expect, it, vi } from 'vitest';
import {
  PASSWORD_LENGTH,
  handleRequest,
  temporaryPassword,
  type Deps
} from '../../supabase/functions/create-helper-account/logic';

const INVITE = 'b0950000-0000-4000-8000-0000000000a1';
const OWNER = 'b0950000-0000-4000-8000-000000000001';
const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function deps(over: Partial<Deps> = {}) {
  const calls: string[] = [];
  const base: Deps = {
    random: bytes,
    userForToken: vi.fn(async (token: string) => (token === 'good' ? { id: OWNER } : null)),
    isActiveOwner: vi.fn(async () => true),
    loadInvite: vi.fn(async () => ({
      id: INVITE,
      email: 'new.helper@example.test',
      expiresAt: '2026-11-25T00:00:00.000Z'
    })),
    createUser: vi.fn(
      async () => (calls.push('createUser'), { id: 'b0950000-0000-4000-8000-0000000000ff' })
    ),
    insertProfile: vi.fn(async () => (calls.push('insertProfile'), true)),
    deleteUser: vi.fn(async () => void calls.push('deleteUser')),
    deleteInvite: vi.fn(async () => void calls.push('deleteInvite')),
    audit: vi.fn(async () => void calls.push('audit'))
  };
  return { deps: { ...base, ...over }, calls };
}
const post = (body: unknown, token: string | null = 'good', method = 'POST') =>
  new Request('https://f.example/create-helper-account', {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
  });

describe('create-helper-account (S3)', () => {
  it('answers the browser preflight and refuses other methods', async () => {
    const { deps: d } = deps();
    const preflight = await handleRequest(post(null, null, 'OPTIONS'), d);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect((await handleRequest(post(null, 'good', 'GET'), d)).status).toBe(405);
  });

  it('wants a valid sign-in that belongs to the active owner, before it reads anything', async () => {
    const a = deps();
    expect((await handleRequest(post({ inviteId: INVITE }, null), a.deps)).status).toBe(401);
    expect((await handleRequest(post({ inviteId: INVITE }, 'bad'), a.deps)).status).toBe(401);
    const b = deps({ isActiveOwner: vi.fn(async () => false) });
    expect((await handleRequest(post({ inviteId: INVITE }), b.deps)).status).toBe(403);
    for (const x of [a, b]) {
      expect(x.deps.loadInvite).not.toHaveBeenCalled();
      expect(x.deps.createUser).not.toHaveBeenCalled();
    }
  });

  it('refuses a request that is not an invite id, and an invite that is not there', async () => {
    const { deps: d } = deps();
    expect((await handleRequest(post('not json'), d)).status).toBe(400);
    expect((await handleRequest(post({ inviteId: 'x' }), d)).status).toBe(400);
    expect((await handleRequest(post({ email: 'a@example.test' }), d)).status).toBe(400);
    const gone = deps({ loadInvite: vi.fn(async () => null) });
    const res = await handleRequest(post({ inviteId: INVITE }), gone.deps);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'invite_not_found' });
    expect(gone.deps.createUser).not.toHaveBeenCalled();
  });

  it('creates the account for the registered email with the registered expiry, in order, and returns the password once', async () => {
    const { deps: d, calls } = deps();
    const res = await handleRequest(
      post({ inviteId: INVITE, email: 'other@example.test', expiresAt: null }),
      d
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as {
      email: string;
      temporaryPassword: string;
      expiresAt: string;
    };
    // What the request says about the email or the expiry is ignored: both come from the invite.
    expect(body.email).toBe('new.helper@example.test');
    expect(body.expiresAt).toBe('2026-11-25T00:00:00.000Z');
    expect(body.temporaryPassword).toHaveLength(PASSWORD_LENGTH);
    expect(body.temporaryPassword).toMatch(/^[a-zA-Z2-9]+$/);
    expect(body.temporaryPassword).not.toMatch(/[0OIl1]/);
    expect(d.createUser).toHaveBeenCalledWith({
      email: 'new.helper@example.test',
      password: body.temporaryPassword
    });
    expect(d.insertProfile).toHaveBeenCalledWith({
      id: 'b0950000-0000-4000-8000-0000000000ff',
      name: 'new.helper',
      expiresAt: '2026-11-25T00:00:00.000Z'
    });
    expect(calls).toEqual(['createUser', 'insertProfile', 'deleteInvite', 'audit']);
    // The audit row says who and when, never the password.
    expect(JSON.stringify(vi.mocked(d.audit).mock.calls)).not.toContain(body.temporaryPassword);
  });

  it('never writes the password anywhere it logs', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined)
    );
    const { deps: d } = deps();
    const body = (await (await handleRequest(post({ inviteId: INVITE }), d)).json()) as {
      temporaryPassword: string;
    };
    for (const spy of spies)
      expect(JSON.stringify(spy.mock.calls)).not.toContain(body.temporaryPassword);
    spies.forEach((s) => s.mockRestore());
  });

  it('an email that already has a sign-in creates nothing and changes no profile', async () => {
    const { deps: d, calls } = deps({
      createUser: vi.fn(async () => ({ error: 'exists' as const }))
    });
    const res = await handleRequest(post({ inviteId: INVITE }), d);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_exists' });
    expect(calls).toEqual([]);
    expect(d.insertProfile).not.toHaveBeenCalled();
  });

  it('a profile that cannot be linked takes the new sign-in back out, and keeps the invite', async () => {
    const { deps: d, calls } = deps({ insertProfile: vi.fn(async () => false) });
    const res = await handleRequest(post({ inviteId: INVITE }), d);
    expect(res.status).toBe(500);
    expect(calls).toEqual(['createUser', 'deleteUser']);
    expect(d.deleteInvite).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).not.toMatch(/password/i);
  });

  it('draws every password from the unambiguous alphabet without bias toward the low end', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) for (const ch of temporaryPassword(bytes)) seen.add(ch);
    expect(seen.size).toBe(54);
    // A byte stream of all 255s (above the rejection limit) must still end, because the next bytes are accepted.
    let first = true;
    const stubborn = (n: number) =>
      first ? ((first = false), new Uint8Array(n).fill(255)) : new Uint8Array(n).fill(7);
    expect(temporaryPassword(stubborn)).toHaveLength(PASSWORD_LENGTH);
  });
});
