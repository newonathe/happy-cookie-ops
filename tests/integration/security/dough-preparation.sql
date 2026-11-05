-- Synthetic fixtures only. All data and requests roll back, including refused subtransactions.
begin;
insert into auth.users(id) select ('d0710000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,4) n;
insert into public.profiles(id, role, display_name, active) values
  ('d0710000-0000-4000-8000-000000000001', 'owner', 'Dough owner', true),
  ('d0710000-0000-4000-8000-000000000002', 'helper', 'Dough helper', true),
  ('d0710000-0000-4000-8000-000000000003', 'support', 'Dough support', true),
  ('d0710000-0000-4000-8000-000000000004', 'owner', 'Inactive owner', false);
insert into public.products(id,name,short_name,price_cents,kind) values
  ('d071-a','Dough fixture A','A',10000,'cookie'), ('d071-b','Dough fixture B','B',10000,'cookie');
insert into public.inventory_items(id,name,unit,category,active,on_hand) values
  ('d071-flour','Dough fixture flour','g','Ingredients',true,2000),
  ('d071-egg','Dough fixture egg','pcs','Ingredients',true,20),
  ('d071-box','Dough fixture box','pcs','Packaging',true,20);
insert into public.recipes(product_id,yield_count) values ('d071-a',12),('d071-b',9);
insert into public.recipe_ingredients(product_id,item_name,qty,unit,position,kind,item_id) values
  ('d071-a','Dough fixture flour',300,'g',0,'ingredient','d071-flour'),
  ('d071-a','Dough fixture egg',1,'pcs',1,'ingredient','d071-egg'),
  ('d071-a','Dough fixture box',12,'pcs',2,'packaging','d071-box'),
  ('d071-b','Dough fixture flour',100,'g',0,'ingredient','d071-flour');
select public.apply_identity_links(public.preview_identity_links() -> 'counts');

create function pg_temp.body(n integer, balls integer default 12, amount numeric default 1) returns jsonb language sql stable as $$
  select jsonb_build_object('id', 'd0711000-0000-4000-8000-' || lpad(n::text,12,'0'),
    'product_id','d071-a','recipe_version',1,'recipe_amount',amount,'balls',balls,
    'drop_no',5,'at',(extract(epoch from now())*1000)::bigint)
$$;
create function pg_temp.subject(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub','d0710000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
end
$$;
create function pg_temp.check_ok(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'dough assertion failed: %',label; end if; end $$;
create function pg_temp.expect(body jsonb, wanted text) returns void language plpgsql security invoker as $$
declare actual text := '00000';
begin
  begin perform public.record_dough_preparation(body);
  exception when others then get stacked diagnostics actual = returned_sqlstate; end;
  if actual <> wanted then raise exception 'dough result % wanted %',actual,wanted; end if;
end $$;
grant execute on function pg_temp.body(integer,integer,numeric), pg_temp.subject(integer),
  pg_temp.check_ok(boolean,text), pg_temp.expect(jsonb,text) to authenticated;

select pg_temp.check_ok(not has_function_privilege('anon','public.record_dough_preparation(jsonb)','execute'), 'anonymous ACL');
select pg_temp.check_ok(not has_function_privilege('service_role','public.record_dough_preparation(jsonb)','execute'), 'service ACL');
set local role authenticated;
do $$ declare n integer; begin
  for n in 2..4 loop
    perform pg_temp.subject(n);
    perform pg_temp.expect(pg_temp.body(1),'42501');
  end loop;
end $$;
select pg_temp.subject(1);
select pg_temp.expect(null,'22023');
select pg_temp.expect('[]','22023');
select pg_temp.expect(pg_temp.body(1)-'balls','22023');
select pg_temp.expect(pg_temp.body(1)||'{"price":0}','22023');
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object(k,'null'::jsonb),'22023')
  from unnest(array['id','product_id','recipe_version','recipe_amount','balls','drop_no','at']) k;
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object(k,'"1"'::jsonb),'22023')
  from unnest(array['recipe_version','recipe_amount','balls','drop_no','at']) k;
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object('balls',v),'22023') from unnest(array[0,-1,1.5,10001]) v;
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object('recipe_amount',v),'22023') from unnest(array[0,0.25,2]) v;
select pg_temp.expect(pg_temp.body(1)||'{"recipe_version":2}','P0002');
select pg_temp.expect(pg_temp.body(1)||'{"recipe_version":2147483648}','22023');
select pg_temp.expect(pg_temp.body(1)||'{"product_id":"missing"}','P0002');
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object('at',(extract(epoch from now()+interval '2 days')*1000)::bigint),'22023');
select pg_temp.expect(pg_temp.body(n,n+10),'00000') from generate_series(1,3) n;
select pg_temp.expect(pg_temp.body(4,7,0.5),'00000');
select pg_temp.expect(pg_temp.body(5)||'{"product_id":"d071-b"}','00000');
select pg_temp.check_ok((select duplicate from public.record_dough_preparation(pg_temp.body(1,11))), 'exact replay');
select pg_temp.expect(pg_temp.body(1,13),'23505');
reset role;
select pg_temp.check_ok((select on_hand=850 from public.inventory_items where id='d071-flour'), 'same full recipe for 11 12 13 and exact half');
select pg_temp.check_ok((select on_hand=16 from public.inventory_items where id='d071-egg'), 'piece rounding');
select pg_temp.check_ok((select on_hand=20 from public.inventory_items where id='d071-box'), 'packaging not consumed');
select pg_temp.check_ok((select sum(qty)=55 and count(*)=5 from public.production_records where product_id in ('d071-a','d071-b')), 'actual balls retained');
select pg_temp.check_ok((select count(*)=5 from public.stock_movements where item_id='d071-flour'), 'one use per preparation');
select pg_temp.check_ok((select count(*)=9 and bool_and(unit_cost is null) from public.stock_movements where item_id in ('d071-flour','d071-egg')), 'unknown cost stays pending');
select pg_temp.check_ok((select preparation_recipe->'lines'->2->>'kind'='packaging' and recipe_amount=1
  from public.production_records where id=(pg_temp.body(1)->>'id')::uuid), 'snapshot keeps line kind');
update public.recipes set version=2,yield_count=20 where product_id='d071-a';
update public.recipe_ingredients set qty=400 where product_id='d071-a' and kind='ingredient' and unit='g';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.check_ok((select duplicate from public.record_dough_preparation(pg_temp.body(1,11))), 'replay before stale recipe check');
select pg_temp.expect(pg_temp.body(6),'P0002');
reset role;
select pg_temp.check_ok((select preparation_recipe->>'yield'='12' and (preparation_recipe->'lines'->0->>'qty')::numeric=300
  from public.production_records where id=(pg_temp.body(1)->>'id')::uuid), 'immutable original recipe');
update public.inventory_items set on_hand=10,avg_cost=2 where id='d071-flour';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(7)||'{"product_id":"d071-b"}','00000');
reset role;
select pg_temp.check_ok((select on_hand=0 from public.inventory_items where id='d071-flour'), 'shortage never makes stock negative');
select pg_temp.check_ok((select (short->0->>'by')::numeric=90 from public.production_records where id=(pg_temp.body(7)->>'id')::uuid), 'shortage retained');
select pg_temp.check_ok((select qty_delta=-10 and short_qty=90 and unit_cost=2 and cost_source='average'
  from public.stock_movements where production_id=(pg_temp.body(7)->>'id')::uuid), 'partial stock cost provenance');
update public.inventory_items set avg_cost=9 where id='d071-flour';
select pg_temp.check_ok((select unit_cost=2 from public.stock_movements where production_id=(pg_temp.body(7)->>'id')::uuid), 'historical cost unchanged');
-- Force the stock-write boundary to fail after the production insert: the whole call must roll back.
create function pg_temp.fail_use() returns trigger language plpgsql as $$
begin raise exception 'injected stock failure' using errcode='P0001'; end $$;
create trigger dough_test_fail before insert on public.stock_movements for each row execute function pg_temp.fail_use();
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(8)||'{"product_id":"d071-b"}','P0001');
reset role;
select pg_temp.check_ok(not exists(select 1 from public.production_records where id=(pg_temp.body(8)->>'id')::uuid), 'failed stock write rolls record back');
drop trigger dough_test_fail on public.stock_movements;
update public.recipe_ingredients set item_id=null where product_id='d071-b';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(10)||'{"product_id":"d071-b"}','00000');
reset role;
select pg_temp.check_ok((select (short->0->>'by')::numeric=100 and short->0->>'why'='not a stock item'
  from public.production_records where id=(pg_temp.body(10)->>'id')::uuid), 'missing item is short');
update public.recipe_ingredients set item_id='d071-flour',unit='ml' where product_id='d071-b';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(11)||'{"product_id":"d071-b"}','00000');
reset role;
select pg_temp.check_ok((select (short->0->>'by')::numeric=100 and short->0->>'why'='unit differs'
  from public.production_records where id=(pg_temp.body(11)->>'id')::uuid), 'incompatible units are short');
select pg_temp.check_ok(not exists(select 1 from public.stock_movements
  where production_id in ((pg_temp.body(10)->>'id')::uuid,(pg_temp.body(11)->>'id')::uuid)), 'unavailable ingredients never deducted');
update public.products set active=false where id='d071-b';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(9)||'{"product_id":"d071-b"}','P0002');
reset role;
update public.products set active=true where id='d071-b';
delete from public.recipe_ingredients where product_id='d071-b';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(12)||'{"product_id":"d071-b"}','P0002');
reset role;
select 'DOUGH|passed';
rollback;
