/**
 * The one runtime import the sign-in gate needs from the Supabase SDK, behind its own module so demo builds can swap it
 * for `auth-errors-none` (next.config.ts) and leave the whole SDK out of the demo bundle (HCB-083).
 */
export { isAuthRetryableFetchError } from '@supabase/supabase-js';
