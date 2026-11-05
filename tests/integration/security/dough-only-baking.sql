begin;
insert into auth.users(id) select ('d0720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4)n;
insert into public.profiles(id,role,display_name,active) values
 ('d0720000-0000-4000-8000-000000000001','owner','Bake owner',true),
 ('d0720000-0000-4000-8000-000000000002','helper','Bake helper',true),
 ('d0720000-0000-4000-8000-000000000003','support','Bake support',true),
 ('d0720000-0000-4000-8000-000000000004','owner','Inactive bake owner',false);
insert into public.products(id,name,short_name,price_cents,kind) values
 ('d072-a','Bake fixture A','A',10000,'cookie'),('d072-b','Bake fixture B','B',10000,'cookie'),('d072-c','Bake fixture chronology','C',10000,'cookie');
insert into public.inventory_items(id,name,unit,category,active,on_hand,avg_cost) values
 ('d072-flour','Bake fixture flour','g','Ingredients',true,2000,2),
 ('d072-unknown','Bake fixture unpriced','g','Ingredients',true,1000,null),
 ('d072-box','Bake fixture box','pcs','Packaging',true,20,null);
insert into public.recipes(product_id,yield_count) values ('d072-a',12),('d072-b',12),('d072-c',12);
insert into public.recipe_ingredients(product_id,item_name,qty,unit,position,kind,item_id) values
 ('d072-a','Bake fixture flour',300,'g',0,'ingredient','d072-flour'),
 ('d072-a','Bake fixture box',12,'pcs',1,'packaging','d072-box'),
 ('d072-b','Bake fixture unpriced',100,'g',0,'ingredient','d072-unknown'),
 ('d072-c','Bake fixture unpriced',100,'g',0,'ingredient','d072-unknown');
select public.apply_identity_links(public.preview_identity_links()->'counts');

create function pg_temp.body(n integer,qty integer default 5,rej integer default 1,pid text default 'd072-a') returns jsonb language sql stable as $$
 select jsonb_build_object('id','d0722000-0000-4000-8000-'||lpad(n::text,12,'0'),
 'product_id',pid,'qty',qty,'target',qty,'rejects',rej,'recipe_version',1,'drop_no',5,
 'at',(extract(epoch from now())*1000)::bigint)
$$;
create function pg_temp.subject(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub','d0720000-0000-4000-8000-'||lpad(n::text,12,'0'),true); end $$;
create function pg_temp.check_ok(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'bake assertion failed: %',label; end if; end $$;
create function pg_temp.expect(body jsonb,wanted text) returns void language plpgsql security invoker as $$
declare actual text:='00000';
begin
 begin perform public.record_bake(body); exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 if actual<>wanted then raise exception 'bake result % wanted %',actual,wanted; end if;
end $$;
create function pg_temp.prep(n integer,balls integer,pid text default 'd072-a',stamp bigint default null) returns void language plpgsql security invoker as $$
begin perform public.record_dough_preparation(jsonb_build_object('id','d0721000-0000-4000-8000-'||lpad(n::text,12,'0'),
 'product_id',pid,'recipe_version',1,'recipe_amount',1,'balls',balls,'drop_no',5,
 'at',coalesce(stamp,(extract(epoch from now())*1000)::bigint))); end $$;
grant execute on function pg_temp.body(integer,integer,integer,text),pg_temp.subject(integer),
 pg_temp.check_ok(boolean,text),pg_temp.expect(jsonb,text),pg_temp.prep(integer,integer,text,bigint) to authenticated;
select pg_temp.check_ok(not has_function_privilege('anon','public.record_bake(jsonb)','execute'),'anonymous ACL');
select pg_temp.check_ok(not has_function_privilege('service_role','public.record_bake(jsonb)','execute'),'service ACL');
set local role authenticated;
do $$ declare n integer; begin for n in 2..4 loop
 perform pg_temp.subject(n); perform pg_temp.expect(pg_temp.body(1),'42501'); end loop; end $$;
select pg_temp.subject(1);
select pg_temp.expect(null,'22023');
select pg_temp.expect('[]','22023');
select pg_temp.expect(pg_temp.body(1)-'rejects','22023');
select pg_temp.expect(pg_temp.body(1)||'{"adj":{}}','22023');
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object(k,'null'::jsonb),'22023')
 from unnest(array['id','product_id','qty','target','rejects','recipe_version','drop_no','at'])k;
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object('qty',v),'22023') from unnest(array[0,1.5,10001])v;
select pg_temp.expect(pg_temp.body(1)||jsonb_build_object('rejects',v),'22023') from unnest(array[-1,1.5,6])v;
select pg_temp.expect(pg_temp.body(1)||'{"target":-1}','22023');
select pg_temp.expect(pg_temp.body(1)||'{"recipe_version":2147483648}','22023');
select pg_temp.expect(pg_temp.body(1)||'{"id":"invalid"}','22023');
select pg_temp.expect(pg_temp.body(1)||'{"product_id":"missing"}','P0002');
select pg_temp.expect(pg_temp.body(1),'ZD001'); -- Ingredients alone are never a bake source.
select pg_temp.prep(1,13);
select pg_temp.expect(pg_temp.body(99,1,0)||jsonb_build_object('at',(extract(epoch from now())*1000)::bigint-1000),'ZD002');
select pg_temp.expect(pg_temp.body(1),'00000');
select pg_temp.expect(pg_temp.body(2,8,8),'00000'); -- Every remaining cookie rejected, counted once.
select pg_temp.check_ok((select duplicate and used_dough=5 from public.record_bake(pg_temp.body(1))),'exact replay');
select pg_temp.expect(pg_temp.body(1,6),'23505');
select pg_temp.expect(pg_temp.body(3,1,0),'ZD001');
reset role;
select pg_temp.check_ok((select on_hand=1700 from public.inventory_items where id='d072-flour'),'ingredients used exactly once at preparation');
select pg_temp.check_ok((select on_hand=20 from public.inventory_items where id='d072-box'),'packaging untouched');
select pg_temp.check_ok((select count(*)=1 from public.stock_movements where item_id='d072-flour'),'baking creates no ingredient movement');
select pg_temp.check_ok((select qty=4 and rejects=1 and dough_used=5 and dough_only from public.production_records where id=(pg_temp.body(1)->>'id')::uuid),'good rejects and dough independent');
select pg_temp.check_ok((select qty=0 and rejects=8 and dough_used=8 from public.production_records where id=(pg_temp.body(2)->>'id')::uuid),'all rejects stored without double subtraction');
select pg_temp.check_ok(not exists(select 1 from public.production_records where id=(pg_temp.body(3)->>'id')::uuid),'shortage leaves no record');
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.check_ok((select (x->>'qty')::integer=4 from jsonb_array_elements(public.get_production(5)->'baked')x where x->>'product_id'='d072-a'),'good cookies available');
select pg_temp.check_ok(not exists(select 1 from jsonb_array_elements(public.get_production(5)->'dough')x where x->>'product_id'='d072-a'),'no dough remains');
select pg_temp.check_ok((select abs(sum((x->>'cost_cents')::numeric)-600)<0.0001 and bool_and((x->>'cost_complete')::boolean)
 from jsonb_array_elements(public.get_production(5)->'batches')x where x->>'product_id'='d072-a'),'actual 13-ball preparation cost allocated once across partial baking');
select pg_temp.check_ok((select x->>'per_cookie_cents' is null from jsonb_array_elements(public.get_production(5)->'batches')x where x->>'id'=pg_temp.body(2)->>'id'),'all-reject cost has no per-good-cookie value');
select pg_temp.prep(2,9,'d072-b');
select pg_temp.expect(pg_temp.body(4,4,0,'d072-b'),'00000');
select pg_temp.check_ok((select x->>'cost_cents' is null and x->>'cost_complete'='false'
 from jsonb_array_elements(public.get_production(5)->'batches')x where x->>'id'=pg_temp.body(4)->>'id'),'unknown dough cost stays pending');
-- Current and point-in-time balances alone are insufficient: do not overdraw an intervening record.
select pg_temp.prep(3,13,'d072-c',(extract(epoch from now())*1000)::bigint-4000);
select pg_temp.expect(pg_temp.body(10,13,0,'d072-c')||jsonb_build_object('at',(extract(epoch from now())*1000)::bigint-3000),'00000');
select pg_temp.prep(4,13,'d072-c',(extract(epoch from now())*1000)::bigint-2000);
select pg_temp.expect(pg_temp.body(11,1,0,'d072-c')||jsonb_build_object('at',(extract(epoch from now())*1000)::bigint-3500),'ZD002');
-- Consistent out-of-order saves are allowed; both are supported by the later preparation.
select pg_temp.expect(pg_temp.body(12,5,0,'d072-c')||jsonb_build_object('at',(extract(epoch from now())*1000)::bigint-500),'00000');
select pg_temp.expect(pg_temp.body(13,7,0,'d072-c')||jsonb_build_object('at',(extract(epoch from now())*1000)::bigint-1000),'00000');
reset role;
update public.recipes set version=2 where product_id='d072-a';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.check_ok((select duplicate from public.record_bake(pg_temp.body(1))),'replay before stale recipe or availability check');
select pg_temp.expect(pg_temp.body(5),'P0002');
reset role;
create function pg_temp.fail_audit() returns trigger language plpgsql as $$
begin raise exception 'injected audit failure' using errcode='P0001'; end $$;
create trigger bake_test_fail before insert on public.audit_log for each row execute function pg_temp.fail_audit();
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(6,1,0,'d072-b'),'P0001');
reset role;
select pg_temp.check_ok(not exists(select 1 from public.production_records where id=(pg_temp.body(6)->>'id')::uuid),'audit failure rolls back bake');
drop trigger bake_test_fail on public.audit_log;
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(6,1,0,'d072-b'),'00000');
reset role;
update public.products set active=false where id='d072-b';
set local role authenticated;
select pg_temp.subject(1);
select pg_temp.expect(pg_temp.body(7,1,0,'d072-b'),'P0002');
reset role;
select 'BAKE|passed';
rollback;
