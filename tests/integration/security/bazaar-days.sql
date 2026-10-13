-- S1 bazaar days (migration 20260101006700) with real SQL roles; all data rolls back.
--
-- THE HAND-WORKED EXAMPLE. Every figure below was worked out on paper first; bazaar_summary is held to it to the centavo.
--
-- Booking X "Fixture fair", two days (day 0 and day 1), rent 500.00 (50000 c), target profit 500.00 (50000 c).
-- Fees: "Permit" 250.00 for the whole event; "Parking" 50.00 for day 1. Fees = 50000 + 25000 + 5000 = 80000 (for the event 75000, day 1 5000).
-- Cost per cookie: A 1200.5000 c from its recipe (250 g flour at 20 c + 3 eggs at 1500 c = 9500 c for 10 cookies = 950, plus one pouch
-- at 250.5 c); B 2875.2500 c, typed by her; C none at first (no recipe), then typed 1000 c. D has an incomplete recipe (one line has no
-- cost), so it is stored as no cost; D is priced on day 1 with no stock, so it changes no figure.
--
-- Day 1. Prices A 130.00, B 150.00, C 90.00. Made A 20, B 10, C 6. Float 500.00.
--   S1 2 A + 1 B, cash                       gross 41000, total 41000
--   S2 3 A, GCash, discount 10.00            gross 39000, total 38000
--   S3 1 B, freebie                          gross 15000, total 0        (given: B 1)
--   S4 2 C, cash, VOIDED                     counts nowhere
--   S5 1 C, cash                             gross 9000, total 9000
--   Loss: 1 A dropped.
--   Revenue 41000 + 38000 + 0 + 9000 = 88000. Gross 104000, discounts 1000, freebies at their price 15000: 104000 - 1000 - 15000 = 88000.
--   By how paid: cash 50000, GCash 38000. Cash expected = 50000 float + 50000 = 100000; counted 99500: SHORT 500.
--   A: 20 - 5 sold - 1 lost = 14; she counts 13: not accounted 1. Left 13 = 8 carried over + 3 to the shop + 2 written off.
--   B: 10 - 1 sold - 1 given = 8; she counts 8. Left 8 = 5 carried over + 3 written off.
--   C: 6 - 1 sold = 5; she counts 5, all carried over.
--
-- Day 2 (the booking's last day). Prices A 120.00, B 150.00, C 90.00. Made A 10, then 2 more added: 12. Carried A 8, B 4 (one of the 5
-- set aside never came: it ends up not accounted), C 5. Float 300.00.
--   T1 4 A, cash                             gross 48000, total 48000
--   T2 2 B + 1 C, Maya                       gross 39000, total 39000
--   T3 1 A, freebie                          gross 12000, total 0        (given: A 1)
--   Loss: 1 C.
--   Revenue 87000. Gross 99000, discounts 0, freebies 12000. Cash expected = 30000 + 48000 = 78000; counted 78000: neither over nor short.
--   A: 12 + 8 - 4 - 1 = 15; she counts 15 = 10 to the shop + 5 written off.
--   B: 4 - 2 = 2; she counts 2, written off.
--   C: 5 - 1 sold - 1 lost = 3; she counts 2: not accounted 1. Left 2, to the shop.
--
-- The event. Revenue 88000 + 87000 = 175000 (cash 98000, GCash 38000, Maya 39000). Gross 203000, discounts 1000, freebies 27000.
--   Flavour  made  to shop  sold  given  lost  written off  not accounted (= made - the rest)
--   A         32     13       9     1      1       7            1
--   B         10      0       3     1      0       5            1
--   C          6      2       2     0      1       0            1
-- A cost line is quantity x cost per cookie, rounded HALF UP to the centavo per flavour line:
--   A  made 32 x 1200.5 = 38416;  to shop 13 x 1200.5 = 15606.5 -> 15607;  cookie cost 38416 - 15607 = 22809
--      sold 10804.5 -> 10805, given 1200.5 -> 1201, lost 1201, written off 8403.5 -> 8404, not accounted 1201: 22812; rounding -3
--   B  made 10 x 2875.25 = 28752.5 -> 28753;  to shop 0;  cookie cost 28753
--      sold 8625.75 -> 8626, given 2875.25 -> 2875, lost 0, written off 14376.25 -> 14376, not accounted 2875: 28752; rounding +1
--   C  (at 1000) made 6000; to shop 2000; cookie cost 4000;  sold 2000, lost 1000, not accounted 1000: 4000; rounding 0
-- While C has no cost: cookie cost and profit are NULL, with the why. Once she types 1000 for C:
--   Cost of cookies made 38416 + 28753 + 6000 = 73169; to the shop 15607 + 2000 = 17607; COOKIE COST 55562.
--   Parts: sold 21431 + given 4076 + lost 2201 + written off 22780 + not accounted 5076 = 55564, rounding -2: 55562.
--   PROFIT = 175000 - 80000 - 55562 + 0 over - 500 short = 38938. Against the target: 38938 - 50000 = -11062; revenue still needed 11062.
-- X sent cookies to the shop, so finalise_bazaar refuses it (rule:fin-shop-entry) until that entry is decided.
--
-- Booking Y "Second fair", sells on one day of its three, nothing to the shop, so it is finalised. Rent 300.00. "Tape" 15.00 was added at the
-- till (add_event_expense) on the day: it is a fee of the day too. Fees "Ice" 40.00 (the day), "Permit" 60.00 (the
-- event). A at its recipe cost 1200.5, B typed 2000. Made A 12, B 3. Float 200.00.
--   U1 2 A cash 26000;  U2 1 A + 1 B GCash 28000;  U3 1 A cash 13000, VOIDED.   Revenue 54000.
--   Cash expected 20000 + 26000 = 46000; counted 46700: OVER 700. Left A 9 and B 2, all written off.
--   Fees 30000 + 4000 + 6000 + 1500 = 41500 (the day: 5500). Cookie cost: A 12 x 1200.5 = 14406 (sold 3601.5 -> 3602, written off 10804.5 -> 10805: rounding -1);
--   B 3 x 2000 = 6000. 20406. PROFIT = 54000 - 41500 - 20406 + 700 = -7206.
--   At finalise the books get: rent -30000, Ice -4000, Permit -6000, drawer over +700; the four sale lines (26000, 28000, 13000 and its
--   void -13000) and the Tape cost stop being held: revenue lines 54700, expense lines 41500.
--   Stock taken for A's 12 cookies: flour 250 x 12 / 10 = 300.0 g (280 on hand: 280 taken, 20 short); eggs 3 x 12 / 10 = 3.6 -> 4;
--   pouches 12. B has no recipe: a shortfall, why "no recipe". Bags: one per sale that is not voided = 2 (1 on hand: 1 taken, 1 short).
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b0d00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b0d00000-0000-4000-8000-000000000001', 'owner', 'Days owner', true),
  ('b0d00000-0000-4000-8000-000000000002', 'helper', 'Days helper', true),
  ('b0d00000-0000-4000-8000-000000000003', 'support', 'Days support', true),
  ('b0d00000-0000-4000-8000-000000000004', 'owner', 'Days inactive owner', false);
insert into public.products(id, name, short_name, price_cents, kind, tag, description, image_path,
  active, published, sort_order, allergens)
values ('mp0s-a', 'Fixture A', 'A', 13000, 'Permanent', '', '', '/a.png', true, true, 1, 'milk'),
       ('mp0s-b', 'Fixture B', 'B', 15000, 'Rotating', '', '', '/b.png', true, true, 2, 'milk'),
       ('mp0s-c', 'Fixture C', 'C', 9000, 'Rotating', '', '', '/c.png', true, true, 3, 'milk'),
       ('mp0s-d', 'Fixture D', 'D', 8000, 'Rotating', '', '', '/d.png', true, true, 4, 'milk');
insert into public.inventory_items(id, name, unit, category, active, on_hand, avg_cost) values
  ('bzi-flour', 'BZ Flour', 'g', 'Ingredients', true, 280, 20),
  ('bzi-egg', 'BZ Egg', 'pcs', 'Ingredients', true, 10, 1500),
  ('bzi-sprinkle', 'BZ Sprinkle', 'g', 'Ingredients', true, 50, null),
  ('bzi-pouch', 'BZ Pouch', 'pcs', 'Packaging', true, 100, 250.5),
  ('bzi-bag', 'BZ Bag', 'pcs', 'Packaging', true, 1, 300);
insert into public.recipes(product_id, yield_count) values ('mp0s-a', 10), ('mp0s-d', 10);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position, item_id, kind) values
  ('mp0s-a', 'BZ Flour', 250, 'g', 0, 'bzi-flour', 'ingredient'),
  ('mp0s-a', 'BZ Egg', 3, 'pcs', 1, 'bzi-egg', 'ingredient'),
  ('mp0s-a', 'BZ Pouch', 1, 'pcs', 2, 'bzi-pouch', 'packaging'),
  ('mp0s-d', 'BZ Flour', 100, 'g', 0, 'bzi-flour', 'ingredient'),
  ('mp0s-d', 'BZ Sprinkle', 5, 'g', 1, 'bzi-sprinkle', 'ingredient');
insert into public.packaging_rules(container, item_id, qty, per, position) values ('bazaar_sale', 'bzi-bag', 1, 'container', 1);
insert into public.scheduled_events(id, name, starts_on, ends_on, place, rent_cents, active) values
  ('b0d0b000-0000-4000-8000-000000000001', 'Fixture fair', current_date, current_date + 1, 'Hall', 50000, true),
  ('b0d0b000-0000-4000-8000-000000000002', 'Second fair', current_date + 13, current_date + 15, 'Yard', 30000, true),
  ('b0d0b000-0000-4000-8000-000000000003', 'Off fair', current_date + 20, current_date + 20, '', 0, false);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b0d00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

-- Runs one statement; anything but `wanted` fails the suite, a success included.
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
    raise exception 'bazaar day outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

create function pg_temp.confirm(ok boolean, actor text, operation text, outcome text) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'bazaar day check differs: % / % / %', actor, operation, outcome;
  end if;
  insert into pg_temp.authority_results values (operation, actor, outcome);
end $$;

-- The tables have no API grant, so a check that reads one runs as the suite's own role.
create function pg_temp.q(cond text) returns boolean language plpgsql security definer as $$
declare ok boolean;
begin
  execute 'select ' || cond into ok;
  return ok;
end $$;

create function pg_temp.bx() returns text language sql immutable as $$ select 'b0d0b000-0000-4000-8000-000000000001'::text $$;
create function pg_temp.bqy() returns text language sql immutable as $$ select 'b0d0b000-0000-4000-8000-000000000002'::text $$;
create function pg_temp.bz() returns text language sql immutable as $$ select 'b0d0b000-0000-4000-8000-000000000003'::text $$;
create function pg_temp.dy(n integer) returns text language sql immutable as $$ select 'b0d0d000-0000-4000-8000-0000000000' || n::text $$;
create function pg_temp.ev(n integer) returns text language sql immutable as $$ select 'b0d0e000-0000-4000-8000-0000000000' || n::text $$;
create function pg_temp.d(n integer) returns text language sql stable as $$ select (current_date + n)::text $$;
create function pg_temp.now_ms() returns bigint language sql stable security invoker as $$
  select (extract(epoch from now()) * 1000)::bigint
$$;
create function pg_temp.line(pid text, made integer, carried integer, price bigint) returns jsonb language sql immutable as $$
  select jsonb_build_object('product_id', pid, 'made_qty', made, 'carried_qty', carried, 'price_cents', price)
$$;
create function pg_temp.plan(day_id text, booking text, n integer, float_c bigint, lines jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('id', day_id, 'scheduled_id', booking, 'day', pg_temp.d(n), 'float_cents', float_c, 'lines', lines)
$$;
create function pg_temp.fee(client text, booking text, day_id text, label text, amount bigint, n integer) returns jsonb language sql stable as $$
  select jsonb_build_object('client_id', client, 'scheduled_id', booking, 'day_id', day_id, 'label', label, 'category', 'Bazaar fees',
    'amount_cents', amount, 'paid_on', pg_temp.d(n))
$$;
create function pg_temp.loss(client text, day_id text, pid text, qty integer) returns jsonb language sql stable as $$
  select jsonb_build_object('client_id', client, 'day_id', day_id, 'product_id', pid, 'qty', qty, 'reason', 'Dropped', 'at', pg_temp.now_ms())
$$;
create function pg_temp.sale(event_id text, client text, items jsonb, discount bigint, total bigint, pay text) returns jsonb
language sql stable as $$
  select jsonb_build_object('clientId', client, 'deviceId', 'devA', 'eventId', event_id, 'items', items, 'discountCents', discount,
    'totalCents', total, 'pay', pay, 'ref', '', 'clerk', 'Owner', 'at', pg_temp.now_ms(), 'tenderedCents', total, 'changeCents', 0)
$$;
create function pg_temp.void(client text) returns jsonb language sql stable as $$
  select jsonb_build_object('clientId', client, 'deviceId', 'devA', 'at', pg_temp.now_ms())
$$;
create function pg_temp.sm(booking text) returns jsonb language sql stable security invoker as $$
  select public.get_bazaar(booking::uuid) -> 'summary'
$$;
create function pg_temp.dayj(s jsonb, day_id text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(s -> 'days') x where x ->> 'id' = day_id
$$;
create function pg_temp.dl(s jsonb, day_id text, pid text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(pg_temp.dayj(s, day_id) -> 'lines') x where x ->> 'product_id' = pid
$$;
create function pg_temp.dc(s jsonb, day_id text, pid text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(pg_temp.dayj(s, day_id) -> 'count') x where x ->> 'product_id' = pid
$$;
create function pg_temp.cc(s jsonb, pid text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(s -> 'cookie_cost' -> 'lines') x where x ->> 'product_id' = pid
$$;
create function pg_temp.part(s jsonb, label text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(s -> 'cookie_cost' -> 'parts') x where x ->> 'label' = label
$$;
create function pg_temp.stamp(booking text, day_id text) returns text language sql stable security invoker as $$
  select x ->> 'updated_at' from jsonb_array_elements(public.get_bazaar(booking::uuid) -> 'stamps') x where x ->> 'id' = day_id
$$;
create function pg_temp.cl(l integer, c integer, s integer, w integer) returns jsonb language sql immutable as $$
  select jsonb_build_object('left', l, 'carry_next', c, 'to_shop', s, 'written_off', w)
$$;
create function pg_temp.closing(booking text, day_id text, counted jsonb, lines jsonb) returns jsonb language sql stable security invoker as $$
  select jsonb_build_object('day_id', day_id, 'at', pg_temp.now_ms() + 60000, 'counted_cents', counted, 'lines', lines,
    'expected', pg_temp.dayj(pg_temp.sm(booking), day_id) ->> 'hash')
$$;
-- The books over a wide period: the sum of one kind of line, and the held entry of one booking.
create function pg_temp.books() returns jsonb language sql stable security invoker as $$
  select public.get_books(now() - interval '60 days', now() + interval '60 days')
$$;
create function pg_temp.sumk(b jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((x ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(b -> 'lines') x where x ->> 'kind' = k
$$;
create function pg_temp.held(b jsonb, booking text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(b -> 'held') x where x ->> 'scheduled_id' = booking
$$;

-- anon must not even hold EXECUTE, on the ten commands or on the four internal functions.
create function pg_temp.assert_anon_acl() returns void language plpgsql security invoker as $$
declare
  sig text;
begin
  foreach sig in array array['get_bazaar(uuid)', 'save_bazaar_day(jsonb,timestamptz)', 'save_bazaar_fee(jsonb)', 'save_bazaar_loss(jsonb)',
    'save_bazaar_cost(uuid,text,numeric)', 'save_bazaar_target(uuid,bigint)', 'start_bazaar_day(uuid,text,uuid)',
    'add_bazaar_day_stock(uuid,text,integer,text,uuid)', 'close_bazaar_day(jsonb)', 'finalise_bazaar(uuid,text)',
    'bazaar_summary(uuid)', 'bazaar_line_facts(uuid)', 'bazaar_held_ledger()', 'recipe_stock_plan(text,numeric,text,jsonb)'] loop
    if has_function_privilege('anon', 'public.' || sig, 'EXECUTE') then
      raise exception 'forbidden bazaar day call succeeded: anon / %', split_part(sig, '(', 1);
    end if;
  end loop;
  insert into pg_temp.authority_results values ('bazaar_days_acl', 'anon', 'no_execute');
end $$;

-- Every caller but the active owner is refused all ten commands.
create function pg_temp.assert_denied(actor text) returns void language plpgsql security invoker as $$
declare
  f text := '''b0d0c105-0000-4000-8000-000000000001''';
begin
  perform pg_temp.expect(actor, 'get_bazaar', 'select public.get_bazaar(' || f || ')', '42501');
  perform pg_temp.expect(actor, 'save_bazaar_day', 'select * from public.save_bazaar_day(''{}''::jsonb, null)', '42501');
  perform pg_temp.expect(actor, 'save_bazaar_fee', 'select * from public.save_bazaar_fee(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'save_bazaar_loss', 'select * from public.save_bazaar_loss(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'save_bazaar_cost', 'select * from public.save_bazaar_cost(' || f || ', ''mp0s-a'', 1)', '42501');
  perform pg_temp.expect(actor, 'save_bazaar_target', 'select public.save_bazaar_target(' || f || ', 1)', '42501');
  perform pg_temp.expect(actor, 'start_bazaar_day', 'select * from public.start_bazaar_day(' || f || ', ''devA'', ' || f || ')', '42501');
  perform pg_temp.expect(actor, 'add_bazaar_day_stock',
    'select * from public.add_bazaar_day_stock(' || f || ', ''mp0s-a'', 1, ''made'', ' || f || ')', '42501');
  perform pg_temp.expect(actor, 'close_bazaar_day', 'select public.close_bazaar_day(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'finalise_bazaar', 'select public.finalise_bazaar(' || f || ', repeat(''0'', 64))', '42501');
end $$;

create function pg_temp.assert_owner() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  s jsonb;
  b jsonb;
  r record;
  h text;
  l1 jsonb := jsonb_build_array(pg_temp.line('mp0s-a', 20, 0, 13000), pg_temp.line('mp0s-b', 10, 0, 15000),
    pg_temp.line('mp0s-c', 6, 0, 9000), pg_temp.line('mp0s-d', 0, 0, 8000));
  l2 jsonb := jsonb_build_array(pg_temp.line('mp0s-a', 10, 8, 12000), pg_temp.line('mp0s-b', 0, 6, 15000), pg_temp.line('mp0s-c', 0, 5, 9000));
  ly jsonb := jsonb_build_array(pg_temp.line('mp0s-a', 12, 0, 13000), pg_temp.line('mp0s-b', 3, 0, 15000));
begin
  -- ---- get_bazaar and the plan
  perform pg_temp.expect(a, 'get_booking_missing', $q$select public.get_bazaar('b0d0c105-0000-4000-8000-0000000000ff')$q$, 'P0002');
  s := pg_temp.sm(pg_temp.bx());
  perform pg_temp.confirm(s -> 'days' = '[]'::jsonb and (s #>> '{fees,total_cents}')::bigint = 50000 and (s #>> '{revenue,revenue_cents}')::bigint = 0
    and (s #>> '{profit,cents}')::bigint = -50000 and s ->> 'counted' = 'true' and s ->> 'hash' ~ '^[0-9a-f]{64}$',
    a, 'summary_before_any_day', 'rent_only');
  perform pg_temp.expect(a, 'day_shape_extra_key',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, '[]') || '{"role": "owner"}', null)$q$, '22023');
  perform pg_temp.expect(a, 'day_shape_float_fraction',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, '[]') || '{"float_cents": 10.5}', null)$q$, '22023');
  perform pg_temp.expect(a, 'day_line_extra_key',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, jsonb_build_array(pg_temp.line('mp0s-a', 1, 0, 100) || '{"x": 1}')), null)$q$, '22023');
  perform pg_temp.expect(a, 'day_line_qty_too_big',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, jsonb_build_array(pg_temp.line('mp0s-a', 10000, 0, 100))), null)$q$, '22023');
  perform pg_temp.expect(a, 'day_line_qty_fraction',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, jsonb_build_array(pg_temp.line('mp0s-a', 1, 0, 100) || '{"made_qty": 1.5}')), null)$q$, '22023');
  perform pg_temp.expect(a, 'day_line_price_negative',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, jsonb_build_array(pg_temp.line('mp0s-a', 1, 0, 100) || '{"price_cents": -1}')), null)$q$, '22023');
  perform pg_temp.expect(a, 'day_line_twice',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, jsonb_build_array(pg_temp.line('mp0s-a', 1, 0, 100), pg_temp.line('mp0s-a', 2, 0, 100))), null)$q$, '22023');
  perform pg_temp.expect(a, 'day_not_a_date',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, '[]') || '{"day": "2026-02-30"}', null)$q$, '22023');
  perform pg_temp.expect(a, 'day_booking_missing',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), 'b0d0c105-0000-4000-8000-0000000000ff', 0, 50000, '[]'), null)$q$, 'P0002');
  perform pg_temp.expect(a, 'day_outside_the_booking',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 2, 50000, '[]'), null)$q$, '22023');
  perform pg_temp.expect(a, 'day_flavour_missing',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, jsonb_build_array(pg_temp.line('mp0s-zzz', 1, 0, 100))), null)$q$, '22023');
  perform pg_temp.expect(a, 'day_create_with_a_stamp',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, '[]'), now())$q$, 'P0002');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 0 from public.bazaar_days)$q$), a, 'day_refusals_leave_nothing', 'no_rows');
  perform public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, l1), null);
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 4 from public.bazaar_day_lines where day_id = pg_temp.dy(11)::uuid)$q$)
    and pg_temp.q($q$(select float_cents = 50000 and event_id is null from public.bazaar_days where id = pg_temp.dy(11)::uuid)$q$),
    a, 'day_created', 'four_lines_and_float');
  perform pg_temp.expect(a, 'day_repeat_answered',
    format($q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 50000, %L), null)$q$, l1), '00000');
  perform pg_temp.expect(a, 'day_create_again_other_body',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 60000, '[]'), null)$q$, 'P0002');
  perform pg_temp.expect(a, 'day_stale_stamp',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 60000, '[]'), '2020-01-01 00:00+00')$q$, 'P0002');
  perform pg_temp.expect(a, 'day_date_taken',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(19), pg_temp.bx(), 0, 50000, '[]'), null)$q$, '23505');
  perform pg_temp.expect(a, 'day_id_of_another_booking',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bqy(), 14, 50000, '[]'), '2020-01-01 00:00+00')$q$, '23505');
  -- Day 2 is planned with B carrying 6 (one more than day 1 will set aside), and a day with no stock for the inactive booking.
  perform public.save_bazaar_day(pg_temp.plan(pg_temp.dy(12), pg_temp.bx(), 1, 30000, l2), null);
  perform public.save_bazaar_day(pg_temp.plan(pg_temp.dy(31), pg_temp.bz(), 20, 0, jsonb_build_array(pg_temp.line('mp0s-a', 5, 0, 100))), null);
  perform public.save_bazaar_day(pg_temp.plan(pg_temp.dy(21), pg_temp.bqy(), 14, 20000, jsonb_build_array(pg_temp.line('mp0s-a', 0, 0, 13000))), null);

  -- ---- fees, costs, the target
  perform pg_temp.expect(a, 'fee_shape_extra_key',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 25000, 0) || '{"x": 1}')$q$, '22023');
  perform pg_temp.expect(a, 'fee_zero',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 0, 0))$q$, '22023');
  perform pg_temp.expect(a, 'fee_fraction',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 1, 0) || '{"amount_cents": 10.5}')$q$, '22023');
  perform pg_temp.expect(a, 'fee_blank_label',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, '   ', 25000, 0))$q$, '22023');
  perform pg_temp.expect(a, 'fee_rent_id',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('rent:' || pg_temp.bx(), pg_temp.bx(), null, 'Permit', 25000, 0))$q$, '22023');
  perform pg_temp.expect(a, 'fee_not_a_date',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 25000, 0) || '{"paid_on": "2026-02-30"}')$q$, '22023');
  perform pg_temp.expect(a, 'fee_booking_missing',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', 'b0d0c105-0000-4000-8000-0000000000ff', null, 'Permit', 25000, 0))$q$, 'P0002');
  perform pg_temp.expect(a, 'fee_day_of_another_booking',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), pg_temp.dy(21), 'Permit', 25000, 0))$q$, '22023');
  perform pg_temp.expect(a, 'fee_paid_on_far',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 25000, 800))$q$, '22023');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 0 from public.bazaar_fees)$q$), a, 'fee_refusals_leave_nothing', 'no_rows');
  select * into r from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 25000, 0));
  perform pg_temp.confirm(r.duplicate = false and pg_temp.q($q$(select count(*) = 0 from public.ledger_entries)$q$), a, 'fee_first', 'saved_and_nothing_in_the_ledger');
  perform pg_temp.expect(a, 'fee_repeat_answered',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 25000, 0))$q$, '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 1 from public.bazaar_fees)$q$)
    and pg_temp.q($q$(select count(*) = 1 from public.audit_log where action = 'bazaar.fee_saved')$q$), a, 'fee_repeat_adds_nothing', 'one_row_one_audit');
  perform pg_temp.expect(a, 'fee_same_id_other_body',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-permit', pg_temp.bx(), null, 'Permit', 26000, 0))$q$, '23505');
  perform public.save_bazaar_fee(pg_temp.fee('f-parking', pg_temp.bx(), pg_temp.dy(11), 'Parking', 5000, 0));

  perform pg_temp.expect(a, 'cost_negative', $q$select * from public.save_bazaar_cost(pg_temp.bx()::uuid, 'mp0s-b', -1)$q$, '22023');
  perform pg_temp.expect(a, 'cost_five_decimals', $q$select * from public.save_bazaar_cost(pg_temp.bx()::uuid, 'mp0s-b', 1.00001)$q$, '22023');
  perform pg_temp.expect(a, 'cost_booking_missing',
    $q$select * from public.save_bazaar_cost('b0d0c105-0000-4000-8000-0000000000ff', 'mp0s-b', 1)$q$, 'P0002');
  perform pg_temp.expect(a, 'cost_flavour_missing', $q$select * from public.save_bazaar_cost(pg_temp.bx()::uuid, 'mp0s-zzz', 1)$q$, '22023');
  select * into r from public.save_bazaar_cost(pg_temp.bx()::uuid, 'mp0s-b', 2875.25);
  perform pg_temp.confirm(r.typed_cents = 2875.25 and r.recipe_cents is null
    and pg_temp.q($q$(select count(*) = 1 from public.audit_log where action = 'bazaar.cost_typed')$q$), a, 'cost_typed', 'stored_and_audited');
  perform pg_temp.expect(a, 'cost_repeat_answered', $q$select * from public.save_bazaar_cost(pg_temp.bx()::uuid, 'mp0s-b', 2875.25)$q$, '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 1 from public.audit_log where action = 'bazaar.cost_typed')$q$), a, 'cost_repeat_adds_nothing', 'one_audit');

  perform pg_temp.expect(a, 'target_negative', $q$select public.save_bazaar_target(pg_temp.bx()::uuid, -1)$q$, '22023');
  perform pg_temp.expect(a, 'target_booking_missing', $q$select public.save_bazaar_target('b0d0c105-0000-4000-8000-0000000000ff', 1)$q$, 'P0002');
  perform pg_temp.confirm(public.save_bazaar_target(pg_temp.bx()::uuid, 50000) = 50000
    and pg_temp.q($q$(select target_profit_cents = 50000 from public.scheduled_events where id = pg_temp.bx()::uuid)$q$), a, 'target_set', 'stored');
  perform pg_temp.expect(a, 'target_repeat_answered', $q$select public.save_bazaar_target(pg_temp.bx()::uuid, 50000)$q$, '00000');

  -- ---- start day 1
  perform pg_temp.expect(a, 'day_start_bad_device', $q$select * from public.start_bazaar_day(pg_temp.dy(11)::uuid, 'dev A!', pg_temp.ev(11)::uuid)$q$, '22023');
  perform pg_temp.expect(a, 'start_no_event_id', $q$select * from public.start_bazaar_day(pg_temp.dy(11)::uuid, 'devA', null)$q$, '22023');
  perform pg_temp.expect(a, 'start_day_missing',
    $q$select * from public.start_bazaar_day('b0d0c105-0000-4000-8000-0000000000ff', 'devA', pg_temp.ev(11)::uuid)$q$, 'P0002');
  perform pg_temp.expect(a, 'start_booking_off', $q$select * from public.start_bazaar_day(pg_temp.dy(31)::uuid, 'devA', pg_temp.ev(31)::uuid)$q$, '22023');
  perform pg_temp.expect(a, 'start_no_stock', $q$select * from public.start_bazaar_day(pg_temp.dy(21)::uuid, 'devA', pg_temp.ev(21)::uuid)$q$, '22023');
  perform pg_temp.expect(a, 'loss_before_the_day_starts',
    $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L0', pg_temp.dy(11), 'mp0s-a', 1))$q$, '55000');
  perform pg_temp.expect(a, 'add_before_the_day_starts',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(11)::uuid, 'mp0s-a', 1, 'made', 'b0d0a000-0000-4000-8000-000000000009')$q$, '55000');
  perform pg_temp.expect(a, 'close_before_the_day_starts',
    $q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '0', '{}'))$q$, '55000');
  perform pg_temp.expect(a, 'finalise_no_day_started',
    $q$select public.finalise_bazaar(pg_temp.bz()::uuid, pg_temp.sm(pg_temp.bz()) ->> 'hash')$q$, '55000');
  select * into r from public.start_bazaar_day(pg_temp.dy(11)::uuid, 'devA', pg_temp.ev(11)::uuid);
  perform pg_temp.confirm(r.event_id = pg_temp.ev(11)::uuid and r.selling_device = 'devA' and r.float_cents = 50000
    and r.prices = '{"mp0s-a": 13000, "mp0s-b": 15000, "mp0s-c": 9000, "mp0s-d": 8000}'
    and r.loaded = '{"mp0s-a": 20, "mp0s-b": 10, "mp0s-c": 6, "mp0s-d": 0}'
    and pg_temp.q($q$(select e.price_snapshot = '{"mp0s-a": 13000, "mp0s-b": 15000, "mp0s-c": 9000, "mp0s-d": 8000}'
                and e.loaded = '{"mp0s-a": 20, "mp0s-b": 10, "mp0s-c": 6, "mp0s-d": 0}' and e.drawer_float_cents = 50000 and e.float_cents = 50000
                and e.opened_at is not null and e.closed_at is null and e.selling_device = 'devA' and e.name = 'Fixture fair ' || pg_temp.d(0)
           from public.events e where e.id = pg_temp.ev(11)::uuid)$q$),
    a, 'start_day_one', 'event_with_its_own_prices_and_stock');
  perform pg_temp.confirm(
    pg_temp.q($q$(select k.recipe_cents = 1200.5 and k.typed_cents is null from public.bazaar_costs k where k.scheduled_id = pg_temp.bx()::uuid and k.product_id = 'mp0s-a')$q$)
    and pg_temp.q($q$(select k.recipe_cents is null and k.typed_cents = 2875.25 and k.recipe_read_at is not null from public.bazaar_costs k where k.scheduled_id = pg_temp.bx()::uuid and k.product_id = 'mp0s-b')$q$)
    and pg_temp.q($q$(select k.recipe_cents is null and k.typed_cents is null from public.bazaar_costs k where k.scheduled_id = pg_temp.bx()::uuid and k.product_id = 'mp0s-c')$q$),
    a, 'start_reads_recipe_costs', 'a_from_its_recipe_b_typed_c_none');
  perform pg_temp.confirm(
    pg_temp.q($q$(select k.recipe_cents is null and k.recipe_read_at is not null from public.bazaar_costs k where k.scheduled_id = pg_temp.bx()::uuid and k.product_id = 'mp0s-d')$q$),
    a, 'incomplete_recipe_is_no_cost', 'never_a_partial_figure');
  perform pg_temp.expect(a, 'start_repeat_answered', $q$select * from public.start_bazaar_day(pg_temp.dy(11)::uuid, 'devA', pg_temp.ev(11)::uuid)$q$, '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 1 from public.events)$q$) and pg_temp.q($q$(select count(*) = 1 from public.audit_log where action = 'bazaar.day_started')$q$),
    a, 'start_repeat_adds_nothing', 'one_event');
  perform pg_temp.expect(a, 'start_again_other_event', $q$select * from public.start_bazaar_day(pg_temp.dy(11)::uuid, 'devA', pg_temp.ev(19)::uuid)$q$, '23505');
  perform pg_temp.expect(a, 'start_event_id_used', $q$select * from public.start_bazaar_day(pg_temp.dy(12)::uuid, 'devA', pg_temp.ev(11)::uuid)$q$, '23505');
  perform pg_temp.expect(a, 'start_while_another_day_is_open', $q$select * from public.start_bazaar_day(pg_temp.dy(12)::uuid, 'devA', pg_temp.ev(12)::uuid)$q$, '55000');
  perform pg_temp.expect(a, 'day_plan_after_start',
    format($q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(11), pg_temp.bx(), 0, 60000, '[]'), %L)$q$, pg_temp.stamp(pg_temp.bx(), pg_temp.dy(11))), '55000');

  -- ---- day 1 sells
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(11), 'devA:S1:1', '{"mp0s-a": 2, "mp0s-b": 1}', 0, 41000, 'Cash'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(11), 'devA:S2:1', '{"mp0s-a": 3}', 1000, 38000, 'GCash'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(11), 'devA:S3:1', '{"mp0s-b": 1}', 15000, 0, 'Freebie'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(11), 'devA:S4:1', '{"mp0s-c": 2}', 0, 18000, 'Cash'));
  perform public.void_event_sale(pg_temp.void('devA:S4:1'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(11), 'devA:S5:1', '{"mp0s-c": 1}', 0, 9000, 'Cash'));
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 0 from public.production_records)$q$) and pg_temp.q($q$(select on_hand = 1 from public.inventory_items where id = 'bzi-bag')$q$)
    and pg_temp.q($q$(select on_hand = 100 from public.inventory_items where id = 'bzi-pouch')$q$),
    a, 'bazaar_day_sale_takes_no_packaging', 'finalise_takes_it');
  perform pg_temp.expect(a, 'loss_shape_extra_key',
    $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-a', 1) || '{"x": 1}')$q$, '22023');
  perform pg_temp.expect(a, 'loss_zero', $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-a', 0))$q$, '22023');
  perform pg_temp.expect(a, 'loss_in_the_future',
    $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-a', 1) || '{"at": 99999999999999}')$q$, '22023');
  perform pg_temp.expect(a, 'loss_day_missing',
    $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', 'b0d0c105-0000-4000-8000-0000000000ff', 'mp0s-a', 1))$q$, 'P0002');
  perform pg_temp.expect(a, 'loss_flavour_not_on_the_day',
    $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-zzz', 1))$q$, '22023');
  perform pg_temp.expect(a, 'loss_below_zero', $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-c', 6))$q$, '22023');
  select * into r from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-a', 1));
  perform pg_temp.confirm(r.duplicate = false, a, 'loss_first', 'saved');
  perform pg_temp.expect(a, 'loss_repeat_answered', $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-a', 1))$q$, '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 1 from public.bazaar_losses)$q$), a, 'loss_repeat_adds_nothing', 'one_row');
  perform pg_temp.expect(a, 'loss_same_id_other_body', $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L1', pg_temp.dy(11), 'mp0s-a', 2))$q$, '23505');

  -- The old close-out would book the drawer difference at once (and finalise would book it again): refused for a bazaar day.
  perform pg_temp.expect(a, 'old_close_refused_on_a_bazaar_day',
    $q$select * from public.close_event(jsonb_build_object('eventId', pg_temp.ev(11), 'at', pg_temp.now_ms() + 60000, 'countedCents', 99500,
      'returned', '{}'::jsonb, 'floatCents', 50000, 'cashCents', 50000))$q$, '55000');

  -- ---- day 1 before her count, to the centavo
  s := pg_temp.sm(pg_temp.bx());
  perform pg_temp.confirm(pg_temp.dayj(s, pg_temp.dy(11)) @> '{"state": "open", "count": null, "revenue_cents": 88000, "gross_cents": 104000,
      "discount_cents": 1000, "freebie_cents": 15000, "by_pay": {"Cash": 50000, "GCash": 38000}, "sales": 4, "voided": 1,
      "cash_sales_cents": 50000, "cash_expected_cents": 100000, "fees_cents": 5000, "float_cents": 50000, "counted_cents": null}'
    and pg_temp.dayj(s, pg_temp.dy(11)) -> 'by_pay' = '{"Cash": 50000, "GCash": 38000}' and s ->> 'counted' = 'false',
    a, 'day_one_takings', 'voided_sale_counts_nowhere');
  perform pg_temp.confirm(pg_temp.dl(s, pg_temp.dy(11), 'mp0s-a') @> '{"made": 20, "carried": 0, "sold": 5, "given": 0, "lost": 1, "price_cents": 13000}'
    and pg_temp.dl(s, pg_temp.dy(11), 'mp0s-b') @> '{"made": 10, "sold": 1, "given": 1, "lost": 0}'
    and pg_temp.dl(s, pg_temp.dy(11), 'mp0s-c') @> '{"made": 6, "sold": 1, "given": 0, "lost": 0}'
    and pg_temp.dl(s, pg_temp.dy(11), 'mp0s-d') @> '{"made": 0, "sold": 0, "given": 0, "lost": 0}',
    a, 'day_one_stock', 'sold_given_lost');
  perform pg_temp.confirm(s #> '{cookie_cost,cents}' = 'null' and s #>> '{cookie_cost,why}' = 'no cost per cookie for: Fixture C'
    and s #> '{profit,cents}' = 'null' and s #>> '{profit,why}' = 'no cost per cookie for: Fixture C'
    and s #> '{target,against_cents}' = 'null' and s #> '{target,revenue_needed_cents}' = 'null'
    and pg_temp.part(s, 'Sold') -> 'amount_cents' = 'null' and pg_temp.cc(s, 'mp0s-c') @> '{"uncosted": true, "made_cents": null, "cost_cents": null}'
    and pg_temp.cc(s, 'mp0s-d') @> '{"uncosted": false, "unit_cents": null, "cost_cents": 0}',
    a, 'no_cost_is_null_with_the_why', 'never_zero');

  -- ---- close day 1
  h := pg_temp.dayj(s, pg_temp.dy(11)) ->> 'hash';
  b := jsonb_build_object('mp0s-a', pg_temp.cl(13, 8, 3, 2), 'mp0s-b', pg_temp.cl(8, 5, 0, 3), 'mp0s-c', pg_temp.cl(5, 5, 0, 0), 'mp0s-d', pg_temp.cl(0, 0, 0, 0));
  perform pg_temp.expect(a, 'close_shape_extra_key',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L) || '{"x": 1}')$q$, b), '22023');
  perform pg_temp.expect(a, 'close_counted_fraction',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '10.5', %L))$q$, b), '22023');
  perform pg_temp.expect(a, 'close_line_extra_key',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L))$q$, b || '{"mp0s-a": {"left": 13, "carry_next": 8, "to_shop": 3, "written_off": 2, "x": 1}}'), '22023');
  perform pg_temp.expect(a, 'close_line_negative',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L))$q$, b || '{"mp0s-a": {"left": 13, "carry_next": 8, "to_shop": 6, "written_off": -1}}'), '22023');
  perform pg_temp.expect(a, 'close_day_missing',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L) || '{"day_id": "b0d0c105-0000-4000-8000-0000000000ff"}')$q$, b), 'P0002');
  perform pg_temp.expect(a, 'close_in_the_future',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L) || '{"at": 99999999999999}')$q$, b), '22023');
  perform pg_temp.expect(a, 'close_stale_hash',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L) || jsonb_build_object('expected', repeat('0', 64)))$q$, b), '40001');
  perform pg_temp.expect(a, 'close_a_flavour_missing',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L))$q$, b - 'mp0s-d'), '22023');
  perform pg_temp.expect(a, 'close_split_does_not_add_up',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L))$q$, b || jsonb_build_object('mp0s-a', pg_temp.cl(13, 8, 3, 1))), '22023');
  perform pg_temp.expect(a, 'close_more_left_than_there',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', %L))$q$, b || jsonb_build_object('mp0s-a', pg_temp.cl(15, 10, 3, 2))), '22023');
  perform pg_temp.confirm(pg_temp.q($q$(select closed_at is null from public.events where id = pg_temp.ev(11)::uuid)$q$)
    and pg_temp.q($q$(select count(*) = 0 from public.bazaar_day_lines where left_qty is not null)$q$), a, 'close_refusals_leave_nothing', 'day_still_open');
  s := public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(11), '99500', b));
  perform pg_temp.confirm(pg_temp.dayj(s, pg_temp.dy(11)) @> '{"state": "closed", "counted_cents": 99500, "over_cents": 0, "short_cents": 500, "changed_after_close": false}'
    and pg_temp.dayj(s, pg_temp.dy(11)) ->> 'hash' = h
    and pg_temp.dc(s, pg_temp.dy(11), 'mp0s-a') = '{"product_id": "mp0s-a", "left": 13, "carry_next": 8, "to_shop": 3, "written_off": 2, "not_accounted": 1}'
    and pg_temp.dc(s, pg_temp.dy(11), 'mp0s-b') @> '{"left": 8, "carry_next": 5, "to_shop": 0, "written_off": 3, "not_accounted": 0}'
    and pg_temp.dc(s, pg_temp.dy(11), 'mp0s-c') @> '{"left": 5, "carry_next": 5, "not_accounted": 0}',
    a, 'close_day_one', 'short_500_and_one_a_not_accounted');
  perform pg_temp.confirm(
    pg_temp.q($q$(select e.closed_at is not null and e.counted_cents = 99500 and e.variance_cents = -500
            and e.returned = '{"mp0s-a": 13, "mp0s-b": 8, "mp0s-c": 5, "mp0s-d": 0}' from public.events e where e.id = pg_temp.ev(11)::uuid)$q$)
    and pg_temp.q(format($q$(select d.closed_review ->> 'hash' = %L and d.closed_review @> '{"short_cents": 500}' from public.bazaar_days d where d.id = pg_temp.dy(11)::uuid)$q$, h))
    and pg_temp.q($q$(select count(*) = 0 from public.ledger_entries where category = 'Cash variance')$q$)
    and pg_temp.q($q$(select count(*) = 0 from public.ledger_entries where kind = 'cost')$q$),
    a, 'close_posts_nothing_to_the_books', 'review_stored');
  perform pg_temp.expect(a, 'close_repeat_answered',
    format($q$select public.close_bazaar_day(%L)$q$, jsonb_build_object('day_id', pg_temp.dy(11), 'at', pg_temp.now_ms() + 60000, 'counted_cents', 99500, 'lines', b, 'expected', h)), '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 1 from public.audit_log where action = 'bazaar.day_closed')$q$), a, 'close_repeat_adds_nothing', 'one_audit');
  perform pg_temp.expect(a, 'close_again_other_count',
    format($q$select public.close_bazaar_day(%L)$q$, jsonb_build_object('day_id', pg_temp.dy(11), 'at', pg_temp.now_ms() + 60000, 'counted_cents', 100000, 'lines', b, 'expected', h)), '23505');
  perform pg_temp.expect(a, 'loss_after_the_close', $q$select * from public.save_bazaar_loss(pg_temp.loss('devA:L9', pg_temp.dy(11), 'mp0s-a', 1))$q$, '55000');

  -- ---- day 2: carried within what day 1 set aside, its own prices, more stock
  perform pg_temp.expect(a, 'start_carries_more_than_set_aside', $q$select * from public.start_bazaar_day(pg_temp.dy(12)::uuid, 'devA', pg_temp.ev(12)::uuid)$q$, '22023');
  l2 := jsonb_build_array(pg_temp.line('mp0s-a', 10, 8, 12000), pg_temp.line('mp0s-b', 0, 4, 15000), pg_temp.line('mp0s-c', 0, 5, 9000));
  perform pg_temp.expect(a, 'day_changed_with_its_stamp',
    format($q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(12), pg_temp.bx(), 1, 30000, %L), %L)$q$, l2, pg_temp.stamp(pg_temp.bx(), pg_temp.dy(12))), '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select carried_qty = 4 from public.bazaar_day_lines where day_id = pg_temp.dy(12)::uuid and product_id = 'mp0s-b')$q$)
    and pg_temp.q($q$(select count(*) = 3 from public.bazaar_day_lines where day_id = pg_temp.dy(12)::uuid)$q$), a, 'day_changed', 'lines_replaced');
  select * into r from public.start_bazaar_day(pg_temp.dy(12)::uuid, 'devA', pg_temp.ev(12)::uuid);
  perform pg_temp.confirm(r.prices = '{"mp0s-a": 12000, "mp0s-b": 15000, "mp0s-c": 9000}' and r.loaded = '{"mp0s-a": 18, "mp0s-b": 4, "mp0s-c": 5}'
    and r.float_cents = 30000
    and pg_temp.q($q$(select k.recipe_cents = 1200.5 from public.bazaar_costs k where k.scheduled_id = pg_temp.bx()::uuid and k.product_id = 'mp0s-a')$q$),
    a, 'start_day_two', 'its_own_prices_and_carried_stock');
  perform pg_temp.expect(a, 'add_zero',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-a', 0, 'made', 'b0d0a000-0000-4000-8000-000000000001')$q$, '22023');
  perform pg_temp.expect(a, 'add_bad_kind',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-a', 2, 'found', 'b0d0a000-0000-4000-8000-000000000001')$q$, '22023');
  perform pg_temp.expect(a, 'add_day_missing',
    $q$select * from public.add_bazaar_day_stock('b0d0c105-0000-4000-8000-0000000000ff', 'mp0s-a', 2, 'made', 'b0d0a000-0000-4000-8000-000000000001')$q$, 'P0002');
  perform pg_temp.expect(a, 'add_flavour_without_a_price',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-d', 2, 'made', 'b0d0a000-0000-4000-8000-000000000001')$q$, '22023');
  perform pg_temp.expect(a, 'add_over_the_most',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-a', 9995, 'made', 'b0d0a000-0000-4000-8000-000000000001')$q$, '22023');
  perform pg_temp.expect(a, 'add_carries_more_than_set_aside',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-b', 2, 'carried', 'b0d0a000-0000-4000-8000-000000000001')$q$, '22023');
  select * into r from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-a', 2, 'made', 'b0d0a000-0000-4000-8000-000000000001');
  perform pg_temp.confirm(r.made_qty = 12 and r.carried_qty = 8 and r.loaded = 20 and r.duplicate = false
    and pg_temp.q($q$(select e.loaded = '{"mp0s-a": 20, "mp0s-b": 4, "mp0s-c": 5}' from public.events e where e.id = pg_temp.ev(12)::uuid)$q$),
    a, 'add_made', 'line_and_loaded_move_together');
  perform pg_temp.expect(a, 'add_repeat_answered',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-a', 2, 'made', 'b0d0a000-0000-4000-8000-000000000001')$q$, '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select made_qty = 12 from public.bazaar_day_lines where day_id = pg_temp.dy(12)::uuid and product_id = 'mp0s-a')$q$)
    and pg_temp.q($q$(select count(*) = 1 from public.bazaar_stock_adds)$q$), a, 'add_repeat_adds_nothing', 'still_twelve');
  perform pg_temp.expect(a, 'add_same_id_other_body',
    $q$select * from public.add_bazaar_day_stock(pg_temp.dy(12)::uuid, 'mp0s-a', 3, 'made', 'b0d0a000-0000-4000-8000-000000000001')$q$, '23505');
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(12), 'devA:T1:1', '{"mp0s-a": 4}', 0, 48000, 'Cash'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(12), 'devA:T2:1', '{"mp0s-b": 2, "mp0s-c": 1}', 0, 39000, 'Maya'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(12), 'devA:T3:1', '{"mp0s-a": 1}', 12000, 0, 'Freebie'));
  perform public.save_bazaar_loss(pg_temp.loss('devA:L2', pg_temp.dy(12), 'mp0s-c', 1));
  b := jsonb_build_object('mp0s-a', pg_temp.cl(15, 0, 10, 5), 'mp0s-b', pg_temp.cl(2, 0, 0, 2), 'mp0s-c', pg_temp.cl(2, 0, 2, 0));
  perform pg_temp.expect(a, 'close_carries_from_the_last_day',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(12), '78000', %L))$q$, b || jsonb_build_object('mp0s-a', pg_temp.cl(15, 1, 10, 4))), '22023');
  s := public.close_bazaar_day(pg_temp.closing(pg_temp.bx(), pg_temp.dy(12), '78000', b));
  perform pg_temp.confirm(pg_temp.dayj(s, pg_temp.dy(12)) @> '{"state": "closed", "revenue_cents": 87000, "gross_cents": 99000, "discount_cents": 0,
      "freebie_cents": 12000, "sales": 3, "voided": 0, "cash_sales_cents": 48000, "cash_expected_cents": 78000, "counted_cents": 78000,
      "over_cents": 0, "short_cents": 0, "fees_cents": 0}'
    and pg_temp.dayj(s, pg_temp.dy(12)) -> 'by_pay' = '{"Cash": 48000, "Maya": 39000}'
    and pg_temp.dl(s, pg_temp.dy(12), 'mp0s-a') @> '{"made": 12, "carried": 8, "sold": 4, "given": 1, "lost": 0, "price_cents": 12000}'
    and pg_temp.dc(s, pg_temp.dy(12), 'mp0s-a') @> '{"left": 15, "to_shop": 10, "written_off": 5, "not_accounted": 0}'
    and pg_temp.dc(s, pg_temp.dy(12), 'mp0s-c') @> '{"left": 2, "to_shop": 2, "not_accounted": 1}',
    a, 'close_day_two', 'to_the_centavo');

  -- ---- the event while C has no cost, then with it: every figure of the example
  perform pg_temp.confirm(s -> 'revenue' = '{"revenue_cents": 175000, "gross_cents": 203000, "discount_cents": 1000, "freebie_cents": 27000,
      "by_pay": {"Cash": 98000, "GCash": 38000, "Maya": 39000}, "sales": 7, "voided": 1}'
    and s -> 'cash' = '{"over_cents": 0, "short_cents": 500}' and s ->> 'counted' = 'true'
    and (s #>> '{fees,total_cents}')::bigint = 80000 and (s #>> '{fees,event_cents}')::bigint = 75000 and jsonb_array_length(s #> '{fees,parts}') = 3
    and s #> '{fees,parts,0}' @> '{"label": "Stall rent", "amount_cents": 50000, "day_id": null}',
    a, 'example_revenue_cash_fees', 'to_the_centavo');
  perform pg_temp.confirm(s #> '{cookie_cost,cents}' = 'null' and s #> '{profit,cents}' = 'null'
    and pg_temp.cc(s, 'mp0s-a') @> '{"cost_cents": 22809}' and pg_temp.cc(s, 'mp0s-b') @> '{"cost_cents": 28753}',
    a, 'example_while_c_has_no_cost', 'profit_null_the_costed_lines_stand');
  perform public.save_bazaar_cost(pg_temp.bx()::uuid, 'mp0s-c', 1000);
  s := pg_temp.sm(pg_temp.bx());
  perform pg_temp.confirm(pg_temp.cc(s, 'mp0s-a') @> '{"unit_cents": 1200.5, "source": "recipe", "made": 32, "to_shop": 13, "sold": 9, "given": 1, "lost": 1,
      "written_off": 7, "not_accounted": 1, "made_cents": 38416, "to_shop_cents": 15607, "sold_cents": 10805, "given_cents": 1201,
      "lost_cents": 1201, "written_off_cents": 8404, "not_accounted_cents": 1201, "cost_cents": 22809, "rounding_cents": -3}',
    a, 'example_flavour_a', 'half_up_per_line');
  perform pg_temp.confirm(pg_temp.cc(s, 'mp0s-b') @> '{"unit_cents": 2875.25, "source": "typed", "made": 10, "to_shop": 0, "sold": 3, "given": 1, "lost": 0,
      "written_off": 5, "not_accounted": 1, "made_cents": 28753, "to_shop_cents": 0, "sold_cents": 8626, "given_cents": 2875,
      "lost_cents": 0, "written_off_cents": 14376, "not_accounted_cents": 2875, "cost_cents": 28753, "rounding_cents": 1}',
    a, 'example_flavour_b', 'the_set_aside_cookie_that_never_came_is_not_accounted');
  perform pg_temp.confirm(pg_temp.cc(s, 'mp0s-c') @> '{"unit_cents": 1000, "source": "typed", "made": 6, "to_shop": 2, "sold": 2, "given": 0, "lost": 1,
      "written_off": 0, "not_accounted": 1, "made_cents": 6000, "to_shop_cents": 2000, "sold_cents": 2000, "lost_cents": 1000,
      "not_accounted_cents": 1000, "cost_cents": 4000, "rounding_cents": 0}',
    a, 'example_flavour_c', 'typed_cost');
  perform pg_temp.confirm(s -> 'cookie_cost' @> '{"cents": 55562, "why": null, "made_cents": 73169, "to_shop_cents": 17607, "made": 48, "to_shop": 15}'
    and pg_temp.part(s, 'Sold') = '{"label": "Sold", "quantity": 14, "amount_cents": 21431}'
    and pg_temp.part(s, 'Given away') = '{"label": "Given away", "quantity": 2, "amount_cents": 4076}'
    and pg_temp.part(s, 'Lost') = '{"label": "Lost", "quantity": 2, "amount_cents": 2201}'
    and pg_temp.part(s, 'Written off') = '{"label": "Written off", "quantity": 12, "amount_cents": 22780}'
    and pg_temp.part(s, 'Not accounted') = '{"label": "Not accounted", "quantity": 3, "amount_cents": 5076}'
    and pg_temp.part(s, 'Rounding') = '{"label": "Rounding", "quantity": null, "amount_cents": -2}'
    and (select sum((p ->> 'amount_cents')::bigint) = 55562 from jsonb_array_elements(s #> '{cookie_cost,parts}') p),
    a, 'example_cookie_cost', 'made_less_to_the_shop_and_the_parts_add_up');
  perform pg_temp.confirm(s -> 'profit' @> '{"cents": 38938, "why": null}'
    and (select sum((p ->> 'amount_cents')::bigint) = 38938 from jsonb_array_elements(s #> '{profit,parts}') p)
    and s -> 'target' = '{"cents": 50000, "against_cents": -11062, "revenue_needed_cents": 11062}',
    a, 'example_profit_and_target', 'to_the_centavo');
  perform pg_temp.confirm(pg_temp.sm(pg_temp.bx()) = s and s ->> 'hash' = pg_temp.sm(pg_temp.bx()) ->> 'hash',
    a, 'summary_same_rows_same_answer', 'stable');

  -- ---- X cannot be finalised: it sent cookies to the shop
  perform pg_temp.expect(a, 'finalise_bad_hash', $q$select public.finalise_bazaar(pg_temp.bx()::uuid, 'nope')$q$, '22023');
  perform pg_temp.expect(a, 'finalise_booking_missing',
    $q$select public.finalise_bazaar('b0d0c105-0000-4000-8000-0000000000ff', repeat('0', 64))$q$, 'P0002');
  perform pg_temp.expect(a, 'finalise_with_cookies_to_the_shop',
    $q$select public.finalise_bazaar(pg_temp.bx()::uuid, pg_temp.sm(pg_temp.bx()) ->> 'hash')$q$, '55000');
  perform pg_temp.confirm(pg_temp.q($q$(select finalised_at is null from public.scheduled_events where id = pg_temp.bx()::uuid)$q$)
    and pg_temp.q($q$(select count(*) = 0 from public.event_expenses)$q$) and pg_temp.q($q$(select count(*) = 0 from public.production_records)$q$),
    a, 'finalise_refusal_leaves_nothing', 'nothing_posted');

  -- ---- booking Y: one day, nothing to the shop, finalised
  perform pg_temp.expect(a, 'second_fair_day_changed',
    format($q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(21), pg_temp.bqy(), 14, 20000, %L), %L)$q$, ly, pg_temp.stamp(pg_temp.bqy(), pg_temp.dy(21))), '00000');
  perform public.save_bazaar_fee(pg_temp.fee('f-ice', pg_temp.bqy(), pg_temp.dy(21), 'Ice', 4000, 14));
  perform public.save_bazaar_fee(pg_temp.fee('f-permit-2', pg_temp.bqy(), null, 'Permit', 6000, 12));
  perform public.save_bazaar_cost(pg_temp.bqy()::uuid, 'mp0s-b', 2000);
  perform public.start_bazaar_day(pg_temp.dy(21)::uuid, 'devA', pg_temp.ev(21)::uuid);
  perform public.save_bazaar_cost(pg_temp.bqy()::uuid, 'mp0s-a', 1300);
  perform pg_temp.confirm(pg_temp.cc(pg_temp.sm(pg_temp.bqy()), 'mp0s-a') @> '{"unit_cents": 1300, "source": "typed", "made_cents": 15600}',
    a, 'typed_cost_wins_over_the_recipe', 'marked_as_hers');
  perform public.save_bazaar_cost(pg_temp.bqy()::uuid, 'mp0s-a', null);
  perform pg_temp.confirm(pg_temp.cc(pg_temp.sm(pg_temp.bqy()), 'mp0s-a') @> '{"unit_cents": 1200.5, "source": "recipe", "made_cents": 14406}',
    a, 'null_goes_back_to_the_recipe', 'recipe_cost_kept');
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(21), 'devA:U1:1', '{"mp0s-a": 2}', 0, 26000, 'Cash'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(21), 'devA:U2:1', '{"mp0s-a": 1, "mp0s-b": 1}', 0, 28000, 'GCash'));
  perform public.record_event_sale(pg_temp.sale(pg_temp.ev(21), 'devA:U3:1', '{"mp0s-a": 1}', 0, 13000, 'Cash') || jsonb_build_object('at', pg_temp.now_ms() + 120000));
  perform public.add_event_expense(jsonb_build_object('clientId', 'devA:E1', 'eventId', pg_temp.ev(21), 'label', 'Tape', 'category', 'Supplies',
    'amountCents', 1500, 'at', pg_temp.now_ms()));
  perform pg_temp.expect(a, 'finalise_while_a_day_is_open',
    $q$select public.finalise_bazaar(pg_temp.bqy()::uuid, pg_temp.sm(pg_temp.bqy()) ->> 'hash')$q$, '55000');
  b := jsonb_build_object('mp0s-a', pg_temp.cl(8, 0, 0, 8), 'mp0s-b', pg_temp.cl(2, 0, 0, 2));
  perform pg_temp.expect(a, 'day_close_before_a_recorded_sale',
    format($q$select public.close_bazaar_day(pg_temp.closing(pg_temp.bqy(), pg_temp.dy(21), '59700', %L))$q$, b), '22023');
  perform public.void_event_sale(pg_temp.void('devA:U3:1'));
  b := jsonb_build_object('mp0s-a', pg_temp.cl(9, 0, 0, 9), 'mp0s-b', pg_temp.cl(2, 0, 0, 2));
  s := public.close_bazaar_day(pg_temp.closing(pg_temp.bqy(), pg_temp.dy(21), '46700', b));
  perform pg_temp.confirm(s -> 'cash' = '{"over_cents": 700, "short_cents": 0}' and (s #>> '{revenue,revenue_cents}')::bigint = 54000
    and (s #>> '{fees,total_cents}')::bigint = 41500 and (s #>> '{fees,event_cents}')::bigint = 36000
    and pg_temp.dayj(s, pg_temp.dy(21)) @> '{"fees_cents": 5500}' and jsonb_array_length(s #> '{fees,parts}') = 4
    and pg_temp.cc(s, 'mp0s-a') @> '{"made_cents": 14406, "sold_cents": 3602, "written_off_cents": 10805, "cost_cents": 14406, "rounding_cents": -1}'
    and pg_temp.cc(s, 'mp0s-b') @> '{"unit_cents": 2000, "cost_cents": 6000, "rounding_cents": 0}'
    and s -> 'cookie_cost' @> '{"cents": 20406}' and s -> 'profit' @> '{"cents": -7206}'
    and s -> 'target' = '{"cents": null, "against_cents": null, "revenue_needed_cents": null}',
    a, 'second_fair_summary', 'over_700_the_till_expense_is_a_fee_profit_minus_7206');
  -- Days start in date order: an earlier day cannot start once a later one has.
  perform public.save_bazaar_day(pg_temp.plan(pg_temp.dy(22), pg_temp.bqy(), 13, 0, jsonb_build_array(pg_temp.line('mp0s-a', 1, 0, 100))), null);
  perform public.save_bazaar_day(pg_temp.plan(pg_temp.dy(23), pg_temp.bqy(), 15, 0, jsonb_build_array(pg_temp.line('mp0s-a', 1, 0, 100))), null);
  perform pg_temp.expect(a, 'start_before_a_started_day',
    $q$select * from public.start_bazaar_day(pg_temp.dy(22)::uuid, 'devA', pg_temp.ev(22)::uuid)$q$, '55000');
  b := pg_temp.books();
  perform pg_temp.confirm(pg_temp.sumk(b, 'revenue') = 0 and pg_temp.sumk(b, 'expense') = 0 and jsonb_array_length(b -> 'lines') = 0
    and jsonb_array_length(b -> 'held') = 2
    and pg_temp.held(b, pg_temp.bx()) = jsonb_build_object('scheduled_id', pg_temp.bx(), 'name', 'Fixture fair', 'count', 7, 'revenue_cents', 175000, 'expense_cents', 0)
    and pg_temp.held(b, pg_temp.bqy()) = jsonb_build_object('scheduled_id', pg_temp.bqy(), 'name', 'Second fair', 'count', 5, 'revenue_cents', 54000, 'expense_cents', 1500)
    and pg_temp.q($q$(select count(*) = 12 from public.ledger_entries)$q$),
    a, 'books_hold_an_open_bazaar', 'left_out_of_lines_and_counted_in_held');
  perform pg_temp.confirm(jsonb_array_length(public.get_books(now() - interval '60 days', now() - interval '30 days') -> 'held') = 0,
    a, 'books_held_follows_the_period', 'empty_list_outside_it');
  perform pg_temp.expect(a, 'finalise_stale_hash', $q$select public.finalise_bazaar(pg_temp.bqy()::uuid, repeat('0', 64))$q$, '40001');
  h := pg_temp.sm(pg_temp.bqy()) ->> 'hash';
  s := public.finalise_bazaar(pg_temp.bqy()::uuid, h);
  perform pg_temp.confirm(s ->> 'hash' = h
    and pg_temp.q(format($q$(select finalised_at is not null and final_hash = %L and final_summary = %L::jsonb from public.scheduled_events where id = pg_temp.bqy()::uuid)$q$, h, s))
    and pg_temp.q($q$(select count(*) = 1 from public.audit_log where action = 'bazaar.finalised')$q$),
    a, 'finalise_second_fair', 'summary_and_hash_stored');
  perform pg_temp.confirm(
    pg_temp.q($q$(select count(*) = 1 from public.ledger_entries where kind = 'cost' and category = 'Bazaar rent' and amount_cents = -30000
        and memo = 'Second fair — Stall rent' and occurred_at = ((current_date + 13) + time '12:00') at time zone 'UTC')$q$)
    and pg_temp.q($q$(select count(*) = 1 from public.ledger_entries where kind = 'cost' and category = 'Bazaar fees' and amount_cents = -4000
        and memo = 'Second fair — Ice' and occurred_at = ((current_date + 14) + time '12:00') at time zone 'UTC')$q$)
    and pg_temp.q($q$(select count(*) = 1 from public.ledger_entries where kind = 'cost' and category = 'Bazaar fees' and amount_cents = -6000
        and occurred_at = ((current_date + 12) + time '12:00') at time zone 'UTC')$q$)
    and pg_temp.q($q$(select count(*) = 4 from public.ledger_entries where kind = 'cost')$q$)
    and pg_temp.q($q$(select count(*) = 1 from public.ledger_entries l where l.kind = 'cost' and (select c.today from public.business_clock(l.occurred_at) c) = current_date + 14)$q$)
    and pg_temp.q($q$(select count(*) = 3 from public.event_expenses where event_id = pg_temp.ev(21)::uuid
          and client_id in ('rent:' || pg_temp.bqy(), 'fee:f-ice', 'fee:f-permit-2') and ledger_id is not null)$q$)
    and pg_temp.q($q$(select count(*) = 2 from public.bazaar_fees where scheduled_id = pg_temp.bqy()::uuid and ledger_id is not null)$q$)
    and pg_temp.q($q$(select count(*) = 2 from public.bazaar_fees where scheduled_id = pg_temp.bx()::uuid and ledger_id is null)$q$),
    a, 'finalise_posts_rent_and_fees', 'each_once_dated_the_day_paid');
  perform pg_temp.confirm(
    pg_temp.q($q$(select count(*) = 1 from public.ledger_entries where kind = 'sale' and category = 'Bazaar' and amount_cents = 700
        and memo = 'Second fair ' || pg_temp.d(14) || ' — drawer over')$q$)
    and pg_temp.q($q$(select count(*) = 0 from public.ledger_entries where category = 'Cash variance')$q$),
    a, 'finalise_posts_the_cash_variance', 'over_is_takings');
  perform pg_temp.confirm(
    pg_temp.q($q$(select on_hand = 0 from public.inventory_items where id = 'bzi-flour')$q$) and pg_temp.q($q$(select on_hand = 6 from public.inventory_items where id = 'bzi-egg')$q$)
    and pg_temp.q($q$(select on_hand = 88 from public.inventory_items where id = 'bzi-pouch')$q$) and pg_temp.q($q$(select on_hand = 0 from public.inventory_items where id = 'bzi-bag')$q$)
    and pg_temp.q($q$(select on_hand = 50 from public.inventory_items where id = 'bzi-sprinkle')$q$)
    and pg_temp.q($q$(select m.qty_delta = -280 and m.short_qty = 20 from public.stock_movements m where m.item_id = 'bzi-flour' and m.kind = 'use')$q$)
    and pg_temp.q($q$(select m.qty_delta = -12 and m.short_qty = 0 from public.stock_movements m where m.item_id = 'bzi-pouch' and m.kind = 'use')$q$)
    and pg_temp.q($q$(select count(*) = 4 from public.stock_movements where kind = 'use')$q$),
    a, 'finalise_takes_stock', 'scaled_as_a_batch_pieces_up');
  perform pg_temp.confirm(
    pg_temp.q($q$(select count(*) = 3 from public.production_records where kind = 'sale' and ref = 'bazaar:' || pg_temp.bqy())$q$)
    and pg_temp.q($q$(select r2.qty = 12 and jsonb_array_length(r2.short) = 1 and r2.short -> 0 ->> 'name' = 'BZ Flour' and (r2.short -> 0 ->> 'by')::numeric = 20
                and not (r2.short -> 0 ? 'why') from public.production_records r2 where r2.product_id = 'mp0s-a')$q$)
    and pg_temp.q($q$(select r2.short = '[{"name": "Fixture B", "by": 3, "unit": "cookie", "why": "no recipe"}]' from public.production_records r2 where r2.product_id = 'mp0s-b')$q$)
    and pg_temp.q($q$(select r2.qty = 4 and r2.short -> 0 ->> 'name' = 'BZ Bag' and (r2.short -> 0 ->> 'by')::numeric = 1
           from public.production_records r2 where r2.product_id is null)$q$),
    a, 'finalise_records_each_shortfall', 'with_its_why_never_a_refusal');
  perform pg_temp.expect(a, 'finalise_repeat_answered', format($q$select public.finalise_bazaar(pg_temp.bqy()::uuid, %L)$q$, h), '00000');
  perform pg_temp.confirm(pg_temp.q($q$(select count(*) = 16 from public.ledger_entries)$q$) and pg_temp.q($q$(select count(*) = 4 from public.stock_movements where kind = 'use')$q$)
    and pg_temp.q($q$(select count(*) = 1 from public.audit_log where action = 'bazaar.finalised')$q$), a, 'finalise_repeat_adds_nothing', 'posted_once');
  perform pg_temp.expect(a, 'finalise_again_other_hash', $q$select public.finalise_bazaar(pg_temp.bqy()::uuid, repeat('0', 64))$q$, '23505');
  b := pg_temp.books();
  perform pg_temp.confirm(pg_temp.sumk(b, 'revenue') = 54700 and pg_temp.sumk(b, 'expense') = 41500 and jsonb_array_length(b -> 'lines') = 9
    and jsonb_array_length(b -> 'held') = 1 and pg_temp.held(b, pg_temp.bx()) @> '{"count": 7, "revenue_cents": 175000}',
    a, 'books_count_a_finalised_bazaar', 'its_lines_are_in_and_the_open_one_stays_held');
  -- Once finalised, nothing of it changes.
  perform pg_temp.expect(a, 'fee_after_finalise',
    $q$select * from public.save_bazaar_fee(pg_temp.fee('f-late', pg_temp.bqy(), null, 'Late', 100, 14))$q$, '55000');
  perform pg_temp.expect(a, 'cost_after_finalise', $q$select * from public.save_bazaar_cost(pg_temp.bqy()::uuid, 'mp0s-b', 2100)$q$, '55000');
  perform pg_temp.expect(a, 'target_after_finalise', $q$select public.save_bazaar_target(pg_temp.bqy()::uuid, 1000)$q$, '55000');
  perform pg_temp.expect(a, 'target_repeat_after_finalise', $q$select public.save_bazaar_target(pg_temp.bqy()::uuid, null)$q$, '00000');
  perform pg_temp.expect(a, 'day_plan_after_finalise',
    $q$select * from public.save_bazaar_day(pg_temp.plan(pg_temp.dy(22), pg_temp.bqy(), 14, 0, '[]'), null)$q$, '55000');
  perform pg_temp.expect(a, 'days_table_closed', 'select * from public.bazaar_days', '42501');
  perform pg_temp.expect(a, 'fees_table_closed', 'select * from public.bazaar_fees', '42501');
  perform pg_temp.expect(a, 'costs_table_closed', 'select * from public.bazaar_costs', '42501');
  perform pg_temp.expect(a, 'summary_is_internal', $q$select public.bazaar_summary(pg_temp.bx()::uuid)$q$, '42501');
  perform pg_temp.expect(a, 'stock_plan_is_internal', $q$select public.recipe_stock_plan('mp0s-a', 1, 'batch', '{}')$q$, '42501');
  perform pg_temp.expect(a, 'held_ledger_is_internal', 'select * from public.bazaar_held_ledger()', '42501');
  perform pg_temp.expect(a, 'line_facts_is_internal', $q$select * from public.bazaar_line_facts(pg_temp.bx()::uuid)$q$, '42501');
  -- record_event_sale and void_event_sale are untouched, so a void that arrives late still lands: the books follow the ledger at once, the
  -- stored summary keeps what she was shown, and the summary worked out again says so.
  perform public.void_event_sale(pg_temp.void('devA:U1:1'));
  b := pg_temp.books();
  s := public.get_bazaar(pg_temp.bqy()::uuid);
  perform pg_temp.confirm(pg_temp.sumk(b, 'revenue') = 28700 and (s #>> '{summary,revenue,revenue_cents}')::bigint = 28000
    and (s #>> '{final_summary,revenue,revenue_cents}')::bigint = 54000
    and (s #>> '{summary,fees,total_cents}')::bigint = 41500 and (s #>> '{final_summary,fees,total_cents}')::bigint = 41500 and s #>> '{summary,hash}' <> s ->> 'final_hash'
    and pg_temp.dayj(s -> 'summary', pg_temp.dy(21)) @> '{"changed_after_close": true}',
    a, 'late_void_after_finalise', 'books_follow_the_ledger_and_the_summary_shows_the_change');
end $$;

-- A day cannot start once its bazaar is finalised (the later day planned and never started above).
create function pg_temp.assert_owner_after() returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect('active_owner', 'start_after_finalise',
    $q$select * from public.start_bazaar_day(pg_temp.dy(23)::uuid, 'devA', pg_temp.ev(23)::uuid)$q$, '55000');
end $$;

grant execute on function pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text),
  pg_temp.confirm(boolean, text, text, text), pg_temp.q(text), pg_temp.bx(), pg_temp.bqy(), pg_temp.bz(), pg_temp.dy(integer), pg_temp.ev(integer),
  pg_temp.d(integer), pg_temp.now_ms(), pg_temp.line(text, integer, integer, bigint), pg_temp.plan(text, text, integer, bigint, jsonb),
  pg_temp.fee(text, text, text, text, bigint, integer), pg_temp.loss(text, text, text, integer),
  pg_temp.sale(text, text, jsonb, bigint, bigint, text), pg_temp.void(text), pg_temp.sm(text), pg_temp.dayj(jsonb, text),
  pg_temp.dl(jsonb, text, text), pg_temp.dc(jsonb, text, text), pg_temp.cc(jsonb, text), pg_temp.part(jsonb, text),
  pg_temp.stamp(text, text), pg_temp.cl(integer, integer, integer, integer), pg_temp.closing(text, text, jsonb, jsonb),
  pg_temp.books(), pg_temp.sumk(jsonb, text), pg_temp.held(jsonb, text), pg_temp.assert_anon_acl(), pg_temp.assert_denied(text),
  pg_temp.assert_owner(), pg_temp.assert_owner_after() to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_anon_acl();
select pg_temp.assert_denied('anon');
reset role;
set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_denied('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_denied('active_support');
select pg_temp.set_subject(4);
select pg_temp.assert_denied('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_owner();
select pg_temp.assert_owner_after();
reset role;
set local role service_role;
select pg_temp.set_subject(9, 'service_role');
select pg_temp.assert_denied('service_role');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
