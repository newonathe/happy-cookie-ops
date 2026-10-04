-- Owner-only editable source, isolated from production; every fixture row rolls back.
begin;
create temporary table draft_results(operation text, actor text, outcome text);
grant insert on draft_results to anon, authenticated;
insert into auth.users(id) select ('a5200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,4) i;
insert into public.profiles(id,role,display_name,active) values
 ('a5200000-0000-4000-8000-000000000001','owner','Draft owner',true),
 ('a5200000-0000-4000-8000-000000000002','helper','Draft helper',true),
 ('a5200000-0000-4000-8000-000000000003','support','Draft support',true),
 ('a5200000-0000-4000-8000-000000000004','owner','Inactive draft owner',false);
insert into public.products(id,name,short_name,price_cents,kind) values('draft-test','Draft test','Draft',100,'cookie');
create function pg_temp.draft_expect(actor text, op text, stmt text, wanted text) returns void
language plpgsql as $$ declare got text:='00000'; begin
 begin execute stmt; exception when others then get stacked diagnostics got=returned_sqlstate; end;
 if got<>wanted then raise exception 'draft outcome differs: % / % / %',actor,op,got; end if;
 insert into pg_temp.draft_results values(op,actor,got);
end $$;
grant execute on function pg_temp.draft_expect(text,text,text,text) to anon,authenticated;
set local role anon;
select pg_temp.draft_expect('anon','read','select public.get_recipe_drafts()','42501');
select pg_temp.draft_expect('anon','save',$s$select public.save_recipe_draft('draft-test',14,'1 tsp salt',null)$s$,'42501');
reset role;
set local role authenticated;
do $$ declare n integer; actor text; begin
 for n in 2..4 loop
  actor:='nonowner_'||n;
  perform set_config('request.jwt.claim.sub','a5200000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub','a5200000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated','app_role','owner')::text,true);
  perform pg_temp.draft_expect(actor,'read','select public.get_recipe_drafts()','42501');
  perform pg_temp.draft_expect(actor,'save',$s$select public.save_recipe_draft('draft-test',14,'1 tsp salt',null)$s$,'42501');
 end loop;
end $$;
select set_config('request.jwt.claim.sub','a5200000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a5200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.draft_expect('owner','raw_read','select * from public.recipe_drafts','42501');
select pg_temp.draft_expect('owner','raw_write',$s$insert into public.recipe_drafts values('draft-test',14,'raw',now())$s$,'42501');
select pg_temp.draft_expect('owner','unknown_product',$s$select public.save_recipe_draft('unknown-draft',14,'text',null)$s$,'22023');
select pg_temp.draft_expect('owner','zero_yield',$s$select public.save_recipe_draft('draft-test',0,'text',null)$s$,'22023');
select pg_temp.draft_expect('owner','large_yield',$s$select public.save_recipe_draft('draft-test',10001,'text',null)$s$,'22023');
select pg_temp.draft_expect('owner','blank_text',$s$select public.save_recipe_draft('draft-test',14,E' \n\t',null)$s$,'22023');
select pg_temp.draft_expect('owner','large_text',$s$select public.save_recipe_draft('draft-test',14,repeat('x',16001),null)$s$,'22023');
select pg_temp.draft_expect('owner','create_stale',$s$select public.save_recipe_draft('draft-test',14,'text','2000-01-01')$s$,'P0002');
select pg_temp.draft_expect('owner','create',$s$select public.save_recipe_draft('draft-test',14,E'Dough: 1 tsp salt\nStuffing: pinch salt; optional cinnamon',null)$s$,'00000');
select pg_temp.draft_expect('owner','lost_reply_retry',$s$select public.save_recipe_draft('draft-test',14,E'Dough: 1 tsp salt\nStuffing: pinch salt; optional cinnamon',null)$s$,'00000');
select pg_temp.draft_expect('owner','update_stale',$s$select public.save_recipe_draft('draft-test',16,'changed','2000-01-01')$s$,'P0002');
do $$ declare row jsonb; begin
 select value into row from jsonb_array_elements(public.get_recipe_drafts()) where value->>'product_id'='draft-test';
 if row->>'source_text'<>E'Dough: 1 tsp salt\nStuffing: pinch salt; optional cinnamon' then raise exception 'draft text changed'; end if;
 perform public.save_recipe_draft('draft-test',16,'changed',(row->>'updated_at')::timestamptz);
 if not exists(select 1 from jsonb_array_elements(public.get_recipe_drafts()) x where x->>'product_id'='draft-test' and x->>'yield'='16') then raise exception 'draft update lost'; end if;
 insert into pg_temp.draft_results values('editable_yield_text','owner','00000');
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.recipes where product_id='draft-test') or exists(select 1 from public.recipe_ingredients where product_id='draft-test') then raise exception 'draft leaked into production recipe'; end if;
 insert into draft_results values('no_production_effect','owner','00000');
end $$;
select 'SEC_RESULT|'||operation||'|'||actor||'|'||outcome from draft_results order by operation,actor;
rollback;
