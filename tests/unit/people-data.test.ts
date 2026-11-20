import { describe, expect, it, vi } from 'vitest';
import {
  addHelper,
  createHelperAccount,
  expiryFrom,
  expiryText,
  listPeople,
  parsePerson,
  revokeHelper,
  setHelperExpiry,
  type PeopleClient
} from '@/lib/data/people';

const ID = 'b0950000-0000-4000-8000-000000000002';
const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  kind: 'profile',
  email: 'helper@example.test',
  name: 'Helper',
  role: 'helper',
  state: 'active',
  expires_at: null,
  ...over
});
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function fake(rpc: (name: string, args?: unknown) => unknown, invoke?: () => unknown) {
  return {
    rpc: vi.fn(async (name: string, args?: unknown) => rpc(name, args)),
    functions: { invoke: vi.fn(async () => invoke?.()) }
  } as unknown as PeopleClient;
}

describe('the people read (S3)', () => {
  it('parses a row and refuses one that is not what the database promises', () => {
    expect(parsePerson(row({ expires_at: 1_800_000_000_000 }))?.expiresAt).toBe(1_800_000_000_000);
    expect(parsePerson(row({ email: null }))?.email).toBeNull();
    for (const bad of [
      null,
      row({ id: 'nope' }),
      row({ kind: 'other' }),
      row({ role: 'admin' }),
      row({ state: 'gone' }),
      row({ expires_at: '2026-01-01' }),
      row({ name: 3 })
    ])
      expect(parsePerson(bad)).toBeNull();
  });

  it('lists people, and says why it could not', async () => {
    const ok = await listPeople(
      fake(() => ({ data: [row(), row({ id: ID.replace('2', '3') })], error: null }))
    );
    expect(ok).toMatchObject({ ok: true });
    expect(ok.ok && ok.people).toHaveLength(2);
    expect(await listPeople(fake(() => ({ data: null, error: { code: 'PGRST202' } })))).toEqual({
      ok: false,
      reason: 'unavailable'
    });
    expect(await listPeople(fake(() => ({ data: null, error: { code: '42501' } })))).toEqual({
      ok: false,
      reason: 'refused'
    });
    expect(
      await listPeople(fake(() => ({ data: null, error: { message: 'Failed to fetch' } })))
    ).toEqual({ ok: false, reason: 'offline' });
    expect(await listPeople(fake(() => ({ data: [row({ role: '?' })], error: null })))).toEqual({
      ok: false,
      reason: 'offline'
    });
    expect(
      await listPeople(
        fake(() => {
          throw new Error('down');
        })
      )
    ).toEqual({ ok: false, reason: 'offline' });
  });
});

describe('expiry as a number and a unit (S3)', () => {
  const now = Date.UTC(2026, 10, 20, 8, 0, 0);
  it('turns hours, days and weeks into a moment', () => {
    expect(expiryFrom('6', 'hours', now)).toBe(now + 6 * HOUR);
    expect(expiryFrom(3, 'days', now)).toBe(now + 3 * DAY);
    expect(expiryFrom(' 2 ', 'weeks', now)).toBe(now + 14 * DAY);
  });
  it('refuses a number that is not a whole 1 or more, or reaches past five years', () => {
    for (const bad of ['', '0', '-1', '1.5', 'abc', '1e3', '100000'])
      expect(expiryFrom(bad, 'days', now)).toBeNull();
    expect(expiryFrom('300', 'weeks', now)).toBeNull();
    expect(expiryFrom('260', 'weeks', now)).not.toBeNull();
  });
  it('says how long is left, in plain words', () => {
    expect(expiryText(null, now)).toBe('No expiry');
    expect(expiryText(now + 30 * 60_000, now)).toBe('Ends in 1 hour');
    expect(expiryText(now + 5 * HOUR, now)).toBe('Ends in 5 hours');
    expect(expiryText(now + 3 * DAY, now)).toBe('Ends in 3 days');
    expect(expiryText(now - 2 * HOUR, now)).toBe('Ended 2 hours ago');
    expect(expiryText(now - 5 * DAY, now)).toBe('Ended 5 days ago');
  });
});

describe('the owner commands (S3)', () => {
  it('adds a helper with an expiry as an ISO time, or none', async () => {
    const calls: unknown[] = [];
    const client = fake((name, args) => {
      calls.push([name, args]);
      return { data: { id: ID, kind: 'invite' }, error: null };
    });
    expect(await addHelper(client, 'a@example.test', Date.UTC(2026, 10, 25))).toEqual({
      ok: true,
      id: ID,
      kind: 'invite'
    });
    expect(calls[0]).toEqual([
      'add_helper',
      { p_email: 'a@example.test', p_expires_at: '2026-11-25T00:00:00.000Z' }
    ]);
    await addHelper(client, 'a@example.test', null);
    expect(calls[1]).toEqual(['add_helper', { p_email: 'a@example.test', p_expires_at: null }]);
  });
  it('tells a bad email, a taken one and a missing migration apart', async () => {
    const as = (error: object) =>
      addHelper(
        fake(() => ({ data: null, error })),
        'a@example.test',
        null
      );
    expect(await as({ code: '22023' })).toEqual({ ok: false, reason: 'bad-email' });
    expect(await as({ code: '23505' })).toEqual({ ok: false, reason: 'taken' });
    expect(await as({ code: 'PGRST202' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(await as({ code: '42501' })).toEqual({ ok: false, reason: 'refused' });
    expect(await as({ message: 'Failed to fetch' })).toEqual({ ok: false, reason: 'offline' });
    expect(
      await addHelper(
        fake(() => ({ data: { id: 'x' }, error: null })),
        'a@example.test',
        null
      )
    ).toEqual({ ok: false, reason: 'offline' });
  });
  it('changes an expiry and removes a helper, saying what happened', async () => {
    const seen: unknown[] = [];
    const ok = fake((name, args) => (seen.push([name, args]), { data: null, error: null }));
    expect(await setHelperExpiry(ok, ID, null)).toBe('saved');
    expect(await revokeHelper(ok, ID)).toBe('saved');
    expect(seen).toEqual([
      ['set_helper_expiry', { p_id: ID, p_expires_at: null }],
      ['revoke_helper', { p_id: ID }]
    ]);
    expect(
      await revokeHelper(
        fake(() => ({ error: { code: '42501' } })),
        ID
      )
    ).toBe('refused');
    expect(
      await revokeHelper(
        fake(() => ({ error: { code: 'PGRST202' } })),
        ID
      )
    ).toBe('unavailable');
    expect(
      await revokeHelper(
        fake(() => {
          throw new Error('down');
        }),
        ID
      )
    ).toBe('offline');
  });
});

describe('the account function (S3)', () => {
  const http = (status: number, body: unknown) => ({
    data: null,
    error: { context: new Response(JSON.stringify(body), { status }) }
  });
  it('returns the temporary password it was given, once', async () => {
    const out = await createHelperAccount(
      fake(
        () => null,
        () => ({
          data: { email: 'a@example.test', temporaryPassword: 'abcdefghjkmnpq' },
          error: null
        })
      ),
      ID
    );
    expect(out).toEqual({ ok: true, email: 'a@example.test', temporaryPassword: 'abcdefghjkmnpq' });
  });
  it('says plainly when the function is not deployed (the gateway answers 404 with its own code)', async () => {
    expect(
      await createHelperAccount(
        fake(
          () => null,
          () => http(404, { code: 'NOT_FOUND', message: 'Requested function was not found' })
        ),
        ID
      )
    ).toEqual({ ok: false, reason: 'not-deployed' });
  });
  it('tells an existing sign-in, a vanished invite and a refused caller apart', async () => {
    expect(
      await createHelperAccount(
        fake(
          () => null,
          () => http(409, { error: 'already_exists' })
        ),
        ID
      )
    ).toEqual({ ok: false, reason: 'exists' });
    expect(
      await createHelperAccount(
        fake(
          () => null,
          () => http(422, { error: 'invite_not_found' })
        ),
        ID
      )
    ).toEqual({ ok: false, reason: 'gone' });
    expect(
      await createHelperAccount(
        fake(
          () => null,
          () => http(403, { error: 'owner_only' })
        ),
        ID
      )
    ).toEqual({ ok: false, reason: 'refused' });
    expect(
      await createHelperAccount(
        fake(
          () => null,
          () => http(500, { error: 'create_failed' })
        ),
        ID
      )
    ).toEqual({ ok: false, reason: 'offline' });
    expect(
      await createHelperAccount(
        fake(
          () => null,
          () => ({ data: { email: 'a@example.test' }, error: null })
        ),
        ID
      )
    ).toEqual({ ok: false, reason: 'offline' });
  });
});
