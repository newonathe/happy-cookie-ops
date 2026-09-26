-- Temporary objects must not override trusted public data inside functions.
begin;
insert into auth.users(id) values('a6f80000-0000-4000-8000-000000000001');
insert into public.profiles(id,role,display_name,active) values('a6f80000-0000-4000-8000-000000000001','owner','MP06h',true);
insert into public.products(id,name,short_name,price_cents,kind) values('MP06H-P','Synthetic','S',100,'cookie');
insert into public.drops(id,week_label,opens_at,closes_at,pickup_at,capacity)
 values('a6f80000-0000-4000-8000-000000000002','MP06H',now(),now(),now(),10);
insert into public.orders(id,drop_id,customer_name,phone,state,total_cents)
 values('MP06H-O','a6f80000-0000-4000-8000-000000000002','Trusted','09170000001','Confirmed',300);
insert into public.order_items(order_id,product_id,qty,unit_price_cents) values('MP06H-O','MP06H-P',3,100);
insert into public.settings(key,int_value) values('capacity',17);
create temporary table orders as select * from public.orders;
create temporary table drops as select * from public.drops;
create temporary table order_items as select * from public.order_items;
create temporary table settings as select * from public.settings;
create temporary table profiles as select * from public.profiles;
update pg_temp.orders set customer_name='Shadow';
update pg_temp.drops set capacity=999;
update pg_temp.settings set int_value=999;
update pg_temp.profiles set role='support';
grant select on pg_temp.orders,pg_temp.drops,pg_temp.order_items,pg_temp.settings,pg_temp.profiles to service_role,authenticated;
select set_config('request.jwt.claim.sub','a6f80000-0000-4000-8000-000000000001',true);
set local role service_role;
do $$ declare n text; c integer; begin
 select customer_name into n from public.lookup_order('MP06H-O','09170000001');
 if n is distinct from 'Trusted' then raise exception 'search path shadow: lookup_order'; end if;
 select public.drop_remaining('a6f80000-0000-4000-8000-000000000002') into c;
 if c is distinct from 7 then raise exception 'search path shadow: drop_remaining'; end if;
 select int_value into c from public.settings_effective() where key='capacity';
 if c is distinct from 17 then raise exception 'search path shadow: settings_effective'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 if public.current_role_name() is distinct from 'owner' or not public.is_owner() or not public.is_staff() then
  raise exception 'search path shadow: role helpers';
 end if;
end $$;
reset role;
-- Test configs after behavior, so a red probe cannot fail only a static assertion.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_schema_privilege(r,'public','CREATE') then raise exception 'public schema is writable by API role'; end if;
 end loop;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname<>'current_role_name'
     and proconfig=array['search_path=pg_catalog, public, pg_temp'])<>16 then raise exception 'function search path inventory differs'; end if;
 if (select proconfig from pg_proc where oid='public.current_role_name()'::regprocedure)<>array['search_path=""'] then
  raise exception 'qualified role lookup changed';
 end if;
end $$;
select 'SEC_RESULT|search_path|'||name||'|passed' from unnest(array['lookup_order','drop_remaining','settings_effective','role_helpers','config_inventory']) name;
rollback;
