-- Legacy client mutation RPC quarantine; all synthetic data and red probes roll back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a6d00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 5) i;
insert into public.profiles(id, role, display_name, active) values
  ('a6d00000-0000-4000-8000-000000000001', 'owner', 'MP06d owner', true),
  ('a6d00000-0000-4000-8000-000000000002', 'helper', 'MP06d helper', true),
  ('a6d00000-0000-4000-8000-000000000003', 'support', 'MP06d support', true),
  ('a6d00000-0000-4000-8000-000000000004', 'owner', 'MP06d inactive owner', false);
insert into public.orders(id, customer_name, phone, state, pay_state, total_cents, updated_at)
values ('MP06D-ORDER', 'MP06d customer', '09170000000', 'Payment review', 'unpaid', 1, '2025-01-01 00:00:00+00');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a6d00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;
create function pg_temp.fixture_state() returns jsonb language sql security invoker as $$
  select jsonb_build_object(
    'orders', (select jsonb_agg(t order by id) from public.orders t),
    'ledger', (select jsonb_agg(t order by id) from public.ledger_entries t),
    'sales', (select jsonb_agg(t order by id) from public.event_sales t),
    'items', (select jsonb_agg(t order by id) from public.event_sale_items t),
    'audit', (select jsonb_agg(t order by id) from public.audit_log t));
$$;
create temporary table original_fixture as select pg_temp.fixture_state() as value;

-- Any non-42501 result is a red oracle: the EXECUTE boundary was crossed before a
-- legacy body failure (including update_order_state's old text/enum behaviour).
create function pg_temp.assert_legacy_denied(actor text) returns void
language plpgsql security invoker as $$
declare operation text; state text;
begin
  foreach operation in array array['sync_event_sale', 'update_order_state'] loop
    begin
      if operation = 'sync_event_sale' then
        perform public.sync_event_sale('{"clientId":"mp06d-quarantine","eventId":null,"items":{},"gross":1,"total":1,"at":1735689600000}'::jsonb);
      else
        perform public.update_order_state('MP06D-ORDER', '2025-01-01 00:00:00+00', 'Confirmed', 'confirmed', 'mp06d');
      end if;
    exception when insufficient_privilege then
      get stacked diagnostics state = returned_sqlstate;
      if state <> '42501' then raise exception 'legacy denial SQLSTATE differs: % / % / %', actor, operation, state; end if;
      insert into pg_temp.authority_results values (operation, actor, 'denied_' || state);
      continue;
    when others then
      get stacked diagnostics state = returned_sqlstate;
      raise exception 'legacy EXECUTE boundary missing: % / % SQLSTATE %', actor, operation, state;
    end;
    raise exception 'legacy EXECUTE boundary missing: % / % succeeded', actor, operation;
  end loop;
end $$;
grant execute on function pg_temp.set_subject(integer, text), pg_temp.assert_legacy_denied(text)
  to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon'); select pg_temp.assert_legacy_denied('anon');
reset role;
set local role authenticated;
select pg_temp.set_subject(1); select pg_temp.assert_legacy_denied('active_owner');
select pg_temp.set_subject(null); select pg_temp.assert_legacy_denied('no_subject');
select pg_temp.set_subject(5); select pg_temp.assert_legacy_denied('missing_profile');
select pg_temp.set_subject(4, 'service_role'); select pg_temp.assert_legacy_denied('inactive_owner');
select pg_temp.set_subject(2, 'service_role'); select pg_temp.assert_legacy_denied('active_helper');
select pg_temp.set_subject(3); select pg_temp.assert_legacy_denied('active_support');
reset role;

do $$ declare signature text; api_role text;
begin
  if pg_temp.fixture_state() is distinct from (select value from pg_temp.original_fixture) then
    raise exception 'legacy denied calls changed orders, ledger, sales, items, or audit';
  end if;
  foreach signature in array array['public.sync_event_sale(jsonb)',
      'public.update_order_state(text,timestamptz,text,text,text)'] loop
    foreach api_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(api_role, signature, 'EXECUTE') then
        raise exception 'effective legacy execute remains: % / %', api_role, signature;
      end if;
    end loop;
    if not has_function_privilege('service_role', signature, 'EXECUTE') then
      raise exception 'service legacy execute missing: %', signature;
    end if;
  end loop;
  if (select count(*) from pg_temp.authority_results) <> 14 then
    raise exception 'legacy mutation role matrix differs';
  end if;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
