-- Synthetic historical records: the retired writer is never used to arrange its own proof.
begin;
insert into auth.users(id) select ('d0730000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4)n;
insert into public.profiles(id,role,display_name,active) values
 ('d0730000-0000-4000-8000-000000000001','owner','Legacy owner',true),
 ('d0730000-0000-4000-8000-000000000002','helper','Legacy helper',true),
 ('d0730000-0000-4000-8000-000000000003','support','Legacy support',true),
 ('d0730000-0000-4000-8000-000000000004','owner','Inactive legacy owner',false);
insert into public.products(id,name,short_name,price_cents,kind) values ('d073-a','Legacy fixture','Legacy',10000,'cookie');
insert into public.recipes(product_id,yield_count) values ('d073-a',12);
select public.apply_identity_links(public.preview_identity_links()->'counts');
create function pg_temp.body(n integer,kind text default 'batch') returns jsonb language sql stable as $$
 select jsonb_build_object('id','d0732000-0000-4000-8000-'||lpad(n::text,12,'0'),
 'kind',kind,'product_id','d073-a','qty',6,'target',case when kind='batch' then 6 else null end,
 'rejects',case when kind='batch' then 1 else 0 end,'adj','{}'::jsonb,
 'recipe_version',1,'drop_no',5,'at',(extract(epoch from now())*1000)::bigint)
$$;
create function pg_temp.check_ok(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'legacy assertion failed: %',label; end if; end $$;
create function pg_temp.expect(body jsonb,wanted text) returns void language plpgsql security invoker as $$
declare actual text:='00000';
begin
 begin perform public.record_production(body); exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 if actual<>wanted then raise exception 'legacy result % wanted %',actual,wanted; end if;
end $$;
create function pg_temp.subject(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub','d0730000-0000-4000-8000-'||lpad(n::text,12,'0'),true); end $$;
grant execute on function pg_temp.body(integer,text),pg_temp.check_ok(boolean,text),pg_temp.expect(jsonb,text),pg_temp.subject(integer) to authenticated;
select pg_temp.check_ok(not has_function_privilege('anon','public.record_production(jsonb)','execute'),'anonymous cannot execute');
-- Preserve historical good output, dough used and shortage exactly as they were recorded.
insert into public.production_records(id,kind,product_id,qty,target,rejects,dough_used,recipe_version,drop_no,at,payload_hash,created_by,short)
select (body->>'id')::uuid,'batch','d073-a',5,6,1,3,1,5,to_timestamp((body->>'at')::bigint/1000.0),
 encode(sha256(convert_to(body::text,'UTF8')),'hex'),'d0730000-0000-4000-8000-000000000001',
 '[{"name":"Historical flour","by":20,"unit":"g"}]'::jsonb from (select pg_temp.body(1) body) b;
insert into public.production_records(id,kind,product_id,qty,rejects,dough_used,recipe_version,drop_no,at,payload_hash,created_by)
select (body->>'id')::uuid,'dough','d073-a',6,0,0,1,5,to_timestamp((body->>'at')::bigint/1000.0),
 encode(sha256(convert_to(body::text,'UTF8')),'hex'),'d0730000-0000-4000-8000-000000000001'
 from (select pg_temp.body(2,'dough') body) b;
-- A current recipe is not required to replay historical work.
update public.recipes set version=2,yield_count=24 where product_id='d073-a';
create temporary table legacy_before as select
 (select count(*) from public.production_records) records,
 (select count(*) from public.stock_movements) movements,
 (select count(*) from public.ledger_entries) ledger,
 (select count(*) from public.audit_log) audit,
 (select jsonb_agg(to_jsonb(i) order by i.id) from public.inventory_items i) stock;
set local role authenticated;
do $$ declare n integer; begin for n in 2..4 loop
 perform pg_temp.subject(n); perform pg_temp.expect(pg_temp.body(1),'42501');
 perform pg_temp.expect(pg_temp.body(3),'42501'); end loop; end $$;
select pg_temp.subject(1);
select pg_temp.check_ok((select duplicate and used_dough=3 and shortfall='[{"name":"Historical flour","by":20,"unit":"g"}]'::jsonb
 from public.record_production(pg_temp.body(1))),'historical batch reply');
select pg_temp.check_ok((select duplicate and used_dough=0 and shortfall='[]'::jsonb
 from public.record_production(pg_temp.body(2,'dough'))),'historical dough reply');
select pg_temp.expect(pg_temp.body(1)||'{"qty":7}','23505');
select pg_temp.expect(pg_temp.body(2,'dough')||'{"qty":7}','23505');
select pg_temp.expect(null,'22023');
select pg_temp.expect(pg_temp.body(3)-'adj','22023');
select pg_temp.expect(pg_temp.body(3)||'{"qty":0}','22023');
select pg_temp.expect(pg_temp.body(3),'ZP001');
select pg_temp.expect(pg_temp.body(3),'ZP001'); -- A repeated refusal never becomes a saved record.
select pg_temp.expect(pg_temp.body(4,'dough'),'ZP001');
reset role;
select pg_temp.check_ok((select
 records=(select count(*) from public.production_records) and movements=(select count(*) from public.stock_movements)
 and ledger=(select count(*) from public.ledger_entries) and audit=(select count(*) from public.audit_log)
 and stock is not distinct from (select jsonb_agg(to_jsonb(i) order by i.id) from public.inventory_items i)
 from legacy_before),'replays and refusals have no production, ingredient, ledger or audit effect');
select 'LEGACY|passed';
rollback;
