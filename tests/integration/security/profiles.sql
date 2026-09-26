-- SQL identity/profile/RLS tests, not GoTrue/JWT verification. All data rolls back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated;
insert into auth.users(id)
select ('a6c20000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,8) i;
insert into public.profiles(id,role,display_name,active)
select ('a6c20000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  (array['owner','helper','support'])[(i-1)%3+1]::public.app_role,
  'Synthetic profile '||i, i<=3 from generate_series(1,6) i;
insert into public.profiles(id,display_name)
values ('a6c20000-0000-4000-8000-000000000008','Synthetic default inactive');
create temporary table original_profiles as select id,role,display_name,created_at from public.profiles;
insert into public.products(id,name,short_name,price_cents,kind,active) values
  ('mp06c2-public','Public fixture','Public',100,'cookie',true),
  ('mp06c2-private','Private fixture','Private',100,'cookie',false);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else 'a6c20000-0000-4000-8000-'||lpad(n::text,12,'0') end;
begin
  perform set_config('request.jwt.claim.sub',subject,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role',claim_role,'app_role','owner')::text,true);
end $$;
create function pg_temp.expect_profile(label text, n integer, expected text, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare visible integer;
begin
  perform pg_temp.set_subject(n,claim_role);
  if auth.uid() is distinct from (case when n is null then null else ('a6c20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid end)
     or public.current_role_name()::text is distinct from expected
     or public.is_owner() is distinct from coalesce(expected='owner',false)
     or public.is_staff() is distinct from (expected is not null) then
    raise exception 'profile authority differs: %',label;
  end if;
  select count(*) into visible from public.products;
  -- MP-06k exposes the public catalogue through fixed-field views; raw rows
  -- remain visible only to an active owner.
  if visible is distinct from (case when expected='owner' then 2 else 0 end) then
    raise exception 'profile product RLS differs: %',label;
  end if;
  insert into pg_temp.authority_results values ('profile_authority',label,coalesce(expected,'none'));
end $$;
grant execute on function pg_temp.set_subject(integer,text), pg_temp.expect_profile(text,integer,text,text) to anon,authenticated;
set local role anon;
select pg_temp.expect_profile('anonymous',null,null,'anon');
reset role;
set local role authenticated;
select pg_temp.expect_profile('no_subject',null,null);
select pg_temp.expect_profile('missing_profile',7,null);
select pg_temp.expect_profile('active_owner',1,'owner');
select pg_temp.expect_profile('active_helper_forged_owner',2,'helper');
select pg_temp.expect_profile('active_support',3,'support');
select pg_temp.expect_profile('inactive_owner_forged_service',4,null,'service_role');
select pg_temp.expect_profile('inactive_helper',5,null);
select pg_temp.expect_profile('inactive_support',6,null);
select pg_temp.expect_profile('default_inactive',8,null);

select pg_temp.set_subject(4);
do $$ declare changed integer; begin
  update public.profiles set active=true where id=auth.uid();
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'inactive self-activation succeeded'; end if;
  insert into pg_temp.authority_results values ('profile_write','inactive_self_activate','zero_rows');
end $$;
select pg_temp.set_subject(2);
do $$ declare changed integer; begin
  update public.profiles set role='owner' where id=auth.uid();
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'helper self-promotion succeeded'; end if;
  insert into pg_temp.authority_results values ('profile_write','helper_self_promote','zero_rows');
end $$;
select pg_temp.set_subject(7);
do $$ begin
  begin
    insert into public.profiles(id,role,display_name,active) values(auth.uid(),'owner','Forbidden owner',true);
    raise exception 'missing profile self-creation succeeded';
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('profile_write','missing_self_create','denied_42501');
  end;
end $$;
select pg_temp.set_subject(1);
do $$ declare changed integer; begin
  update public.profiles set active=true where id='a6c20000-0000-4000-8000-000000000005';
  get diagnostics changed = row_count;
  if changed<>1 then raise exception 'active owner activation failed'; end if;
  insert into pg_temp.authority_results values ('profile_write','owner_activate','one_row');
end $$;
select pg_temp.expect_profile('activated_helper',5,'helper');

-- Keep this subject unchanged while a trusted database administrator deactivates it.
select pg_temp.set_subject(2);
reset role;
update public.profiles set active=false where id='a6c20000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  if auth.uid() is distinct from 'a6c20000-0000-4000-8000-000000000002'::uuid
     or public.current_role_name() is not null or public.is_owner() or public.is_staff()
     or (select count(*) from public.products)<>0 then
    raise exception 'deactivation did not revoke the unchanged subject';
  end if;
  insert into pg_temp.authority_results values ('profile_authority','deactivated_same_subject','none');
end $$;
reset role;
create temporary table profiles(id uuid,role public.app_role,active boolean);
insert into pg_temp.profiles values('a6c20000-0000-4000-8000-000000000007','owner',true);
grant select on pg_temp.profiles to authenticated;
set local role authenticated;
select pg_temp.expect_profile('shadow_missing_profile',7,null);
reset role;
do $$ begin
  if (select jsonb_agg(t order by id) from pg_temp.original_profiles t) is distinct from
     (select jsonb_agg(t order by id) from (select id,role,display_name,created_at from public.profiles) t)
     or (select active from public.profiles where id='a6c20000-0000-4000-8000-000000000008') is distinct from false
     or (select count(*) from pg_temp.authority_results)<>17 then
    raise exception 'profile preservation/default/result count differs';
  end if;
end $$;
select 'SEC_RESULT|'||operation||'|'||actor||'|'||outcome from pg_temp.authority_results order by operation,actor;
rollback;
