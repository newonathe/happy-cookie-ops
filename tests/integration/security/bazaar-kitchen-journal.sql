-- Private foundation, before any client transfer writer is enabled.
begin;
insert into auth.users(id) values ('b0750000-0000-4000-8000-000000000001');
insert into public.profiles(id,role,display_name,active)
 values ('b0750000-0000-4000-8000-000000000001','owner','Synthetic journal owner',true);
set local request.jwt.claim.sub='b0750000-0000-4000-8000-000000000001';
insert into public.products(id,name,short_name,price_cents,item_type,kind)
 values ('p075-cookie','Synthetic journal cookie','Journal cookie',10000,'cookie','Permanent');
insert into public.scheduled_events(id,name,starts_on,ends_on,place,rent_cents,active)
 values ('b0751000-0000-4000-8000-000000000001','Synthetic journal fair',current_date,current_date,'Fixture',0,true);
insert into public.bazaar_days(id,scheduled_id,day,plan_hash)
 values ('b0752000-0000-4000-8000-000000000001','b0751000-0000-4000-8000-000000000001',current_date,repeat('0',64));
insert into public.production_records(id,kind,product_id,qty,target,drop_no,at,payload_hash,created_by)
 values ('b0753000-0000-4000-8000-000000000001','batch','p075-cookie',6,6,5,now(),repeat('0',64),auth.uid());
insert into public.orders(id,customer_name,phone) values ('P075-PACK','Synthetic packing','09170000001');
insert into public.order_items(order_id,product_id,qty,unit_price_cents) values ('P075-PACK','p075-cookie',3,10000);
create function pg_temp.journal_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'journal contract: %',label; end if; end $$;
create function pg_temp.journal_refuses(statement text, wanted text) returns void language plpgsql as $$
declare actual text := '00000';
begin
 begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 perform pg_temp.journal_assert(actual=wanted,statement||' returned '||actual||', expected '||wanted);
end $$;
select pg_temp.journal_assert(public.get_production(5)=public.get_production_before_transfers(5),'legacy output unchanged');
insert into public.bazaar_kitchen_sources values ('b0751000-0000-4000-8000-000000000001','p075-cookie',5);
insert into public.bazaar_kitchen_moves
 values ('b0754000-0000-4000-8000-000000000001','b0751000-0000-4000-8000-000000000001','p075-cookie',
 'b0752000-0000-4000-8000-000000000001','transfer',-4,now(),'{}','{}','["b0753000-0000-4000-8000-000000000001"]',auth.uid());
select pg_temp.journal_assert(public.kitchen_cookie_balance('p075-cookie',5)=2,'journal debit');
select pg_temp.journal_assert(public.kitchen_cookie_balance('p075-cookie',6)=0,'period isolation');
select pg_temp.journal_assert(public.get_production(5)-'baked'=public.get_production_before_transfers(5)-'baked','batch costs and dough unchanged');
select pg_temp.journal_assert((select (x->>'qty')::integer=2 from jsonb_array_elements(public.get_production(5)->'baked') x
 where x->>'product_id'='p075-cookie'),'read balance includes transfers');
select pg_temp.journal_refuses($q$select public.record_pack('P075-PACK',5)$q$,'ZB001');
select pg_temp.journal_refuses($q$select public.record_discard(jsonb_build_object('id','b0755000-0000-4000-8000-000000000001',
 'kind','baked','product_id','p075-cookie','qty',3,'reason','Synthetic waste','drop_no',5,'at',(extract(epoch from now())*1000)::bigint))$q$,'ZB001');
select pg_temp.journal_refuses($q$select public.record_batch_correction(jsonb_build_object('id','b0756000-0000-4000-8000-000000000001',
 'batch_id','b0753000-0000-4000-8000-000000000001','qty',1,'rejects',0,'reason','Synthetic correction',
 'at',(extract(epoch from now())*1000)::bigint))$q$,'ZB001');
select pg_temp.journal_assert(public.kitchen_cookie_balance('p075-cookie',5)=2,'refusals have no effects');
insert into public.bazaar_kitchen_moves
 values ('b0754000-0000-4000-8000-000000000002','b0751000-0000-4000-8000-000000000001','p075-cookie',
 'b0752000-0000-4000-8000-000000000001','return',1,now(),'{}','{}','[]',auth.uid());
select pg_temp.journal_assert(public.kitchen_cookie_balance('p075-cookie',5)=3,'return credits original pool');
select pg_temp.journal_refuses($q$insert into public.bazaar_kitchen_moves
 select 'b0754000-0000-4000-8000-000000000003',scheduled_id,product_id,day_id,'return',4,at,request,acknowledgement,source_records,created_by
 from public.bazaar_kitchen_moves limit 1$q$,'22023');
select pg_temp.journal_refuses($q$insert into public.bazaar_kitchen_moves
 select 'b0754000-0000-4000-8000-000000000003',scheduled_id,product_id,day_id,'transfer',-4,at,request,acknowledgement,source_records,created_by
 from public.bazaar_kitchen_moves limit 1$q$,'ZB001');
select pg_temp.journal_refuses($q$update public.bazaar_kitchen_moves set qty_delta=-1 where kind='transfer'$q$,'55000');
select pg_temp.journal_refuses($q$delete from public.bazaar_kitchen_moves$q$,'55000');
select pg_temp.journal_refuses($q$update public.bazaar_kitchen_sources set source_drop=6$q$,'55000');
select pg_temp.journal_refuses($q$delete from public.bazaar_kitchen_sources$q$,'55000');
select public.record_pack('P075-PACK',5);
select public.record_pack('P075-PACK',5);
select pg_temp.journal_assert(public.kitchen_cookie_balance('p075-cookie',5)=0,'packing consumes available stock once');
select pg_temp.journal_assert(not exists(select 1 from jsonb_array_elements(public.get_production(5)->'baked') x
 where x->>'product_id'='p075-cookie'),'spent stock omitted');
do $$ declare role_name text; operation text; relation text; begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  foreach operation in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
   foreach relation in array array['bazaar_kitchen_sources','bazaar_kitchen_moves'] loop
    perform pg_temp.journal_assert(not has_table_privilege(role_name,'public.'||relation,operation),role_name||' table access');
   end loop;
  end loop;
  foreach operation in array array['kitchen_cookie_balance(text,integer)','guard_kitchen_journal()',
   'guard_kitchen_cookie_spend()','get_production_before_transfers(integer)'] loop
   perform pg_temp.journal_assert(not has_function_privilege(role_name,'public.'||operation,'EXECUTE'),role_name||' private helper');
  end loop;
 end loop;
 perform pg_temp.journal_assert((select bool_and(c.relrowsecurity) from pg_class c where c.oid in
 ('public.bazaar_kitchen_sources'::regclass,'public.bazaar_kitchen_moves'::regclass)),'journal RLS');
end $$;
select 'KITCHEN_JOURNAL|passed';
rollback;
