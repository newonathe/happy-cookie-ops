import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';

/**
 * The people Cine manages (S3, migration 20260101009500): who has an account, which helpers are waiting for one, and each helper's
 * expiry. Reads and commands are the owner's four RPCs; the account itself is made by the Edge Function `create-helper-account`.
 * Nothing here is used on a database without the migration: the panel says so plainly instead (`unavailable`).
 */
export type PeopleClient = Pick<SupabaseClient<Database>, 'rpc' | 'functions'>;

export type PersonState = 'active' | 'expired' | 'removed' | 'waiting';

export interface Person {
  id: string;
  kind: 'profile' | 'invite';
  email: string | null;
  name: string;
  role: 'owner' | 'helper' | 'support';
  state: PersonState;
  /** Milliseconds since 1970, or null for no expiry. */
  expiresAt: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLES = ['owner', 'helper', 'support'] as const;
const STATES: readonly PersonState[] = ['active', 'expired', 'removed', 'waiting'];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** One row of `list_people`, or null when it is not what the database promises. */
export function parsePerson(row: unknown): Person | null {
  if (!isObj(row)) return null;
  const { id, kind, email, name, role, state, expires_at } = row;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (kind !== 'profile' && kind !== 'invite') return null;
  if (typeof name !== 'string') return null;
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) return null;
  if (typeof state !== 'string' || !STATES.includes(state as PersonState)) return null;
  if (!(email === null || typeof email === 'string')) return null;
  if (!(expires_at === null || (typeof expires_at === 'number' && Number.isFinite(expires_at))))
    return null;
  return {
    id,
    kind,
    email,
    name,
    role: role as Person['role'],
    state: state as PersonState,
    expiresAt: expires_at
  };
}

export type ListOutcome =
  { ok: true; people: Person[] } | { ok: false; reason: 'unavailable' | 'refused' | 'offline' };

/** PostgREST answers a function the database does not have with PGRST202 (or 404). */
function failure(error: {
  code?: string;
  message?: string;
}): 'unavailable' | 'refused' | 'offline' {
  if (error.code === 'PGRST202' || error.code === '42883') return 'unavailable';
  if (error.code === '42501') return 'refused';
  return 'offline';
}

export async function listPeople(client: PeopleClient): Promise<ListOutcome> {
  try {
    const { data, error } = await client.rpc('list_people');
    if (error) return { ok: false, reason: failure(error) };
    if (!Array.isArray(data)) return { ok: false, reason: 'offline' };
    const people: Person[] = [];
    for (const row of data) {
      const person = parsePerson(row);
      if (!person) return { ok: false, reason: 'offline' };
      people.push(person);
    }
    return { ok: true, people };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

// ------------------------------------------------------------------ expiry as a number and a unit

export type ExpiryUnit = 'hours' | 'days' | 'weeks';
export const EXPIRY_UNITS: readonly ExpiryUnit[] = ['hours', 'days', 'weeks'];

const UNIT_MS: Record<ExpiryUnit, number> = {
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 7 * 86_400_000
};

/** Five years, the most the database accepts. */
const MAX_MS = 5 * 365 * 86_400_000;

/**
 * "3 days" as a moment. Null when the amount is not a whole number of 1 or more, or reaches past five years. `permanent` is a
 * separate choice and never goes through here.
 */
export function expiryFrom(amount: string | number, unit: ExpiryUnit, now: number): number | null {
  const text = String(amount).trim();
  if (!/^[0-9]{1,5}$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  const at = now + n * UNIT_MS[unit];
  return at - now > MAX_MS ? null : at;
}

/** How a helper's expiry reads: "Never expires", "Ends in 2 days", "Ended 3 hours ago". */
export function expiryText(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return 'No expiry';
  const diff = expiresAt - now;
  const span = (ms: number) => {
    const hours = Math.max(1, Math.round(ms / UNIT_MS.hours));
    if (hours < 48) return hours === 1 ? '1 hour' : `${hours} hours`;
    const days = Math.round(ms / UNIT_MS.days);
    return days === 1 ? '1 day' : `${days} days`;
  };
  return diff > 0 ? `Ends in ${span(diff)}` : `Ended ${span(-diff)} ago`;
}

// ------------------------------------------------------------------ commands

export type CommandOutcome = 'saved' | 'refused' | 'unavailable' | 'offline';

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export type AddOutcome =
  | { ok: true; id: string; kind: 'invite' | 'profile' }
  | { ok: false; reason: 'unavailable' | 'refused' | 'offline' | 'bad-email' | 'taken' };

/** Registers an email with an expiry (null = permanent). An email that already belongs to a removed helper is given access again. */
export async function addHelper(
  client: PeopleClient,
  email: string,
  expiresAt: number | null
): Promise<AddOutcome> {
  try {
    const { data, error } = await client.rpc('add_helper', {
      p_email: email,
      p_expires_at: iso(expiresAt) as string
    });
    if (error) {
      if (error.code === '22023') return { ok: false, reason: 'bad-email' };
      if (error.code === '23505') return { ok: false, reason: 'taken' };
      return { ok: false, reason: failure(error) };
    }
    if (
      !isObj(data) ||
      typeof data.id !== 'string' ||
      (data.kind !== 'invite' && data.kind !== 'profile')
    )
      return { ok: false, reason: 'offline' };
    return { ok: true, id: data.id, kind: data.kind };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export async function setHelperExpiry(
  client: PeopleClient,
  id: string,
  expiresAt: number | null
): Promise<CommandOutcome> {
  try {
    const { error } = await client.rpc('set_helper_expiry', {
      p_id: id,
      p_expires_at: iso(expiresAt) as string
    });
    return error ? (failure(error) === 'offline' ? 'offline' : failure(error)) : 'saved';
  } catch {
    return 'offline';
  }
}

export async function revokeHelper(client: PeopleClient, id: string): Promise<CommandOutcome> {
  try {
    const { error } = await client.rpc('revoke_helper', { p_id: id });
    return error ? failure(error) : 'saved';
  } catch {
    return 'offline';
  }
}

export type AccountOutcome =
  | { ok: true; email: string; temporaryPassword: string }
  | { ok: false; reason: 'not-deployed' | 'exists' | 'gone' | 'refused' | 'offline' };

/**
 * Asks the Edge Function to make the helper's sign-in for a registered email. It answers with the temporary password, once. A
 * function that is not deployed answers 404 from the gateway with its own code (NOT_FOUND), which is not one of ours.
 */
export async function createHelperAccount(
  client: PeopleClient,
  inviteId: string
): Promise<AccountOutcome> {
  try {
    const { data, error } = await client.functions.invoke('create-helper-account', {
      body: { inviteId } as unknown as Json as never
    });
    if (error) {
      const context = (error as { context?: unknown }).context;
      const status = context instanceof Response ? context.status : 0;
      let code = '';
      if (context instanceof Response) {
        try {
          const body: unknown = await context.clone().json();
          if (isObj(body)) code = String(body.error ?? body.code ?? '');
        } catch {
          /* not JSON */
        }
      }
      if (status === 404 || code === 'NOT_FOUND') return { ok: false, reason: 'not-deployed' };
      if (code === 'already_exists') return { ok: false, reason: 'exists' };
      if (code === 'invite_not_found') return { ok: false, reason: 'gone' };
      if (status === 401 || status === 403) return { ok: false, reason: 'refused' };
      return { ok: false, reason: 'offline' };
    }
    if (
      !isObj(data) ||
      typeof data.email !== 'string' ||
      typeof data.temporaryPassword !== 'string' ||
      data.temporaryPassword.length < 8
    )
      return { ok: false, reason: 'offline' };
    return { ok: true, email: data.email, temporaryPassword: data.temporaryPassword };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
