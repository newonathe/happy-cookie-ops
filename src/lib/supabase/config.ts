/**
 * Whether a backend is configured at all.
 *
 * The app is designed to run without one: the books are still in localStorage, so all 24
 * screens work with no database. Only sign-in and the sync endpoint need Supabase.
 *
 * Every Supabase entry point checks this first. The alternative — `process.env.X!` —
 * throws deep inside the client library with a message about an invalid URL, which tells
 * you nothing about which variable is missing or where to put it.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Reads a required variable, or fails with a message that says what to do about it. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in ` +
        '(docs/DEPLOY.md lists where each value comes from).'
    );
  }
  return value;
}
