-- Read-only Money projection: human event names, immutable ledger facts.
begin;
insert into auth.users(id) values
 ('b0800000-0000-4000-8000-000000000001'),('b0800000-0000-4000-8000-000000000002'),
 ('b0800000-0000-4000-8000-000000000003'),('b0800000-0000-4000-8000-000000000004');
insert into public.profiles(id,role,display_name,active) values
 ('b0800000-0000-4000-8000-000000000001','owner','Names owner',true),
 ('b0800000-0000-4000-8000-000000000002','helper','Names helper',true),
 ('b0800000-0000-4000-8000-000000000003','support','Names support',true),
 ('b0800000-0000-4000-8000-000000000004','owner','Inactive names owner',false);
insert into public.events(id,name,starts_at,closed_at) values
 ('b0801000-0000-4000-8000-000000000001','Named Bazaar',now()-interval '1 hour',now());
insert into public.event_sales(id,client_id,event_id,gross_cents,total_cents,pay_method,sold_at,voided_at) values
 ('b0802000-0000-4000-8000-000000000001','names-device:S1:1','b0801000-0000-4000-8000-000000000001',30000,30000,'Cash',now(),now()),
 ('b0802000-0000-4000-8000-000000000002','names-device:S2:2',null,10000,10000,'Cash',now(),null);
insert into public.ledger_entries(id,kind,category,memo,amount_cents,occurred_at,sale_id) values
 ('b0803000-0000-4000-8000-000000000001','sale','Bazaar','Stall sale names-device:S1:1',30000,now(),'b0802000-0000-4000-8000-000000000001'),
 ('b0803000-0000-4000-8000-000000000002','sale','Bazaar','Void of stall sale names-device:S1:1',-30000,now(),'b0802000-0000-4000-8000-000000000001'),
 ('b0803000-0000-4000-8000-000000000003','sale','Bazaar','Owner supplied note',200,now(),'b0802000-0000-4000-8000-000000000001'),
 ('b0803000-0000-4000-8000-000000000004','sale','Bazaar','Stall sale names-device:S2:2',10000,now(),'b0802000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','b0800000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b0800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare v jsonb; old_value jsonb; old_lines jsonb; new_lines jsonb; basis text; preview jsonb;
begin
 for basis in select unnest(array['bought','used']) loop
  if basis='used' then
    preview:=public.preview_cost_cutover();
    perform public.apply_cost_cutover(jsonb_build_object('hash',preview->>'hash','total_cents',(preview->>'total_cents')::bigint));
  end if;
  perform public.set_cost_basis(basis);
  v:=public.get_books(now()-interval '1 day',now()+interval '1 day');
  if not exists(select 1 from jsonb_array_elements(v->'lines') l where l->>'id'='l:b0803000-0000-4000-8000-000000000001'
    and l->>'label'='Stall sale · Named Bazaar') then
    raise exception 'MONEY_NAMES_EXPECTED: sale must display the event name';
  end if;
  if not exists(select 1 from jsonb_array_elements(v->'lines') l where l->>'id'='l:b0803000-0000-4000-8000-000000000002'
    and l->>'label'='Void of stall sale · Named Bazaar' and (l->>'amount_cents')::bigint=-30000) then
    raise exception 'void must retain its signed amount and event context';
  end if;
  if not exists(select 1 from jsonb_array_elements(v->'lines') l where l->>'id'='l:b0803000-0000-4000-8000-000000000003'
    and l->>'label'='Owner supplied note') then raise exception 'custom note changed'; end if;
  if not exists(select 1 from jsonb_array_elements(v->'lines') l where l->>'id'='l:b0803000-0000-4000-8000-000000000004'
    and l->>'label'='Stall sale · Bazaar') then raise exception 'missing event must have an honest generic label'; end if;
  old_value:=pg_temp.book_names_before_labels(now()-interval '1 day',now()+interval '1 day');
  select jsonb_agg(l.line-'label' order by l.position) into old_lines from jsonb_array_elements(old_value->'lines') with ordinality l(line,position);
  select jsonb_agg(l.line-'label' order by l.position) into new_lines from jsonb_array_elements(v->'lines') with ordinality l(line,position);
  if old_lines is distinct from new_lines or old_value-'lines' is distinct from v-'lines' then
    raise exception 'labels changed accounting, basis, held, receipts or missing-cost facts';
  end if;
 end loop;
 if (select memo from public.ledger_entries where id='b0803000-0000-4000-8000-000000000001')<>'Stall sale names-device:S1:1' then
  raise exception 'stored ledger memo changed'; end if;
 if not has_function_privilege('authenticated','public.get_books(timestamptz,timestamptz)','EXECUTE')
   or has_function_privilege('anon','public.get_books(timestamptz,timestamptz)','EXECUTE')
   or not has_function_privilege('service_role','public.get_books(timestamptz,timestamptz)','EXECUTE') then
  raise exception 'book RPC grants changed'; end if;
end $$;
set local role authenticated;
select public.get_books(now()-interval '1 day',now()+interval '1 day') is not null;
reset role;
do $$
declare who text; code text;
begin
 foreach who in array array['b0800000-0000-4000-8000-000000000002','b0800000-0000-4000-8000-000000000003','b0800000-0000-4000-8000-000000000004'] loop
  perform set_config('request.jwt.claim.sub',who,true);
  perform set_config('request.jwt.claims',json_build_object('sub',who,'role','authenticated')::text,true);
  code:='00000';
  begin perform public.get_books(now()-interval '1 day',now()+interval '1 day');
  exception when others then get stacked diagnostics code=returned_sqlstate; end;
  if code<>'42501' then raise exception 'non-owner read escaped: %',code; end if;
 end loop;
end $$;
select 'BOOK_NAMES|passed';
rollback;
