-- B3 shop state with real SQL roles; all data rolls back.
--
-- get_shop_status(): anon may read exactly the ordering window and the override. set_shop_override():
-- the active owner only (anon does not even hold EXECUTE); a bad mode is refused; setting what is
-- already set changes nothing. place_order() honours the switch: closed refuses (ZC001), sold out
-- refuses (ZC002), an order that already went through still answers while the shop is closed (the
-- replay check comes first), and switching back to "follow the window" lets orders through again.
-- The harness neutralises each rule line in turn (scripts/test-db-security.py, SHOP_MUTATIONS).
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b3d00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b3d00000-0000-4000-8000-000000000001', 'owner', 'Shop owner', true),
  ('b3d00000-0000-4000-8000-000000000002', 'helper', 'Shop helper', true),
  ('b3d00000-0000-4000-8000-000000000003', 'support', 'Shop support', true),
  ('b3d00000-0000-4000-8000-000000000004', 'owner', 'Shop inactive owner', false);

insert into public.products(id, name, short_name, price_cents, kind, published, active, sort_order)
values ('b3s-cookie', 'B3S cookie', 'B3S', 12000, 'Permanent', true, true, 1);
insert into public.payment_methods(id, label, account_number, account_name, active, sort_order)
values ('b3s-gcash', 'B3S GCash', '000', 'Holder', true, 1);
-- The ordering window is open all of today (Manila), so only the switch can close it.
insert into public.settings(key, int_value)
select k, v from (values ('openDow', extract(dow from now() at time zone 'Asia/Manila')::integer), ('openH', 0), ('openM', 0),
  ('closeDow', extract(dow from now() at time zone 'Asia/Manila')::integer), ('closeH', 23), ('closeM', 59), ('extendH', 24)) s(k, v);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b3d00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

create function pg_temp.monday() returns date language sql stable as $$
  select d from (select (now() at time zone 'Asia/Manila')::date + s as d from generate_series(1, 7) s) q
   where extract(isodow from d) = 1 $$;

create function pg_temp.body(n integer) returns text language sql stable as $$
  select 'select * from public.place_order(' || quote_literal(jsonb_build_object(
    'client_id', 'b3e00000-0000-4000-8000-' || lpad(n::text, 12, '0'),
    'name', 'Shop Buyer', 'ig', '', 'mobile', '0917' || lpad(n::text, 7, '0'),
    'pickup_date', to_char(pg_temp.monday(), 'YYYY-MM-DD'), 'pickup_window', '10:00', 'pay_method', 'B3S GCash',
    'items', jsonb_build_array(jsonb_build_object('product_id', 'b3s-cookie', 'qty', 1)))::text) || '::jsonb)' $$;

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
  if state <> wanted then
    raise exception 'shop state outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'shop state check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if not has_function_privilege('anon', 'public.get_shop_status()', 'EXECUTE') then
    raise exception 'public shop status call missing: anon';
  end if;
  if has_function_privilege('anon', 'public.set_shop_override(text)', 'EXECUTE') then
    raise exception 'forbidden shop state call succeeded: anon / set_shop_override';
  end if;
  insert into pg_temp.authority_results values ('acl', 'anon', 'status_public_switch_private');
end $$;

create function pg_temp.assert_status(a text) returns void language plpgsql security invoker as $$
declare s jsonb := public.get_shop_status();
begin
  perform pg_temp.assert_ok(a, 'shop_status_keys_exact',
    (select array_agg(k order by k) from jsonb_object_keys(s) k)
      = array['close_dow', 'close_h', 'close_m', 'extend_h', 'open_dow', 'open_h', 'open_m', 'override']);
  perform pg_temp.assert_ok(a, 'status_window_is_the_owners',
    (s ->> 'open_h')::integer = 0 and (s ->> 'close_h')::integer = 23 and (s ->> 'close_m')::integer = 59
    and (s ->> 'extend_h')::integer = 24
    and (s ->> 'open_dow')::integer = extract(dow from now() at time zone 'Asia/Manila')::integer);
end $$;

create function pg_temp.override_now() returns text language sql stable security invoker as $$
  select public.get_shop_status() ->> 'override' $$;

create function pg_temp.assert_denied(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'set_shop_override', 'select * from public.set_shop_override(''closed'')', '42501');
end $$;

create function pg_temp.phase_owner() returns void language plpgsql security invoker as $$
declare a text := 'active_owner'; before_stamp timestamptz; after_stamp timestamptz;
begin
  perform pg_temp.expect(a, 'shop_state_table_select', 'select * from public.shop_state', '42501');
  perform pg_temp.expect(a, 'shop_state_table_update', 'update public.shop_state set override = ''closed''', '42501');
  perform pg_temp.expect(a, 'override_bad_mode', 'select * from public.set_shop_override(''shut'')', '22023');
  perform pg_temp.expect(a, 'override_closed', 'select * from public.set_shop_override(''closed'')', '00000');
  perform pg_temp.assert_ok(a, 'override_shows_in_status', pg_temp.override_now() = 'closed');
  select updated_at into before_stamp from public.set_shop_override('closed');
  perform pg_temp.assert_ok(a, 'override_same_mode_keeps_the_stamp',
    (select updated_at from public.set_shop_override('closed')) = before_stamp);
end $$;

grant execute on function pg_temp.set_subject(integer, text), pg_temp.monday(), pg_temp.body(integer),
  pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean), pg_temp.assert_acl(),
  pg_temp.assert_status(text), pg_temp.override_now(), pg_temp.assert_denied(text), pg_temp.phase_owner()
  to anon, authenticated, service_role;

-- 1. Nothing set: anon reads the window and the empty switch, and an order goes through.
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_status('anon');
select pg_temp.assert_ok('anon', 'status_default_follows_the_window', pg_temp.override_now() is null);
select pg_temp.assert_denied('anon');
select pg_temp.expect('anon', 'place_before_switch', pg_temp.body(1), '00000');
reset role;

-- 2. Nobody but the active owner may throw the switch.
set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_denied('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_denied('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_denied('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.phase_owner();
reset role;
set local role service_role;
select pg_temp.set_subject(9, 'service_role');
select pg_temp.assert_denied('service_role');
reset role;

-- 3. Closed: a new order is refused, an order that already went through still answers.
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_ok('anon', 'status_shows_closed', pg_temp.override_now() = 'closed');
select pg_temp.expect('anon', 'place_while_closed', pg_temp.body(2), 'ZC001');
select pg_temp.expect('anon', 'replay_while_closed', pg_temp.body(1), '00000');
reset role;

-- 4. Sold out: refused as "no room", detail 0.
set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.expect('active_owner', 'override_soldout', 'select * from public.set_shop_override(''soldout'')', '00000');
reset role;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.expect('anon', 'place_while_soldout', pg_temp.body(3), 'ZC002');
reset role;

-- 5. Back to the window: orders go through again.
set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.expect('active_owner', 'override_off', 'select * from public.set_shop_override(null)', '00000');
reset role;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_ok('anon', 'status_back_to_the_window', pg_temp.override_now() is null);
select pg_temp.expect('anon', 'place_after_reopen', pg_temp.body(4), '00000');
reset role;

-- 6. The owner holds the shop open outside the window; a hold does not let a bad order through.
update public.settings set int_value = (int_value + 3) % 7 where key in ('openDow', 'closeDow');
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.expect('anon', 'place_outside_window', pg_temp.body(5), 'ZC001');
reset role;
set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.expect('active_owner', 'override_open', 'select * from public.set_shop_override(''open'')', '00000');
reset role;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.expect('anon', 'place_open_outside_window', pg_temp.body(5), '00000');
reset role;
set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.expect('active_owner', 'override_soon', 'select * from public.set_shop_override(''soon'')', '00000');
reset role;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.expect('anon', 'place_soon_outside_window', pg_temp.body(6), '00000');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
