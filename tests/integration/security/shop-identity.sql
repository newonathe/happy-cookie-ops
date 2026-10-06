-- B2 shop identity and business clock authority with real SQL roles; all data rolls back.
--
-- get_shop_identity() is the one anonymous read: four texts and a stamp, all empty until the
-- owner types them (there is no seed row). save_shop_identity(): the active owner only, anon must
-- not even hold EXECUTE, exactly four string keys, trimmed and bounded text, no control
-- characters, a stale stamp refused. The table has no API grant for anyone, the owner included.
-- business_clock() is for other SQL functions: neither anon nor authenticated may execute it, and
-- it must give the answers (day, week and the shop's wall clock) in tests/fixtures/clock-cases.json (the harness replaces
-- __CLOCK_CASES__ with that file, so the app's clock and this one share one list of cases).
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a6c93000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('a6c93000-0000-4000-8000-000000000001', 'owner', 'Identity owner', true),
  ('a6c93000-0000-4000-8000-000000000002', 'helper', 'Identity helper', true),
  ('a6c93000-0000-4000-8000-000000000003', 'support', 'Identity support', true),
  ('a6c93000-0000-4000-8000-000000000004', 'owner', 'Identity inactive owner', false);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a6c93000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

create function pg_temp.valid() returns jsonb language sql immutable as $$
  select jsonb_build_object('shop_name', 'Fixture Shop', 'owner_name', 'Fixture Owner',
    'contact_line', 'fixture@example.test', 'tagline', 'Fixture tagline')
$$;

-- Runs one statement and records its SQLSTATE; anything but `wanted` fails the suite.
create function pg_temp.expect(actor text, operation text, statement text, wanted text) returns void
language plpgsql security invoker as $$
declare state text := '00000';
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
  end;
  if state = '00000' and wanted <> '00000' then
    raise exception 'forbidden identity call succeeded: % / %', actor, operation;
  elsif state <> wanted then
    raise exception 'identity outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

-- anon must not hold EXECUTE on the owner RPC or the clock: the in-function role check alone is
-- not enough. It must hold it on the one public read, or the shop shows no identity at all.
create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.save_shop_identity(jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden identity call succeeded: anon / save_shop_identity';
  end if;
  if has_function_privilege('anon', 'public.business_clock(timestamptz)', 'EXECUTE') then
    raise exception 'forbidden identity call succeeded: anon / business_clock';
  end if;
  if has_function_privilege('authenticated', 'public.business_clock(timestamptz)', 'EXECUTE') then
    raise exception 'forbidden identity call succeeded: authenticated / business_clock';
  end if;
  if not has_function_privilege('authenticated', 'public.save_shop_identity(jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'owner identity save missing: authenticated / save_shop_identity';
  end if;
  if not has_function_privilege('anon', 'public.get_shop_identity()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_shop_identity()', 'EXECUTE') then
    raise exception 'public identity read missing: get_shop_identity';
  end if;
  insert into pg_temp.authority_results values ('acl', 'api_roles', 'identity_grants_exact');
end $$;

-- What the shop prints: exactly five keys, empty texts and a null stamp until the owner types some.
create function pg_temp.assert_public_read(actor text, expect_saved boolean) returns void
language plpgsql security invoker as $$
declare info jsonb := public.get_shop_identity();
begin
  if (select array_agg(k order by k) from jsonb_object_keys(info) k)
       is distinct from array['contact_line', 'owner_name', 'shop_name', 'tagline', 'updated_at'] then
    raise exception 'public identity read differs: % / keys', actor;
  end if;
  if expect_saved and ((info ->> 'shop_name') is distinct from 'Fixture Shop'
       or (info ->> 'tagline') is distinct from 'Fixture tagline' or (info ->> 'updated_at') is null) then
    raise exception 'public identity read differs: % / saved', actor;
  end if;
  if not expect_saved and ((info ->> 'shop_name') is distinct from '' or (info ->> 'owner_name') is distinct from ''
       or (info ->> 'contact_line') is distinct from '' or (info ->> 'tagline') is distinct from ''
       or jsonb_typeof(info -> 'updated_at') is distinct from 'null') then
    raise exception 'public identity is not empty by default: %', actor;
  end if;
  insert into pg_temp.authority_results values ('public_read', actor,
    case when expect_saved then 'saved_texts' else 'empty_default' end);
end $$;

create function pg_temp.assert_denied(actor text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'save_shop_identity', 'select public.save_shop_identity(pg_temp.valid(), null)', '42501');
  perform pg_temp.expect(actor, 'business_clock', 'select * from public.business_clock(now())', '42501');
  perform pg_temp.expect(actor, 'identity_table_select', 'select * from public.shop_identity', '42501');
  perform pg_temp.expect(actor, 'identity_table_insert', 'insert into public.shop_identity(id) values (true)', '42501');
  perform pg_temp.expect(actor, 'identity_table_update', 'update public.shop_identity set shop_name = ''x''', '42501');
  perform pg_temp.expect(actor, 'identity_table_delete', 'delete from public.shop_identity', '42501');
end $$;

create function pg_temp.assert_owner() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  save text := 'select public.save_shop_identity(%s, %s)';
  stamp text := '((public.get_shop_identity() ->> ''updated_at'')::timestamptz)';
begin
  perform pg_temp.expect(a, 'business_clock', 'select * from public.business_clock(now())', '42501');
  perform pg_temp.expect(a, 'identity_table_select', 'select * from public.shop_identity', '42501');
  perform pg_temp.expect(a, 'identity_table_insert', 'insert into public.shop_identity(id) values (true)', '42501');
  perform pg_temp.expect(a, 'identity_table_update', 'update public.shop_identity set shop_name = ''x''', '42501');
  perform pg_temp.expect(a, 'identity_table_delete', 'delete from public.shop_identity', '42501');

  perform pg_temp.expect(a, 'identity_save_null_object', format(save, 'null::jsonb', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_array', format(save, '''[]''::jsonb', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_unknown_key', format(save, 'pg_temp.valid() || ''{"id": "x"}''', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_missing_key', format(save, 'pg_temp.valid() - ''tagline''', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_number', format(save, 'pg_temp.valid() || ''{"shop_name": 5}''', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_null_value', format(save, 'pg_temp.valid() || ''{"owner_name": null}''', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_boolean', format(save, 'pg_temp.valid() || ''{"tagline": true}''', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_shop_name_long',
    format(save, 'pg_temp.valid() || jsonb_build_object(''shop_name'', repeat(''x'', 61))', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_owner_name_long',
    format(save, 'pg_temp.valid() || jsonb_build_object(''owner_name'', repeat(''x'', 41))', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_contact_long',
    format(save, 'pg_temp.valid() || jsonb_build_object(''contact_line'', repeat(''x'', 161))', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_tagline_long',
    format(save, 'pg_temp.valid() || jsonb_build_object(''tagline'', repeat(''x'', 121))', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_control_tab',
    format(save, 'pg_temp.valid() || jsonb_build_object(''shop_name'', ''Bad'' || chr(9) || ''Name'')', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_control_newline',
    format(save, 'pg_temp.valid() || jsonb_build_object(''contact_line'', ''one'' || chr(10) || ''two'')', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_control_trailing',
    format(save, 'pg_temp.valid() || jsonb_build_object(''tagline'', ''ends with tab'' || chr(9))', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_control_delete',
    format(save, 'pg_temp.valid() || jsonb_build_object(''shop_name'', ''a'' || chr(127) || ''b'')', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_control_c1',
    format(save, 'pg_temp.valid() || jsonb_build_object(''contact_line'', ''a'' || chr(133) || ''b'')', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_control_unit_separator',
    format(save, 'pg_temp.valid() || jsonb_build_object(''owner_name'', ''a'' || chr(31) || ''b'')', 'null'), '22023');
  perform pg_temp.expect(a, 'identity_save_stale_without_row',
    format(save, 'pg_temp.valid()', '''2000-01-01 00:00+00''::timestamptz'), 'P0002');
  if (public.get_shop_identity() ->> 'updated_at') is not null then
    raise exception 'a refused identity save left a row';
  end if;
  -- The bounds are inclusive and apply after trimming: padding does not count, 60 characters fit.
  perform pg_temp.expect(a, 'identity_save_create_at_bounds',
    format(save, 'jsonb_build_object(''shop_name'', ''  '' || repeat(''x'', 60) || ''  '', ''owner_name'', repeat(''y'', 40), '
      '''contact_line'', repeat(''z'', 160), ''tagline'', repeat(''w'', 120))', 'null'), '00000');
  if (public.get_shop_identity() ->> 'shop_name') <> repeat('x', 60) then
    raise exception 'identity text was not trimmed';
  end if;
  perform pg_temp.expect(a, 'identity_save_create_again', format(save, 'pg_temp.valid()', 'null'), 'P0002');
  perform pg_temp.expect(a, 'identity_save_stale',
    format(save, 'pg_temp.valid()', '''2000-01-01 00:00+00''::timestamptz'), 'P0002');
  perform pg_temp.expect(a, 'identity_save_update', format(save, 'pg_temp.valid()', stamp), '00000');
  perform pg_temp.expect(a, 'identity_save_update_clear',
    format(save, 'jsonb_build_object(''shop_name'', '''', ''owner_name'', '''', ''contact_line'', '''', ''tagline'', '''')', stamp),
    '00000');
  perform pg_temp.expect(a, 'identity_save_update_restore', format(save, 'pg_temp.valid()', stamp), '00000');
end $$;

grant execute on function pg_temp.set_subject(integer, text), pg_temp.valid(),
  pg_temp.expect(text, text, text, text), pg_temp.assert_acl(),
  pg_temp.assert_public_read(text, boolean), pg_temp.assert_denied(text), pg_temp.assert_owner()
  to anon, authenticated, service_role;

-- Fixture state as the fixture owner of the transaction: no seed row, the table is shut to the API
-- roles, and business_clock() gives the shop's day and week for every case of the shared fixture.
do $$
declare
  c jsonb;
  r record;
  n integer := 0;
begin
  if (select count(*) from public.shop_identity) <> 0 then
    raise exception 'shop_identity has a seed row';
  end if;
  begin
    insert into public.shop_identity(id, shop_name) values (true, 'a' || chr(9) || 'b');
    raise exception 'identity table check accepted a control character';
  exception when check_violation then null;
  end;
  begin
    insert into public.shop_identity(id, tagline) values (true, repeat('x', 121));
    raise exception 'identity table check accepted a long tagline';
  exception when check_violation then null;
  end;
  begin
    insert into public.shop_identity(id) values (false);
    raise exception 'identity table accepted a second row key';
  exception when check_violation then null;
  end;
  insert into pg_temp.authority_results values ('identity_table', 'owner_of_transaction', 'checks_hold_and_no_seed');

  -- tests/fixtures/clock-cases.json, replaced in by the harness.
  for c in select value from jsonb_array_elements(('__CLOCK_CASES__'::jsonb) -> 'cases') loop
    select b.today, b.week_start, b.local_time into r from public.business_clock((c ->> 'at')::timestamptz) b;
    if r.today::text is distinct from (c ->> 'today') or r.week_start::text is distinct from (c ->> 'weekStart') then
      raise exception 'business clock differs: % gave % / %, wanted % / %',
        c ->> 'at', r.today, r.week_start, c ->> 'today', c ->> 'weekStart';
    end if;
    -- B3a: the shop's wall clock at that instant; place_order reads the time of day from it.
    if r.local_time::text is distinct from (c ->> 'localTime') then
      raise exception 'business clock local time differs: % gave %, wanted %', c ->> 'at', r.local_time, c ->> 'localTime';
    end if;
    n := n + 1;
  end loop;
  if n < 8 then
    raise exception 'business clock fixture has too few cases: %', n;
  end if;
  insert into pg_temp.authority_results values ('business_clock', 'fixture_cases', 'all_cases_match');
  if (select b.today from public.business_clock() b) is distinct from
     ((now() at time zone 'Asia/Manila')::date) then
    raise exception 'business clock default instant differs';
  end if;
  insert into pg_temp.authority_results values ('business_clock', 'default_instant', 'now_in_manila');
  if (select b.local_time from public.business_clock() b) is distinct from (now() at time zone 'Asia/Manila') then
    raise exception 'business clock default local time differs';
  end if;
  -- Midnight is the one place the date and the hour move together; Sunday to Monday moves the week.
  if (select count(*) from jsonb_array_elements(('__CLOCK_CASES__'::jsonb) -> 'cases') k
       where k.value ->> 'localTime' like '% 23:59:59' or k.value ->> 'localTime' like '% 00:00:00') < 4 then
    raise exception 'business clock fixture lacks midnight boundary cases';
  end if;
  insert into pg_temp.authority_results values ('business_clock', 'local_time', 'cases_and_default_match');
end $$;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_public_read('anon_default', false);
select pg_temp.assert_denied('anon');
reset role;
set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_public_read('active_helper_default', false);
select pg_temp.assert_denied('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_denied('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_denied('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_owner();
select pg_temp.set_subject(2);
select pg_temp.assert_public_read('active_helper_saved', true);
reset role;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_public_read('anon_after_owner', true);
reset role;
set local role service_role;
-- A subject with no profile: service_role is not staff, so the owner RPC refuses it.
select pg_temp.set_subject(9, 'service_role');
select pg_temp.expect('service_role', 'save_shop_identity', 'select public.save_shop_identity(pg_temp.valid(), null)', '42501');
reset role;

do $$
declare r record;
begin
  -- No API role holds any privilege on the table (the role calls above prove select to update).
  for r in select a.role_name, p.priv from unnest(array['anon', 'authenticated']) a(role_name),
      unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p(priv)
    where has_table_privilege(a.role_name, 'public.shop_identity', p.priv) loop
    raise exception 'forbidden identity call succeeded: api_roles / identity_table_privilege % %', r.role_name, r.priv;
  end loop;
  -- The owner's saves changed exactly what they sent, and nothing a denied caller sent landed.
  if (select count(*) from public.shop_identity) <> 1
     or not exists (select 1 from public.shop_identity where shop_name = 'Fixture Shop' and owner_name = 'Fixture Owner'
       and contact_line = 'fixture@example.test' and tagline = 'Fixture tagline') then
    raise exception 'identity fixture or result differs';
  end if;
  insert into pg_temp.authority_results values ('identity_fixture', 'preserved', 'owner_saves_only');
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
