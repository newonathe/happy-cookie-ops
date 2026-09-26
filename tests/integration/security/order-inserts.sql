-- Real SQL-role order insertion attempts on synthetic data; all mutations are rolled back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into public.products (id, name, short_name, price_cents, kind)
values ('mp06c-order-insert-product', 'MP06c order product', 'MP06c', 100, 'cookie');
insert into public.orders (id, customer_name, phone, state, pay_state, total_cents)
values ('MP06C-EXISTING-ORDER', 'MP06c existing customer', '0917-000-0003', 'Payment review', 'unpaid', 100);
insert into public.order_items (id, order_id, product_id, qty, unit_price_cents)
values ('a6c10000-0000-4000-8000-000000000001', 'MP06C-EXISTING-ORDER',
        'mp06c-order-insert-product', 1, 100);

create function pg_temp.order_insert_fixture_state() returns jsonb language sql security invoker as $$
  select jsonb_build_object(
    'products', (select jsonb_agg(t order by id) from public.products t),
    'orders', (select jsonb_agg(t order by id) from public.orders t),
    'order_items', (select jsonb_agg(t order by id) from public.order_items t));
$$;
create temporary table original_fixture as select pg_temp.order_insert_fixture_state() as value;

-- This SECURITY INVOKER helper catches only the expected SQLSTATE. A successful
-- forbidden call must use the exact error below so the root red oracle detects it.
create function pg_temp.assert_order_insert_denied(actor text) returns void
language plpgsql security invoker as $$
declare operation text; statement text;
begin
  foreach operation in array array['orders_insert', 'order_items_insert'] loop
    statement := case operation
      when 'orders_insert' then
        'insert into public.orders (id,customer_name,phone,state,pay_state,total_cents) values ' ||
        '(''MP06C-DENIED-ORDER'',''MP06c tampered customer'',''0917-000-0004'',''Payment review'',''unpaid'',1)'
      else
        'insert into public.order_items (id,order_id,product_id,qty,unit_price_cents) values ' ||
        '(''a6c10000-0000-4000-8000-000000000003''::uuid,''MP06C-EXISTING-ORDER'',' ||
        '''mp06c-order-insert-product'',1,1)' end;
    begin
      execute statement;
      raise exception 'forbidden order insert succeeded: % / %', actor, operation;
    exception when insufficient_privilege then
      insert into pg_temp.authority_results values (operation, actor, 'denied_42501');
    end;
  end loop;
end;
$$;
grant execute on function pg_temp.assert_order_insert_denied(text) to anon, authenticated;

set local role anon;
select pg_temp.assert_order_insert_denied('anon');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"owner"}',true);
select pg_temp.assert_order_insert_denied('authenticated_owner_claim');
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"helper"}',true);
select pg_temp.assert_order_insert_denied('authenticated_helper_claim');
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"support"}',true);
select pg_temp.assert_order_insert_denied('authenticated_support_claim');
select set_config('request.jwt.claims','{"role":"service_role","app_role":"owner"}',true);
select pg_temp.assert_order_insert_denied('authenticated_forged_service_claim');
reset role;

do $$ begin
  if pg_temp.order_insert_fixture_state() is distinct from (select value from pg_temp.original_fixture) then
    raise exception 'denied order inserts changed synthetic fixture state';
  end if;
end $$;

set local role service_role;
do $$ begin
  insert into public.orders (id, customer_name, phone, state, pay_state, total_cents)
  values ('MP06C-SERVICE-ORDER', 'MP06c service customer', '0917-000-0005', 'Payment review', 'unpaid', 1);
  if not exists (select 1 from public.orders where id = 'MP06C-SERVICE-ORDER'
      and customer_name = 'MP06c service customer' and phone = '0917-000-0005'
      and drop_id is null and state = 'Payment review' and pay_state = 'unpaid'
      and total_cents = 1 and packaging_cents = 0 and notes = '') then
    raise exception 'service order insert fixture differs';
  end if;
  insert into pg_temp.authority_results values ('orders_insert', 'service_role', 'low_total_exact_row');
  insert into public.order_items (id, order_id, product_id, qty, unit_price_cents)
  values ('a6c10000-0000-4000-8000-000000000002', 'MP06C-SERVICE-ORDER',
          'mp06c-order-insert-product', 1, 1);
  if not exists (select 1 from public.order_items where id = 'a6c10000-0000-4000-8000-000000000002'
      and order_id = 'MP06C-SERVICE-ORDER' and product_id = 'mp06c-order-insert-product'
      and qty = 1 and unit_price_cents = 1) then
    raise exception 'service order item insert fixture differs';
  end if;
  insert into pg_temp.authority_results values ('order_items_insert', 'service_role', 'low_price_exact_relationship');
end $$;
reset role;

do $$ declare relation_name text; actor text;
begin
  if pg_temp.order_insert_fixture_state() is not distinct from (select value from pg_temp.original_fixture)
     or (select count(*) from pg_temp.authority_results) <> 12 then
    raise exception 'service order inserts or result count differ';
  end if;
  foreach relation_name in array array['public.orders', 'public.order_items'] loop
    foreach actor in array array['anon', 'authenticated'] loop
      if has_table_privilege(actor, relation_name, 'INSERT')
         or has_any_column_privilege(actor, relation_name, 'INSERT') then
        raise exception 'effective order insert still granted: % / %', actor, relation_name;
      end if;
    end loop;
    if not has_table_privilege('service_role', relation_name, 'INSERT') then
      raise exception 'service order insert missing: %', relation_name;
    end if;
  end loop;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
