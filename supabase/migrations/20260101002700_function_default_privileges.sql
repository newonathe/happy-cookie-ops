-- MP-06m proved a global-only default revoke is insufficient: Supabase's own
-- postgres default for schema public still grants anon/authenticated EXECUTE
-- on any new function. Harden both layers. Existing function grants, which
-- were already made explicit by earlier authority migrations, are unchanged.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- These five functions have never had an explicit GRANT/REVOKE: their EXECUTE
-- privilege has only ever come from the default combination above, computed
-- fresh each time the function is (re)created. capacity_allows is partway
-- there -- 20260101000400_capacity_parity.sql explicitly grants it to
-- anon/authenticated, but not to PUBLIC or service_role, so those two are
-- still default-derived. A default-privilege change never touches an
-- already-materialized ACL, but it does change what a future re-create
-- computes -- and `supabase db reset` replays every migration, including the
-- `create function`/`create or replace function` statements that created
-- these six, against the SAME already-hardened database on a second and
-- subsequent reset. On that replay the two REVOKE statements above are
-- already in effect from the very first migration (they are schema/role
-- catalog state, not schema-owned objects `db reset` recreates), so a
-- function created without an explicit grant silently loses whatever the
-- narrowed default no longer provides -- breaking every RLS policy that
-- calls it. Grant every current grantee explicitly, including PUBLIC, so
-- each ACL is fully fixed from here on, independent of default-privilege
-- state or replay order. This does not add or remove any access: every
-- grantee below already had EXECUTE on all six (see
-- tests/fixtures/function-authority.json).
grant execute on function public.current_role_name() to public, anon, authenticated, service_role;
grant execute on function public.is_owner() to public, anon, authenticated, service_role;
grant execute on function public.is_staff() to public, anon, authenticated, service_role;
grant execute on function public.state_is_recognised(public.order_state) to public, anon, authenticated, service_role;
grant execute on function public.state_reserves_capacity(public.order_state) to public, anon, authenticated, service_role;
grant execute on function public.capacity_allows(integer, integer, integer) to public, service_role;
