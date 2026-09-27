-- Private settings policy checks with real SQL roles; all data rolls back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a6c30000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 7) i;
insert into public.profiles(id, role, display_name, active)
select ('a6c30000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  (array['owner', 'helper', 'support'])[(i - 1) % 3 + 1]::public.app_role,
  'MP06c3 profile ' || i, i <= 3
from generate_series(1, 6) i;
insert into public.settings(key, int_value) values ('mp06c3_private_int', 17);
insert into public.settings(key, text_value) values ('mp06c3_private_text', 'margin');
insert into public.settings(key, cents_value) values ('mp06c3_private_cents', 3844);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a6c30000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;
create function pg_temp.settings_fixture() returns jsonb language sql security invoker as $$
  select jsonb_agg(s order by key) from public.settings s;
$$;
create temporary table original_fixture as select pg_temp.settings_fixture() as value;
grant select on pg_temp.original_fixture to authenticated, service_role;

create function pg_temp.assert_settings_denied(actor text) returns void
language plpgsql security invoker as $$
declare visible integer; changed integer;
begin
  select count(*) into visible from public.settings where key like 'mp06c3_private_%';
  if visible <> 0 then raise exception 'settings visibility differs: %', actor; end if;
  insert into pg_temp.authority_results values ('settings_select', actor, 'empty');
  update public.settings set int_value = 99 where key = 'mp06c3_private_int';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'settings update differs: %', actor; end if;
  insert into pg_temp.authority_results values ('settings_update', actor, 'zero_rows');
  delete from public.settings where key = 'mp06c3_private_int';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'settings delete differs: %', actor; end if;
  insert into pg_temp.authority_results values ('settings_delete', actor, 'zero_rows');
  begin
    insert into public.settings(key, int_value) values ('mp06c3_denied_' || actor, 1);
    raise exception 'forbidden settings insert succeeded: %', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('settings_insert', actor, 'denied_42501');
  end;
end $$;
create function pg_temp.assert_settings_write(actor text) returns void
language plpgsql security invoker as $$
declare key_name text := 'mp06c3_write_' || actor;
begin
  if pg_temp.settings_fixture() is distinct from (select value from pg_temp.original_fixture) then
    raise exception 'settings exact values differ: %', actor;
  end if;
  insert into pg_temp.authority_results values ('settings_select', actor, 'private_exact_values');
  insert into public.settings(key, int_value) values (key_name, 1);
  if not exists (select 1 from public.settings where key = key_name and int_value = 1
      and text_value is null and cents_value is null) then
    raise exception 'settings insert differs: %', actor;
  end if;
  insert into pg_temp.authority_results values ('settings_insert', actor, 'one_exact_row');
  update public.settings set int_value = null, text_value = 'updated' where key = key_name;
  if not exists (select 1 from public.settings where key = key_name and int_value is null
      and text_value = 'updated' and cents_value is null) then
    raise exception 'settings update differs: %', actor;
  end if;
  insert into pg_temp.authority_results values ('settings_update', actor, 'one_exact_row');
  delete from public.settings where key = key_name;
  if exists (select 1 from public.settings where key = key_name) then
    raise exception 'settings delete differs: %', actor;
  end if;
  insert into pg_temp.authority_results values ('settings_delete', actor, 'one_row');
end $$;
grant execute on function pg_temp.set_subject(integer, text), pg_temp.assert_settings_denied(text),
  pg_temp.assert_settings_write(text), pg_temp.settings_fixture() to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_settings_denied('anon');
reset role;
set local role authenticated;
select pg_temp.set_subject(null);
select pg_temp.assert_settings_denied('no_subject');
select pg_temp.set_subject(7);
select pg_temp.assert_settings_denied('missing_profile');
select pg_temp.set_subject(1);
select pg_temp.assert_settings_write('active_owner');
select pg_temp.set_subject(2, 'service_role');
select pg_temp.assert_settings_denied('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_settings_denied('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_settings_denied('inactive_owner');
select pg_temp.set_subject(5);
select pg_temp.assert_settings_denied('inactive_helper');
select pg_temp.set_subject(6);
select pg_temp.assert_settings_denied('inactive_support');
reset role;
set local role service_role;
select pg_temp.set_subject(null, 'service_role');
select pg_temp.assert_settings_write('service_role');
reset role;

do $$ begin
  if pg_temp.settings_fixture() is distinct from (select value from pg_temp.original_fixture)
     or (select count(*) from pg_temp.authority_results) <> 40 then
    raise exception 'settings preservation or result count differs';
  end if;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
