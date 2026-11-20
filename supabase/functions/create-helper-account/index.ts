// Supabase Edge Function (Deno). NOT deployed by this repository: Ethan deploys it once with the Supabase CLI (see the S3 pull request).
//   supabase functions deploy create-helper-account --project-ref <ref>
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to the function by Supabase itself; the service key never reaches the browser.
// The rules are in logic.ts (unit-tested); this file only connects them to Supabase. The temporary password is never logged.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleRequest, type Deps } from './logic.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const deps: Deps = {
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  userForToken: async (token) => {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  isActiveOwner: async (userId) => {
    const { data } = await admin
      .from('profiles')
      .select('role, active, access_expires_at')
      .eq('id', userId)
      .maybeSingle();
    return (
      !!data &&
      data.role === 'owner' &&
      data.active === true &&
      (data.access_expires_at === null || new Date(data.access_expires_at).getTime() > Date.now())
    );
  },
  loadInvite: async (inviteId) => {
    const { data } = await admin
      .from('helper_invites')
      .select('id, email, access_expires_at')
      .eq('id', inviteId)
      .maybeSingle();
    return data ? { id: data.id, email: data.email, expiresAt: data.access_expires_at } : null;
  },
  createUser: async ({ email, password }) => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { must_change_password: true }
    });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? '');
      return { error: exists ? 'exists' : 'failed' };
    }
    return { id: data.user.id };
  },
  insertProfile: async ({ id, name, expiresAt }) => {
    const { error } = await admin.from('profiles').insert({
      id,
      role: 'helper',
      display_name: name,
      active: true,
      access_expires_at: expiresAt
    });
    return !error;
  },
  deleteUser: async (id) => {
    await admin.auth.admin.deleteUser(id);
  },
  deleteInvite: async (id) => {
    await admin.from('helper_invites').delete().eq('id', id);
  },
  audit: async ({ actor, entityId, expiresAt }) => {
    await admin.from('audit_log').insert({
      actor,
      action: 'helper.account_created',
      entity: 'profiles',
      entity_id: entityId,
      detail: { expires_at: expiresAt }
    });
  }
};

Deno.serve((req) => handleRequest(req, deps));
