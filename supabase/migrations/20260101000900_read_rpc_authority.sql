-- Unused legacy reads are backend-only until safe projections replace them.
-- API-facing roles only: database owners retain PostgreSQL administrative control.
revoke execute on function public.lookup_order(text, text) from public, anon, authenticated;
revoke execute on function public.drop_remaining(uuid) from public, anon, authenticated;
revoke execute on function public.settings_effective() from public, anon, authenticated;

grant execute on function public.lookup_order(text, text) to service_role;
grant execute on function public.drop_remaining(uuid) to service_role;
grant execute on function public.settings_effective() to service_role;
