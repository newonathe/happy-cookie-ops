-- Private settings policy checks with real SQL roles; all data rolls back.
--
-- MP-09 b1: writes now go only through save_setting(); a raw table write is denied to
-- everyone, including the owner. Reads split in two: the owner keeps raw-table SELECT
-- (unchanged, via the pre-existing "settings owner write" FOR ALL policy) and gets
-- get_settings() for the full validated view; any active staff member gets
-- get_operating_settings(), a published-safe projection with no cost key.
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
-- The three seed rows, unchanged, regardless of any legitimate row save_setting() adds
-- later. This file no longer expects the whole table to stay byte-identical to a
-- pre-test snapshot: the owner's valid save_setting() calls below are supposed to add
-- real rows (capacity, priceMode), and that is not a leak.
create function pg_temp.private_seed_intact() returns boolean language sql security invoker as $$
  select (select int_value from public.settings where key = 'mp06c3_private_int') = 17
     and (select text_value from public.settings where key = 'mp06c3_private_text') = 'margin'
     and (select cents_value from public.settings where key = 'mp06c3_private_cents') = 3844;
$$;

-- Direct table access: unchanged for select (RLS still governs it), but insert/update/
-- delete are denied to every actor here, owner included — validated only,
-- through save_setting() now.
create function pg_temp.assert_settings_table_denied(actor text, can_select boolean) returns void
language plpgsql security invoker as $$
declare visible integer;
begin
  if can_select then
    if not pg_temp.private_seed_intact() then
      raise exception 'settings exact values differ: %', actor;
    end if;
    insert into pg_temp.authority_results values ('settings_select', actor, 'private_exact_values');
  else
    select count(*) into visible from public.settings where key like 'mp06c3_private_%';
    if visible <> 0 then raise exception 'settings visibility differs: %', actor; end if;
    insert into pg_temp.authority_results values ('settings_select', actor, 'empty');
  end if;
  begin
    update public.settings set int_value = 99 where key = 'mp06c3_private_int';
    raise exception 'forbidden settings update succeeded: %', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('settings_update', actor, 'denied_42501');
  end;
  begin
    delete from public.settings where key = 'mp06c3_private_int';
    raise exception 'forbidden settings delete succeeded: %', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('settings_delete', actor, 'denied_42501');
  end;
  begin
    insert into public.settings(key, int_value) values ('mp06c3_denied_' || actor, 1);
    raise exception 'forbidden settings insert succeeded: %', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('settings_insert', actor, 'denied_42501');
  end;
end $$;
create function pg_temp.assert_settings_service_write(actor text) returns void
language plpgsql security invoker as $$
declare key_name text := 'mp06c3_write_' || actor;
begin
  if not pg_temp.private_seed_intact() then
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

-- get_settings(): owner-only. Denied actors get 42501; the owner gets every key,
-- including a private one no staff projection ever exposes.
create function pg_temp.assert_get_settings_denied(actor text) returns void
language plpgsql security invoker as $$
begin
  begin
    perform * from public.get_settings();
    raise exception 'forbidden get_settings invocation succeeded: %', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('get_settings', actor, 'denied_42501');
  end;
end $$;
create function pg_temp.assert_get_settings_owner(actor text) returns void
language plpgsql security invoker as $$
declare cap_value bigint; row_count integer;
begin
  select int_value into cap_value from public.get_settings() where key = 'capacity';
  select count(*) into row_count from public.get_settings();
  if cap_value is distinct from 200 or row_count <> 28 then
    raise exception 'get_settings owner projection differs: %', actor;
  end if;
  insert into pg_temp.authority_results values ('get_settings', actor, 'full_projection');
end $$;

-- get_operating_settings(): any active staff. Exactly the published-safe key set, no
-- cost key, no cents_value on any row.
create function pg_temp.assert_operating_denied(actor text) returns void
language plpgsql security invoker as $$
begin
  begin
    perform * from public.get_operating_settings();
    raise exception 'forbidden get_operating_settings invocation succeeded: %', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('get_operating_settings', actor, 'denied_42501');
  end;
end $$;
-- expected_capacity proves a staff read genuinely reflects the owner's write, not just a
-- fixed default: called with 200 (the untouched default) before the owner saves anything,
-- and 260 (what assert_save_setting_owner leaves capacity at) for every actor after.
create function pg_temp.assert_operating_allowed(actor text, expected_capacity integer) returns void
language plpgsql security invoker as $$
declare keys text[]; costly integer; priced integer; cap_value bigint;
begin
  select array_agg(key order by key) into keys from public.get_operating_settings();
  -- MP-09 b3 adds the lists helper/support screens use and the helper-totals switch;
  -- none is a cost or a price.
  if keys is distinct from array[
    'capacity', 'categories', 'channels', 'closeDow', 'closeH', 'closeM', 'extendH',
    'helperSeesSales', 'idleMinutesHelper', 'idleMinutesOwner', 'idleMinutesSupport',
    'inactiveCats', 'maxPerOrder', 'openDow', 'openH', 'openM'
  ] then
    raise exception 'operating settings key set differs: %', actor;
  end if;
  select int_value into cap_value from public.get_operating_settings() where key = 'capacity';
  if cap_value is distinct from expected_capacity then
    raise exception 'operating settings did not reflect the owner''s save: %', actor;
  end if;
  select count(*) into costly from public.get_operating_settings()
    where key in ('cogsMultiple', 'groceryBudget', 'packagingFee', 'flatBoxPrice',
                  'drawerFloat', 'discountA', 'discountB', 'taxRate', 'priceMode');
  select count(*) into priced from public.get_operating_settings() where cents_value is not null;
  if costly <> 0 or priced <> 0 then
    raise exception 'operating settings leaked a cost key: %', actor;
  end if;
  insert into pg_temp.authority_results values ('get_operating_settings', actor, 'no_cost_key');
end $$;

-- save_setting(): owner-only, then validated. Every negative case here is a distinct
-- guarantee the RPC gives; a red probe that re-grants direct table access must not make
-- any of them pass silently.
create function pg_temp.assert_save_setting_denied(actor text) returns void
language plpgsql security invoker as $$
begin
  begin
    perform * from public.save_setting('capacity', to_jsonb(250), null);
    raise exception 'forbidden save_setting invocation succeeded: %', actor;
  exception when insufficient_privilege then
    insert into pg_temp.authority_results values ('save_setting', actor, 'denied_42501');
  end;
end $$;
create function pg_temp.assert_save_setting_owner(actor text) returns void
language plpgsql security invoker as $$
declare seen_at timestamptz; new_at timestamptz; updated_at2 timestamptz;
begin
  select updated_at from public.get_settings() where key = 'capacity' into seen_at;

  select updated_at into new_at from public.save_setting('capacity', to_jsonb(250), seen_at);
  if new_at is null or (select int_value from public.get_settings() where key = 'capacity') <> 250
      or (select updated_by from public.settings where key = 'capacity') <> auth.uid() then
    raise exception 'save_setting valid save did not take: %', actor;
  end if;
  insert into pg_temp.authority_results values ('save_setting', actor, 'valid_save');

  -- The update path (not the insert-a-new-row path above): a correct expected_updated_at
  -- against an existing row succeeds. now() is constant for the whole transaction, so
  -- updated_at2 legitimately equals new_at here — only real clock time between two
  -- separate transactions would move it, which is not this test's job to prove.
  select updated_at into updated_at2 from public.save_setting('capacity', to_jsonb(260), new_at);
  if updated_at2 is null
      or (select int_value from public.get_settings() where key = 'capacity') <> 260 then
    raise exception 'save_setting update path did not take: %', actor;
  end if;
  insert into pg_temp.authority_results values ('save_setting', actor, 'update_path');

  begin
    -- The update path's own stale case: a wrong (but non-null) expected_updated_at
    -- against an existing row, distinct from the insert-races-an-existing-row case below.
    perform * from public.save_setting('capacity', to_jsonb(270), updated_at2 - interval '1 second');
    raise exception 'save_setting accepted a stale update token: %', actor;
  exception when no_data_found then
    insert into pg_temp.authority_results values ('save_setting', actor, 'stale_update_denied');
  end;

  begin
    perform * from public.save_setting('notAKey', to_jsonb(1), null);
    raise exception 'save_setting accepted an unknown key: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'unknown_key_denied');
  end;

  begin
    perform * from public.save_setting('capacity', to_jsonb(9999), updated_at2);
    raise exception 'save_setting accepted an out-of-range value: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'out_of_range_denied');
  end;

  begin
    -- taxRate took 0.5 steps from MP-09 b3, so the whole-number rule is proven on capacity.
    perform * from public.save_setting('capacity', to_jsonb(250.5), updated_at2);
    raise exception 'save_setting accepted a non-integer value for an int_value key: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'non_integer_denied');
  end;

  begin
    -- seen_at was null (capacity had no row yet); the valid save above created one, so
    -- this null-expected save now races an existing row and must fail as stale, the
    -- same insert-races-an-existing-row case save_setting's own comment documents.
    perform * from public.save_setting('capacity', to_jsonb(300), seen_at);
    raise exception 'save_setting accepted a stale expected_updated_at: %', actor;
  exception when no_data_found then
    insert into pg_temp.authority_results values ('save_setting', actor, 'stale_denied');
  end;

  declare enum_at timestamptz;
  begin
    select updated_at into enum_at
      from public.save_setting('priceMode', to_jsonb('Cookie cost × multiplier + packaging'::text), null);
    if enum_at is null or (select text_value from public.get_settings() where key = 'priceMode')
        <> 'Cookie cost × multiplier + packaging' then
      raise exception 'save_setting priceMode round-trip differs: %', actor;
    end if;
    insert into pg_temp.authority_results values ('save_setting', actor, 'enum_round_trip');
  end;

  -- MP-09 b3: half steps, the alert channels, the category lists and the helper switch.
  declare half_at timestamptz;
  begin
    select updated_at into half_at from public.save_setting('taxRate', to_jsonb(3.5), null);
    if half_at is null
        or (select json_value from public.get_settings() where key = 'taxRate') <> '3.5'::jsonb
        or (select int_value from public.get_settings() where key = 'taxRate') is not null then
      raise exception 'save_setting half step did not take: %', actor;
    end if;
    insert into pg_temp.authority_results values ('save_setting', actor, 'half_step_save');
  end;

  begin
    perform * from public.save_setting('cogsMultiple', to_jsonb(4.25), null);
    raise exception 'save_setting accepted a quarter step: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'quarter_step_denied');
  end;

  declare channels_at timestamptz;
  begin
    select updated_at into channels_at
      from public.save_setting('channels', '{"New order": false, "Low stock": true}'::jsonb, null);
    if channels_at is null or (select json_value from public.get_settings() where key = 'channels')
        <> '{"New order": false, "Low stock": true}'::jsonb then
      raise exception 'save_setting channels round-trip differs: %', actor;
    end if;
    insert into pg_temp.authority_results values ('save_setting', actor, 'channels_save');
  end;

  begin
    perform * from public.save_setting('channels', '{"Bogus alert": true}'::jsonb, null);
    raise exception 'save_setting accepted an unknown alert name: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'channels_unknown_denied');
  end;

  begin
    perform * from public.save_setting('channels', '{"New order": "yes"}'::jsonb, null);
    raise exception 'save_setting accepted a non-boolean alert value: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'channels_non_boolean_denied');
  end;

  declare list_at timestamptz;
  begin
    select updated_at into list_at
      from public.save_setting('categories', '["Ingredients", "Packaging", "Delivery"]'::jsonb, null);
    perform * from public.save_setting('inactiveCats', '[]'::jsonb, null);
    if list_at is null or (select json_value from public.get_settings() where key = 'categories')
        <> '["Ingredients", "Packaging", "Delivery"]'::jsonb
        or (select json_value from public.get_settings() where key = 'inactiveCats') <> '[]'::jsonb then
      raise exception 'save_setting list round-trip differs: %', actor;
    end if;
    insert into pg_temp.authority_results values ('save_setting', actor, 'list_save');

    begin
      perform * from public.save_setting('categories', '[]'::jsonb, list_at);
      raise exception 'save_setting accepted an empty category list: %', actor;
    exception when invalid_parameter_value then
      insert into pg_temp.authority_results values ('save_setting', actor, 'list_empty_categories_denied');
    end;
  end;

  begin
    perform * from public.save_setting('categories', '["Packaging", "Packaging"]'::jsonb, null);
    raise exception 'save_setting accepted a duplicate list item: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'list_duplicate_denied');
  end;

  begin
    perform * from public.save_setting('categories', '[" Packaging"]'::jsonb, null);
    raise exception 'save_setting accepted an untrimmed list item: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'list_untrimmed_denied');
  end;

  begin
    perform * from public.save_setting('helperSeesSales', to_jsonb(2), null);
    raise exception 'save_setting accepted a helper switch value other than 0 or 1: %', actor;
  exception when invalid_parameter_value then
    insert into pg_temp.authority_results values ('save_setting', actor, 'helper_switch_range_denied');
  end;
end $$;

grant execute on function
  pg_temp.set_subject(integer, text), pg_temp.private_seed_intact(),
  pg_temp.assert_settings_table_denied(text, boolean), pg_temp.assert_settings_service_write(text),
  pg_temp.assert_get_settings_denied(text), pg_temp.assert_get_settings_owner(text),
  pg_temp.assert_operating_denied(text), pg_temp.assert_operating_allowed(text, integer),
  pg_temp.assert_save_setting_denied(text), pg_temp.assert_save_setting_owner(text)
to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_settings_table_denied('anon', false);
select pg_temp.assert_get_settings_denied('anon');
select pg_temp.assert_operating_denied('anon');
select pg_temp.assert_save_setting_denied('anon');
reset role;
set local role authenticated;
select pg_temp.set_subject(null);
select pg_temp.assert_settings_table_denied('no_subject', false);
select pg_temp.assert_get_settings_denied('no_subject');
select pg_temp.assert_operating_denied('no_subject');
select pg_temp.assert_save_setting_denied('no_subject');
select pg_temp.set_subject(7);
select pg_temp.assert_settings_table_denied('missing_profile', false);
select pg_temp.assert_get_settings_denied('missing_profile');
select pg_temp.assert_operating_denied('missing_profile');
select pg_temp.assert_save_setting_denied('missing_profile');
select pg_temp.set_subject(1);
select pg_temp.assert_settings_table_denied('active_owner', true);
select pg_temp.assert_get_settings_owner('active_owner');
select pg_temp.assert_operating_allowed('active_owner', 200);
select pg_temp.assert_save_setting_owner('active_owner');
select pg_temp.set_subject(2, 'service_role');
select pg_temp.assert_settings_table_denied('active_helper', false);
select pg_temp.assert_get_settings_denied('active_helper');
select pg_temp.assert_operating_allowed('active_helper', 260);
select pg_temp.assert_save_setting_denied('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_settings_table_denied('active_support', false);
select pg_temp.assert_get_settings_denied('active_support');
select pg_temp.assert_operating_allowed('active_support', 260);
select pg_temp.assert_save_setting_denied('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_settings_table_denied('inactive_owner', false);
select pg_temp.assert_get_settings_denied('inactive_owner');
select pg_temp.assert_operating_denied('inactive_owner');
select pg_temp.assert_save_setting_denied('inactive_owner');
select pg_temp.set_subject(5);
select pg_temp.assert_settings_table_denied('inactive_helper', false);
select pg_temp.assert_get_settings_denied('inactive_helper');
select pg_temp.assert_operating_denied('inactive_helper');
select pg_temp.assert_save_setting_denied('inactive_helper');
select pg_temp.set_subject(6);
select pg_temp.assert_settings_table_denied('inactive_support', false);
select pg_temp.assert_get_settings_denied('inactive_support');
select pg_temp.assert_operating_denied('inactive_support');
select pg_temp.assert_save_setting_denied('inactive_support');
reset role;
set local role service_role;
select pg_temp.set_subject(null, 'service_role');
select pg_temp.assert_settings_service_write('service_role');
reset role;

do $$ begin
  -- The three private seed rows must still be exactly as seeded; the owner's own valid
  -- save_setting() calls above are expected to have added real rows (capacity,
  -- priceMode) that were never here before, which is the RPC working, not a leak.
  if not pg_temp.private_seed_intact()
     or (select count(*) from pg_temp.authority_results) <> 84 then
    raise exception 'settings preservation or result count differs';
  end if;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
