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
