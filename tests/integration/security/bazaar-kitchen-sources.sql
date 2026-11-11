begin;
insert into auth.users(id) select ('a0830000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4)n;
insert into public.profiles(id,role,display_name,active) values
 ('a0830000-0000-4000-8000-000000000001','owner','Synthetic sources owner',true),
 ('a0830000-0000-4000-8000-000000000002','helper','Synthetic sources helper',true),
 ('a0830000-0000-4000-8000-000000000003','support','Synthetic sources support',true),
 ('a0830000-0000-4000-8000-000000000004','owner','Synthetic inactive sources owner',false);
insert into public.products(id,name,short_name,price_cents,item_type,kind) values
 ('p083-a','Synthetic source A','Source A',10000,'cookie','Permanent'),
 ('p083-b','Synthetic source B','Source B',10000,'cookie','Permanent');
insert into public.scheduled_events(id,name,starts_on,ends_on,place,rent_cents,active)
 select ('a0831000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic source fair '||n,current_date,current_date,'Fixture',0,true
 from generate_series(1,3)n;
insert into public.bazaar_kitchen_sources values
 ('a0831000-0000-4000-8000-000000000001','p083-a',5),
 ('a0831000-0000-4000-8000-000000000002','p083-b',6);
create temporary table source_before as select
 (select count(*) from public.production_records) as production,
 (select count(*) from public.stock_movements) as stock,
 (select count(*) from public.ledger_entries) as ledger,
 (select count(*) from public.audit_log) as audit;
create function pg_temp.source_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'kitchen source contract: %',label; end if; end $$;
create function pg_temp.source_refusal(booking uuid,wanted text) returns void language plpgsql security invoker as $$
declare actual text:='00000'; begin
 begin perform public.get_bazaar_kitchen_sources(booking);
 exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 perform pg_temp.source_assert(actual=wanted,'refusal expected '||wanted||', actual '||actual);
end $$;
grant execute on function pg_temp.source_assert(boolean,text),pg_temp.source_refusal(uuid,text) to anon,authenticated,service_role;
set local role authenticated;
set local request.jwt.claim.sub='a0830000-0000-4000-8000-000000000001';
select pg_temp.source_assert((select jsonb_agg(to_jsonb(x)) from public.get_bazaar_kitchen_sources('a0831000-0000-4000-8000-000000000001') x)
 ='[{"product_id":"p083-a","source_drop":5}]'::jsonb,'booking isolation');
select pg_temp.source_assert((select jsonb_agg(to_jsonb(x)) from public.get_bazaar_kitchen_sources('a0831000-0000-4000-8000-000000000002') x)
 ='[{"product_id":"p083-b","source_drop":6}]'::jsonb,'second source period');
select pg_temp.source_assert((select count(*)=0 from public.get_bazaar_kitchen_sources('a0831000-0000-4000-8000-000000000003')),'genuine unmarked booking');
select pg_temp.source_refusal(null,'22023');
select pg_temp.source_refusal('a0831000-0000-4000-8000-000000000009','P0002');
do $$ declare n integer; begin
 for n in 2..4 loop
  perform set_config('request.jwt.claim.sub','a0830000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
  perform pg_temp.source_refusal('a0831000-0000-4000-8000-000000000001','42501');
 end loop;
end $$;
reset role;
set local role anon;
select pg_temp.source_refusal('a0831000-0000-4000-8000-000000000001','42501');
reset role;
set local role service_role;
select pg_temp.source_refusal('a0831000-0000-4000-8000-000000000001','42501');
reset role;
select pg_temp.source_assert(not has_function_privilege('anon','public.get_bazaar_kitchen_sources(uuid)','EXECUTE')
 and not has_function_privilege('service_role','public.get_bazaar_kitchen_sources(uuid)','EXECUTE')
 and has_function_privilege('authenticated','public.get_bazaar_kitchen_sources(uuid)','EXECUTE'),'RPC grants');
select pg_temp.source_assert((select production=(select count(*) from public.production_records)
 and stock=(select count(*) from public.stock_movements) and ledger=(select count(*) from public.ledger_entries)
 and audit=(select count(*) from public.audit_log) from pg_temp.source_before),'read-only effects');
select 'KITCHEN_SOURCES|passed';
rollback;
