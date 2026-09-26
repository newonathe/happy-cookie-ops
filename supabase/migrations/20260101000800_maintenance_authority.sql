-- MP-06.a: API-facing callers must reach maintenance through trusted server code.
-- Explicit GRANTs in earlier migrations did not remove PUBLIC or image defaults.
revoke execute on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.prune_rate_limits()
  from public, anon, authenticated;
revoke execute on function public.prune_personal_data(integer)
  from public, anon, authenticated;

grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.prune_rate_limits() to service_role;
grant execute on function public.prune_personal_data(integer) to service_role;

-- Other current functions, default privileges, role policies and parameter bounds
-- require the following MP-06 slices. This migration makes no readiness claim.
