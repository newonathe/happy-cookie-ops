-- F1 operational health and fixed one-year personal-data retention. All fixtures roll back.
begin;
create temporary table ops_results (case_name text, actor text, outcome text);
grant insert on ops_results to anon, authenticated, service_role;
insert into auth.users(id) values
  ('f1000000-0000-4000-8000-000000000001'), ('f1000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000003');
insert into public.profiles(id, role, display_name, active) values
  ('f1000000-0000-4000-8000-000000000001','owner','Ops owner',true),
  ('f1000000-0000-4000-8000-000000000002','support','Ops support',true),
  ('f1000000-0000-4000-8000-000000000003','helper','Ops helper',true);
insert into public.orders(id, customer_name, phone, notes, placed_at, ig, status_token, payload_hash)
values ('ops-old','Old customer','09170000001','old note',now()-interval '366 days','oldig',repeat('a',64),repeat('b',64)),
       ('ops-blank-phone','Past customer','','',now()-interval '400 days','',null,null),
       ('ops-recent','Recent customer','09170000002','keep',now()-interval '364 days','keepig',repeat('c',64),repeat('d',64));
insert into public.order_add_ons(order_id,line_no,add_on_id,name,qty,unit_price_cents,note)
values ('ops-old',1,'gift-note','Note card',1,0,'old personal message'),
       ('ops-blank-phone',1,'gift-note','Note card',1,0,'still personal');
insert into public.waitlist_entries(client_id,payload_hash,name,phone,wanted_date,created_at)
values ('f1000000-0000-4000-8000-000000000010',repeat('e',64),'Old waitlist','09170000003',current_date,now()-interval '366 days');

create function pg_temp.expect_denied(case_name text, statement text) returns void
language plpgsql security invoker as $$
declare state text := '00000';
begin
  begin execute statement; exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state <> '42501' then raise exception 'operations denial differs: % / %',case_name,state; end if;
  insert into pg_temp.ops_results values(case_name,'api','denied_42501');
end $$;
create function pg_temp.set_subject(subject text, role_name text) returns void
language plpgsql security invoker as $$
begin
  perform set_config('request.jwt.claim.sub',subject,true);
  perform set_config('request.jwt.claim.role',role_name,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role',role_name)::text,true);
end $$;
grant execute on function pg_temp.expect_denied(text,text), pg_temp.set_subject(text,text)
  to anon, authenticated, service_role;
-- Deliberately widen RPC EXECUTE only in this rolled-back fixture to prove the
-- functions' own role checks, independently of their production ACL boundary.
grant execute on function public.record_operations_run(text,text,uuid,timestamptz,text),
  public.prune_personal_data(integer) to anon, authenticated;

set local role anon;
select pg_temp.set_subject('','anon');
select pg_temp.expect_denied('record_anon','select public.record_operations_run(''backup'',''failed'',''f1000000-0000-4000-8000-000000000101'',now(),null)');
reset role;
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','',true);
set local role authenticated;
select pg_temp.set_subject('f1000000-0000-4000-8000-000000000003','authenticated');
select pg_temp.expect_denied('record_helper','select public.record_operations_run(''backup'',''failed'',''f1000000-0000-4000-8000-000000000102'',now(),null)');
select pg_temp.expect_denied('health_helper','select public.get_operations_health()');
select pg_temp.expect_denied('retention_helper','select public.prune_personal_data(365)');
select pg_temp.set_subject('f1000000-0000-4000-8000-000000000001','authenticated');
do $$ declare h jsonb;
begin
  h := public.get_operations_health();
  if h->>'checked_at' is null or h->'jobs'->'backup'->'last_run' <> 'null'::jsonb
     or h->'jobs'->'keepalive'->'last_success' <> 'null'::jsonb then
    raise exception 'empty operations health shape differs';
  end if;
end $$;
insert into pg_temp.ops_results values('health_owner','owner','ok');
reset role;
set local role anon;
select pg_temp.expect_denied('raw_table','select * from public.operations_runs');
reset role;
do $$ begin
  if has_table_privilege('anon','public.operations_runs','SELECT')
     or has_table_privilege('authenticated','public.operations_runs','SELECT')
     or has_table_privilege('service_role','public.operations_runs','SELECT') then
    raise exception 'operations table grants leaked';
  end if;
end $$;
insert into pg_temp.ops_results values('no_raw_grants','catalog','ok');

set local role service_role;
select pg_temp.set_subject('','service_role');
select public.record_operations_run('backup','success','f1000000-0000-4000-8000-000000000201',now()-interval '2 days',repeat('1',64));
select public.record_operations_run('backup','success','f1000000-0000-4000-8000-000000000201',now()-interval '2 days',repeat('1',64));
select public.record_operations_run('backup','success','f1000000-0000-4000-8000-000000000203',now(),repeat('2',64));
-- A delayed failure arriving after the newest success must remain historical.
select public.record_operations_run('backup','failed','f1000000-0000-4000-8000-000000000202',now()-interval '1 day',null);
select public.record_operations_run('restore','success','f1000000-0000-4000-8000-000000000204',now(),repeat('3',64));
do $$ declare h jsonb;
begin
  h := public.get_operations_health();
  if h->'jobs'->'backup'->'last_run'->>'status' <> 'success'
     or h->'jobs'->'backup'->'last_run'->>'archive_sha256' <> repeat('2',64)
     or h->'jobs'->'backup'->'last_success'->>'archive_sha256' <> repeat('2',64)
     or h->'jobs'->'restore'->'last_success'->>'archive_sha256' <> repeat('3',64)
     or h->'jobs'->'retention'->'last_run' <> 'null'::jsonb then
    raise exception 'operations latest/status shape differs';
  end if;
end $$;
insert into pg_temp.ops_results values('latest_run','service_role','ok');
do $$ declare state text := '00000';
begin
  begin
    perform public.record_operations_run('backup','failed','f1000000-0000-4000-8000-000000000201',now()-interval '2 days',null);
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state <> '23505' then raise exception 'idempotency conflict differs: %',state; end if;
end $$;
insert into pg_temp.ops_results values('run_id_conflict','service_role','23505');
do $$ declare state text := '00000';
begin
  begin
    perform public.record_operations_run('backup','success','f1000000-0000-4000-8000-000000000205',now(),null);
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state <> '23514' then raise exception 'missing archive hash accepted'; end if;
end $$;
insert into pg_temp.ops_results values('backup_hash_required','service_role','23514');
do $$ declare state text := '00000';
begin
  begin
    perform public.record_operations_run('keepalive','success','f1000000-0000-4000-8000-000000000207',now(),repeat('4',64));
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state <> '23514' then raise exception 'nonbackup archive hash accepted'; end if;
end $$;
insert into pg_temp.ops_results values('nonbackup_archive_hash','service_role','23514');
do $$ declare state text := '00000';
begin
  begin
    perform public.record_operations_run('keepalive','success','f1000000-0000-4000-8000-000000000206',now()+interval '1 day',null);
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state <> '23514' then raise exception 'future run time accepted'; end if;
end $$;
insert into pg_temp.ops_results values('future_run_time','service_role','23514');
do $$ declare state text := '00000';
begin
  begin perform public.prune_personal_data(364);
  exception when others then get stacked diagnostics state = returned_sqlstate; end;
  if state <> '23514' then raise exception 'short retention accepted'; end if;
end $$;
insert into pg_temp.ops_results values('retention_short_rejected','service_role','23514');
select public.prune_personal_data(365);
reset role;
do $$ declare h jsonb;
begin
  if (select customer_name from public.orders where id='ops-old') <> 'Past customer'
     or (select phone from public.orders where id='ops-old') <> ''
     or (select notes || ig from public.orders where id='ops-old') <> ''
     or (select status_token from public.orders where id='ops-old') is not null
     or (select payload_hash from public.orders where id='ops-old') is not null
     or (select note from public.order_add_ons where order_id='ops-old') is not null
     or (select note from public.order_add_ons where order_id='ops-blank-phone') is not null
     or (select count(*) from public.waitlist_entries) <> 0
     or (select phone from public.orders where id='ops-recent') <> '09170000002'
     or (select total_cents from public.orders where id='ops-old') <> 0 then
    raise exception 'retention data boundary differs';
  end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  h := public.get_operations_health();
  if h->'jobs'->'retention'->'last_success'->>'status' <> 'success' then
    raise exception 'transactional retention health missing';
  end if;
end $$;
insert into pg_temp.ops_results values('retention_effects','service_role','ok');

select 'SEC_RESULT|'||case_name||'|'||actor||'|'||outcome from pg_temp.ops_results order by case_name;
rollback;
