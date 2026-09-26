-- Private operational data is owner-only. Every fixture and policy change rolls back.
begin;
__PRIVATE_RED_POLICY__
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id) select ('a6c21000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into public.profiles(id,role,display_name,active) values
  ('a6c21000-0000-4000-8000-000000000001','owner','Private active owner',true),
  ('a6c21000-0000-4000-8000-000000000002','helper','Private active helper',true),
  ('a6c21000-0000-4000-8000-000000000003','support','Private active support',true),
  ('a6c21000-0000-4000-8000-000000000004','owner','Private inactive owner',false);
insert into public.products(id,name,short_name,price_cents,kind) values
  ('mp06j-private-product','Private test product','MP06j',100,'cookie');
insert into public.recipes(product_id,yield_count) values ('mp06j-private-product',1);
insert into public.recipe_ingredients(id,product_id,item_name,qty,unit) values
  ('a6c21000-0000-4000-8000-000000000101','mp06j-private-product','Flour',1,'g');
insert into public.suppliers(id,name) values ('mp06j-private-supplier','Private supplier');
insert into public.supplier_prices(id,supplier_id,item_name,pack_label,price_cents) values
  ('a6c21000-0000-4000-8000-000000000102','mp06j-private-supplier','Flour','1 g',1);
insert into public.inventory_items(id,name,unit,on_hand,par_level,supplier_id) values
  ('mp06j-private-stock','Flour','g',1,1,'mp06j-private-supplier');
insert into public.orders(id,customer_name,phone,state,pay_state,total_cents) values
  ('MP06J-PRIVATE-ORDER','Private customer','09170000000','Payment review','unpaid',100);
insert into public.order_items(id,order_id,product_id,qty,unit_price_cents) values
  ('a6c21000-0000-4000-8000-000000000103','MP06J-PRIVATE-ORDER','mp06j-private-product',1,100);
insert into public.bake_batches(id,product_id,planned_qty) values
  ('a6c21000-0000-4000-8000-000000000104','mp06j-private-product',1);
insert into public.events(id,name,starts_at,float_cents) values
  ('a6c21000-0000-4000-8000-000000000105','Private event','2025-01-01 00:00+00',0);
insert into public.event_sales(id,client_id,event_id,gross_cents,total_cents,pay_method,sold_at) values
  ('a6c21000-0000-4000-8000-000000000106','mp06j-private-sale','a6c21000-0000-4000-8000-000000000105',100,100,'cash','2025-01-01 00:00+00');
insert into public.event_sale_items(id,sale_id,product_id,qty,unit_price_cents) values
  ('a6c21000-0000-4000-8000-000000000107','a6c21000-0000-4000-8000-000000000106','mp06j-private-product',1,100);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else 'a6c21000-0000-4000-8000-'||lpad(n::text,12,'0') end;
begin
  perform set_config('request.jwt.claim.sub',subject,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role',claim_role,'app_role','owner')::text,true);
end $$;
create function pg_temp.private_state() returns jsonb language sql security invoker as $$
  select jsonb_build_object('recipes',(select jsonb_agg(t) from public.recipes t),'recipe_ingredients',(select jsonb_agg(t) from public.recipe_ingredients t),'suppliers',(select jsonb_agg(t) from public.suppliers t),'supplier_prices',(select jsonb_agg(t) from public.supplier_prices t),'inventory_items',(select jsonb_agg(t) from public.inventory_items t),'orders',(select jsonb_agg(t) from public.orders t),'order_items',(select jsonb_agg(t) from public.order_items t),'bake_batches',(select jsonb_agg(t) from public.bake_batches t),'events',(select jsonb_agg(t) from public.events t),'event_sales',(select jsonb_agg(t) from public.event_sales t),'event_sale_items',(select jsonb_agg(t) from public.event_sale_items t))
$$;
create temporary table original_fixture as select pg_temp.private_state() as value;
create function pg_temp.assert_private_reads(actor text, expected integer) returns void
language plpgsql security invoker as $$
declare relation text; visible integer;
begin
  foreach relation in array array['recipes','recipe_ingredients','suppliers','supplier_prices','inventory_items','orders','order_items','bake_batches','events','event_sales','event_sale_items'] loop
    execute format('select count(*) from public.%I',relation) into visible;
    if visible <> expected then raise exception 'private read differs: % / % / %',actor,relation,visible; end if;
    insert into pg_temp.authority_results values('private_select',actor,relation||'=exact_'||visible);
  end loop;
end $$;
create function pg_temp.assert_private_updates(actor text) returns void
language plpgsql security invoker as $$
declare relation text; statement text; changed integer;
begin
  foreach relation in array array['inventory_items','orders','order_items','bake_batches'] loop
    statement := case relation when 'inventory_items' then 'update public.inventory_items set on_hand=99'
      when 'orders' then 'update public.orders set notes=''denied'''
      when 'order_items' then 'update public.order_items set qty=2'
      else 'update public.bake_batches set baked_qty=1' end;
    execute statement; get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'private update succeeded: % / % / %',actor,relation,changed; end if;
    insert into pg_temp.authority_results values('private_update',actor,relation||'=zero_rows');
  end loop;
end $$;
create function pg_temp.assert_private_insert_denied(actor text) returns void
language plpgsql security invoker as $$
declare operation text; statement text; state text;
begin
  foreach operation in array array['bake_batches','event_sales','event_sale_items'] loop
    statement := case operation
      when 'bake_batches' then 'insert into public.bake_batches(product_id,planned_qty) values (''mp06j-private-product'',1)'
      when 'event_sales' then 'insert into public.event_sales(client_id,event_id,gross_cents,total_cents,pay_method,sold_at) values (''mp06j-denied-'||actor||''',''a6c21000-0000-4000-8000-000000000105'',1,1,''cash'',''2025-01-01 00:00+00'')'
      else 'insert into public.event_sale_items(sale_id,product_id,qty,unit_price_cents) values (''a6c21000-0000-4000-8000-000000000106'',''mp06j-private-product'',1,1)' end;
    begin
      execute statement; raise exception 'private insert succeeded: % / %',actor,operation;
    exception when insufficient_privilege then
      get stacked diagnostics state = returned_sqlstate;
      if state <> '42501' then raise exception 'private insert SQLSTATE differs: % / % / %',actor,operation,state; end if;
      insert into pg_temp.authority_results values('private_insert',actor,operation||'=denied_42501');
    end;
  end loop;
end $$;
grant execute on function pg_temp.set_subject(integer,text), pg_temp.assert_private_reads(text,integer), pg_temp.assert_private_updates(text), pg_temp.assert_private_insert_denied(text) to anon, authenticated, service_role;

set local role authenticated;
select pg_temp.set_subject(2); select pg_temp.assert_private_reads('active_helper',0);
__PRIVATE_RED_UPDATE_POLICY__
select pg_temp.assert_private_updates('active_helper'); select pg_temp.assert_private_insert_denied('active_helper');
select pg_temp.set_subject(3); select pg_temp.assert_private_reads('active_support',0); select pg_temp.assert_private_updates('active_support'); select pg_temp.assert_private_insert_denied('active_support');
select pg_temp.set_subject(null); select pg_temp.assert_private_reads('no_subject',0);
select pg_temp.set_subject(5); select pg_temp.assert_private_reads('missing_profile',0);
select pg_temp.set_subject(4,'service_role'); select pg_temp.assert_private_reads('inactive_owner_forged_service',0);
select pg_temp.set_subject(1); select pg_temp.assert_private_reads('active_owner',1);
reset role;
set local role anon;
select pg_temp.set_subject(null,'anon'); select pg_temp.assert_private_reads('anonymous',0);
reset role;
set local role service_role;
select pg_temp.set_subject(null,'service_role'); select pg_temp.assert_private_reads('service_role',1);
reset role;
do $$ begin
  if (select value from pg_temp.original_fixture) is distinct from pg_temp.private_state() then raise exception 'private fixture changed after denials'; end if;
  if (select count(*) from pg_temp.authority_results) <> 102 then raise exception 'private authority result count differs'; end if;
  insert into pg_temp.authority_results values('private_fixture','preserved','all_rows');
end $$;
select 'SEC_RESULT|'||operation||'|'||actor||'|'||outcome from pg_temp.authority_results order by operation,actor,outcome;
rollback;
