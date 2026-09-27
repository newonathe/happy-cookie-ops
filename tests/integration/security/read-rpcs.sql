-- Real SQL-role read-RPC invocations on synthetic data; all mutations are rolled back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into public.products (id, name, short_name, price_cents, kind)
values ('mp06b-read-product', 'MP06b read product', 'MP06b', 100, 'cookie');
insert into public.drops (id, week_label, opens_at, closes_at, pickup_at, capacity)
values ('a6b10000-0000-4000-8000-000000000001', 'MP06b read drop', now(), now(), now(), 10);
insert into public.orders (id, drop_id, customer_name, phone, state, total_cents)
values ('MP06B-READ-ORDER', 'a6b10000-0000-4000-8000-000000000001',
        'MP06b read customer', '0917-000-0001', 'Confirmed', 300);
insert into public.order_items (id, order_id, product_id, qty, unit_price_cents)
values ('a6b10000-0000-4000-8000-000000000002', 'MP06B-READ-ORDER', 'mp06b-read-product', 3, 100);
-- cogsMultiple lives in json_value since MP-09 b3 (20260101002900).
insert into public.settings (key, int_value, json_value) values
  ('capacity', 17, null), ('cogsMultiple', null, '9'::jsonb), ('mp06b_read_marker', 1, null);

create function pg_temp.read_fixture_state() returns jsonb language sql security invoker as $$
  select jsonb_build_object(
    'products', (select jsonb_agg(t order by id) from public.products t),
    'drops', (select jsonb_agg(t order by id) from public.drops t),
    'orders', (select jsonb_agg(t order by id) from public.orders t),
    'items', (select jsonb_agg(t order by id) from public.order_items t),
    'settings', (select jsonb_agg(t order by key) from public.settings t));
$$;
create temporary table original_fixture as select pg_temp.read_fixture_state() as value;

-- This SECURITY INVOKER helper catches only the expected SQLSTATE. If a forbidden
-- RPC succeeds, its exact error proves the red oracle caught the unsafe grant.
create function pg_temp.assert_read_rpc_denied(actor text) returns void
language plpgsql security invoker as $$
declare function_name text; statement text;
begin
  foreach function_name in array array['lookup_order','drop_remaining','settings_effective'] loop
    statement := case function_name
      when 'lookup_order' then
        'select 1 from public.lookup_order(''MP06B-READ-ORDER'',''0917-000-0001'')'
      when 'drop_remaining' then
        'select public.drop_remaining(''a6b10000-0000-4000-8000-000000000001''::uuid)'
      else 'select 1 from public.settings_effective()' end;
    begin
      execute statement;
      raise exception 'forbidden read RPC invocation succeeded: % / %', actor, function_name;
    exception when insufficient_privilege then
      insert into pg_temp.authority_results values (function_name, actor, 'denied_42501');
    end;
  end loop;
end;
$$;
grant execute on function pg_temp.assert_read_rpc_denied(text) to anon, authenticated;

set local role anon;
select pg_temp.assert_read_rpc_denied('anon');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"owner"}',true);
select pg_temp.assert_read_rpc_denied('authenticated_owner_claim');
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"helper"}',true);
select pg_temp.assert_read_rpc_denied('authenticated_helper_claim');
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"support"}',true);
select pg_temp.assert_read_rpc_denied('authenticated_support_claim');
select set_config('request.jwt.claims','{"role":"service_role","app_role":"owner"}',true);
select pg_temp.assert_read_rpc_denied('authenticated_forged_service_claim');
reset role;

do $$ begin
  if pg_temp.read_fixture_state() is distinct from (select value from pg_temp.original_fixture) then
    raise exception 'denied read RPC calls changed synthetic fixture state';
  end if;
end $$;

set local role service_role;
do $$ declare found_order record; remaining integer; capacity_value bigint;
begin
  select * into found_order from public.lookup_order('MP06B-READ-ORDER', '0917-000-0001');
  if found_order.id is distinct from 'MP06B-READ-ORDER' or found_order.customer_name is distinct from 'MP06b read customer'
     or found_order.total_cents is distinct from 300 or found_order.state is distinct from 'Confirmed'
     or found_order.pay_state is distinct from 'unpaid' or found_order.pickup_at is distinct from now()
     or found_order.placed_at is distinct from now() then raise exception 'service lookup match differs'; end if;
  if exists (select 1 from public.lookup_order('MP06B-READ-ORDER', '0917-000-0002')) then
    raise exception 'service lookup mismatch differs';
  end if;
  insert into pg_temp.authority_results values ('lookup_order', 'service_role', 'match_and_mismatch');
  select public.drop_remaining('a6b10000-0000-4000-8000-000000000001') into remaining;
  if remaining is distinct from 7 then raise exception 'service drop remaining differs'; end if;
  insert into pg_temp.authority_results values ('drop_remaining', 'service_role', 'confirmed_qty_three_of_ten');
  select int_value into capacity_value from public.settings_effective() where key = 'capacity';
  if capacity_value is distinct from 17
     or not exists (select 1 from public.settings_effective() where key = 'cogsMultiple' and json_value = '9'::jsonb and not is_default)
     or not exists (select 1 from public.settings_effective() where key = 'packagingFee' and cents_value = 3844 and is_default) then
    raise exception 'service effective settings differ';
  end if;
  insert into pg_temp.authority_results values ('settings_effective', 'service_role', 'override_and_default');
end $$;
reset role;

do $$ declare signature text; actor text;
begin
  if pg_temp.read_fixture_state() is distinct from (select value from pg_temp.original_fixture)
     or (select count(*) from pg_temp.authority_results) <> 18 then
    raise exception 'read RPC effects or result count differ';
  end if;
  foreach signature in array array['public.lookup_order(text,text)', 'public.drop_remaining(uuid)',
      'public.settings_effective()'] loop
    foreach actor in array array['anon', 'authenticated'] loop
      if has_function_privilege(actor, signature, 'EXECUTE') then
        raise exception 'effective read RPC execute still granted: % / %', actor, signature;
      end if;
    end loop;
    if not has_function_privilege('service_role', signature, 'EXECUTE') then
      raise exception 'service read RPC execute missing: %', signature;
    end if;
  end loop;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
