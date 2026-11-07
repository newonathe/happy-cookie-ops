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
 values ('b0753000-0000-4000-8000-000000000001','batch','p075-cookie',6,6,5,date_trunc('milliseconds',now()),repeat('0',64),auth.uid());
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
insert into public.bazaar_day_lines(day_id,product_id,made_qty,carried_qty,price_cents) values ('b0752000-0000-4000-8000-000000000001','p075-cookie',0,0,10000);
create function pg_temp.transfer_body() returns jsonb language sql stable as $$
 select jsonb_build_object('id','b0764000-0000-4000-8000-000000000001',
  'day_id','b0752000-0000-4000-8000-000000000001','product_id','p075-cookie',
  'source_drop',5,'qty',4,'at',(extract(epoch from now())*1000)::bigint)
$$;
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock('[]')$q$,'22023');
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body()||'{"qty":1.5}')$q$,'22023');
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body()||'{"extra":1}')$q$,'22023');
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body()||'{"source_drop":6}')$q$,'ZB001');
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body()||
 jsonb_build_object('at',(extract(epoch from now()-interval '1 hour')*1000)::bigint))$q$,'ZB003');
select pg_temp.journal_assert(not exists(select 1 from public.bazaar_kitchen_sources),'refusals publish no source');
select pg_temp.journal_assert(public.kitchen_cookie_balance('p075-cookie',5)=6,'refusals leave physical stock');
do $$ declare ack jsonb; replay jsonb; begin
 ack:=public.transfer_bazaar_stock(pg_temp.transfer_body());
 replay:=public.transfer_bazaar_stock(pg_temp.transfer_body());
 perform pg_temp.journal_assert(ack->>'kitchen_remaining'='2' and ack->>'day_total'='4' and ack->>'duplicate'='false','exact acknowledgement');
 perform pg_temp.journal_assert(ack-'duplicate'=replay-'duplicate' and replay->>'duplicate'='true','stored replay facts');
 perform pg_temp.journal_assert(ack->'source_records'='["b0753000-0000-4000-8000-000000000001"]','pool provenance');
end $$;
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body()||'{"qty":3}')$q$,'23505');
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body()||
 '{"id":"b0764000-0000-4000-8000-000000000002","source_drop":6}')$q$,'ZB002');
select pg_temp.journal_refuses($q$update public.bazaar_day_lines set product_id='c1' where product_id='p075-cookie'$q$,'ZB002');
select pg_temp.journal_refuses($q$update public.bazaar_day_lines set made_qty=5 where product_id='p075-cookie'$q$,'ZB002');
select pg_temp.journal_refuses($q$delete from public.bazaar_day_lines where product_id='p075-cookie'$q$,'ZB002');
select public.start_bazaar_day('b0752000-0000-4000-8000-000000000001','p076-device','b0767000-0000-4000-8000-000000000001');
select pg_temp.journal_refuses($q$select public.add_bazaar_day_stock('b0752000-0000-4000-8000-000000000001','p075-cookie',1,'made',
 'b0768000-0000-4000-8000-000000000001')$q$,'ZB002');
select public.transfer_bazaar_stock(pg_temp.transfer_body()||'{"id":"b0764000-0000-4000-8000-000000000002","qty":1}');
select pg_temp.journal_assert((select loaded->>'p075-cookie'='5' from public.events
 where id='b0767000-0000-4000-8000-000000000001'),'open till load matches transfer');
update public.scheduled_events set active=false where id='b0751000-0000-4000-8000-000000000001';
select pg_temp.journal_assert(public.transfer_bazaar_stock(pg_temp.transfer_body())->>'duplicate'='true','replay after booking changes');
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body()||
 '{"id":"b0764000-0000-4000-8000-000000000003","qty":1}')$q$,'55000');
update public.profiles set active=false where id=auth.uid();
select pg_temp.journal_refuses($q$select public.transfer_bazaar_stock(pg_temp.transfer_body())$q$,'42501');
select 'KITCHEN_TRANSFER|passed';
rollback;
