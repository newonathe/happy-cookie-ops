-- Direct audit mutation containment and legacy sync compatibility; all data rolls back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a6c50000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 5) i;
insert into public.profiles(id, role, display_name, active) values
  ('a6c50000-0000-4000-8000-000000000001', 'owner', 'MP06c5 owner', true),
  ('a6c50000-0000-4000-8000-000000000002', 'helper', 'MP06c5 helper', true),
  ('a6c50000-0000-4000-8000-000000000003', 'support', 'MP06c5 support', true),
  ('a6c50000-0000-4000-8000-000000000004', 'owner', 'MP06c5 inactive owner', false);
insert into public.audit_log(actor, action, entity, entity_id, detail, at) values
  ('a6c50000-0000-4000-8000-000000000001', 'mp06c5.trusted', 'fixture', 'trusted',
   '{"source":"trusted","amount":1}', '2025-01-01 00:00:00+00');
create temporary table original_audit as select jsonb_agg(a order by id) as value from public.audit_log a;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a6c50000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;
create function pg_temp.assert_audit_preserved(actor text) returns void
language plpgsql security invoker as $$
begin
  if (select jsonb_agg(a order by id) from public.audit_log a) is distinct from
       (select value from pg_temp.original_audit) then
    raise exception 'audit full-row preservation differs: %', actor;
  end if;
end $$;
create function pg_temp.assert_audit_read(actor text, permitted boolean) returns void
language plpgsql security invoker as $$
declare visible integer;
begin
  select count(*) into visible from public.audit_log a
  where a.actor = 'a6c50000-0000-4000-8000-000000000001' and action = 'mp06c5.trusted'
    and entity = 'fixture' and entity_id = 'trusted' and detail = '{"source":"trusted","amount":1}'
    and at = '2025-01-01 00:00:00+00';
  if visible is distinct from (case when permitted then 1 else 0 end) then
    raise exception 'audit read visibility differs: %', actor;
  end if;
  insert into pg_temp.authority_results values ('audit_select', actor,
    case when permitted then 'trusted_exact_row' else 'empty' end);
end $$;
create function pg_temp.assert_audit_mutations_denied(actor text) returns void
language plpgsql security invoker as $$
begin
  begin
    -- Explicit synthetic ID isolates table INSERT authority from sequence permissions.
    insert into public.audit_log(id, actor, action, entity, entity_id, detail, at) values
      (-60050001, 'a6c50000-0000-4000-8000-000000000001', 'forged.action', 'audit_log', 'trusted',
       '{"arbitrary":true,"spoofed":"owner"}', '2025-01-02 00:00:00+00');
    raise exception 'forbidden audit mutation succeeded: % / insert', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('audit_insert', actor, 'denied_42501');
  end;
  begin
    update public.audit_log set detail = '{"tampered":true}' where action = 'mp06c5.trusted';
    raise exception 'forbidden audit mutation succeeded: % / update', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('audit_update', actor, 'denied_42501');
  end;
  begin
    delete from public.audit_log where action = 'mp06c5.trusted';
    raise exception 'forbidden audit mutation succeeded: % / delete', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('audit_delete', actor, 'denied_42501');
  end;
end $$;
grant execute on function pg_temp.set_subject(integer, text), pg_temp.assert_audit_preserved(text),
  pg_temp.assert_audit_read(text, boolean), pg_temp.assert_audit_mutations_denied(text)
  to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_audit_read('anon', false);
select pg_temp.assert_audit_mutations_denied('anon');
reset role; select pg_temp.assert_audit_preserved('anon');
set local role authenticated;
select pg_temp.set_subject(null);
select pg_temp.assert_audit_read('no_subject', false);
select pg_temp.assert_audit_mutations_denied('no_subject');
reset role; select pg_temp.assert_audit_preserved('no_subject');
set local role authenticated;
select pg_temp.set_subject(5);
select pg_temp.assert_audit_read('missing_profile', false);
select pg_temp.assert_audit_mutations_denied('missing_profile');
reset role; select pg_temp.assert_audit_preserved('missing_profile');
set local role authenticated;
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_audit_read('inactive_owner', false);
select pg_temp.assert_audit_mutations_denied('inactive_owner');
reset role; select pg_temp.assert_audit_preserved('inactive_owner');
set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.assert_audit_read('active_owner', true);
select pg_temp.assert_audit_mutations_denied('active_owner');
reset role; select pg_temp.assert_audit_preserved('active_owner');
set local role authenticated;
select pg_temp.set_subject(2, 'service_role');
select pg_temp.assert_audit_read('active_helper', false);
select pg_temp.assert_audit_mutations_denied('active_helper');
reset role; select pg_temp.assert_audit_preserved('active_helper');
set local role authenticated;
select pg_temp.set_subject(3);
select pg_temp.assert_audit_read('active_support', false);
select pg_temp.assert_audit_mutations_denied('active_support');
reset role; select pg_temp.assert_audit_preserved('active_support');

set local role service_role;
select pg_temp.set_subject(null, 'service_role');
insert into public.audit_log(actor, action, entity, entity_id, detail, at) values
  ('a6c50000-0000-4000-8000-000000000001', 'mp06c5.service', 'fixture', 'service',
   '{"trusted":true}', '2025-01-03 00:00:00+00');
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where actor = 'a6c50000-0000-4000-8000-000000000001'
      and action = 'mp06c5.service' and entity = 'fixture' and entity_id = 'service'
      and detail = '{"trusted":true}' and at = '2025-01-03 00:00:00+00') then
    raise exception 'service audit insert differs';
  end if;
  insert into pg_temp.authority_results values ('audit_insert', 'service_role', 'trusted_exact_row');
end $$;

set local role service_role;
select pg_temp.set_subject(1);
do $$ declare result_row record; sale jsonb :=
  '{"clientId":"mp06c5-active-owner-sync","eventId":null,"items":{},"gross":1,"total":1,"at":1735689600000}'::jsonb;
begin
  select * into result_row from public.sync_event_sale(sale);
  if result_row.client_id is distinct from 'mp06c5-active-owner-sync' or result_row.sale_id is null
     or result_row.duplicate is distinct from false then raise exception 'legacy sync return differs'; end if;
  if (select count(*) from public.event_sales where id = result_row.sale_id and client_id = result_row.client_id
      and event_id is null and gross_cents = 100 and total_cents = 100
      and sold_at = '2025-01-01 00:00:00+00') <> 1
     or (select count(*) from public.event_sales es join public.ledger_entries le on le.id = es.ledger_id
        where es.id = result_row.sale_id and le.created_by = auth.uid() and le.amount_cents = 100
          and le.memo = 'Stall sale mp06c5-active-owner-sync' and le.occurred_at = '2025-01-01 00:00:00+00') <> 1
     or exists (select 1 from public.event_sale_items where sale_id = result_row.sale_id)
     or (select count(*) from public.audit_log where actor = auth.uid() and action = 'sale.synced'
      and entity = 'event_sales' and entity_id = result_row.sale_id::text and detail = sale) <> 1 then
    raise exception 'legacy sync rows differ';
  end if;
  insert into pg_temp.authority_results values ('sync_event_sale', 'service_active_owner', 'one_sale_ledger_audit');
end $$;
reset role;

do $$ begin
  if has_table_privilege('anon', 'public.audit_log', 'INSERT')
     or has_table_privilege('anon', 'public.audit_log', 'UPDATE')
     or has_table_privilege('anon', 'public.audit_log', 'DELETE')
     or has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_log', 'DELETE')
     or has_any_column_privilege('anon', 'public.audit_log', 'INSERT,UPDATE')
     or has_any_column_privilege('authenticated', 'public.audit_log', 'INSERT,UPDATE')
     or (select count(*) from public.audit_log) <> 3
     or (select count(*) from public.event_sales) <> 1
     or (select count(*) from public.ledger_entries) <> 1
     or (select jsonb_agg(a order by id) from public.audit_log a where action='mp06c5.trusted')
        is distinct from (select value from pg_temp.original_audit)
     or (select count(*) from pg_temp.authority_results) <> 30 then
    raise exception 'audit mutation privileges or result count differ';
  end if;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor, outcome;
rollback;
