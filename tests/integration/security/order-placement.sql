-- B1 order command, order status and waitlist with real SQL roles; all data rolls back.
--
-- place_order()/order_status()/join_waitlist(): anon and any signed-in caller may execute them,
-- and nothing else about the order tables is open to the API roles. Every customer rule has a
-- case that must be refused with its own SQLSTATE and a case that must pass; the harness then
-- neutralises each rule in turn (scripts/test-db-security.py, ORDER_MUTATIONS) and requires the
-- refusal case to fail without it. get_order_rules()/save_order_rules(): the active owner only.
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;
create temporary table captured (key text primary key, order_no text, token text, total bigint,
  pickup_date date, pickup_window text, replayed boolean);
grant select, insert on captured to anon, authenticated, service_role;

insert into auth.users(id)
select ('b1c92000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b1c92000-0000-4000-8000-000000000001', 'owner', 'Order owner', true),
  ('b1c92000-0000-4000-8000-000000000002', 'helper', 'Order helper', true),
  ('b1c92000-0000-4000-8000-000000000003', 'support', 'Order support', true),
  ('b1c92000-0000-4000-8000-000000000004', 'owner', 'Order inactive owner', false);

-- The menu: a cookie, a set that takes four slots, a draft (unpublished) and one taken off the form.
insert into public.products(id, name, short_name, price_cents, kind, item_type, capacity_weight, published, active, sort_order) values
  ('b1-cookie', 'B1 cookie', 'B1', 12000, 'Permanent', 'cookie', 1, true, true, 1),
  ('b1-fries', 'B1 fries', 'B1f', 26000, 'Rotating', 'set', 4, true, true, 2),
  ('b1-draft', 'B1 draft', 'B1d', 9000, 'Rotating', 'cookie', 1, false, true, 3),
  ('b1-off', 'B1 off', 'B1o', 9000, 'Rotating', 'cookie', 1, true, false, 4);
insert into public.payment_methods(id, label, account_number, account_name, active, sort_order) values
  ('b1-gcash', 'B1 GCash', '000', 'Holder', true, 1),
  ('b1-maya', 'B1 Maya', '111', 'Holder', false, 2);

create function pg_temp.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date $$;
create function pg_temp.nextdow(dow integer, lead integer) returns date language sql stable as $$
  select pg_temp.today() + s from generate_series(lead, lead + 6) s
   where extract(isodow from pg_temp.today() + s) = dow limit 1 $$;
-- The window: open all of today and tomorrow (Asia/Manila), or shut. Fixture settings, rolled back.
create function pg_temp.set_window(open boolean) returns void language plpgsql as $$
declare d integer := extract(dow from now() at time zone 'Asia/Manila')::integer;
begin
  delete from public.settings where key in ('openDow', 'openH', 'openM', 'closeDow', 'closeH', 'closeM', 'extendH');
  if open then
    insert into public.settings(key, int_value) values ('openDow', d), ('openH', 0), ('openM', 0),
      ('closeDow', d), ('closeH', 23), ('closeM', 59), ('extendH', 24);
  else
    insert into public.settings(key, int_value) values ('openDow', (d + 1) % 7), ('openH', 0), ('openM', 0),
      ('closeDow', (d + 1) % 7), ('closeH', 1), ('closeM', 0), ('extendH', 0);
  end if;
end $$;
insert into public.settings(key, int_value) values ('capacity', 10);
select pg_temp.set_window(true);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b1c92000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

-- A valid order for slot n (its own client id and phone), on the Monday of the SECOND week ahead
-- (week B) unless changed; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.body(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object(
    'client_id', 'b1000000-0000-4000-8000-' || lpad(n::text, 12, '0'),
    'name', 'Test Buyer', 'ig', '@test.buyer', 'mobile', '0917' || lpad(n::text, 7, '0'),
    'pickup_date', to_char(pg_temp.nextdow(1, 1) + 7, 'YYYY-MM-DD'), 'pickup_window', '10:00',
    'pay_method', 'B1 GCash',
    'items', jsonb_build_array(jsonb_build_object('product_id', 'b1-cookie', 'qty', 1))
  ) || over) - dropkeys $$;

create function pg_temp.capture(k text, body jsonb) returns void language plpgsql security invoker as $$
begin
  insert into pg_temp.captured
  select k, r.order_no, r.status_token, r.total_cents, r.pickup_date, r.pickup_window, r.replayed
    from public.place_order(body) r;
end $$;

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
    raise exception 'order outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

-- place_order for slot n: stores the result under the operation name when it is accepted.
create function pg_temp.place(actor text, op text, n integer, over jsonb, dropkeys text[], wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op,
    format('select pg_temp.capture(%L, pg_temp.body(%s, %L::jsonb, %L::text[]))', op, n, over::text, dropkeys::text),
    wanted);
end $$;
create function pg_temp.place_raw(actor text, op text, body text, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.place_order(%L::jsonb)', body), wanted);
end $$;

create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'order check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

create function pg_temp.tok(k text) returns text language sql stable as $$
  select token from pg_temp.captured where key = k $$;
create function pg_temp.no(k text) returns text language sql stable as $$
  select order_no from pg_temp.captured where key = k $$;

-- ---------------------------------------------------------------- what anon may and may not do

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.get_order_rules()', 'EXECUTE') then
    raise exception 'forbidden order call succeeded: anon / get_order_rules';
  end if;
  if has_function_privilege('anon', 'public.save_order_rules(jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden order call succeeded: anon / save_order_rules';
  end if;
  if not has_function_privilege('anon', 'public.place_order(jsonb)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.order_status(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.join_waitlist(jsonb)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.order_holds_capacity(public.order_state,public.pay_state,timestamptz,timestamptz,integer)', 'EXECUTE') then
    raise exception 'public order call missing: anon';
  end if;
  insert into pg_temp.authority_results values ('acl', 'anon', 'order_rpcs_public_owner_rpcs_not');
end $$;

create function pg_temp.assert_tables(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'orders_table_insert',
    'insert into public.orders(id, customer_name, phone) values (''HC-RAW'', ''x'', ''0917'')', '42501');
  perform pg_temp.expect(actor, 'waitlist_table_select', 'select * from public.waitlist_entries', '42501');
  perform pg_temp.expect(actor, 'waitlist_table_insert',
    'insert into public.waitlist_entries(client_id, payload_hash, name, phone, wanted_date) values (gen_random_uuid(), repeat(''a'', 64), ''x'', ''09170000000'', current_date)', '42501');
  perform pg_temp.expect(actor, 'rules_table_select', 'select * from public.order_rules', '42501');
  perform pg_temp.expect(actor, 'rules_table_update', 'update public.order_rules set unpaid_hold_hours = 1', '42501');
  perform pg_temp.expect(actor, 'order_sequence_use', 'select nextval(''public.order_number_seq'')', '42501');
end $$;

-- orders and order_items keep their older API grants with RLS as the lock: a caller who is not the
-- active owner reads no rows at all, while orders exist.
create function pg_temp.assert_rows_hidden(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.assert_ok(actor, 'orders_rows_hidden',
    (select count(*) from public.orders) = 0 and (select count(*) from public.order_items) = 0);
end $$;

create function pg_temp.assert_owner_rpcs_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_order_rules', 'select * from public.get_order_rules()', '42501');
  perform pg_temp.expect(actor, 'save_order_rules',
    'select public.save_order_rules(''{}''::jsonb, null)', '42501');
end $$;

-- ---------------------------------------------------------------- the customer's order, phase 1

create function pg_temp.phase_shape(a text) returns void language plpgsql security invoker as $$
begin
  -- The server decides price, total, state and role: a body that names one is refused, not ignored.
  perform pg_temp.place(a, 'place_unknown_price', 900, '{"unit_price": 1}', '{}', '22023');
  perform pg_temp.place(a, 'place_unknown_total', 901, '{"total_cents": 1}', '{}', '22023');
  perform pg_temp.place(a, 'place_unknown_state', 902, '{"state": "Confirmed"}', '{}', '22023');
  perform pg_temp.place(a, 'place_unknown_role', 903, '{"role": "owner"}', '{}', '22023');
  perform pg_temp.place(a, 'place_missing_field', 904, '{}', array['name'], '22023');
  perform pg_temp.place(a, 'place_missing_items', 905, '{}', array['items'], '22023');
  perform pg_temp.place_raw(a, 'place_empty_object', '{}', '22023');
  perform pg_temp.place_raw(a, 'place_not_object', '[]', '22023');
  perform pg_temp.expect(a, 'place_null', 'select * from public.place_order(null)', '22023');
  perform pg_temp.place(a, 'place_name_number', 906, '{"name": 5}', '{}', '22023');
  perform pg_temp.place(a, 'place_name_blank', 907, '{"name": "   "}', '{}', '22023');
  perform pg_temp.place(a, 'place_name_control', 908, jsonb_build_object('name', 'Bad' || chr(7) || 'Name'), '{}', '22023');
  perform pg_temp.place(a, 'place_client_uppercase', 909, '{"client_id": "B1000000-0000-4000-8000-000000000909"}', '{}', '22023');
  perform pg_temp.place(a, 'place_client_not_uuid', 910, '{"client_id": "not-a-uuid"}', '{}', '22023');
  perform pg_temp.place(a, 'place_mobile_short', 911, '{"mobile": "12345"}', '{}', '22023');
  perform pg_temp.place(a, 'place_mobile_foreign', 912, '{"mobile": "+1 415 555 0100"}', '{}', '22023');
  perform pg_temp.place(a, 'place_ig_space', 913, '{"ig": "has space"}', '{}', '22023');
  perform pg_temp.place(a, 'place_notes_long', 914, jsonb_build_object('notes', repeat('n', 301)), '{}', '22023');
  perform pg_temp.place(a, 'place_date_format', 915, '{"pickup_date": "10/12/2026"}', '{}', '22023');
  perform pg_temp.place(a, 'place_date_impossible', 916, '{"pickup_date": "2026-02-30"}', '{}', '22023');
  perform pg_temp.place(a, 'place_items_empty', 917, '{"items": []}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_price_key', 918,
    '{"items": [{"product_id": "b1-cookie", "qty": 1, "unit_price_cents": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_not_object', 919, '{"items": ["b1-cookie"]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_qty_zero', 920, '{"items": [{"product_id": "b1-cookie", "qty": 0}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_qty_fraction', 921, '{"items": [{"product_id": "b1-cookie", "qty": 1.5}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_qty_huge', 922, '{"items": [{"product_id": "b1-cookie", "qty": 121}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_id_bad', 923, '{"items": [{"product_id": "Bad Id", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_twice', 924,
    '{"items": [{"product_id": "b1-cookie", "qty": 1}, {"product_id": "b1-cookie", "qty": 2}]}', '{}', '22023');
  -- Only what is published AND active is sold; the draft and the taken-off flavour are refused.
  perform pg_temp.place(a, 'place_item_unpublished', 925, '{"items": [{"product_id": "b1-draft", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_inactive', 926, '{"items": [{"product_id": "b1-off", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_item_unknown', 927, '{"items": [{"product_id": "b1-nothing", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_over_max', 928, '{"items": [{"product_id": "b1-cookie", "qty": 25}]}', '{}', '22023');
  -- A method the owner does not offer, or has switched off, cannot be chosen.
  perform pg_temp.place(a, 'place_method_unknown', 929, '{"pay_method": "Nope Pay"}', '{}', 'ZC005');
  perform pg_temp.place(a, 'place_method_inactive', 930, '{"pay_method": "B1 Maya"}', '{}', 'ZC005');
end $$;

create function pg_temp.phase_pickup(a text) returns void language plpgsql security invoker as $$
declare
  monday date := pg_temp.nextdow(1, 1);
begin
  perform pg_temp.place(a, 'place_pickup_tuesday', 940,
    jsonb_build_object('pickup_date', to_char(pg_temp.nextdow(2, 1), 'YYYY-MM-DD')), '{}', 'ZC004');
  perform pg_temp.place(a, 'place_pickup_too_far', 941,
    jsonb_build_object('pickup_date', to_char(monday + 14, 'YYYY-MM-DD')), '{}', 'ZC004');
  perform pg_temp.place(a, 'place_time_before_open', 942, '{"pickup_window": "08:59"}', '{}', 'ZC004');
  perform pg_temp.place(a, 'place_time_at_cutoff', 943, '{"pickup_window": "17:00"}', '{}', 'ZC004');
  perform pg_temp.place(a, 'place_time_malformed', 944, '{"pickup_window": "9:00"}', '{}', '22023');
  perform pg_temp.place(a, 'place_time_words', 945, '{"pickup_window": "noon"}', '{}', '22023');
  -- Accepted, in week B: Monday at the last minute before cut-off, then the campus slot.
  perform pg_temp.place(a, 'place_ok_last_minute', 946, '{"pickup_window": "16:59", "pay_ref": "  ref 123  "}', '{}', '00000');
  perform pg_temp.place(a, 'place_ok_campus', 947, '{"pickup_window": "campus"}', '{}', '00000');
end $$;

create function pg_temp.phase_happy(a text) returns void language plpgsql security invoker as $$
begin
  -- Priced from the menu: three cookies at the menu price, whatever the request could have said.
  perform pg_temp.place(a, 'place_ok_priced', 950,
    '{"items": [{"product_id": "b1-cookie", "qty": 3}], "ig": "test.buyer", "mobile": "+63 917 000 0950"}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'total_is_menu_price', (select total from pg_temp.captured where key = 'place_ok_priced') = 36000);
  perform pg_temp.assert_ok(a, 'token_is_64_hex', pg_temp.tok('place_ok_priced') ~ '^[0-9a-f]{64}$');
  perform pg_temp.assert_ok(a, 'order_no_shape', pg_temp.no('place_ok_priced') ~ '^HC-[0-9]{4,}$');
  perform pg_temp.assert_ok(a, 'not_replayed_first_time', (select not replayed from pg_temp.captured where key = 'place_ok_priced'));
  perform pg_temp.assert_ok(a, 'tokens_differ', pg_temp.tok('place_ok_priced') <> pg_temp.tok('place_ok_campus'));
  -- The same request again is the same order: same number, same token, no second row.
  perform pg_temp.place(a, 'place_replay_same_body', 950,
    '{"items": [{"product_id": "b1-cookie", "qty": 3}], "ig": "test.buyer", "mobile": "+63 917 000 0950"}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'replay_returns_same_order',
    pg_temp.no('place_replay_same_body') = pg_temp.no('place_ok_priced')
    and pg_temp.tok('place_replay_same_body') = pg_temp.tok('place_ok_priced')
    and (select replayed from pg_temp.captured where key = 'place_replay_same_body'));
  perform pg_temp.place(a, 'place_replay_other_body', 950, '{"name": "Someone Else"}', '{}', '23505');
end $$;

-- ---------------------------------------------------------------- phone limit and expiry (week B)

create function pg_temp.phase_phone(a text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.place(a, 'place_phone_a', 960, '{}', '{}', '00000');
  perform pg_temp.place(a, 'place_phone_b', 961, '{"mobile": "09170000960"}', '{}', '00000');
  -- A third unpaid order on the same number is refused, however the number is written.
  perform pg_temp.place(a, 'place_phone_limit', 962, '{"mobile": "+63 917 0000 960"}', '{}', 'ZC003');
  perform pg_temp.place(a, 'place_phone_limit_ten_digit', 964, '{"mobile": "917 0000 960"}', '{}', 'ZC003');
  -- A retry of an order that already counts is answered, not refused because it now counts.
  perform pg_temp.place(a, 'place_phone_replay_at_limit', 961, '{"mobile": "09170000960"}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'replay_at_limit_same_order', pg_temp.no('place_phone_replay_at_limit') = pg_temp.no('place_phone_b'));
end $$;

create function pg_temp.phase_phone_after(a text) returns void language plpgsql security invoker as $$
begin
  -- The first order's unpaid hold has ended, so it no longer counts against the number.
  perform pg_temp.place(a, 'place_phone_after_expiry', 963, '{"mobile": "09170000960"}', '{}', '00000');
end $$;

-- ---------------------------------------------------------------- capacity (week A: Monday + Thursday)

create function pg_temp.phase_capacity_1(a text) returns void language plpgsql security invoker as $$
declare
  monday date := pg_temp.nextdow(1, 1);
  mon text := to_char(monday, 'YYYY-MM-DD');
  thu text := to_char(monday + 3, 'YYYY-MM-DD');
begin
  perform pg_temp.place(a, 'cap_six_cookies', 970,
    jsonb_build_object('pickup_date', mon, 'items', '[{"product_id": "b1-cookie", "qty": 6}]'::jsonb), '{}', '00000');
  -- The set takes four slots (D9): 6 + 4 fills the ten exactly, on the Thursday of the same week.
  perform pg_temp.place(a, 'cap_fries_fill', 971,
    jsonb_build_object('pickup_date', thu, 'items', '[{"product_id": "b1-fries", "qty": 1}]'::jsonb), '{}', '00000');
  perform pg_temp.place(a, 'place_capacity_full', 972, jsonb_build_object('pickup_date', mon), '{}', 'ZC002');
  perform pg_temp.place(a, 'cap_full_thursday_too', 973, jsonb_build_object('pickup_date', thu), '{}', 'ZC002');
  -- The refusal names what is left.
  perform pg_temp.expect(a, 'cap_detail_is_remaining',
    format('do $x$ begin begin perform public.place_order(pg_temp.body(974, %L::jsonb)); exception when sqlstate ''ZC002'' then declare d text; begin get stacked diagnostics d = pg_exception_detail; if d <> ''0'' then raise exception ''detail %%'', d; end if; end; end; end $x$', jsonb_build_object('pickup_date', mon)::text),
    '00000');
  -- Another week is a fresh ten.
  perform pg_temp.place(a, 'cap_other_week_open', 975, '{}', '{}', '00000');
end $$;

create function pg_temp.phase_capacity_2(a text) returns void language plpgsql security invoker as $$
declare
  mon text := to_char(pg_temp.nextdow(1, 1), 'YYYY-MM-DD');
  three jsonb := '[{"product_id": "b1-cookie", "qty": 3}]'::jsonb;
begin
  -- The six-cookie order was unpaid for more than the hold, so its slots came back: 4 held, 3 more fit.
  perform pg_temp.place(a, 'place_after_hold_expiry', 976, jsonb_build_object('pickup_date', mon, 'items', three), '{}', '00000');
  -- Three slots are left and the set needs four: a request counts at its own weight (D9).
  perform pg_temp.place(a, 'cap_fries_too_heavy', 977,
    jsonb_build_object('pickup_date', mon, 'items', '[{"product_id": "b1-fries", "qty": 1}]'::jsonb), '{}', 'ZC002');
  perform pg_temp.place(a, 'cap_fill_after', 978, jsonb_build_object('pickup_date', mon, 'items', three), '{}', '00000');
end $$;

create function pg_temp.phase_capacity_3(a text) returns void language plpgsql security invoker as $$
declare
  mon text := to_char(pg_temp.nextdow(1, 1), 'YYYY-MM-DD');
begin
  -- The set order is past the hold but paid, so it still holds its four slots: the week is full.
  perform pg_temp.place(a, 'cap_paid_keeps_slots', 979, jsonb_build_object('pickup_date', mon), '{}', 'ZC002');
end $$;

create function pg_temp.phase_capacity_4(a text) returns void language plpgsql security invoker as $$
declare
  mon text := to_char(pg_temp.nextdow(1, 1), 'YYYY-MM-DD');
begin
  -- The set order is refunded and one three-cookie order cancelled: only the other three still hold,
  -- so seven more fit.
  perform pg_temp.place(a, 'cap_refund_and_cancel_release', 983,
    jsonb_build_object('pickup_date', mon, 'items', '[{"product_id": "b1-cookie", "qty": 7}]'::jsonb), '{}', '00000');
end $$;

-- ---------------------------------------------------------------- window and same-day

create function pg_temp.phase_closed(a text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.place(a, 'place_closed_window', 980, '{}', '{}', 'ZC001');
  -- An order already taken is still answered while the shop is shut.
  perform pg_temp.place(a, 'place_replay_while_closed', 950,
    '{"items": [{"product_id": "b1-cookie", "qty": 3}], "ig": "test.buyer", "mobile": "+63 917 000 0950"}', '{}', '00000');
end $$;

create function pg_temp.phase_lead(a text) returns void language plpgsql security invoker as $$
begin
  -- Every weekday is a pickup day here, so only the lead time can refuse these.
  perform pg_temp.place(a, 'place_pickup_today', 981,
    jsonb_build_object('pickup_date', to_char(pg_temp.today(), 'YYYY-MM-DD')), '{}', 'ZC004');
  perform pg_temp.place(a, 'place_pickup_yesterday', 982,
    jsonb_build_object('pickup_date', to_char(pg_temp.today() - 1, 'YYYY-MM-DD')), '{}', 'ZC004');
end $$;

-- ---------------------------------------------------------------- order status

create function pg_temp.phase_status(a text) returns void language plpgsql security invoker as $$
declare
  s jsonb := public.order_status(pg_temp.tok('place_ok_priced'));
begin
  perform pg_temp.assert_ok(a, 'status_found', s ->> 'order_no' = pg_temp.no('place_ok_priced'));
  perform pg_temp.assert_ok(a, 'status_keys_exact',
    (select array_agg(k order by k) from jsonb_object_keys(s) k)
      = array['hold_expires_at', 'items', 'order_no', 'pay_method', 'pay_state', 'pickup_date', 'pickup_window',
              'placed_at', 'state', 'total_cents']);
  perform pg_temp.assert_ok(a, 'status_shows_unpaid_hold',
    s ->> 'pay_state' = 'unpaid' and s ->> 'state' = 'Payment review' and (s ->> 'hold_expires_at') is not null);
  perform pg_temp.assert_ok(a, 'status_item_snapshot_price',
    (s #>> '{items,0,unit_price_cents}')::bigint = 12000 and (s #>> '{items,0,qty}')::integer = 3);
  perform pg_temp.assert_ok(a, 'status_no_personal_text', s::text not like '%09170000950%' and s::text not like '%@test.buyer%'
    and s::text not like '%Test Buyer%');
  perform pg_temp.assert_ok(a, 'status_unknown_token_is_null', public.order_status(repeat('0', 64)) is null);
  perform pg_temp.assert_ok(a, 'status_short_token_is_null', public.order_status('abc') is null);
  perform pg_temp.assert_ok(a, 'status_uppercase_token_is_null', public.order_status(upper(pg_temp.tok('place_ok_priced'))) is null);
  perform pg_temp.assert_ok(a, 'status_order_number_is_not_a_token', public.order_status(pg_temp.no('place_ok_priced')) is null);
  perform pg_temp.assert_ok(a, 'status_null_is_null', public.order_status(null) is null);
  perform pg_temp.assert_ok(a, 'status_injection_is_null', public.order_status('x'' or true --') is null);
end $$;

create function pg_temp.phase_status_price(a text) returns void language plpgsql security invoker as $$
begin
  -- The owner raised the menu price after the order: the order keeps the price it was made at.
  perform pg_temp.assert_ok(a, 'status_price_survives_menu_change',
    (public.order_status(pg_temp.tok('place_ok_priced')) #>> '{items,0,unit_price_cents}')::bigint = 12000
    and (public.order_status(pg_temp.tok('place_ok_priced')) ->> 'total_cents')::bigint = 36000);
end $$;

-- ---------------------------------------------------------------- waitlist

create function pg_temp.wl(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}') returns jsonb
language sql stable as $$
  select (jsonb_build_object(
    'client_id', 'b1000000-0000-4000-8000-' || lpad((5000 + n)::text, 12, '0'),
    'name', 'Wait Buyer', 'ig', '@wait.buyer', 'mobile', '0918' || lpad(n::text, 7, '0'),
    'wanted_date', to_char(pg_temp.today() + 10, 'YYYY-MM-DD')) || over) - dropkeys $$;
create function pg_temp.wl_call(actor text, op text, n integer, over jsonb, dropkeys text[], wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op,
    format('select * from public.join_waitlist(pg_temp.wl(%s, %L::jsonb, %L::text[]))', n, over::text, dropkeys::text), wanted);
end $$;
create function pg_temp.wl_id(n integer, over jsonb default '{}'::jsonb) returns uuid language sql volatile as $$
  select waitlist_id from public.join_waitlist(pg_temp.wl(n, over)) $$;

create function pg_temp.phase_waitlist(a text) returns void language plpgsql security invoker as $$
declare
  first_id uuid;
begin
  perform pg_temp.wl_call(a, 'wait_unknown_key', 1, '{"state": "x"}', '{}', '22023');
  perform pg_temp.wl_call(a, 'wait_missing_key', 1, '{}', array['name'], '22023');
  perform pg_temp.wl_call(a, 'wait_bad_phone', 1, '{"mobile": "123"}', '{}', '22023');
  perform pg_temp.wl_call(a, 'wait_bad_ig', 1, '{"ig": "no way"}', '{}', '22023');
  perform pg_temp.wl_call(a, 'wait_bad_date_format', 1, '{"wanted_date": "soon"}', '{}', '22023');
  perform pg_temp.wl_call(a, 'wait_date_past', 1,
    jsonb_build_object('wanted_date', to_char(pg_temp.today() - 1, 'YYYY-MM-DD')), '{}', '22023');
  perform pg_temp.wl_call(a, 'wait_date_too_far', 1,
    jsonb_build_object('wanted_date', to_char(pg_temp.today() + 91, 'YYYY-MM-DD')), '{}', '22023');
  perform pg_temp.wl_call(a, 'wait_ok', 1, '{}', '{}', '00000');
  first_id := pg_temp.wl_id(1);
  perform pg_temp.assert_ok(a, 'wait_replay_same_entry', first_id is not null);
  perform pg_temp.wl_call(a, 'wait_replay', 1, '{}', '{}', '00000');
  perform pg_temp.wl_call(a, 'wait_replay_other_body', 1, '{"name": "Different Person"}', '{}', '23505');
  -- The same number asking for the same date under a new request id is the same request.
  perform pg_temp.assert_ok(a, 'wait_same_day_again_returns_first',
    pg_temp.wl_id(1, '{"client_id": "b1000000-0000-4000-8000-000000009999"}') = first_id);
  perform pg_temp.assert_ok(a, 'wait_ten_digit_is_same_number',
    pg_temp.wl_id(1, '{"client_id": "b1000000-0000-4000-8000-000000009997", "mobile": "918 0000 001"}') = first_id);
  perform pg_temp.wl_call(a, 'wait_same_day_again', 1, '{"client_id": "b1000000-0000-4000-8000-000000009998"}', '{}', '00000');
  -- Five open entries per number: dates 11..14 make five with the first, the sixth is refused.
  perform pg_temp.wl_call(a, 'wait_second_date', 1, jsonb_build_object('client_id', 'b1000000-0000-4000-8000-000000009001',
    'wanted_date', to_char(pg_temp.today() + 11, 'YYYY-MM-DD')), '{}', '00000');
  perform pg_temp.wl_call(a, 'wait_third_date', 1, jsonb_build_object('client_id', 'b1000000-0000-4000-8000-000000009002',
    'wanted_date', to_char(pg_temp.today() + 12, 'YYYY-MM-DD')), '{}', '00000');
  perform pg_temp.wl_call(a, 'wait_fourth_date', 1, jsonb_build_object('client_id', 'b1000000-0000-4000-8000-000000009003',
    'wanted_date', to_char(pg_temp.today() + 13, 'YYYY-MM-DD')), '{}', '00000');
  perform pg_temp.wl_call(a, 'wait_fifth_date', 1, jsonb_build_object('client_id', 'b1000000-0000-4000-8000-000000009004',
    'wanted_date', to_char(pg_temp.today() + 14, 'YYYY-MM-DD')), '{}', '00000');
  perform pg_temp.wl_call(a, 'wait_limit', 1, jsonb_build_object('client_id', 'b1000000-0000-4000-8000-000000009005',
    'wanted_date', to_char(pg_temp.today() + 15, 'YYYY-MM-DD')), '{}', 'ZC006');
end $$;

-- ---------------------------------------------------------------- owner: the rules

create function pg_temp.rules_json() returns jsonb language sql stable as $$
  select to_jsonb(r) - 'updated_at' from public.get_order_rules() r $$;
create function pg_temp.rules_stamp() returns timestamptz language sql stable as $$
  select updated_at from public.get_order_rules() $$;

create function pg_temp.phase_owner_rules() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  save text := 'select public.save_order_rules(%s, %s)';
  stamp text := 'pg_temp.rules_stamp()';
begin
  perform pg_temp.expect(a, 'rules_get', 'select * from public.get_order_rules()', '00000');
  perform pg_temp.assert_ok(a, 'rules_defaults_are_the_decided_ones',
    (select unpaid_hold_hours = 24 and max_unpaid_per_phone = 2 and pickup_days = array[1, 4]
            and lead_min_days = 1 and lead_max_days = 14 and pickup_from_hour = 9 and pickup_cutoff_hour = 17
            and campus_from = '14:00' and campus_to = '15:30' from public.get_order_rules()));
  perform pg_temp.expect(a, 'rules_not_object', format(save, '''[]''::jsonb', stamp), '22023');
  perform pg_temp.expect(a, 'rules_unknown_key', format(save, 'pg_temp.rules_json() || ''{"x": 1}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_missing_key', format(save, 'pg_temp.rules_json() - ''campus_to''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_wrong_type', format(save, 'pg_temp.rules_json() || ''{"unpaid_hold_hours": "24"}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_fraction', format(save, 'pg_temp.rules_json() || ''{"pickup_from_hour": 9.5}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_hold_zero', format(save, 'pg_temp.rules_json() || ''{"unpaid_hold_hours": 0}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_hold_too_long', format(save, 'pg_temp.rules_json() || ''{"unpaid_hold_hours": 169}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_phone_limit_zero', format(save, 'pg_temp.rules_json() || ''{"max_unpaid_per_phone": 0}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_day_eight', format(save, 'pg_temp.rules_json() || ''{"pickup_days": [8]}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_day_text', format(save, 'pg_temp.rules_json() || ''{"pickup_days": ["mon"]}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_no_days', format(save, 'pg_temp.rules_json() || ''{"pickup_days": []}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_lead_min_zero', format(save, 'pg_temp.rules_json() || ''{"lead_min_days": 0}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_lead_inverted',
    format(save, 'pg_temp.rules_json() || ''{"lead_min_days": 5, "lead_max_days": 3}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_hours_inverted',
    format(save, 'pg_temp.rules_json() || ''{"pickup_from_hour": 17, "pickup_cutoff_hour": 9}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_campus_inverted',
    format(save, 'pg_temp.rules_json() || ''{"campus_from": "16:00", "campus_to": "15:00"}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_campus_malformed', format(save, 'pg_temp.rules_json() || ''{"campus_from": "2pm"}''', stamp), '22023');
  perform pg_temp.expect(a, 'rules_stale',
    format(save, 'pg_temp.rules_json()', '''2000-01-01 00:00+00''::timestamptz'), 'P0002');
  perform pg_temp.expect(a, 'rules_null_stamp', format(save, 'pg_temp.rules_json()', 'null'), 'P0002');
  -- One phone at a time from here: the owner narrows the limit; the customer's next order feels it.
  -- 24.0 is a whole number: saved, not a cast error.
  perform pg_temp.expect(a, 'rules_whole_float_saved',
    format(save, 'pg_temp.rules_json() || ''{"unpaid_hold_hours": 24.0}''', stamp), '00000');
  perform pg_temp.expect(a, 'rules_save_limit_one',
    format(save, 'pg_temp.rules_json() || ''{"max_unpaid_per_phone": 1}''', stamp), '00000');
  perform pg_temp.assert_ok(a, 'rules_saved_limit_is_one', (select max_unpaid_per_phone = 1 from public.get_order_rules()));
end $$;

create function pg_temp.phase_owner_restore() returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect('active_owner', 'rules_save_restore',
    format('select public.save_order_rules(pg_temp.rules_json() || ''{"max_unpaid_per_phone": 2}'', %s)', 'pg_temp.rules_stamp()'), '00000');
end $$;

create function pg_temp.phase_limit_owner_setting(a text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.place(a, 'place_limit_one_first', 990, '{}', '{}', '00000');
  perform pg_temp.place(a, 'place_limit_one_second', 991, '{"mobile": "09170000990"}', '{}', 'ZC003');
end $$;

create function pg_temp.phase_erasure() returns void language plpgsql security invoker as $$
begin
  -- Erasure reaches the new personal data: an unpaid order is deleted, a paid one is blanked
  -- (name, phone, notes, handle and status token), and the waitlist entries for the number go.
  perform pg_temp.expect('active_owner', 'erase_unpaid_number', 'select public.anonymise_customer(''0917 0000 950'', ''b1'')', '00000');
  perform pg_temp.expect('active_owner', 'erase_paid_number', 'select public.anonymise_customer(''0917 0000 970'', ''b1'')', '00000');
  perform pg_temp.expect('active_owner', 'erase_waitlist_number', 'select public.anonymise_customer(''0918 0000 001'', ''b1'')', '00000');
end $$;

create function pg_temp.phase_prune() returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect('service_role', 'prune_blanks_new_data', 'select public.prune_personal_data(-1)', '00000');
end $$;

grant execute on function
  pg_temp.today(), pg_temp.nextdow(integer, integer), pg_temp.set_window(boolean),
  pg_temp.set_subject(integer, text), pg_temp.body(integer, jsonb, text[]), pg_temp.capture(text, jsonb),
  pg_temp.expect(text, text, text, text), pg_temp.place(text, text, integer, jsonb, text[], text),
  pg_temp.place_raw(text, text, text, text), pg_temp.assert_ok(text, text, boolean), pg_temp.tok(text), pg_temp.no(text),
  pg_temp.assert_acl(), pg_temp.assert_tables(text), pg_temp.assert_rows_hidden(text), pg_temp.assert_owner_rpcs_refused(text),
  pg_temp.phase_shape(text), pg_temp.phase_pickup(text), pg_temp.phase_happy(text), pg_temp.phase_phone(text),
  pg_temp.phase_phone_after(text), pg_temp.phase_capacity_1(text), pg_temp.phase_capacity_2(text),
  pg_temp.phase_capacity_3(text), pg_temp.phase_capacity_4(text), pg_temp.phase_closed(text), pg_temp.phase_lead(text),
  pg_temp.phase_status(text), pg_temp.phase_status_price(text), pg_temp.wl(integer, jsonb, text[]),
  pg_temp.wl_call(text, text, integer, jsonb, text[], text), pg_temp.wl_id(integer, jsonb),
  pg_temp.phase_waitlist(text), pg_temp.rules_json(), pg_temp.rules_stamp(), pg_temp.phase_owner_rules(),
  pg_temp.phase_owner_restore(), pg_temp.phase_limit_owner_setting(text), pg_temp.phase_erasure(), pg_temp.phase_prune()
  to anon, authenticated, service_role;

-- ================================================================ the run

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_tables('anon');
select pg_temp.assert_owner_rpcs_refused('anon');
select pg_temp.phase_shape('anon');
select pg_temp.phase_pickup('anon');
select pg_temp.phase_happy('anon');
select pg_temp.phase_phone('anon');
select pg_temp.phase_capacity_1('anon');
reset role;

-- Time passes: the first phone order and the six-cookie order stay unpaid past the 24-hour hold.
update public.orders set placed_at = now() - interval '25 hours'
 where id in (pg_temp.no('place_phone_a'), pg_temp.no('cap_six_cookies'));

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_phone_after('anon');
select pg_temp.phase_capacity_2('anon');
reset role;

-- The set order is 25 hours old but the owner has ticked it paid: it holds its four slots.
update public.orders set placed_at = now() - interval '25 hours', state = 'Confirmed', pay_state = 'confirmed'
 where id = pg_temp.no('cap_fries_fill');

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_capacity_3('anon');
reset role;

-- Refund the set order and cancel the first three-cookie order: both release their slots.
update public.orders set pay_state = 'refunded' where id = pg_temp.no('cap_fries_fill');
update public.orders set state = 'Cancelled' where id = pg_temp.no('place_after_hold_expiry');

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_capacity_4('anon');
select pg_temp.phase_status('anon');
select pg_temp.assert_rows_hidden('anon');
reset role;

-- The menu price changes after the order was made.
update public.products set price_cents = 99900 where id = 'b1-cookie';
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_status_price('anon');
reset role;
update public.products set price_cents = 12000 where id = 'b1-cookie';

-- The shop is shut: new orders are refused, an order already taken is still answered.
select pg_temp.set_window(false);
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_closed('anon');
reset role;
select pg_temp.set_window(true);

-- Every weekday is a pickup day: only the lead time refuses today and yesterday.
update public.order_rules set pickup_days = '{1,2,3,4,5,6,7}';
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_lead('anon');
reset role;
update public.order_rules set pickup_days = '{1,4}';

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_waitlist('anon');
reset role;

-- Signed-in staff are customers here too, and get no order data through this door.
set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_tables('active_helper');
select pg_temp.assert_owner_rpcs_refused('active_helper');
select pg_temp.place('active_helper', 'staff_can_order', 995, '{}', '{}', '00000');
select pg_temp.assert_ok('active_helper', 'staff_order_status', public.order_status(pg_temp.tok('staff_can_order')) ->> 'order_no' = pg_temp.no('staff_can_order'));
select pg_temp.assert_rows_hidden('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_rows_hidden('active_support');
select pg_temp.assert_owner_rpcs_refused('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_owner_rpcs_refused('inactive_owner');
select pg_temp.assert_tables('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_tables('active_owner');
select pg_temp.phase_owner_rules();
reset role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_limit_owner_setting('anon');
reset role;

set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.phase_owner_restore();
reset role;

-- A waitlist entry for a number that also ordered, then erasure and pruning.
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.wl_call('anon', 'wait_for_erased_number', 1, '{"mobile": "09180000001"}', '{}', '00000');
reset role;
update public.orders set state = 'Confirmed', pay_state = 'confirmed', pay_ref = 'typed a name here' where id = pg_temp.no('cap_six_cookies');
insert into public.waitlist_entries(client_id, payload_hash, name, phone, wanted_date)
values (gen_random_uuid(), repeat('a', 64), 'Erase me', '09180000001', pg_temp.today() + 20);

set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.phase_erasure();
reset role;

do $$
begin
  if exists (select 1 from public.orders where id = pg_temp.no('place_ok_priced')) then
    raise exception 'order check differs: erased unpaid order is still there';
  end if;
  if not exists (select 1 from public.orders where id = pg_temp.no('cap_six_cookies') and phone = '' and ig = ''
       and status_token is null and payload_hash is null
       and customer_name = 'Removed on request' and notes = '') then
    raise exception 'order check differs: erased paid order kept personal data';
  end if;
  if exists (select 1 from public.waitlist_entries where phone = '09180000001') then
    raise exception 'order check differs: erased number kept waitlist entries';
  end if;
  insert into pg_temp.authority_results values ('erasure_reaches_new_data', 'preserved', 'ok');
end $$;

-- A waitlist entry that only pruning can remove (erasure already took the other number's).
insert into public.waitlist_entries(client_id, payload_hash, name, phone, wanted_date)
values (gen_random_uuid(), repeat('b', 64), 'Prune me', '09180000077', pg_temp.today() + 30);

set local role service_role;
select pg_temp.set_subject(9, 'service_role');
select pg_temp.phase_prune();
reset role;

do $$
begin
  if exists (select 1 from public.orders where ig <> '' or status_token is not null or phone <> ''
                or payload_hash is not null)
     or exists (select 1 from public.waitlist_entries) then
    raise exception 'order check differs: prune kept personal data';
  end if;
  -- The order rows themselves stay: the money record is not deleted by pruning.
  if not exists (select 1 from public.orders where customer_name = 'Past customer') then
    raise exception 'order check differs: prune removed the financial record';
  end if;
  insert into pg_temp.authority_results values ('prune_blanks_new_data', 'preserved', 'ok');
end $$;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
