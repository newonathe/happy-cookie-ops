/**
 * create-helper-account: the rules, with every outside call passed in, so they run the same under Deno (index.ts) and under the
 * unit tests. Nothing here imports anything.
 *
 * Cine registers a helper's email (the `add_helper` command writes a row in helper_invites with the expiry). This function then
 * makes the sign-in: it checks the caller is the active owner, creates the auth user (email already confirmed, a random temporary
 * password, flagged `must_change_password`), links the profile as a helper with the invite's expiry, removes the invite and returns
 * the temporary password ONCE. The password is never logged, stored or put in an error.
 */

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// No 0/O, 1/l/I: it is read out and typed by hand.
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PASSWORD_LENGTH = 14;

/** A random password of PASSWORD_LENGTH characters from the alphabet, unbiased (rejection sampling). */
export function temporaryPassword(random: (n: number) => Uint8Array): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let out = '';
  while (out.length < PASSWORD_LENGTH) {
    for (const byte of random(PASSWORD_LENGTH * 2)) {
      if (byte < limit && out.length < PASSWORD_LENGTH)
        out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
  }
  return out;
}

export interface Invite {
  id: string;
  email: string;
  expiresAt: string | null;
}

export interface Caller {
  id: string;
}

/** What the function needs from outside. Each call returns a plain answer; none throws for an expected refusal. */
export interface Deps {
  random: (n: number) => Uint8Array;
  /** The user behind this access token, or null when the token is not valid. */
  userForToken: (token: string) => Promise<Caller | null>;
  /** True when this user's profile is an active, unexpired owner. */
  isActiveOwner: (userId: string) => Promise<boolean>;
  loadInvite: (inviteId: string) => Promise<Invite | null>;
  createUser: (args: {
    email: string;
    password: string;
  }) => Promise<{ id: string } | { error: 'exists' | 'failed' }>;
  insertProfile: (args: { id: string; name: string; expiresAt: string | null }) => Promise<boolean>;
  deleteUser: (id: string) => Promise<void>;
  deleteInvite: (id: string) => Promise<void>;
  audit: (args: { actor: string; entityId: string; expiresAt: string | null }) => Promise<void>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** Handles one request. Error codes are for the app to show a plain sentence; they carry no detail. */
export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return json(401, { error: 'not_signed_in' });
  const caller = await deps.userForToken(token);
  if (!caller) return json(401, { error: 'not_signed_in' });
  if (!(await deps.isActiveOwner(caller.id))) return json(403, { error: 'owner_only' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const inviteId =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).inviteId : null;
  if (typeof inviteId !== 'string' || !UUID.test(inviteId))
    return json(400, { error: 'bad_request' });

  // The email and the expiry come from the invite the owner registered, never from this request.
  const invite = await deps.loadInvite(inviteId);
  if (!invite) return json(422, { error: 'invite_not_found' });

  const password = temporaryPassword(deps.random);
  const created = await deps.createUser({ email: invite.email, password });
  if ('error' in created)
    return json(created.error === 'exists' ? 409 : 500, {
      error: created.error === 'exists' ? 'already_exists' : 'create_failed'
    });

  // Only ever an insert: an email that already belongs to someone else must never become, or change, a profile.
  const linked = await deps.insertProfile({
    id: created.id,
    name: invite.email.split('@')[0] ?? 'Helper',
    expiresAt: invite.expiresAt
  });
  if (!linked) {
    await deps.deleteUser(created.id);
    return json(500, { error: 'create_failed' });
  }
  await deps.deleteInvite(invite.id);
  await deps.audit({ actor: caller.id, entityId: created.id, expiresAt: invite.expiresAt });
  return json(200, {
    email: invite.email,
    temporaryPassword: password,
    expiresAt: invite.expiresAt
  });
}
