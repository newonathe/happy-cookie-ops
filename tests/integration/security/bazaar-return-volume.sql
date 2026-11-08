-- Two individually valid days must also support their aggregate test reversal.
begin;
insert into auth.users(id) values ('b0810000-0000-4000-8000-000000000001');
insert into public.profiles(id,role,display_name,active)
 values('b0810000-0000-4000-8000-000000000001','owner','Volume fixture',true);
insert into public.products(id,name,short_name,price_cents,item_type,kind)
 values('p081-cookie','Volume cookie','Volume cookie',100,'cookie','Permanent');
insert into public.inventory_items(id,name,unit,category,active,on_hand,avg_cost)
 values('p081-flour','Volume flour','g','Ingredients',true,100,2);
insert into public.recipes(product_id,yield_count) values('p081-cookie',8000);
insert into public.recipe_versions(product_id,version,yield_count,lines)
 values('p081-cookie',1,8000,'[{"name":"Volume flour","qty":1,"unit":"g","kind":"ingredient"}]');
insert into public.recipe_ingredients(product_id,item_name,qty,unit,position,kind,item_id)
 values('p081-cookie','Volume flour',1,'g',0,'ingredient','p081-flour');
insert into public.scheduled_events(id,name,starts_on,ends_on,place,rent_cents,active)
 values('b0811000-0000-4000-8000-000000000001','Volume test Bazaar',current_date-1,current_date,'Fixture',0,true);
set local request.jwt.claim.sub='b0810000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"b0810000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $$
declare n integer; day_id uuid; event_id uuid; summary jsonb; h text; body jsonb; at_ms bigint:=floor(extract(epoch from now())*1000)::bigint;
 code text; first_return jsonb;
begin
 for n in 1..2 loop
  perform public.record_dough_preparation(jsonb_build_object('id',('b0815000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   'product_id','p081-cookie','recipe_version',1,'recipe_amount',1,'balls',8000,'drop_no',5,'at',at_ms-86400000));
  perform public.record_bake(jsonb_build_object('id',('b0816000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   'product_id','p081-cookie','recipe_version',1,'qty',8000,'target',8000,'rejects',0,'drop_no',5,'at',at_ms-86400000));
 end loop;
 for n in 1..2 loop
  day_id:=('b0812000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  event_id:=('b0813000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  perform public.save_bazaar_day(jsonb_build_object('id',day_id,'scheduled_id','b0811000-0000-4000-8000-000000000001',
   'day',(current_date-2+n)::text,'float_cents',0,'lines','[{"product_id":"p081-cookie","made_qty":0,"carried_qty":0,"price_cents":100}]'::jsonb),null);
  perform public.save_bazaar_cost('b0811000-0000-4000-8000-000000000001','p081-cookie',1);
  body:=jsonb_build_object('id',('b0814000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   'day_id',day_id,'product_id','p081-cookie','source_drop',5,'qty',8000,'at',at_ms);
  perform public.transfer_bazaar_stock(body);
  perform public.transfer_bazaar_stock(body);
  code:='00000';
  begin perform public.transfer_bazaar_stock(body||jsonb_build_object('id',gen_random_uuid(),'qty',10000));
  exception when others then get stacked diagnostics code=returned_sqlstate; end;
  if code<>'22023' then raise exception 'individual transfer cap changed: %',code; end if;
  perform public.start_bazaar_day(day_id,'volume-device-'||n,event_id);
  summary:=public.get_bazaar('b0811000-0000-4000-8000-000000000001')->'summary';
  select x->>'hash' into h from jsonb_array_elements(summary->'days') x where x->>'id'=day_id::text;
  perform public.close_bazaar_day(jsonb_build_object('day_id',day_id,'at',at_ms,'counted_cents',0,
   'lines','{"p081-cookie":{"left":8000,"carry_next":0,"to_shop":0,"written_off":8000}}'::jsonb,
   'expected',h,'sales_count',0,'cash_cents',0));
 end loop;
 summary:=public.get_bazaar('b0811000-0000-4000-8000-000000000001')->'summary';
 h:=summary->>'hash';
 perform public.finalise_bazaar('b0811000-0000-4000-8000-000000000001',h,5,null);
 perform public.finalise_bazaar('b0811000-0000-4000-8000-000000000001',h,5,null);
 first_return:=public.reverse_bazaar_test('b0811000-0000-4000-8000-000000000001','Volume test Bazaar');
 if public.reverse_bazaar_test('b0811000-0000-4000-8000-000000000001','Volume test Bazaar') is distinct from first_return then
  raise exception 'reversal replay acknowledgement changed'; end if;
 if not exists(select 1 from jsonb_array_elements(public.get_production(5)->'baked') p
   where p->>'product_id'='p081-cookie' and (p->>'qty')::integer=16000) then
  raise exception 'aggregate reversal did not restore exactly16000 kitchen cookies'; end if;
end $$;
reset role;
do $$ declare code text; begin
 if (select count(*)<>3 or sum(qty_delta)<>0 or count(*) filter(where kind='return' and qty_delta=16000)<>1
   from public.bazaar_kitchen_moves where scheduled_id='b0811000-0000-4000-8000-000000000001') then
  raise exception 'aggregate reversal duplicated or lost journal effects'; end if;
 if (select count(*)<>4 from public.production_records where product_id='p081-cookie')
   or (select on_hand<>98 from public.inventory_items where id='p081-flour')
   or (select count(*)<>2 or sum(-qty_delta*unit_cost)<>4 from public.stock_movements where item_id='p081-flour') then
  raise exception 'reversal changed production or ingredient/cost effects'; end if;
 if (select coalesce(sum(amount_cents),0)<>0 from public.ledger_entries l join public.event_sales s on s.id=l.sale_id
   join public.bazaar_days d on d.event_id=s.event_id where d.scheduled_id='b0811000-0000-4000-8000-000000000001') then
  raise exception 'volume test created revenue'; end if;
 code:='00000';
 begin
  insert into public.bazaar_kitchen_moves
   select gen_random_uuid(),scheduled_id,product_id,day_id,'transfer',-10000,clock_timestamp(),request,acknowledgement,source_records,created_by
   from public.bazaar_kitchen_moves where id='b0814000-0000-4000-8000-000000000001';
 exception when others then get stacked diagnostics code=returned_sqlstate; end;
 if code<>'23514' then raise exception 'oversized transfer journal entry admitted: %',code; end if;
 code:='00000';
 begin
  perform public.credit_bazaar_kitchen('b0811000-0000-4000-8000-000000000001','p081-cookie',
   'b0812000-0000-4000-8000-000000000002',1,clock_timestamp(),gen_random_uuid());
 exception when others then get stacked diagnostics code=returned_sqlstate; end;
 if code<>'22023' then raise exception 'over-return journal guard changed: %',code; end if;
end $$;
select 'RETURN_VOLUME|passed';
rollback;
