-- Connected synthetic/local regression: prepare 250 g / 13 balls -> bake 8 / 2 rejects
-- -> transfer 4 good cookies -> sell 3 -> return 1 -> stock and used-basis Money.
-- Historical Bazaar-only assertions remain in bazaar-days.sql, unchanged.
begin;
create temporary table p0_checks(label text, ok boolean, detail jsonb);
create temporary table p0_values(name text primary key, value jsonb);
insert into auth.users(id) values ('b0740000-0000-4000-8000-000000000001');
insert into public.profiles(id,role,display_name,active)
 values ('b0740000-0000-4000-8000-000000000001','owner','Synthetic transfer owner',true);
insert into auth.users(id) select ('b0740000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(2,4)n;
insert into public.profiles(id,role,display_name,active) values
 ('b0740000-0000-4000-8000-000000000002','helper','Synthetic helper',true),
 ('b0740000-0000-4000-8000-000000000003','support','Synthetic support',true),
 ('b0740000-0000-4000-8000-000000000004','owner','Synthetic inactive owner',false);
insert into public.products(id,name,short_name,price_cents,item_type,kind)
 values ('p074-cookie','Synthetic transfer cookie','Transfer cookie',10000,'cookie','Permanent');
insert into public.inventory_items(id,name,unit,category,active,on_hand,avg_cost)
 values ('p074-flour','Synthetic transfer flour','g','Ingredients',true,2000,2);
insert into public.recipes(product_id,yield_count) values ('p074-cookie',12);
insert into public.recipe_versions(product_id,version,yield_count,lines)
 values ('p074-cookie',1,12,'[{"name":"Synthetic transfer flour","qty":250,"unit":"g","kind":"ingredient"}]'::jsonb);
insert into public.recipe_ingredients(product_id,item_name,qty,unit,position,kind,item_id)
 values ('p074-cookie','Synthetic transfer flour',250,'g',0,'ingredient','p074-flour');
insert into public.scheduled_events(id,name,starts_on,ends_on,place,rent_cents,active)
 values ('b0741000-0000-4000-8000-000000000001','Synthetic transfer fair',current_date,current_date,'Fixture',0,true);
update public.books_settings set cost_basis='used',used_from=now()-interval '1 day' where id;
create function pg_temp.p0_mark(label text, ok boolean, detail jsonb default '{}'::jsonb)
returns void language sql security definer as $$ insert into pg_temp.p0_checks values(label,ok,detail) $$;
create function pg_temp.p0_baked() returns integer language sql stable security invoker as $$
 select coalesce((select (x->>'qty')::integer from jsonb_array_elements(public.get_production(5)->'baked') x
                  where x->>'product_id'='p074-cookie'),0)
$$;
create function pg_temp.p0_transfer(body jsonb) returns void language plpgsql security invoker as $$
begin perform public.transfer_bazaar_stock(body); end
$$;
create function pg_temp.p0_body() returns jsonb language sql stable as $$
 select jsonb_build_object('id','b0744000-0000-4000-8000-000000000001',
  'day_id','b0742000-0000-4000-8000-000000000001','product_id','p074-cookie',
  'source_drop',5,'qty',4,'at',floor(extract(epoch from now())*1000)::bigint)
$$;
grant execute on function pg_temp.p0_mark(text,boolean,jsonb),pg_temp.p0_baked(),
 pg_temp.p0_transfer(jsonb),pg_temp.p0_body() to authenticated;
create function pg_temp.p0_extra_day(n integer, leftovers integer, carry boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare book uuid:=('b0741000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 day_id uuid:=('b0742000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 event_id uuid:=('b0743000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
 device text:='p0-extra-'||n; summary jsonb; closing jsonb; h text;
begin
 insert into public.scheduled_events(id,name,starts_on,ends_on,place,rent_cents,active)
  values(book,'Synthetic extra fair '||n,current_date,current_date+case when carry then 1 else 0 end,'Fixture',0,true);
 perform public.save_bazaar_day(jsonb_build_object('id',day_id,'scheduled_id',book,'day',current_date::text,'float_cents',0,
  'lines','[{"product_id":"p074-cookie","made_qty":0,"carried_qty":0,"price_cents":10000}]'::jsonb),null);
 perform public.save_bazaar_cost(book,'p074-cookie',1000);
 perform public.transfer_bazaar_stock(pg_temp.p0_body()||jsonb_build_object('id',
  'b0744000-0000-4000-8000-'||lpad(n::text,12,'0'),'day_id',day_id,'qty',2));
 perform public.start_bazaar_day(day_id,device,event_id);
 perform public.record_event_sale(jsonb_build_object('clientId',device||':sale:1','deviceId',device,'eventId',event_id,
  'items',jsonb_build_object('p074-cookie',2-leftovers),'discountCents',0,'totalCents',(2-leftovers)*10000,
  'pay','Cash','ref','','clerk','Synthetic owner','at',floor(extract(epoch from now())*1000)::bigint,
  'tenderedCents',(2-leftovers)*10000,'changeCents',0));
 summary:=public.get_bazaar(book)->'summary';
 select x->>'hash' into h from jsonb_array_elements(summary->'days') x where x->>'id'=day_id::text;
 closing:=jsonb_build_object('day_id',day_id,'at',floor(extract(epoch from now())*1000)::bigint+60000,
  'counted_cents',(2-leftovers)*10000,'lines',jsonb_build_object('p074-cookie',jsonb_build_object('left',leftovers,
  'carry_next',case when carry then leftovers else 0 end,'to_shop',case when carry then 0 else leftovers end,'written_off',0)),
  'expected',h,'sales_count',1,'cash_cents',(2-leftovers)*10000);
 perform public.close_bazaar_day(closing);
 if carry and pg_temp.p0_baked()<>1 then raise exception 'carry counted as a kitchen return'; end if;
 summary:=public.get_bazaar(book)->'summary';
 h:=summary->>'hash';
 summary:=public.finalise_bazaar(book,h,5,null,case when carry then '{"p074-cookie":{"to_shop":1,"written_off":0}}'::jsonb else null end);
 perform public.finalise_bazaar(book,h,5,null,case when carry then '{"p074-cookie":{"to_shop":1,"written_off":0}}'::jsonb else null end);
 return summary;
end $$;
grant execute on function pg_temp.p0_extra_day(integer,integer,boolean) to authenticated;
set local role authenticated;
set local request.jwt.claim.sub='b0740000-0000-4000-8000-000000000001';
do $$ declare n integer; code text; begin
 for n in 2..4 loop
  perform set_config('request.jwt.claim.sub','b0740000-0000-4000-8000-'||lpad(n::text,12,'0'),true); code:='00000';
  begin perform public.transfer_bazaar_stock(pg_temp.p0_body());
  exception when others then get stacked diagnostics code=returned_sqlstate; end;
  perform pg_temp.p0_mark('transfer role refusal '||n,code='42501',jsonb_build_object('sqlstate',code));
 end loop;
 perform set_config('request.jwt.claim.sub','b0740000-0000-4000-8000-000000000001',true);
end $$;
select public.record_dough_preparation(jsonb_build_object('id','b0745000-0000-4000-8000-000000000001',
 'product_id','p074-cookie','recipe_version',1,'recipe_amount',1,'balls',13,'drop_no',5,
 'at',floor(extract(epoch from now())*1000)::bigint));
select public.record_bake(jsonb_build_object('id','b0746000-0000-4000-8000-000000000001',
 'product_id','p074-cookie','recipe_version',1,'qty',8,'target',8,'rejects',2,'drop_no',5,
 'at',floor(extract(epoch from now())*1000)::bigint));
select public.save_bazaar_day(jsonb_build_object('id','b0742000-0000-4000-8000-000000000001',
 'scheduled_id','b0741000-0000-4000-8000-000000000001','day',current_date::text,'float_cents',0,
 'lines',jsonb_build_array(jsonb_build_object('product_id','p074-cookie','made_qty',0,'carried_qty',0,'price_cents',10000))),null);
select public.save_bazaar_cost('b0741000-0000-4000-8000-000000000001','p074-cookie',1000);
select pg_temp.p0_transfer(pg_temp.p0_body());
select public.start_bazaar_day('b0742000-0000-4000-8000-000000000001','p0-device','b0743000-0000-4000-8000-000000000001');
select pg_temp.p0_mark('transfer debits kitchen once',pg_temp.p0_baked()=2,jsonb_build_object('kitchen',pg_temp.p0_baked()));
select pg_temp.p0_transfer(pg_temp.p0_body());
select pg_temp.p0_mark('identical transfer replay does not debit again',pg_temp.p0_baked()=2,jsonb_build_object('kitchen',pg_temp.p0_baked()));
do $$ declare code text:='00000'; begin
 begin perform pg_temp.p0_transfer(pg_temp.p0_body()||'{"qty":3}');
 exception when others then get stacked diagnostics code=returned_sqlstate; end;
 perform pg_temp.p0_mark('changed transfer body is refused',code='23505',jsonb_build_object('sqlstate',code));
end $$;
do $$ declare sale jsonb; closing jsonb; summary jsonb; h text; books jsonb; begin
 sale:=jsonb_build_object('clientId','p0-device:sale:1','deviceId','p0-device',
  'eventId','b0743000-0000-4000-8000-000000000001','items','{"p074-cookie":3}'::jsonb,
  'discountCents',0,'totalCents',30000,'pay','Cash','ref','','clerk','Synthetic owner',
  'at',floor(extract(epoch from now())*1000)::bigint,'tenderedCents',30000,'changeCents',0);
 perform public.record_event_sale(sale);
 perform public.record_event_sale(sale);
 books:=public.get_books(now()-interval '2 days',now()+interval '2 days');
 perform pg_temp.p0_mark('unfinalised revenue remains held',exists(select 1 from jsonb_array_elements(books->'held') x
  where x->>'scheduled_id'='b0741000-0000-4000-8000-000000000001' and (x->>'revenue_cents')::bigint=30000));
 summary:=public.get_bazaar('b0741000-0000-4000-8000-000000000001')->'summary';
 select x->>'hash' into h from jsonb_array_elements(summary->'days') x
  where x->>'id'='b0742000-0000-4000-8000-000000000001';
 closing:=jsonb_build_object('day_id','b0742000-0000-4000-8000-000000000001',
  'at',floor(extract(epoch from now())*1000)::bigint+60000,'counted_cents',30000,
  'lines','{"p074-cookie":{"left":1,"carry_next":0,"to_shop":1,"written_off":0}}'::jsonb,
  'expected',h,'sales_count',1,'cash_cents',30000);
 perform public.close_bazaar_day(closing);
 perform public.close_bazaar_day(closing);
 perform pg_temp.p0_mark('day close returns exactly one cookie before finalization',pg_temp.p0_baked()=3);
 perform pg_temp.p0_transfer(pg_temp.p0_body());
 perform pg_temp.p0_mark('transfer replay after close has no new debit',pg_temp.p0_baked()=3);
 summary:=public.get_bazaar('b0741000-0000-4000-8000-000000000001')->'summary';
 h:=summary->>'hash';
 summary:=public.finalise_bazaar('b0741000-0000-4000-8000-000000000001',h,5,null);
 perform public.finalise_bazaar('b0741000-0000-4000-8000-000000000001',h,5,null);
 perform pg_temp.p0_mark('typed Bazaar costing remains unchanged',
  (summary->'cookie_cost'->>'cents')::bigint=3000,summary->'cookie_cost');
 perform pg_temp.p0_mark('two never transferred plus one returned remain',pg_temp.p0_baked()=3,
  jsonb_build_object('kitchen',pg_temp.p0_baked()));
end $$;
-- Isolate the reversal story so its server timestamp cannot affect other stories.
savepoint reversal_case;
select pg_temp.p0_extra_day(2,0,false);
select public.reverse_bazaar_test('b0741000-0000-4000-8000-000000000002','Synthetic extra fair 2');
select public.reverse_bazaar_test('b0741000-0000-4000-8000-000000000002','Synthetic extra fair 2');
reset role;
do $$ declare revenue bigint; begin
 select coalesce(sum((x->>'amount_cents')::bigint),0) into revenue
  from jsonb_array_elements(public.get_books(now()-interval '2 days',now()+interval '2 days')->'lines') x
  where x->>'kind'='revenue' and x->>'id' in (
   select 'l:'||l.id::text from public.ledger_entries l join public.event_sales e on e.id=l.sale_id
    join public.bazaar_days d on d.event_id=e.event_id where d.scheduled_id='b0741000-0000-4000-8000-000000000002'
   union select 'l:'||md5('reverse:'||l.id::text)::uuid::text from public.ledger_entries l join public.event_sales e on e.id=l.sale_id
    join public.bazaar_days d on d.event_id=e.event_id where d.scheduled_id='b0741000-0000-4000-8000-000000000002');
 if pg_temp.p0_baked()<>3 or revenue<>0 then raise exception 'test reversal duplicated kitchen or Money effects'; end if;
end $$;
rollback to reversal_case;
reset role;
insert into p0_values values('production',public.get_production(5)),
 ('books',public.get_books(now()-interval '2 days',now()+interval '2 days'));
insert into p0_checks
 select 'ingredients deducted exactly once',on_hand=1750,jsonb_build_object('on_hand',on_hand)
 from public.inventory_items where id='p074-flour';
insert into p0_checks
 select 'one ingredient use movement',count(*)=1,jsonb_build_object('movements',count(*),'used',-sum(qty_delta))
 from public.stock_movements where item_id='p074-flour' and kind='use';
insert into p0_checks
 select 'return creates no phantom production',count(*)=2 and count(*) filter(where kind='batch')=1,
  jsonb_build_object('records',count(*),'batches',count(*) filter(where kind='batch'))
 from public.production_records where product_id='p074-cookie';
insert into p0_checks
 select 'five refrigerated dough balls remain',sum(case kind when 'dough' then qty else -dough_used end)=5,'{}'
 from public.production_records where product_id='p074-cookie' and kind in ('dough','batch');
insert into p0_checks
 select 'one sale despite retry',count(*)=1,'{}' from public.event_sales where client_id='p0-device:sale:1';
insert into p0_checks
 select 'used-basis books charge the original ingredient use once',coalesce(sum((x->>'amount_cents')::bigint),0)=500,
  jsonb_build_object('ingredient_expense',coalesce(sum((x->>'amount_cents')::bigint),0))
 from p0_values b cross join lateral jsonb_array_elements(b.value->'lines') x
 where b.name='books' and x->>'kind'='expense' and x->>'id' in
  (select 'm:'||id::text from public.stock_movements where item_id='p074-flour');
insert into p0_checks
 select 'finalized sales and test reversal reconcile to 30000 revenue',coalesce(sum((x->>'amount_cents')::bigint),0)=30000,
  jsonb_build_object('revenue',coalesce(sum((x->>'amount_cents')::bigint),0))
 from p0_values b cross join lateral jsonb_array_elements(b.value->'lines') x
 where b.name='books' and x->>'kind'='revenue' and x->>'id' in
  (select 'l:'||z.id::text from (
    select l.id from public.ledger_entries l join public.event_sales e on e.id=l.sale_id
     join public.bazaar_days d on d.event_id=e.event_id where d.scheduled_id in
      ('b0741000-0000-4000-8000-000000000001','b0741000-0000-4000-8000-000000000002')
    union select md5('reverse:'||l.id::text)::uuid from public.ledger_entries l join public.event_sales e on e.id=l.sale_id
     join public.bazaar_days d on d.event_id=e.event_id where d.scheduled_id='b0741000-0000-4000-8000-000000000002'
   ) z);
select label,ok,detail from p0_checks order by label;
do $$ declare failures jsonb; begin
 select jsonb_agg(jsonb_build_object('check',label,'actual',detail)) into failures from p0_checks where ok is not true;
 if failures is not null then raise exception 'P0 Make/Bazaar connected regression: %',failures; end if;
end $$;
savepoint packaging_case;
insert into public.inventory_items(id,name,unit,category,active,on_hand,avg_cost) values
 ('p074-pouch','Synthetic pouch','pcs','Packaging',true,20,3),('p074-container','Synthetic container','pcs','Packaging',true,20,5);
insert into public.recipe_ingredients(product_id,item_name,qty,unit,position,kind,item_id)
 values('p074-cookie','Synthetic pouch',1,'pcs',1,'packaging','p074-pouch');
insert into public.packaging_rules(container,item_id,qty,per,position) values('bazaar_sale','p074-container',1,'container',1);
select pg_temp.p0_extra_day(3,1,false);
do $$ begin
 if pg_temp.p0_baked()<>2 or (select on_hand<>1750 from public.inventory_items where id='p074-flour')
  or (select count(*)<>2 or bool_or(on_hand<>19) from public.inventory_items where id in('p074-pouch','p074-container'))
  or (select count(*)<>2 or count(unit_cost)<>2 or sum(-qty_delta*unit_cost)<>8 or bool_or(qty_delta<>-1) from public.stock_movements where item_id in('p074-pouch','p074-container'))
  or (select coalesce(sum((x->>'amount_cents')::bigint),0)<>8 from jsonb_array_elements(public.get_books(now()-interval '2 days',now()+interval '2 days')->'lines') x
   where x->>'id' in (select 'm:'||id::text from public.stock_movements where item_id in('p074-pouch','p074-container')))
 then raise exception 'sourced per-cookie/container packaging or return was repeated'; end if;
end $$;
rollback to packaging_case;
savepoint stranded_case;
select pg_temp.p0_extra_day(4,1,true);
do $$ begin
 if pg_temp.p0_baked()<>2 or (select on_hand<>1750 from public.inventory_items where id='p074-flour')
  or (select count(*)<>1 from public.production_records where product_id='p074-cookie' and kind='batch')
 then raise exception 'final stranded return duplicated production or ingredients'; end if;
end $$;
rollback to stranded_case;
select 'MAKE_BAZAAR|passed';
rollback;
