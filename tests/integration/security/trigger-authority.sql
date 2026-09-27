-- Table and function authority are tested separately; all DDL/data rolls back.
begin;
create temporary table authority_results(operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;
create function pg_temp.harmless_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
grant execute on function pg_temp.harmless_trigger() to anon, authenticated;
create temporary table trigger_target(updated_at timestamptz);
grant trigger on trigger_target to anon, authenticated;
create function pg_temp.assert_trigger_denied(actor text) returns void language plpgsql security invoker as $$
declare t text; f text;
begin
 foreach t in array array['audit_log','bake_batches','drops','erasure_requests','event_sale_items','event_sales','events','inventory_items','ledger_entries','order_items','orders','products','profiles','rate_limits','recipe_ingredients','recipes','settings','supplier_prices','suppliers'] loop
  begin
   execute format('create trigger mp06e_denied before update on public.%I for each row execute function pg_temp.harmless_trigger()',t);
   raise exception 'trigger table boundary missing: % / %',actor,t;
  exception when insufficient_privilege then
   insert into authority_results values('table_'||t,actor,'denied');
  end;
 end loop;
 foreach f in array array['touch_updated_at','settings_touch'] loop
  begin
   execute format('create trigger mp06e_function_denied before update on pg_temp.trigger_target for each row execute function public.%I()',f);
   raise exception 'trigger function boundary missing: % / %',actor,f;
  exception when insufficient_privilege then
   insert into authority_results values('function_'||f,actor,'denied');
  end;
 end loop;
end $$;
grant execute on function pg_temp.assert_trigger_denied(text) to anon, authenticated;
set local role anon;
select pg_temp.assert_trigger_denied('anon');
reset role;
set local role authenticated;
select pg_temp.assert_trigger_denied('authenticated');
reset role;
do $$ declare f regprocedure; r text; begin
 foreach f in array array['public.touch_updated_at()'::regprocedure,'public.settings_touch()'::regprocedure] loop
  foreach r in array array['anon','authenticated'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception 'unexpected trigger execute'; end if;
  end loop;
  if not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'trusted execute lost'; end if;
 end loop;
end $$;
insert into auth.users(id) values('a6e00000-0000-4000-8000-000000000001'),('a6e00000-0000-4000-8000-000000000002');
insert into public.profiles(id,role,display_name,active) values('a6e00000-0000-4000-8000-000000000001','owner','MP06e owner',true);
insert into public.products(id,name,short_name,price_cents,kind) values('MP06E-P','Synthetic','S',1,'cookie');
insert into public.orders(id,customer_name,phone,updated_at) values('MP06E-O','Synthetic','09170000000','2020-01-01');
insert into public.order_items(order_id,product_id,qty,unit_price_cents,updated_at) values('MP06E-O','MP06E-P',1,1,'2020-01-01');
insert into public.inventory_items(id,name,unit,updated_at) values('MP06E-I','MP06E-I','g','2020-01-01');
insert into public.bake_batches(product_id,planned_qty,updated_at) values('MP06E-P',1,'2020-01-01');
insert into public.drops(week_label,opens_at,closes_at,pickup_at,capacity,updated_at) values('MP06E-D',now(),now(),now(),1,'2020-01-01');
select set_config('request.jwt.claim.sub','a6e00000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare t text; n integer; begin
 foreach t in array array['orders','order_items','inventory_items','bake_batches','drops'] loop
  execute format('update public.%I set updated_at=%L',t,'2020-01-01');
  get diagnostics n=row_count;
  if n<>1 then raise exception 'positive fixture update count differs: %',t; end if;
  execute format('select count(*) from public.%I where updated_at=transaction_timestamp()',t) into n;
  if n<>1 then raise exception 'existing timestamp trigger did not fire: %',t; end if;
  insert into authority_results values('firing_'||t,'active_owner','passed');
 end loop;
end $$;
insert into public.settings(key,int_value,updated_at,updated_by) values('MP06E-S',1,'2020-01-01','a6e00000-0000-4000-8000-000000000002');
do $$ begin
 if not exists(select 1 from public.settings where key='MP06E-S' and updated_at=transaction_timestamp() and updated_by=auth.uid()) then raise exception 'settings insert trigger failed'; end if;
end $$;
insert into authority_results values('settings_insert','active_owner','passed');
update public.settings set int_value=2,updated_at='2020-01-01',updated_by='a6e00000-0000-4000-8000-000000000002' where key='MP06E-S';
do $$ begin
 if not exists(select 1 from public.settings where key='MP06E-S' and int_value=2 and updated_at=transaction_timestamp() and updated_by=auth.uid()) then raise exception 'settings update trigger failed'; end if;
end $$;
insert into authority_results values('settings_update','active_owner','passed');
reset role;
set local role service_role;
update public.settings set int_value=3,updated_at='2020-01-01' where key='MP06E-S';
do $$ begin
 if not exists(select 1 from public.settings where key='MP06E-S' and int_value=3 and updated_at=transaction_timestamp() and updated_by=auth.uid()) then raise exception 'service settings trigger failed'; end if;
end $$;
insert into authority_results values('settings_update','service_owner_context','passed');
reset role;
select 'SEC_RESULT|trigger|'||operation||'|'||actor||'|'||outcome from authority_results order by operation,actor;
rollback;
