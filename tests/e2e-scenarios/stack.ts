import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

/**
 * Local-stack helpers for the browser scenarios. Test code only: the service-role client
 * reads and prepares rows; the app under test never sees it. Refuses any non-loopback API.
 */
export const API_URL = process.env.HC_SCN_API_URL ?? 'http://127.0.0.1:55421';
// The Supabase CLI's published local-development service_role key (same on every machine; useless
// anywhere but a local stack). Override with HC_SCN_SERVICE_KEY if the stack uses another secret.
const SERVICE_KEY =
  process.env.HC_SCN_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
export const OWNER_EMAIL = 'owner@scenario.test';
export const OWNER_PASSWORD = 'scenario-pass-1';

export function admin(): SupabaseClient {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API_URL))
    throw new Error('Scenario specs run against a local stack only');
  if (!SERVICE_KEY) throw new Error('Set HC_SCN_SERVICE_KEY (supabase status, service_role key)');
  return createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/** Creates the owner account and profile once; safe to call again. */
export async function ensureOwner(): Promise<string> {
  const db = admin();
  const list = await db.auth.admin.listUsers({ perPage: 200 });
  let user = list.data?.users.find((u) => u.email === OWNER_EMAIL);
  if (!user) {
    const made = await db.auth.admin.createUser({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      email_confirm: true
    });
    if (made.error || !made.data.user) throw new Error(`createUser: ${made.error?.message}`);
    user = made.data.user;
  }
  const profile = await db
    .from('profiles')
    .upsert({ id: user.id, role: 'owner', display_name: 'Scenario owner', active: true });
  if (profile.error) throw new Error(`profile: ${profile.error.message}`);
  return user.id;
}

export async function signInAsOwner(page: Page): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(OWNER_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/**
 * Runs SQL as the database owner inside the throwaway local stack's database container
 * (`supabase_db_<project_id>`). Used to prepare the rows an operator would have entered;
 * never to drive the flow under test.
 */
import { spawnSync } from 'node:child_process';
export const DB_CONTAINER = process.env.HC_SCN_DB_CONTAINER ?? 'supabase_db_hcscn';
export function sql(statement: string): string {
  if (!/^supabase_db_[A-Za-z0-9_-]+$/.test(DB_CONTAINER)) throw new Error('Bad db container');
  const run = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-A',
      '-t'
    ],
    { input: statement, encoding: 'utf8' }
  );
  if (run.status !== 0) throw new Error(`psql failed: ${run.stderr}`);
  return run.stdout.trim();
}

export const HELPER_EMAIL = 'helper.d@example.test';
export const HELPER_PASSWORD = 'scenario-helper-1';

/**
 * Registers a helper the way the owner does, minus the Edge Function (not deployed on the local stack): the owner's own session
 * calls the `add_helper` RPC (two-hour expiry), then the service-role client plays the function: it makes the auth user and the
 * helper profile with the invite's expiry, and removes the invite. Returns the helper's user id.
 */
export async function createHelperViaRpc(hours = 2): Promise<string> {
  const service = admin();
  const old = (await service.auth.admin.listUsers({ perPage: 200 })).data?.users.find(
    (u) => u.email === HELPER_EMAIL
  );
  if (old) await service.auth.admin.deleteUser(old.id);
  await service.from('helper_invites').delete().eq('email', HELPER_EMAIL);
  const signedIn = await createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false }
  }).auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  const token = signedIn.data.session?.access_token;
  if (!token) throw new Error(`owner sign-in: ${signedIn.error?.message}`);
  // The gateway key is the service key; PostgREST takes the role from the owner's bearer token.
  const asOwner = createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const expires = new Date(Date.now() + hours * 3600_000).toISOString();
  const added = await asOwner.rpc('add_helper', { p_email: HELPER_EMAIL, p_expires_at: expires });
  if (added.error) throw new Error(`add_helper: ${added.error.message}`);
  const invite = await service
    .from('helper_invites')
    .select('id, access_expires_at')
    .eq('email', HELPER_EMAIL)
    .single();
  if (invite.error) throw new Error(`invite: ${invite.error.message}`);
  const made = await service.auth.admin.createUser({
    email: HELPER_EMAIL,
    password: HELPER_PASSWORD,
    email_confirm: true
  });
  if (made.error || !made.data.user) throw new Error(`helper user: ${made.error?.message}`);
  const profile = await service.from('profiles').insert({
    id: made.data.user.id,
    role: 'helper',
    display_name: 'Helper D',
    active: true,
    access_expires_at: invite.data.access_expires_at
  });
  if (profile.error) throw new Error(`helper profile: ${profile.error.message}`);
  await service.from('helper_invites').delete().eq('id', invite.data.id);
  return made.data.user.id;
}

/** The owner's `set_helper_expiry` for a future time, or the service role for a past one (the RPC refuses the past by design). */
export async function endHelperAccess(helperId: string): Promise<void> {
  const done = await admin()
    .from('profiles')
    .update({ access_expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', helperId);
  if (done.error) throw new Error(`expire helper: ${done.error.message}`);
}

/** Server-side truth for the sales table, read with the service role: [{ client_id, recorded_by, voided_at, sold_at }]. */
export async function serverSales(): Promise<
  Array<{
    client_id: string;
    recorded_by: string | null;
    voided_at: string | null;
    sold_at: string;
    event_id: string;
  }>
> {
  const res = await admin()
    .from('event_sales')
    .select('client_id, recorded_by, voided_at, sold_at, event_id')
    .order('sold_at');
  if (res.error) throw new Error(`event_sales: ${res.error.message}`);
  return res.data ?? [];
}
