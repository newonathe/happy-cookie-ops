-- B4a boxes, add-ons, the sampler cap and the same-day surcharge with real SQL roles; all data rolls back.
--
-- get_order_extras()/save_order_extras(): the active owner only. get_shop_extras()/place_order()/order_status():
-- anon may execute them. Every new customer rule has a case that must be refused with its own SQLSTATE and
-- a case that must pass, and every total is asserted to the centavo. The harness neutralises each
-- `-- rule:` line of supabase/migrations/20260101004000_order_extras.sql in turn (scripts/test-db-security.py,
-- EXTRAS_MUTATIONS), or changes one expression, and requires the named case here to fail.
-- Same-day cases do not depend on the wall clock: every weekday is a pickup day, the pickup hours are
-- 00:00-24:00, `23:59` is a slot that is still ahead and `00:00` one that has passed.
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;
create temporary table captured (key text primary key, order_no text, token text, total bigint,
  pickup_date date, pickup_window text, replayed boolean);
grant select, insert on captured to anon, authenticated, service_role;

insert into auth.users(id)
select ('b4c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b4c00000-0000-4000-8000-000000000001', 'owner', 'Extras owner', true),
  ('b4c00000-0000-4000-8000-000000000002', 'helper', 'Extras helper', true),
  ('b4c00000-0000-4000-8000-000000000003', 'support', 'Extras support', true),
  ('b4c00000-0000-4000-8000-000000000004', 'owner', 'Extras inactive owner', false);

-- The menu: two cookies, the sampler (a set of six slots) and a set that cannot be boxed.
insert into public.products(id, name, short_name, price_cents, kind, item_type, capacity_weight, published, active, sort_order) values
  ('b4-cookie', 'B4 cookie', 'B4', 12000, 'Permanent', 'cookie', 1, true, true, 1),
  ('b4-odd', 'B4 odd', 'B4o', 12005, 'Permanent', 'cookie', 1, true, true, 2),
  ('b4-sampler', 'B4 sampler', 'B4s', 100000, 'Rotating', 'set', 6, true, true, 3),
  ('b4-fries', 'B4 fries', 'B4f', 26000, 'Rotating', 'set', 4, true, true, 4);
insert into public.payment_methods(id, label, account_number, account_name, active, sort_order) values
  ('b4-gcash', 'B4 GCash', '000', 'Holder', true, 1);

create function pg_temp.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date $$;
create function pg_temp.set_window(open boolean) returns void language plpgsql as $$
declare d integer := extract(dow from now() at time zone 'Asia/Manila')::integer;
begin
  delete from public.settings where key in ('openDow', 'openH', 'openM', 'closeDow', 'closeH', 'closeM', 'extendH');
  insert into public.settings(key, int_value) values ('openDow', d), ('openH', 0), ('openM', 0),
    ('closeDow', d), ('closeH', 23), ('closeM', 59), ('extendH', 24);
end $$;
insert into public.settings(key, int_value) values ('capacity', 500);
select pg_temp.set_window(true);
-- Every weekday, any hour: the wall clock decides nothing below.
update public.order_rules set pickup_days = '{1,2,3,4,5,6,7}', pickup_from_hour = 0, pickup_cutoff_hour = 24;
-- Same-day pickup is off by default; switched on after the public read has shown that.

-- Fixture edits of the owner's configuration (run as the fixture owner of the transaction, never through an API role).
create function pg_temp.set_addon_active(p_id text, p_on boolean) returns void language sql as $$
  update public.order_extras set add_ons = (select jsonb_agg(case when a ->> 'id' = p_id
    then jsonb_set(a, '{active}', to_jsonb(p_on)) else a end order by ord)
    from jsonb_array_elements(add_ons) with ordinality as t(a, ord)) $$;
create function pg_temp.set_box(p_size integer, p_charge bigint, p_on boolean) returns void language sql as $$
  update public.order_extras set box_sizes = (select jsonb_agg(case when b ->> 'size' = p_size::text
    then jsonb_build_object('size', p_size, 'charge_cents', p_charge, 'active', p_on) else b end order by ord)
    from jsonb_array_elements(box_sizes) with ordinality as t(b, ord)) $$;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b4c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

-- A valid one-cookie order for slot n (its own client id and phone) for TOMORROW at 10:00; `over` replaces
-- keys, `dropkeys` removes them.
create function pg_temp.body(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object(
    'client_id', 'b4000000-0000-4000-8000-' || lpad(n::text, 12, '0'),
    'name', 'Extras Buyer', 'ig', '@extras.buyer', 'mobile', '0917' || lpad(n::text, 7, '0'),
    'pickup_date', to_char(pg_temp.today() + 1, 'YYYY-MM-DD'), 'pickup_window', '10:00',
    'pay_method', 'B4 GCash',
    'items', jsonb_build_array(jsonb_build_object('product_id', 'b4-cookie', 'qty', 1))
  ) || over) - dropkeys $$;
create function pg_temp.today_str() returns text language sql stable as $$
  select to_char(pg_temp.today(), 'YYYY-MM-DD') $$;

create function pg_temp.capture(k text, body jsonb) returns void language plpgsql security invoker as $$
begin
  insert into pg_temp.captured
  select k, r.order_no, r.status_token, r.total_cents, r.pickup_date, r.pickup_window, r.replayed
    from public.place_order(body) r;
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
    raise exception 'extras outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.place(actor text, op text, n integer, over jsonb, dropkeys text[], wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op,
    format('select pg_temp.capture(%L, pg_temp.body(%s, %L::jsonb, %L::text[]))', op, n, over::text, dropkeys::text),
    wanted);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'extras check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;
create function pg_temp.total(k text) returns bigint language sql stable as $$
  select total from pg_temp.captured where key = k $$;
create function pg_temp.tok(k text) returns text language sql stable as $$
  select token from pg_temp.captured where key = k $$;
create function pg_temp.no(k text) returns text language sql stable as $$
  select order_no from pg_temp.captured where key = k $$;

-- ---------------------------------------------------------------- what anon and staff may and may not do

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.get_order_extras()', 'EXECUTE') then
    raise exception 'forbidden extras call succeeded: anon / get_order_extras';
  end if;
  if has_function_privilege('anon', 'public.save_order_extras(jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden extras call succeeded: anon / save_order_extras';
  end if;
  if not has_function_privilege('anon', 'public.get_shop_extras()', 'EXECUTE')
     or not has_function_privilege('anon', 'public.place_order(jsonb)', 'EXECUTE') then
    raise exception 'public extras call missing: anon';
  end if;
  insert into pg_temp.authority_results values ('acl', 'anon', 'extras_public_read_owner_rpcs_not');
end $$;

create function pg_temp.assert_tables(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'extras_table_select', 'select * from public.order_extras', '42501');
  perform pg_temp.expect(actor, 'extras_table_update', 'update public.order_extras set same_day_percent = 0', '42501');
  perform pg_temp.expect(actor, 'add_ons_table_select', 'select * from public.order_add_ons', '42501');
  perform pg_temp.expect(actor, 'add_ons_table_insert',
    'insert into public.order_add_ons(order_id, line_no, add_on_id, name, qty, unit_price_cents) values (''HC-RAW'', 1, ''x'', ''x'', 1, 0)', '42501');
  perform pg_temp.expect(actor, 'boxes_table_select', 'select * from public.order_boxes', '42501');
  perform pg_temp.expect(actor, 'boxes_table_insert',
    'insert into public.order_boxes(order_id, size, qty, charge_cents) values (''HC-RAW'', 6, 1, 0)', '42501');
end $$;

create function pg_temp.assert_owner_rpcs_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_order_extras', 'select * from public.get_order_extras()', '42501');
  perform pg_temp.expect(actor, 'save_order_extras', 'select public.save_order_extras(''{}''::jsonb, null)', '42501');
end $$;

-- ---------------------------------------------------------------- the public read

create function pg_temp.phase_public_read(a text) returns void language plpgsql security invoker as $$
declare s jsonb := public.get_shop_extras();
begin
  perform pg_temp.assert_ok(a, 'shop_extras_keys',
    (select array_agg(k order by k) from jsonb_object_keys(s) k) = array['add_ons', 'boxes', 'same_day', 'sampler']);
  perform pg_temp.assert_ok(a, 'shop_extras_defaults',
    not (s -> 'same_day' ->> 'enabled')::boolean and (s -> 'same_day' ->> 'percent')::integer = 40
    and jsonb_array_length(s -> 'boxes') = 3 and jsonb_array_length(s -> 'add_ons') = 4
    and (select array_agg((b ->> 'size')::integer order by (b ->> 'size')::integer) from jsonb_array_elements(s -> 'boxes') b) = array[6, 8, 12]
    and (select (x ->> 'price_cents')::integer from jsonb_array_elements(s -> 'add_ons') x where x ->> 'id' = 'sticker') = 1500);
  perform pg_temp.assert_ok(a, 'shop_extras_no_private_keys',
    not (select bool_or(x ? 'active') from jsonb_array_elements(s -> 'add_ons') x)
    and not (select bool_or(b ? 'active') from jsonb_array_elements(s -> 'boxes') b));
end $$;
create function pg_temp.phase_public_read_hidden(a text) returns void language plpgsql security invoker as $$
declare s jsonb := public.get_shop_extras();
begin
  perform pg_temp.assert_ok(a, 'shop_extras_hides_inactive',
    not exists (select 1 from jsonb_array_elements(s -> 'add_ons') x where x ->> 'id' = 'cream-ribbon')
    and not exists (select 1 from jsonb_array_elements(s -> 'boxes') b where (b ->> 'size')::integer = 12));
end $$;

-- ---------------------------------------------------------------- boxes

create function pg_temp.phase_boxes(a text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.place(a, 'place_plain', 1, '{}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'plain_total', pg_temp.total('place_plain') = 12000);
  -- size 6 costs 2500 a box; seven cookies, one box of six, one cookie in a bag
  perform pg_temp.place(a, 'place_box', 2,
    '{"items": [{"product_id": "b4-cookie", "qty": 7}], "boxes": [{"size": 6, "qty": 1}]}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'box_total', pg_temp.total('place_box') = 7 * 12000 + 2500);
  perform pg_temp.place(a, 'place_box_free_size', 3,
    '{"items": [{"product_id": "b4-cookie", "qty": 8}], "boxes": [{"size": 8, "qty": 1}]}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'box_free_size_total', pg_temp.total('place_box_free_size') = 8 * 12000);
  perform pg_temp.place(a, 'place_box_size_unknown', 4,
    '{"items": [{"product_id": "b4-cookie", "qty": 7}], "boxes": [{"size": 7, "qty": 1}]}', '{}', 'ZC007');
  perform pg_temp.place(a, 'place_box_size_inactive', 5,
    '{"items": [{"product_id": "b4-cookie", "qty": 12}], "boxes": [{"size": 12, "qty": 1}]}', '{}', 'ZC007');
  perform pg_temp.place(a, 'place_box_fit', 6,
    '{"items": [{"product_id": "b4-cookie", "qty": 5}], "boxes": [{"size": 6, "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_box_sets_not_boxable', 7,
    '{"items": [{"product_id": "b4-cookie", "qty": 5}, {"product_id": "b4-fries", "qty": 1}], "boxes": [{"size": 6, "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_box_dup_size', 8,
    '{"items": [{"product_id": "b4-cookie", "qty": 12}], "boxes": [{"size": 6, "qty": 1}, {"size": 6, "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_box_extra_key', 9,
    '{"items": [{"product_id": "b4-cookie", "qty": 6}], "boxes": [{"size": 6, "qty": 1, "charge_cents": 0}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_boxes_not_array', 10,
    '{"boxes": {"size": 6}}', '{}', '22023');
end $$;

-- ---------------------------------------------------------------- add-ons

create function pg_temp.phase_addons(a text) returns void language plpgsql security invoker as $$
begin
  -- two stickers of design 2 (1500 each) and a note card (1000) with its message
  perform pg_temp.place(a, 'place_addons', 20,
    '{"add_ons": [{"id": "sticker", "variant": "2", "qty": 2}, {"id": "note-card", "qty": 1, "text": "Happy birthday Mika"}]}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'addons_total', pg_temp.total('place_addons') = 12000 + 2 * 1500 + 1000);
  perform pg_temp.place(a, 'place_addon_unknown', 21, '{"add_ons": [{"id": "gold-leaf", "qty": 1}]}', '{}', 'ZC007');
  perform pg_temp.place(a, 'place_addon_inactive', 22, '{"add_ons": [{"id": "cream-ribbon", "qty": 1}]}', '{}', 'ZC007');
  perform pg_temp.place(a, 'place_addon_variant_missing', 23, '{"add_ons": [{"id": "sticker", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_variant_unknown', 24, '{"add_ons": [{"id": "sticker", "variant": "9", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_variant_not_offered', 25, '{"add_ons": [{"id": "sticker-pack", "variant": "1", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_text_missing', 26, '{"add_ons": [{"id": "note-card", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_text_too_long', 27,
    jsonb_build_object('add_ons', jsonb_build_array(jsonb_build_object('id', 'note-card', 'qty', 1, 'text', repeat('x', 151)))), '{}', '22023');
  perform pg_temp.place(a, 'place_addon_text_not_offered', 28,
    '{"add_ons": [{"id": "sticker-pack", "qty": 1, "text": "hello"}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_text_two_cards', 29, '{"add_ons": [{"id": "note-card", "qty": 2, "text": "hi"}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_qty', 30, '{"add_ons": [{"id": "sticker-pack", "qty": 11}]}', '{}', '22023');
  -- the limit is per add-on, not per line: two designs of six stickers each is twelve, over the limit of ten
  perform pg_temp.place(a, 'place_addon_qty_across_lines', 37,
    '{"add_ons": [{"id": "sticker", "variant": "1", "qty": 6}, {"id": "sticker", "variant": "2", "qty": 6}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_dup', 31,
    '{"add_ons": [{"id": "sticker", "variant": "1", "qty": 1}, {"id": "sticker", "variant": "1", "qty": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_two_designs', 32,
    '{"add_ons": [{"id": "sticker", "variant": "1", "qty": 1}, {"id": "sticker", "variant": "3", "qty": 1}]}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'addon_two_designs_total', pg_temp.total('place_addon_two_designs') = 12000 + 2 * 1500);
  perform pg_temp.place(a, 'place_addon_price_key', 33, '{"add_ons": [{"id": "sticker-pack", "qty": 1, "price_cents": 1}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_control_chars', 34,
    jsonb_build_object('add_ons', jsonb_build_array(jsonb_build_object('id', 'note-card', 'qty', 1, 'text', 'a' || chr(7) || 'b'))), '{}', '22023');
  perform pg_temp.place(a, 'place_addons_not_array', 35, '{"add_ons": "sticker"}', '{}', '22023');
  perform pg_temp.place(a, 'place_addon_qty_fraction', 36, '{"add_ons": [{"id": "sticker-pack", "qty": 1.5}]}', '{}', '22023');
end $$;

-- ---------------------------------------------------------------- same-day

create function pg_temp.phase_same_day(a text) returns void language plpgsql security invoker as $$
declare today jsonb := jsonb_build_object('pickup_date', pg_temp.today_str(), 'pickup_window', '23:59');
begin
  perform pg_temp.place(a, 'place_same_day', 40, today, '{}', '00000');
  perform pg_temp.assert_ok(a, 'same_day_total', pg_temp.total('place_same_day') = 12000 + 4800);
  perform pg_temp.place(a, 'place_next_day', 41, '{}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'next_day_no_surcharge', pg_temp.total('place_next_day') = 12000);
  -- the surcharge covers the cookies only while the owner leaves add-ons and boxes out of it
  perform pg_temp.place(a, 'place_same_day_addon', 42,
    today || '{"add_ons": [{"id": "sticker", "variant": "1", "qty": 1}]}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'same_day_addon_total', pg_temp.total('place_same_day_addon') = 12000 + 1500 + 4800);
  perform pg_temp.place(a, 'place_same_day_past_time', 43,
    jsonb_build_object('pickup_date', pg_temp.today_str(), 'pickup_window', '00:00'), '{}', 'ZC004');
end $$;
create function pg_temp.phase_same_day_campus_past(a text) returns void language plpgsql security invoker as $$
begin
  -- the campus slot starts at midnight, so it has begun
  perform pg_temp.place(a, 'place_same_day_campus_past', 48,
    jsonb_build_object('pickup_date', pg_temp.today_str(), 'pickup_window', 'campus'), '{}', 'ZC004');
end $$;
create function pg_temp.phase_same_day_campus(a text) returns void language plpgsql security invoker as $$
begin
  -- the campus slot starts at 23:58, so it is still ahead
  perform pg_temp.place(a, 'place_same_day_campus', 49,
    jsonb_build_object('pickup_date', pg_temp.today_str(), 'pickup_window', 'campus'), '{}', '00000');
  perform pg_temp.assert_ok(a, 'same_day_campus_total', pg_temp.total('place_same_day_campus') = 12000 + 4800);
end $$;
create function pg_temp.phase_same_day_extras(a text) returns void language plpgsql security invoker as $$
declare today jsonb := jsonb_build_object('pickup_date', pg_temp.today_str(), 'pickup_window', '23:59');
begin
  perform pg_temp.place(a, 'place_same_day_on_extras', 44,
    today || '{"add_ons": [{"id": "sticker", "variant": "1", "qty": 1}]}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'same_day_on_extras_total', pg_temp.total('place_same_day_on_extras') = 12000 + 1500 + 5400);
end $$;
create function pg_temp.phase_same_day_rounding(a text) returns void language plpgsql security invoker as $$
begin
  -- 10% of 12005 centavos is 1200.5: rounded once, half up, to 1201
  perform pg_temp.place(a, 'place_same_day_rounding', 45,
    jsonb_build_object('pickup_date', pg_temp.today_str(), 'pickup_window', '23:59',
                       'items', jsonb_build_array(jsonb_build_object('product_id', 'b4-odd', 'qty', 1))), '{}', '00000');
  perform pg_temp.assert_ok(a, 'same_day_rounding', pg_temp.total('place_same_day_rounding') = 12005 + 1201);
end $$;
create function pg_temp.phase_same_day_off(a text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.place(a, 'place_same_day_off', 46,
    jsonb_build_object('pickup_date', pg_temp.today_str(), 'pickup_window', '23:59'), '{}', 'ZC004');
  perform pg_temp.place(a, 'place_next_day_when_off', 47, '{}', '{}', '00000');
end $$;

-- ---------------------------------------------------------------- the sampler

create function pg_temp.phase_sampler(a text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.place(a, 'place_sampler_cap', 50,
    '{"items": [{"product_id": "b4-sampler", "qty": 3}]}', '{}', '22023');
  perform pg_temp.place(a, 'place_sampler', 51,
    '{"items": [{"product_id": "b4-sampler", "qty": 2}]}', '{}', '00000');
  perform pg_temp.assert_ok(a, 'sampler_total', pg_temp.total('place_sampler') = 200000);
  perform pg_temp.place(a, 'place_sampler_one', 52,
    '{"items": [{"product_id": "b4-sampler", "qty": 1}]}', '{}', '00000');
end $$;
create function pg_temp.phase_sampler_weight(a text) returns void language plpgsql security invoker as $$
begin
  -- five slots left in the pickup week, the sampler takes six
  perform pg_temp.place(a, 'place_sampler_over_capacity', 53,
    '{"items": [{"product_id": "b4-sampler", "qty": 1}]}', '{}', 'ZC002');
end $$;

-- ---------------------------------------------------------------- replay and status

create function pg_temp.phase_replay(a text) returns void language plpgsql security invoker as $$
declare
  again jsonb;
  s jsonb;
begin
  -- the same body again answers with the order that already exists
  again := pg_temp.body(20, '{"add_ons": [{"id": "sticker", "variant": "2", "qty": 2}, {"id": "note-card", "qty": 1, "text": "Happy birthday Mika"}]}');
  perform pg_temp.assert_ok(a, 'replay_same_total',
    (select r.total_cents = pg_temp.total('place_addons') and r.replayed and r.order_no = pg_temp.no('place_addons')
       from public.place_order(again) r));
  perform pg_temp.expect(a, 'replay_other_addons',
    format('select * from public.place_order(%L::jsonb)',
      pg_temp.body(20, '{"add_ons": [{"id": "sticker", "variant": "2", "qty": 3}, {"id": "note-card", "qty": 1, "text": "Happy birthday Mika"}]}')::text), '23505');
  s := public.order_status(pg_temp.tok('place_addons'));
  perform pg_temp.assert_ok(a, 'status_keys_extras',
    (select array_agg(k order by k) from jsonb_object_keys(s) k)
      = array['add_ons', 'boxes', 'hold_expires_at', 'items', 'order_no', 'pay_method', 'pay_state', 'pickup_date',
              'pickup_window', 'placed_at', 'same_day', 'state', 'surcharge_cents', 'total_cents']);
  perform pg_temp.assert_ok(a, 'status_lists_addons',
    jsonb_array_length(s -> 'add_ons') = 2 and (s ->> 'surcharge_cents')::bigint = 0 and (s ->> 'total_cents')::bigint = 16000);
  perform pg_temp.assert_ok(a, 'status_hides_note', position('Mika' in s::text) = 0);
  perform pg_temp.assert_ok(a, 'status_shows_surcharge',
    (public.order_status(pg_temp.tok('place_same_day')) ->> 'surcharge_cents')::bigint = 4800
    and (public.order_status(pg_temp.tok('place_same_day')) ->> 'same_day')::boolean);
  perform pg_temp.assert_ok(a, 'status_lists_boxes',
    jsonb_array_length(public.order_status(pg_temp.tok('place_box')) -> 'boxes') = 1
    and (public.order_status(pg_temp.tok('place_box')) -> 'boxes' -> 0 ->> 'charge_cents')::bigint = 2500);
end $$;

-- ---------------------------------------------------------------- the owner

create function pg_temp.ex_stamp() returns timestamptz language sql stable as $$
  select (public.get_order_extras() ->> 'updated_at')::timestamptz $$;
create function pg_temp.ex_json() returns jsonb language sql stable as $$
  select public.get_order_extras() - 'updated_at' $$;
create function pg_temp.save(a text, op text, body jsonb, stamp timestamptz, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(a, op,
    format('select public.save_order_extras(%L::jsonb, %L::timestamptz)', body::text, stamp), wanted);
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare
  stamp timestamptz := pg_temp.ex_stamp();
  base jsonb := pg_temp.ex_json();
  s jsonb;
begin
  perform pg_temp.assert_ok(a, 'get_extras_keys',
    (select array_agg(k order by k) from jsonb_object_keys(base) k)
      = array['add_ons', 'box_sizes', 'same_day_enabled', 'same_day_on_extras', 'same_day_percent',
              'sampler_max_qty', 'sampler_product_id']);
  perform pg_temp.save(a, 'save_extras_keys_missing', base - 'add_ons', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_keys_extra', base || '{"price": 1}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_not_object', '[]'::jsonb, stamp, '22023');
  perform pg_temp.save(a, 'save_extras_percent_type', base || '{"same_day_percent": "40"}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_percent_high', base || '{"same_day_percent": 101}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_percent_fraction', base || '{"same_day_percent": 12.5}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_percent_negative', base || '{"same_day_percent": -1}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_sampler_qty_zero', base || '{"sampler_max_qty": 0}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_sampler_qty_high', base || '{"sampler_max_qty": 21}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_sampler_not_a_set', base || '{"sampler_product_id": "b4-cookie"}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_sampler_unknown', base || '{"sampler_product_id": "nope"}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_flag_type', base || '{"same_day_enabled": "yes"}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_box_small', base || '{"box_sizes": [{"size": 1, "charge_cents": 0, "active": true}]}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_box_dup',
    base || '{"box_sizes": [{"size": 6, "charge_cents": 0, "active": true}, {"size": 6, "charge_cents": 0, "active": false}]}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_box_dup_decimal',
    base || '{"box_sizes": [{"size": 6, "charge_cents": 0, "active": true}, {"size": 6.0, "charge_cents": 0, "active": true}]}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_box_negative', base || '{"box_sizes": [{"size": 6, "charge_cents": -1, "active": true}]}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_box_keys', base || '{"box_sizes": [{"size": 6, "active": true}]}', stamp, '22023');
  perform pg_temp.save(a, 'save_extras_addon_id',
    base || jsonb_build_object('add_ons', jsonb_build_array(jsonb_set(base -> 'add_ons' -> 0, '{id}', '"Bad Id"'))), stamp, '22023');
  perform pg_temp.save(a, 'save_extras_addon_dup_id',
    base || jsonb_build_object('add_ons', jsonb_build_array(base -> 'add_ons' -> 0, base -> 'add_ons' -> 0)), stamp, '22023');
  perform pg_temp.save(a, 'save_extras_addon_name_long',
    base || jsonb_build_object('add_ons', jsonb_build_array(jsonb_set(base -> 'add_ons' -> 0, '{name}', to_jsonb(repeat('n', 41))))), stamp, '22023');
  perform pg_temp.save(a, 'save_extras_addon_price_high',
    base || jsonb_build_object('add_ons', jsonb_build_array(jsonb_set(base -> 'add_ons' -> 0, '{price_cents}', '1000001'))), stamp, '22023');
  perform pg_temp.save(a, 'save_extras_addon_text_max',
    base || jsonb_build_object('add_ons', jsonb_build_array(jsonb_set(base -> 'add_ons' -> 0, '{text_max}', '0'))), stamp, '22023');
  perform pg_temp.save(a, 'save_extras_addon_variant_dup',
    base || jsonb_build_object('add_ons', jsonb_build_array(jsonb_set(base -> 'add_ons' -> 0, '{variants}', '["1", "1"]'))), stamp, '22023');
  perform pg_temp.save(a, 'save_extras_addon_keys',
    base || jsonb_build_object('add_ons', jsonb_build_array((base -> 'add_ons' -> 0) - 'max_qty')), stamp, '22023');
  perform pg_temp.save(a, 'save_extras_stamp_null', base, null, 'P0002');
  perform pg_temp.save(a, 'save_extras_stamp_old', base, stamp - interval '1 minute', 'P0002');
  perform pg_temp.save(a, 'save_extras_ok', base || '{"same_day_percent": 25, "sampler_product_id": "b4-sampler", "sampler_max_qty": 2}', stamp, '00000');
  perform pg_temp.save(a, 'save_extras_stale', base || '{"same_day_percent": 30}', stamp, 'P0002');
  s := public.get_order_extras();
  perform pg_temp.assert_ok(a, 'save_extras_persisted',
    (s ->> 'same_day_percent')::integer = 25 and s ->> 'sampler_product_id' = 'b4-sampler'
    and (s ->> 'sampler_max_qty')::integer = 2 and (s ->> 'updated_at')::timestamptz <> stamp);
  -- a new price and a new variant list are normalised and priced from then on
  perform pg_temp.save(a, 'save_extras_prices',
    (pg_temp.ex_json() || '{"same_day_percent": 40}')
      || jsonb_build_object('add_ons', jsonb_build_array(jsonb_build_object(
           'id', 'sticker', 'name', ' Sticker ', 'price_cents', 2000.0, 'active', true, 'variants', '["A", " B "]'::jsonb,
           'text_label', null, 'text_max', 150, 'max_qty', 5))),
    pg_temp.ex_stamp(), '00000');
  s := public.get_order_extras();
  perform pg_temp.assert_ok(a, 'save_extras_normalised',
    s -> 'add_ons' = '[{"id": "sticker", "name": "Sticker", "active": true, "max_qty": 5, "text_max": 150, "variants": ["A", "B"], "price_cents": 2000, "text_label": null}]'::jsonb);
end $$;

-- ---------------------------------------------------------------- what the owner reads back

create function pg_temp.phase_staff_reads(a text) returns void language plpgsql security invoker as $$
declare o jsonb;
begin
  select x into o from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' = pg_temp.no('place_addons');
  perform pg_temp.assert_ok(a, 'staff_sees_addons_and_note',
    (o ->> 'total_cents')::bigint = 16000 and jsonb_array_length(o -> 'add_ons') = 2
    and exists (select 1 from jsonb_array_elements(o -> 'add_ons') x where x ->> 'note' = 'Happy birthday Mika')
    and exists (select 1 from jsonb_array_elements(o -> 'add_ons') x where x ->> 'variant' = '2' and (x ->> 'qty')::integer = 2));
  select x into o from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' = pg_temp.no('place_same_day');
  perform pg_temp.assert_ok(a, 'staff_sees_surcharge',
    (o ->> 'surcharge_cents')::bigint = 4800 and (o ->> 'same_day')::boolean and (o ->> 'total_cents')::bigint = 16800);
  select x into o from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' = pg_temp.no('place_box');
  perform pg_temp.assert_ok(a, 'staff_sees_boxes',
    jsonb_array_length(o -> 'boxes') = 1 and (o -> 'boxes' -> 0 ->> 'size')::integer = 6);
end $$;

-- ---------------------------------------------------------------- erasure and retention

create function pg_temp.phase_erasure() returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect('active_owner', 'erase_paid_note_number', 'select public.anonymise_customer(''0917 0000 060'', ''b4'')', '00000');
  perform pg_temp.expect('active_owner', 'erase_unpaid_note_number', 'select public.anonymise_customer(''0917 0000 061'', ''b4'')', '00000');
end $$;
create function pg_temp.phase_prune() returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect('service_role', 'prune_blanks_note', 'select public.prune_personal_data(-1)', '00000');
end $$;

grant execute on function
  pg_temp.today(), pg_temp.today_str(), pg_temp.set_window(boolean), pg_temp.set_subject(integer, text),
  pg_temp.body(integer, jsonb, text[]), pg_temp.capture(text, jsonb), pg_temp.expect(text, text, text, text),
  pg_temp.place(text, text, integer, jsonb, text[], text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.total(text), pg_temp.tok(text), pg_temp.no(text), pg_temp.assert_acl(), pg_temp.assert_tables(text),
  pg_temp.assert_owner_rpcs_refused(text), pg_temp.phase_public_read(text), pg_temp.phase_public_read_hidden(text),
  pg_temp.phase_boxes(text), pg_temp.phase_addons(text), pg_temp.phase_same_day(text),
  pg_temp.phase_same_day_campus_past(text), pg_temp.phase_same_day_campus(text), pg_temp.phase_same_day_extras(text), pg_temp.phase_same_day_rounding(text), pg_temp.phase_same_day_off(text),
  pg_temp.phase_sampler(text), pg_temp.phase_sampler_weight(text), pg_temp.phase_replay(text),
  pg_temp.ex_stamp(), pg_temp.ex_json(), pg_temp.save(text, text, jsonb, timestamptz, text), pg_temp.phase_owner(text),
  pg_temp.phase_staff_reads(text), pg_temp.phase_erasure(), pg_temp.phase_prune()
  to anon, authenticated, service_role;

-- ================================================================ the run

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_tables('anon');
select pg_temp.assert_owner_rpcs_refused('anon');
select pg_temp.phase_public_read('anon');
reset role;
update public.order_extras set same_day_enabled = true;

-- Boxes: size 6 costs 2500 a box, size 8 is free, size 12 is switched off.
select pg_temp.set_box(6, 2500, true);
select pg_temp.set_box(12, 0, false);
-- The ribbon is switched off.
select pg_temp.set_addon_active('cream-ribbon', false);
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_public_read_hidden('anon');
select pg_temp.phase_boxes('anon');
select pg_temp.phase_addons('anon');
select pg_temp.phase_same_day('anon');
reset role;

-- The campus slot on the same day: one that starts at midnight has begun, one that starts at 23:58 has not.
update public.order_rules set campus_from = '00:00', campus_to = '00:01';
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_same_day_campus_past('anon');
reset role;
update public.order_rules set campus_from = '23:58', campus_to = '23:59';
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_same_day_campus('anon');
reset role;
update public.order_rules set campus_from = '14:00', campus_to = '15:30';

-- Same-day also covers add-ons and box charges.
update public.order_extras set same_day_on_extras = true;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_same_day_extras('anon');
reset role;
update public.order_extras set same_day_on_extras = false;

-- 10 percent turns 12005 centavos into a half centavo.
update public.order_extras set same_day_percent = 10;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_same_day_rounding('anon');
reset role;
update public.order_extras set same_day_percent = 40;

-- Same-day pickup is off.
update public.order_extras set same_day_enabled = false;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_same_day_off('anon');
reset role;
update public.order_extras set same_day_enabled = true;

-- The sampler: at most two a order, six slots each.
update public.order_extras set sampler_product_id = 'b4-sampler', sampler_max_qty = 2;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_sampler('anon');
reset role;
select pg_temp.set_subject(1);
update public.settings set int_value = (select coalesce(sum(oi.qty * oi.capacity_weight), 0) + 5
    from public.orders o join public.order_items oi on oi.order_id = o.id
   where o.pickup_date >= date_trunc('week', (pg_temp.today() + 1)::timestamp)::date
     and o.pickup_date < date_trunc('week', (pg_temp.today() + 1)::timestamp)::date + 7) where key = 'capacity';
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_sampler_weight('anon');
reset role;
select pg_temp.set_subject(1);
update public.settings set int_value = 500 where key = 'capacity';
do $$
begin
  if (select capacity_weight from public.order_items where order_id = pg_temp.no('place_sampler')) <> 6 then
    raise exception 'extras check differs: sampler slots not frozen on the line';
  end if;
  insert into pg_temp.authority_results values ('sampler_slots_frozen', 'preserved', 'ok');
end $$;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.phase_replay('anon');
reset role;

-- The lines an order carries are stored as ordered, and nothing else is open to the API roles.
do $$
declare v_id text := pg_temp.no('place_addons');
begin
  if (select count(*) from public.order_add_ons where order_id = v_id) <> 2
     or not exists (select 1 from public.order_add_ons where order_id = v_id and add_on_id = 'sticker' and variant = '2'
                      and qty = 2 and unit_price_cents = 1500 and name = 'Sticker' and line_no = 1 and note is null)
     or not exists (select 1 from public.order_add_ons where order_id = v_id and add_on_id = 'note-card'
                      and qty = 1 and unit_price_cents = 1000 and note = 'Happy birthday Mika' and line_no = 2) then
    raise exception 'extras check differs: add-on lines not stored as ordered';
  end if;
  if not exists (select 1 from public.order_boxes where order_id = pg_temp.no('place_box') and size = 6 and qty = 1 and charge_cents = 2500)
     or exists (select 1 from public.order_boxes where order_id = pg_temp.no('place_box_free_size') and charge_cents <> 0)
     or (select surcharge_cents from public.orders where id = pg_temp.no('place_same_day')) <> 4800
     or not (select same_day from public.orders where id = pg_temp.no('place_same_day'))
     or (select surcharge_cents from public.orders where id = pg_temp.no('place_next_day')) <> 0
     or (select same_day from public.orders where id = pg_temp.no('place_next_day')) then
    raise exception 'extras check differs: boxes or surcharge not stored';
  end if;
  insert into pg_temp.authority_results values ('lines_stored_as_ordered', 'preserved', 'ok');
end $$;

-- The customer's note-card message is their own words: three orders carry one (D11).
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.place('anon', 'place_note_paid', 60, '{"add_ons": [{"id": "note-card", "qty": 1, "text": "erase me"}]}', '{}', '00000');
select pg_temp.place('anon', 'place_note_unpaid', 61,
  '{"items": [{"product_id": "b4-cookie", "qty": 6}], "boxes": [{"size": 6, "qty": 1}], "add_ons": [{"id": "note-card", "qty": 1, "text": "delete me"}]}', '{}', '00000');
select pg_temp.place('anon', 'place_note_pruned', 62, '{"add_ons": [{"id": "note-card", "qty": 1, "text": "prune me"}]}', '{}', '00000');
reset role;
update public.orders set state = 'Confirmed', pay_state = 'confirmed'
 where id in (pg_temp.no('place_note_paid'), pg_temp.no('place_note_pruned'));

-- The configuration was last saved an hour ago (the touch trigger stamps the transaction's own clock).
alter table public.order_extras disable trigger order_extras_touch;
update public.order_extras set updated_at = now() - interval '1 hour';
alter table public.order_extras enable trigger order_extras_touch;

set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_tables('active_helper');
select pg_temp.assert_owner_rpcs_refused('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_tables('active_support');
select pg_temp.assert_owner_rpcs_refused('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_owner_rpcs_refused('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_tables('active_owner');
select pg_temp.phase_staff_reads('active_owner');
select pg_temp.phase_owner('active_owner');
select pg_temp.phase_erasure();
reset role;

do $$
begin
  if exists (select 1 from public.order_add_ons where order_id = pg_temp.no('place_note_paid') and note is not null) then
    raise exception 'extras check differs: erased paid order kept the note';
  end if;
  if not exists (select 1 from public.order_add_ons where order_id = pg_temp.no('place_note_paid') and add_on_id = 'note-card') then
    raise exception 'extras check differs: erasure removed the financial record';
  end if;
  if exists (select 1 from public.orders where id = pg_temp.no('place_note_unpaid'))
     or exists (select 1 from public.order_add_ons where order_id = pg_temp.no('place_note_unpaid'))
     or exists (select 1 from public.order_boxes where order_id = pg_temp.no('place_note_unpaid')) then
    raise exception 'extras check differs: erased unpaid order left its lines';
  end if;
  if not exists (select 1 from public.order_add_ons where order_id = pg_temp.no('place_note_pruned') and note = 'prune me') then
    raise exception 'extras check differs: erasure touched another customer';
  end if;
  insert into pg_temp.authority_results values ('erasure_reaches_notes', 'preserved', 'ok');
end $$;

set local role service_role;
select pg_temp.set_subject(9, 'service_role');
select pg_temp.phase_prune();
reset role;

do $$
begin
  if exists (select 1 from public.order_add_ons where note is not null) then
    raise exception 'extras check differs: prune kept the note';
  end if;
  insert into pg_temp.authority_results values ('prune_blanks_notes', 'preserved', 'ok');
end $$;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
