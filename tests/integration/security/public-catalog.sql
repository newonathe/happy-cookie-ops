-- Public catalog projections expose fixed order fields only; every synthetic row rolls back.
begin;
__CATALOG_RED_POLICY__
create temporary table authority_results(operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id) select ('a6c22000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into public.profiles(id,role,display_name,active) values
 ('a6c22000-0000-4000-8000-000000000001','owner','Catalog owner',true),
 ('a6c22000-0000-4000-8000-000000000002','helper','Catalog helper',true),
 ('a6c22000-0000-4000-8000-000000000003','support','Catalog support',true),
 ('a6c22000-0000-4000-8000-000000000004','owner','Catalog inactive owner',false);
insert into public.products(id,name,short_name,price_cents,kind,tag,description,image_path,active,published,sort_order) values
 ('mp06k-public','Public product','Public',13000,'Permanent','New','Visible description','/public.png',true,true,7),
 ('mp06k-draft','Draft product','Draft',14000,'Rotating','Draft','Private marker draft','/draft.png',true,false,8),
 ('mp06k-inactive','Inactive product','Inactive',15000,'Permanent','Hidden','Private marker inactive','/inactive.png',false,true,9);
insert into public.drops(id,week_label,opens_at,closes_at,pickup_at,capacity,published) values
 ('a6c22000-0000-4000-8000-000000000101','MP06k published','2026-01-01 01:00+00','2026-01-02 01:00+00','2026-01-03 01:00+00',77,true),
 ('a6c22000-0000-4000-8000-000000000102','MP06k draft','2026-02-01 01:00+00','2026-02-02 01:00+00','2026-02-03 01:00+00',88,false);
insert into public.products(id,name,short_name,price_cents,kind) values ('mp06k-default','Default product','Default',1,'Permanent');
insert into public.drops(id,week_label,opens_at,closes_at,pickup_at,capacity) values
 ('a6c22000-0000-4000-8000-000000000103','MP06k default','2026-03-01 01:00+00','2026-03-02 01:00+00','2026-03-03 01:00+00',99);
do $$ begin
 if (select published from public.products where id='mp06k-default') or
    (select published from public.drops where id='a6c22000-0000-4000-8000-000000000103') then
   raise exception 'published default is not false'; end if;
end $$;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void language plpgsql security invoker as $$
declare subject text:=case when n is null then '' else 'a6c22000-0000-4000-8000-'||lpad(n::text,12,'0') end;
begin perform set_config('request.jwt.claim.sub',subject,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role',claim_role,'app_role','owner')::text,true); end $$;
create function pg_temp.assert_reads(actor text, raw_products integer, raw_drops integer) returns void language plpgsql security invoker as $$
declare p jsonb; d jsonb; keys text[];
begin
 if (select count(*) from public.products where id like 'mp06k-%')<>raw_products or (select count(*) from public.drops where week_label like 'MP06k%')<>raw_drops then raise exception 'raw visibility differs: %',actor; end if;
 select to_jsonb(x) into p from public.shop_products x where id='mp06k-public'; select to_jsonb(x) into d from public.shop_drops x where week_label='MP06k published';
 select array_agg(key order by key) into keys from jsonb_object_keys(p) key;
 if keys is distinct from array['allergens','description','id','image_path','kind','name','price_cents','short_name','sort_order','tag'] or p <> '{"id":"mp06k-public","name":"Public product","short_name":"Public","price_cents":13000,"kind":"Permanent","tag":"New","description":"Visible description","image_path":"/public.png","sort_order":7,"allergens":""}'::jsonb then raise exception 'product projection differs: %',actor; end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(d) key;
 if keys is distinct from array['closes_at','id','opens_at','pickup_at','week_label'] or d <> '{"id":"a6c22000-0000-4000-8000-000000000101","week_label":"MP06k published","opens_at":"2026-01-01T01:00:00+00:00","closes_at":"2026-01-02T01:00:00+00:00","pickup_at":"2026-01-03T01:00:00+00:00"}'::jsonb then raise exception 'drop projection differs: %',actor; end if;
 if exists(select 1 from public.shop_products where id in ('mp06k-draft','mp06k-inactive','mp06k-default')) or exists(select 1 from public.shop_drops where week_label in ('MP06k draft','MP06k default')) then raise exception 'draft or inactive projection visible: %',actor; end if;
 insert into pg_temp.authority_results values ('catalog_read',actor,'views_exact_raw_'||raw_products||'_'||raw_drops);
end $$;
create function pg_temp.assert_view_mutations(actor text) returns void language plpgsql security invoker as $$
declare relation text; operation text; statement text; state text;
begin foreach relation in array array['shop_products','shop_drops'] loop foreach operation in array array['insert','update','delete'] loop
 statement:=case relation||'/'||operation
  when 'shop_products/insert' then 'insert into public.shop_products(id,name,short_name,price_cents,kind,tag,description,image_path,sort_order) values (''mp06k-denied'',''Denied'',''Denied'',1,''Permanent'','''','''','''',1)'
  when 'shop_products/update' then 'update public.shop_products set sort_order=70 where id=''mp06k-public'''
  when 'shop_products/delete' then 'delete from public.shop_products where id=''mp06k-public'''
  when 'shop_drops/insert' then 'insert into public.shop_drops(id,week_label,opens_at,closes_at,pickup_at) values (''a6c22000-0000-4000-8000-000000000104'',''Denied'',''2026-04-01 01:00+00'',''2026-04-02 01:00+00'',''2026-04-03 01:00+00'')'
  when 'shop_drops/update' then 'update public.shop_drops set week_label=''Denied'' where id=''a6c22000-0000-4000-8000-000000000101'''
  else 'delete from public.shop_drops where id=''a6c22000-0000-4000-8000-000000000101''' end;
 begin execute statement; raise exception 'view mutation succeeded: % / % / %',actor,relation,operation;
 exception when insufficient_privilege then get stacked diagnostics state=returned_sqlstate; if state<>'42501' then raise exception 'view mutation SQLSTATE differs: % / % / % / %',actor,relation,operation,state; end if; insert into pg_temp.authority_results values ('catalog_'||operation,actor,relation||'_denied_42501'); end;
 end loop; end loop;
end $$;
grant execute on function pg_temp.set_subject(integer,text),pg_temp.assert_reads(text,integer,integer),pg_temp.assert_view_mutations(text) to anon,authenticated,service_role;
create function pg_temp.catalog_state() returns jsonb language sql security invoker as $$
 select jsonb_build_object('products',(select jsonb_agg(t) from public.products t where id like 'mp06k-%'),'drops',(select jsonb_agg(t) from public.drops t where week_label like 'MP06k%'))
$$;
create temporary table original_fixture as select pg_temp.catalog_state() as value;
grant execute on function pg_temp.catalog_state() to anon, authenticated, service_role;

__CATALOG_RED_VIEW_GRANT__

set local role anon; select pg_temp.set_subject(null,'anon'); select pg_temp.assert_reads('anon',0,0); select pg_temp.assert_view_mutations('anon'); reset role;
set local role authenticated; select pg_temp.set_subject(null); select pg_temp.assert_reads('no_subject',0,0); select pg_temp.set_subject(5); select pg_temp.assert_reads('missing_profile',0,0); select pg_temp.set_subject(4,'service_role'); select pg_temp.assert_reads('inactive_owner',0,0); select pg_temp.set_subject(2); select pg_temp.assert_reads('helper',0,0); select pg_temp.assert_view_mutations('helper'); select pg_temp.set_subject(3); select pg_temp.assert_reads('support',0,0); select pg_temp.assert_view_mutations('support'); select pg_temp.set_subject(1); select pg_temp.assert_reads('owner',4,3); select pg_temp.assert_view_mutations('owner'); reset role;
set local role service_role; select pg_temp.set_subject(null,'service_role'); select pg_temp.assert_reads('service_role',4,3); select pg_temp.assert_view_mutations('service_role'); reset role;

do $$ begin
 if (select value from pg_temp.original_fixture) is distinct from pg_temp.catalog_state() then raise exception 'catalog fixture changed after denials'; end if;
 insert into pg_temp.authority_results values ('catalog_fixture','preserved','all_rows');
end $$;

do $$ declare view_name text; role_name text; options text[]; begin
 foreach view_name in array array['shop_products','shop_drops'] loop
  select c.reloptions into options from pg_class c where c.oid=('public.'||view_name)::regclass;
  if (select r.rolname from pg_class c join pg_roles r on r.oid=c.relowner where c.oid=('public.'||view_name)::regclass)<>'postgres' or not('security_barrier=true'=any(options)) or not('security_invoker=false'=any(options)) then raise exception 'view owner or options differ: %',view_name; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop if not has_table_privilege(role_name,'public.'||view_name,'SELECT') or has_table_privilege(role_name,'public.'||view_name,'INSERT,UPDATE,DELETE') then raise exception 'view ACL differs: % / %',view_name,role_name; end if; end loop;
 end loop;
 if exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid in ('public.shop_products'::regclass,'public.shop_drops'::regclass) and a.grantee=0 and a.privilege_type='SELECT') then raise exception 'PUBLIC view SELECT grant exists'; end if;
 insert into pg_temp.authority_results values ('catalog_metadata','postgres','views_owner_options_acl'); end $$;
set local role service_role; update public.products set published=false where id='mp06k-public'; update public.drops set published=false where week_label='MP06k published'; reset role;
set local role anon; select pg_temp.set_subject(null,'anon'); do $$ begin if exists(select 1 from public.shop_products where id='mp06k-public') or exists(select 1 from public.shop_drops where week_label='MP06k published') then raise exception 'withdrawn rows remain public'; end if; insert into pg_temp.authority_results values ('catalog_withdraw','anon','views_empty'); end $$; reset role;
do $$ begin if (select count(*) from pg_temp.authority_results)<>41 then raise exception 'catalog result count differs'; end if; end $$;
select 'SEC_RESULT|'||operation||'|'||actor||'|'||outcome from pg_temp.authority_results order by operation,actor,outcome;
rollback;
