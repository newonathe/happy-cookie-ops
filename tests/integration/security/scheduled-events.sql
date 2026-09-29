-- D4 scheduled bazaar events with real SQL roles; all data rolls back.
--
-- get_scheduled_events / save_scheduled_event / link_scheduled_event: the active owner only (a helper, support,
-- an inactive owner and anon are all refused; anon does not even hold EXECUTE, and the table has no API grant).
-- The harness neutralises each `-- rule:` line of supabase/migrations/20260101004100_scheduled_events.sql in turn
-- (scripts/test-db-security.py, SCHEDULED_MUTATIONS) and requires the named case here to fail.
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('d4c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('d4c00000-0000-4000-8000-000000000001', 'owner', 'Sched owner', true),
  ('d4c00000-0000-4000-8000-000000000002', 'helper', 'Sched helper', true),
  ('d4c00000-0000-4000-8000-000000000003', 'support', 'Sched support', true),
  ('d4c00000-0000-4000-8000-000000000004', 'owner', 'Sched inactive owner', false);

-- Two events already started, for the link cases (written as the fixture owner, never through an API role).
insert into public.events(id, name, starts_at) values
  ('d4e00000-0000-4000-8000-000000000001', 'D4 event one', now()),
  ('d4e00000-0000-4000-8000-000000000002', 'D4 event two', now());

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'd4c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

create function pg_temp.expect(actor text, operation text, statement text, wanted text) returns void
language plpgsql security invoker as $$
declare state text := '00000';
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
  end;
  if state <> wanted then
    raise exception 'scheduled outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'scheduled check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- A valid booking body for id n; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.ev(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object(
    'id', 'd4a00000-0000-4000-8000-' || lpad(n::text, 12, '0'),
    'name', 'Katipunan market', 'place', 'Katipunan Ave, QC',
    'starts_on', '2026-10-24', 'ends_on', '2026-10-25', 'rent_cents', 250000, 'active', true
  ) || over) - dropkeys $$;
create function pg_temp.eid(n integer) returns text language sql immutable as $$
  select 'd4a00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.stamp(n integer) returns timestamptz language sql stable as $$
  select (x ->> 'updated_at')::timestamptz from jsonb_array_elements(public.get_scheduled_events()) x
   where x ->> 'id' = pg_temp.eid(n) $$;
create function pg_temp.save(actor text, op text, body jsonb, stamp timestamptz, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select public.save_scheduled_event(%L::jsonb, %L::timestamptz)', body::text, stamp), wanted);
end $$;
create function pg_temp.link(actor text, op text, sched text, ev text, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.link_scheduled_event(%L::uuid, %L::uuid)', sched, ev), wanted);
end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.get_scheduled_events()', 'EXECUTE') then
    raise exception 'forbidden scheduled call succeeded: anon / get_scheduled_events';
  end if;
  if has_function_privilege('anon', 'public.save_scheduled_event(jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden scheduled call succeeded: anon / save_scheduled_event';
  end if;
  if has_function_privilege('anon', 'public.link_scheduled_event(uuid,uuid)', 'EXECUTE') then
    raise exception 'forbidden scheduled call succeeded: anon / link_scheduled_event';
  end if;
  insert into pg_temp.authority_results values ('acl', 'anon', 'scheduled_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'scheduled_table_select', 'select * from public.scheduled_events', '42501');
  perform pg_temp.expect(actor, 'scheduled_table_insert',
    'insert into public.scheduled_events(id, name, starts_on, ends_on) values (gen_random_uuid(), ''x'', current_date, current_date)', '42501');
  perform pg_temp.expect(actor, 'scheduled_table_update', 'update public.scheduled_events set name = ''y''', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_scheduled_events', 'select public.get_scheduled_events()', '42501');
  perform pg_temp.expect(actor, 'save_scheduled_event', 'select public.save_scheduled_event(''{}''::jsonb, null)', '42501');
  perform pg_temp.expect(actor, 'link_scheduled_event',
    'select * from public.link_scheduled_event(gen_random_uuid(), gen_random_uuid())', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare
  s1 timestamptz;
  before jsonb;
begin
  perform pg_temp.assert_ok(a, 'list_starts_empty', public.get_scheduled_events() = '[]'::jsonb);

  -- create
  perform pg_temp.save(a, 'create_ok', pg_temp.ev(1, '{"name": "  Katipunan market  "}'), null, '00000');
  before := public.get_scheduled_events();
  perform pg_temp.assert_ok(a, 'create_stored_normalised',
    jsonb_array_length(before) = 1 and before -> 0 ->> 'name' = 'Katipunan market'
    and before -> 0 ->> 'starts_on' = '2026-10-24' and before -> 0 ->> 'ends_on' = '2026-10-25'
    and (before -> 0 ->> 'rent_cents')::bigint = 250000 and (before -> 0 ->> 'active')::boolean
    and not (before -> 0 ->> 'started')::boolean and before -> 0 ->> 'place' = 'Katipunan Ave, QC');
  s1 := pg_temp.stamp(1);
  -- a lost reply on a create: the same body again is answered; another body with the same id is refused
  perform pg_temp.save(a, 'create_replay', pg_temp.ev(1), null, '00000');
  perform pg_temp.assert_ok(a, 'create_replay_same_stamp', pg_temp.stamp(1) = s1 and jsonb_array_length(public.get_scheduled_events()) = 1);
  perform pg_temp.save(a, 'create_replay_other_body', pg_temp.ev(1, '{"rent_cents": 1}'), null, 'P0002');
  perform pg_temp.save(a, 'create_with_stamp_unknown', pg_temp.ev(9), s1, 'P0002');

  -- shape and bounds
  perform pg_temp.save(a, 'save_not_object', '[]'::jsonb, null, '22023');
  perform pg_temp.save(a, 'save_keys_missing', pg_temp.ev(2, '{}', array['place']), null, '22023');
  perform pg_temp.save(a, 'save_keys_extra', pg_temp.ev(2, '{"price": 1}'), null, '22023');
  perform pg_temp.save(a, 'save_type_rent', pg_temp.ev(2, '{"rent_cents": "5"}'), null, '22023');
  perform pg_temp.save(a, 'save_type_active', pg_temp.ev(2, '{"active": "yes"}'), null, '22023');
  perform pg_temp.save(a, 'save_id_not_uuid', pg_temp.ev(2, '{"id": "nope"}'), null, '22023');
  perform pg_temp.save(a, 'save_id_uppercase', pg_temp.ev(2, jsonb_build_object('id', upper(pg_temp.eid(2)))), null, '22023');
  perform pg_temp.save(a, 'save_name_blank', pg_temp.ev(2, '{"name": "   "}'), null, '22023');
  perform pg_temp.save(a, 'save_name_long', pg_temp.ev(2, jsonb_build_object('name', repeat('n', 81))), null, '22023');
  perform pg_temp.save(a, 'save_place_long', pg_temp.ev(2, jsonb_build_object('place', repeat('p', 81))), null, '22023');
  perform pg_temp.save(a, 'save_name_control', pg_temp.ev(2, jsonb_build_object('name', 'a' || chr(7) || 'b')), null, '22023');
  perform pg_temp.save(a, 'save_date_format', pg_temp.ev(2, '{"starts_on": "24/10/2026"}'), null, '22023');
  perform pg_temp.save(a, 'save_date_not_real', pg_temp.ev(2, '{"starts_on": "2026-02-30", "ends_on": "2026-03-01"}'), null, '22023');
  perform pg_temp.save(a, 'save_ends_before_start', pg_temp.ev(2, '{"starts_on": "2026-10-25", "ends_on": "2026-10-24"}'), null, '22023');
  perform pg_temp.save(a, 'save_too_long', pg_temp.ev(2, '{"starts_on": "2026-10-01", "ends_on": "2026-10-16"}'), null, '22023');
  perform pg_temp.save(a, 'save_two_weeks_ok', pg_temp.ev(3, '{"starts_on": "2026-10-01", "ends_on": "2026-10-15"}'), null, '00000');
  perform pg_temp.save(a, 'save_rent_negative', pg_temp.ev(2, '{"rent_cents": -1}'), null, '22023');
  perform pg_temp.save(a, 'save_rent_fraction', pg_temp.ev(2, '{"rent_cents": 12.5}'), null, '22023');
  perform pg_temp.save(a, 'save_rent_huge', pg_temp.ev(2, '{"rent_cents": 100000001}'), null, '22023');
  perform pg_temp.save(a, 'save_rent_zero_ok', pg_temp.ev(4, '{"rent_cents": 0, "place": ""}'), null, '00000');

  -- change with the stamp it read, and refuse a stale one
  perform pg_temp.save(a, 'change_ok', pg_temp.ev(1, '{"rent_cents": 300000, "place": "UP Town Center"}'), s1, '00000');
  perform pg_temp.assert_ok(a, 'change_persisted',
    (select (x ->> 'rent_cents')::bigint = 300000 and x ->> 'place' = 'UP Town Center'
       from jsonb_array_elements(public.get_scheduled_events()) x where x ->> 'id' = pg_temp.eid(1)));
  perform pg_temp.save(a, 'change_stale', pg_temp.ev(1, '{"rent_cents": 1}'), s1 - interval '1 minute', 'P0002');
  perform pg_temp.save(a, 'change_stamp_null_other_body', pg_temp.ev(1, '{"rent_cents": 5}'), null, 'P0002');
  perform pg_temp.assert_ok(a, 'list_soonest_first',
    (select array_agg(x ->> 'id' order by ord) from jsonb_array_elements(public.get_scheduled_events()) with ordinality t(x, ord))
      = array[pg_temp.eid(3), pg_temp.eid(1), pg_temp.eid(4)]);
end $$;

create function pg_temp.phase_link(a text) returns void language plpgsql security invoker as $$
declare first_time boolean;
begin
  perform pg_temp.save(a, 'inactive_create', pg_temp.ev(5, '{"active": false}'), null, '00000');
  -- the first link says so, so the caller books the rent once; a repeat says false
  select l.first_link into first_time
    from public.link_scheduled_event(pg_temp.eid(1)::uuid, 'd4e00000-0000-4000-8000-000000000001'::uuid) l;
  perform pg_temp.assert_ok(a, 'link_first_is_true', first_time is true);
  perform pg_temp.assert_ok(a, 'link_repeat_is_false',
    (select l.first_link from public.link_scheduled_event(pg_temp.eid(1)::uuid, 'd4e00000-0000-4000-8000-000000000001'::uuid) l) is false);
  perform pg_temp.assert_ok(a, 'link_marks_started',
    (select (x ->> 'started')::boolean from jsonb_array_elements(public.get_scheduled_events()) x where x ->> 'id' = pg_temp.eid(1)));
  perform pg_temp.link(a, 'link_other_event', pg_temp.eid(1), 'd4e00000-0000-4000-8000-000000000002', '23505');
  perform pg_temp.link(a, 'link_booking_missing', pg_temp.eid(99), 'd4e00000-0000-4000-8000-000000000001', 'P0002');
  perform pg_temp.link(a, 'link_event_missing', pg_temp.eid(3), 'd4e00000-0000-4000-8000-0000000000ff', 'P0002');
  perform pg_temp.link(a, 'link_inactive', pg_temp.eid(5), 'd4e00000-0000-4000-8000-000000000002', '22023');
end $$;

grant execute on function
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.ev(integer, jsonb, text[]), pg_temp.eid(integer), pg_temp.stamp(integer),
  pg_temp.save(text, text, jsonb, timestamptz, text), pg_temp.link(text, text, text, text, text),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text),
  pg_temp.phase_owner(text), pg_temp.phase_link(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_table('anon');
select pg_temp.assert_refused('anon');
reset role;

set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_table('active_helper');
select pg_temp.assert_refused('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_table('active_support');
select pg_temp.assert_refused('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_refused('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_table('active_owner');
select pg_temp.phase_owner('active_owner');
select pg_temp.phase_link('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
