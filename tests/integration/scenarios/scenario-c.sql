-- Connected scenario C (docs/state/full-goal.md section 8): bazaar event -> selling day -> table stock -> sales (one rung offline and
-- replayed after reconnect) -> void -> close the day -> finalise the event -> books, driven through the real RPCs with real SQL roles
-- (anon, a helper, the owner). One transaction; it rolls back.
--
-- HOW TO RUN (disposable local database only; never a hosted one): the setup in docs/TESTING.md under "Scenario A" applies unchanged
-- (a Postgres 17 Supabase database with every migration applied, no seed), then
--     node scripts/test-scenario.mjs c [container-name]     (default hc-scenario-c)  prints PASS or FAIL.
--
-- The phone's offline queue and reload live in IndexedDB (src/lib/offline, docs/OFFLINE.md); what the server must do with what the queue
-- sends is proven here: a queued sale sent late, sent twice (a reload before the acknowledgement), rung at an old price, and a void that
-- arrives before its sale. The kitchen's bake is a fixture row (scenario B proves baking); what is proven is the transfer to the table.
--
-- Fixture (centavos): SC Oat 120.00, SC Choc 100.00. Oat recipe (10 per batch): 200 g flour, pouch 1 per cookie = 650 a cookie
-- (400 + 250). Choc: 100 g flour, pouch 1 = 450 a cookie. Flour 2000 g at 20, pouches 100 at 250, bags 10 at 300 (one per sale).
-- Booking "SC Fair", one day, rent 300.00, float 500.00. Permit 50.00 for the event; "Tape" 15.00 bought at the till.
-- Choc is baked in the kitchen (10, drop 7) and moved to the table: 6 before the day, 2 more during it. Oat is made for the table: 20, +2.
--   S1 2 Oat + 1 Choc cash             34000
--   S2 3 Oat GCash, discount 10.00     35000    (VOIDED later: -35000)
--   price of Oat changes 120.00 -> 130.00 (list 1)
--   S3 2 Oat GCash at the new price    26000
--   F1 1 Choc freebie                  0        (gross 10000 given away)
--   Q2 1 Choc cash 10000               its void arrived BEFORE the sale: stored voided, no money, no stock
--   Q1 1 Oat + 1 Choc cash, rung 5 minutes BEFORE the change, sent after it: 22000 at the OLD price (12000), not 23000
--   Oat dropped 1. Revenue 34000 + 26000 + 22000 = 82000; gross 92000, freebies 10000; cash sales 56000, GCash 26000.
--   Cash expected 50000 + 56000 = 106000; counted 105700: short 300.
--   Oat 22 made - 5 sold - 1 lost = 16 left = 10 to the shop + 6 written off. Choc 8 loaded - 2 sold - 1 given = 5 = 3 back to the kitchen + 2 off.
--   Cookie cost: Oat 22 x 650 = 14300 less 10 to the shop 6500 = 7800; Choc 8 x 450 = 3600 less 3 x 450 = 1350 = 2250. Total 10050.
--   Fees 30000 + 5000 + 1500 = 36500. Profit 82000 - 36500 - 10050 - 300 = 35150.
--   Finalise (drop 7) books: rent -30000, Permit -5000, short -300, Tape -1500 already posted at the till, sales 34000 + 35000 - 35000 + 26000 + 22000.
--   Stock: the 10 Oat sent to the shop are a batch (flour 200); the 12 Oat left take flour 240 and pouches 12; Choc takes only the pouches of the 5 not
--   returned (its flour went in the kitchen's bake); bags 4 (sales not voided, the freebie included): flour 1560, pouches 83, bags 6.
--   After finalise nothing is sold or voided. A second small "test fair" (nothing to the shop, a late queued freebie that arrives after the close) is run to
--   the books and reversed: books and stock return exactly. The first fair cannot be reversed by that tool (cookies went to the shop), and is refused.
-- The transaction keeps one clock: "minutes" below move a record's own time, not the database's.
begin;
create temporary table steps (n serial, label text);
grant select, insert on steps to anon, authenticated;
grant usage on sequence steps_n_seq to anon, authenticated;

insert into auth.users(id) values ('c6c00000-0000-4000-8000-000000000001'), ('c6c00000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
  ('c6c00000-0000-4000-8000-000000000001', 'owner', 'Scenario owner', true),
  ('c6c00000-0000-4000-8000-000000000002', 'helper', 'Scenario helper', true);
insert into public.products(id, name, short_name, price_cents, kind, item_type) values
  ('sc-oat', 'SC Oat', 'Oat', 12000, 'Permanent', 'cookie'), ('sc-choc', 'SC Choc', 'Choc', 10000, 'Permanent', 'cookie');
insert into public.inventory_items(id, name, unit, category, active, on_hand, avg_cost) values
  ('sc-flour', 'SC Flour', 'g', 'Ingredients', true, 2000, 20), ('sc-pouch', 'SC Pouch', 'pcs', 'Packaging', true, 100, 250),
  ('sc-bag', 'SC Bag', 'pcs', 'Packaging', true, 10, 300);
insert into public.recipes(product_id, yield_count) values ('sc-oat', 10), ('sc-choc', 10);
insert into public.recipe_versions(product_id, version, yield_count, lines) values ('sc-oat', 1, 10, '[]'), ('sc-choc', 1, 10, '[]');
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position, item_id, kind) values
  ('sc-oat', 'SC Flour', 200, 'g', 0, 'sc-flour', 'ingredient'), ('sc-oat', 'SC Pouch', 1, 'pcs', 1, 'sc-pouch', 'packaging'),
  ('sc-choc', 'SC Flour', 100, 'g', 0, 'sc-flour', 'ingredient'), ('sc-choc', 'SC Pouch', 1, 'pcs', 1, 'sc-pouch', 'packaging');
insert into public.packaging_rules(container, item_id, qty, per, position) values ('bazaar_sale', 'sc-bag', 1, 'container', 1);
insert into public.scheduled_events(id, name, starts_on, ends_on, place, rent_cents, active)
  values ('c6b00000-0000-4000-8000-000000000001', 'SC Fair', current_date, current_date, 'Hall', 30000, true),
         ('c6b00000-0000-4000-8000-000000000002', 'SC Test Fair', current_date + 1, current_date + 1, 'Yard', 20000, true);
-- The kitchen's bake of Choc (drop 7), two hours old.
insert into public.production_records(id, kind, product_id, qty, target, drop_no, at, payload_hash, created_by)
  values ('c6f00000-0000-4000-8000-000000000001', 'batch', 'sc-choc', 10, 10, 7, date_trunc('milliseconds', now() - interval '2 hours'), repeat('c', 64),
          'c6c00000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------- helpers
create function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'scenario C failed: %', label; end if;
  insert into pg_temp.steps(label) values (label);
end $$;
-- Runs one statement; it must fail with exactly `wanted`.
create function pg_temp.refused(label text, stmt text, wanted text) returns void language plpgsql as $$
declare got text := '00000';
begin
  begin execute stmt; exception when others then got := sqlstate; end;
  if got <> wanted then raise exception 'scenario C failed: % (wanted %, got %)', label, wanted, got; end if;
  insert into pg_temp.steps(label) values (label);
end $$;
-- Reads private data as the table owner (the test's eyes, not a caller's).
create function pg_temp.q(stmt text) returns text language plpgsql security definer as $$
declare r text; begin execute stmt into r; return r; end $$;
create function pg_temp.n(stmt text) returns numeric language sql volatile as $$ select pg_temp.q(stmt)::numeric $$;
create function pg_temp.claims(sub text, claim_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub, ''), true);
  perform set_config('request.jwt.claims',
    (case when sub is null then '{}'::jsonb else jsonb_build_object('sub', sub) end || jsonb_build_object('role', claim_role))::text, true);
end $$;
create function pg_temp.ms() returns bigint language sql stable as $$ select (extract(epoch from now()) * 1000)::bigint $$;
create function pg_temp.bid() returns uuid language sql immutable as $$ select 'c6b00000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.did() returns uuid language sql immutable as $$ select 'c6d00000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.eid() returns uuid language sql immutable as $$ select 'c6e00000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$ select ('c6c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
-- Everything a retry must not move: record counts, money lines, stock, kitchen moves, audit.
create function pg_temp.fp() returns text language sql volatile security definer as $$
  select concat_ws('/', (select count(*) from public.event_sales), (select count(*) from public.event_sale_items),
    (select count(*) from public.event_sale_voids), (select count(*) from public.ledger_entries), (select coalesce(sum(amount_cents), 0) from public.ledger_entries),
    (select count(*) from public.stock_movements), (select count(*) from public.production_records), (select count(*) from public.event_expenses),
    (select count(*) from public.bazaar_kitchen_moves), (select count(*) from public.audit_log),
    (select string_agg(id || '=' || on_hand::text, ',' order by id) from public.inventory_items), (select count(*) from public.event_price_versions)) $$;
create function pg_temp.sale(client text, items jsonb, discount bigint, total bigint, pay text, minutes integer, device text default 'devC') returns jsonb
language sql stable as $$
  select jsonb_build_object('clientId', device || ':' || client, 'deviceId', device, 'eventId', pg_temp.eid(), 'items', items,
    'discountCents', discount, 'totalCents', total, 'pay', pay, 'ref', '', 'clerk', 'Cine',
    'at', pg_temp.ms() + minutes * 60000, 'tenderedCents', total, 'changeCents', 0) $$;
create function pg_temp.void(client text) returns jsonb language sql stable as $$
  select jsonb_build_object('clientId', 'devC:' || client, 'deviceId', 'devC', 'at', pg_temp.ms()) $$;
create function pg_temp.unit(client text, pid text) returns bigint language sql volatile security definer as $$
  select i.unit_price_cents from public.event_sales s join public.event_sale_items i on i.sale_id = s.id
   where s.client_id = 'devC:' || client and i.product_id = pid $$;
create function pg_temp.sm() returns jsonb language sql stable as $$ select public.get_bazaar(pg_temp.bid()) -> 'summary' $$;
create function pg_temp.day() returns jsonb language sql stable as $$ select x from jsonb_array_elements(pg_temp.sm() -> 'days') x limit 1 $$;
create function pg_temp.books() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '60 days', now() + interval '60 days') $$;
create function pg_temp.sumk(b jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((x ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(b -> 'lines') x where x ->> 'kind' = k $$;
create function pg_temp.stock() returns text language sql volatile security definer as $$
  select string_agg(id || '=' || trim_scale(on_hand)::text, ',' order by id) from public.inventory_items $$;
create function pg_temp.kitchen(pid text) returns bigint language sql volatile security definer as $$ select public.kitchen_cookie_balance(pid, 7) $$;
create function pg_temp.cl(l integer, c integer, s integer, w integer) returns jsonb language sql immutable as $$
  select jsonb_build_object('left', l, 'carry_next', c, 'to_shop', s, 'written_off', w) $$;
create function pg_temp.closing(counted bigint, lines jsonb, extra jsonb default '{}') returns jsonb language sql stable as $$
  select jsonb_build_object('day_id', pg_temp.did(), 'at', pg_temp.ms() + 60000, 'counted_cents', counted, 'lines', lines,
    'expected', pg_temp.day() ->> 'hash', 'sales_count', null, 'cash_cents', null) || extra $$;
create function pg_temp.xfer(id integer, qty integer) returns jsonb language sql stable as $$
  select jsonb_build_object('id', 'c6a10000-0000-4000-8000-' || lpad(id::text, 12, '0'), 'day_id', pg_temp.did(), 'product_id', 'sc-choc',
    'source_drop', 7, 'qty', qty, 'at', pg_temp.ms()) $$;
create function pg_temp.price(req integer, cents bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('requestId', 'c6a20000-0000-4000-8000-' || lpad(req::text, 12, '0'), 'eventId', pg_temp.eid(), 'productId', 'sc-oat',
    'priceCents', cents) $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------- the owner plans the event and moves kitchen cookies to the table
set local role authenticated;
select pg_temp.claims(pg_temp.uid(1)::text, 'authenticated');
do $c$
declare
  r record; ack jsonb; fp text; body jsonb;
begin
  perform public.save_bazaar_day(jsonb_build_object('id', pg_temp.did(), 'scheduled_id', pg_temp.bid(), 'day', current_date::text, 'float_cents', 50000,
    'lines', jsonb_build_array(
      jsonb_build_object('product_id', 'sc-oat', 'made_qty', 20, 'carried_qty', 0, 'price_cents', 12000),
      jsonb_build_object('product_id', 'sc-choc', 'made_qty', 0, 'carried_qty', 0, 'price_cents', 10000))), null);
  perform pg_temp.ok('plan: the day has its float and one line per flavour at its price',
    pg_temp.n($q$select count(*) from public.bazaar_day_lines where day_id = 'c6d00000-0000-4000-8000-000000000001'$q$) = 2
    and pg_temp.n($q$select float_cents from public.bazaar_days where id = 'c6d00000-0000-4000-8000-000000000001'$q$) = 50000
    and pg_temp.n($q$select price_cents from public.bazaar_day_lines where day_id = 'c6d00000-0000-4000-8000-000000000001' and product_id = 'sc-choc'$q$) = 10000);
  select * into r from public.save_bazaar_fee(jsonb_build_object('client_id', 'f-permit', 'scheduled_id', pg_temp.bid(), 'day_id', null, 'label', 'Permit',
    'category', 'Bazaar fees', 'amount_cents', 5000, 'paid_on', current_date::text));
  fp := pg_temp.fp();
  perform pg_temp.ok('fee: saved once; a repeat is answered and changes nothing; the books are untouched until finalise',
    r.duplicate = false and (select x.duplicate from public.save_bazaar_fee(jsonb_build_object('client_id', 'f-permit', 'scheduled_id', pg_temp.bid(), 'day_id', null,
      'label', 'Permit', 'category', 'Bazaar fees', 'amount_cents', 5000, 'paid_on', current_date::text)) x) = true
    and fp = pg_temp.fp() and pg_temp.n('select count(*) from public.ledger_entries') = 0);

  -- Choc: 10 baked, 6 to the table before the day.
  fp := pg_temp.fp();
  ack := public.transfer_bazaar_stock(pg_temp.xfer(1, 6));
  perform pg_temp.ok('transfer: 6 of 10 baked Choc leave the kitchen for the table', ack ->> 'kitchen_remaining' = '4' and ack ->> 'day_total' = '6'
    and ack ->> 'duplicate' = 'false' and pg_temp.kitchen('sc-choc') = 4
    and pg_temp.n($q$select made_qty from public.bazaar_day_lines where day_id = 'c6d00000-0000-4000-8000-000000000001' and product_id = 'sc-choc'$q$) = 6);
  fp := pg_temp.fp();
  perform pg_temp.ok('transfer: the same request again moves nothing', public.transfer_bazaar_stock(pg_temp.xfer(1, 6)) ->> 'duplicate' = 'true' and fp = pg_temp.fp());
  perform pg_temp.refused('transfer: more than the kitchen holds (5 of 4) is refused', format($$select public.transfer_bazaar_stock(%L::jsonb)$$, pg_temp.xfer(2, 5)::text), 'ZB001');
  perform pg_temp.refused('transfer: another body under a used id is refused', format($$select public.transfer_bazaar_stock(%L::jsonb)$$, pg_temp.xfer(1, 5)::text), '23505');
  perform pg_temp.ok('transfer: refusals changed nothing', fp = pg_temp.fp());

  -- Start the selling day on phone devC.
  select * into r from public.start_bazaar_day(pg_temp.did(), 'devC', pg_temp.eid());
  perform pg_temp.ok('start: the day sells on devC with its prices, float and the table stock', r.event_id = pg_temp.eid() and r.selling_device = 'devC'
    and r.prices = '{"sc-oat": 12000, "sc-choc": 10000}' and r.loaded = '{"sc-oat": 20, "sc-choc": 6}' and r.float_cents = 50000);
  perform pg_temp.ok('start: each cookie has a cost per cookie from its recipe (Oat 650, Choc 450)',
    pg_temp.n($q$select recipe_cents from public.bazaar_costs where scheduled_id = 'c6b00000-0000-4000-8000-000000000001' and product_id = 'sc-oat'$q$) = 650
    and pg_temp.n($q$select recipe_cents from public.bazaar_costs where scheduled_id = 'c6b00000-0000-4000-8000-000000000001' and product_id = 'sc-choc'$q$) = 450);
  fp := pg_temp.fp();
  perform pg_temp.ok('start: a repeat is answered; one event; stock and money untouched', (select x.event_id from public.start_bazaar_day(pg_temp.did(), 'devC', pg_temp.eid()) x) = pg_temp.eid()
    and fp = pg_temp.fp() and pg_temp.n('select count(*) from public.events') = 1);

  -- More stock on the table during the day.
  ack := public.transfer_bazaar_stock(pg_temp.xfer(3, 2));
  perform pg_temp.ok('transfer during the day: 2 more Choc reach the table, kitchen left 2, the till load follows', ack ->> 'kitchen_remaining' = '2' and ack ->> 'day_total' = '8'
    and pg_temp.q($q$select loaded::text from public.events where id = 'c6e00000-0000-4000-8000-000000000001'$q$)::jsonb = '{"sc-oat": 20, "sc-choc": 8}');
  select * into r from public.add_bazaar_day_stock(pg_temp.did(), 'sc-oat', 2, 'made', 'c6a30000-0000-4000-8000-000000000001');
  perform pg_temp.ok('add stock: 2 more Oat made at the table: 22 made, 22 loaded', r.made_qty = 22 and r.loaded = 22 and r.duplicate = false);
  fp := pg_temp.fp();
  select * into r from public.add_bazaar_day_stock(pg_temp.did(), 'sc-oat', 2, 'made', 'c6a30000-0000-4000-8000-000000000001');
  perform pg_temp.ok('add stock: the same add again is answered and adds nothing', r.duplicate = true and r.made_qty = 22 and fp = pg_temp.fp());
  perform pg_temp.refused('add stock: kitchen cookies are moved by transfer, not typed in', $$select * from public.add_bazaar_day_stock('c6d00000-0000-4000-8000-000000000001', 'sc-choc', 1, 'made', 'c6a30000-0000-4000-8000-000000000002')$$, 'ZB002');
end $c$;

-- ---------------------------------------------------------------- selling: online, a price change, a freebie, voids, an expense, a loss
do $c$
declare
  r record; fp text; s jsonb; x jsonb;
begin
  select * into r from public.record_event_sale(pg_temp.sale('S1', '{"sc-oat": 2, "sc-choc": 1}', 0, 34000, 'Cash', 0));
  perform pg_temp.ok('sale S1: 2 Oat + 1 Choc, cash 340.00, recorded once with one ledger line', r.duplicate = false and r.voided = false
    and pg_temp.n($q$select amount_cents from public.ledger_entries where memo = 'Stall sale devC:S1'$q$) = 34000
    and pg_temp.unit('S1', 'sc-oat') = 12000 and pg_temp.unit('S1', 'sc-choc') = 10000);
  perform public.record_event_sale(pg_temp.sale('S2', '{"sc-oat": 3}', 1000, 35000, 'GCash', 0));
  perform pg_temp.ok('sale S2: 3 Oat less a discount of 10.00, GCash 350.00', pg_temp.n($q$select gross_cents from public.event_sales where client_id = 'devC:S2'$q$) = 36000
    and pg_temp.n($q$select total_cents from public.event_sales where client_id = 'devC:S2'$q$) = 35000);
  perform pg_temp.ok('sale: Bazaar Mode takes no pouches or bags at the till (finalise takes them once)', pg_temp.stock() = 'sc-bag=10,sc-flour=2000,sc-pouch=100'
    and pg_temp.n('select count(*) from public.stock_movements') = 0);

  fp := pg_temp.fp();
  select * into r from public.record_event_sale(pg_temp.sale('S1', '{"sc-oat": 2, "sc-choc": 1}', 0, 34000, 'Cash', 0));
  perform pg_temp.ok('replay: S1 sent again (a retry) is acknowledged as a duplicate and changes no sale, money or stock', r.duplicate = true and fp = pg_temp.fp());
  perform pg_temp.refused('replay: another sale under S1''s id is refused', format($$select * from public.record_event_sale(%L::jsonb)$$,
    pg_temp.sale('S1', '{"sc-oat": 1}', 0, 12000, 'Cash', 0)::text), '23505');
  -- S2 (migration 93): any device of hers may sell the day, so "another phone cannot sell" is gone; a sale still cannot take a client
  -- id that names another device than the one sending it. (Two devices selling the same day is proved in bazaar-day-anywhere.sql.)
  perform pg_temp.refused('a client id cannot name another device than the sender', format($$select * from public.record_event_sale(%L::jsonb)$$,
    (pg_temp.sale('X1', '{"sc-oat": 1}', 0, 12000, 'Cash', 0, 'devZ') || '{"deviceId": "devC"}')::text), '22023');
  perform pg_temp.refused('a total that is not the prices is refused', format($$select * from public.record_event_sale(%L::jsonb)$$,
    pg_temp.sale('X2', '{"sc-oat": 1}', 0, 11000, 'Cash', 0)::text), '22023');
  perform pg_temp.refused('a flavour not on the day is refused', format($$select * from public.record_event_sale(%L::jsonb)$$,
    pg_temp.sale('X3', '{"sc-zzz": 1}', 0, 100, 'Cash', 0)::text), '22023');
  perform pg_temp.ok('refusals changed nothing', fp = pg_temp.fp());

  -- The price of Oat changes on the started day.
  s := public.set_bazaar_day_price(pg_temp.price(1, 13000));
  perform pg_temp.ok('price: Oat 120.00 -> 130.00 is list 1; the day and its line show it, Choc is as it was', s ->> 'version' = '1' and s -> 'prices' = '{"sc-oat": 13000, "sc-choc": 10000}'
    and pg_temp.q($q$select price_snapshot::text from public.events where id = 'c6e00000-0000-4000-8000-000000000001'$q$)::jsonb = '{"sc-oat": 13000, "sc-choc": 10000}'
    and pg_temp.n($q$select price_cents from public.bazaar_day_lines where day_id = 'c6d00000-0000-4000-8000-000000000001' and product_id = 'sc-oat'$q$) = 13000);
  fp := pg_temp.fp();
  perform pg_temp.ok('price: the same request again changes nothing', (public.set_bazaar_day_price(pg_temp.price(1, 13000)) ->> 'duplicate')::boolean = true and fp = pg_temp.fp());
  perform public.record_event_sale(pg_temp.sale('S3', '{"sc-oat": 2}', 0, 26000, 'GCash', 1));
  perform pg_temp.ok('sale S3 after the change: 2 Oat at 130.00 = 260.00', pg_temp.unit('S3', 'sc-oat') = 13000);

  -- A freebie, and a void that reaches the server before its sale.
  select * into r from public.record_event_sale(pg_temp.sale('F1', '{"sc-choc": 1}', 10000, 0, 'Freebie', 1));
  perform pg_temp.ok('freebie F1: 1 Choc given away: gross 100.00 recorded, no money, no ledger line', r.duplicate = false
    and pg_temp.n($q$select gross_cents from public.event_sales where client_id = 'devC:F1'$q$) = 10000
    and pg_temp.n($q$select count(*) from public.ledger_entries where memo like '%devC:F1'$q$) = 0);
  perform pg_temp.refused('a freebie cannot charge', format($$select * from public.record_event_sale(%L::jsonb)$$,
    pg_temp.sale('F2', '{"sc-choc": 1}', 0, 10000, 'Freebie', 1)::text), '22023');
  fp := pg_temp.fp();
  select * into r from public.void_event_sale(pg_temp.void('Q2'));
  perform pg_temp.ok('void first: a void for a sale the server has not seen is kept, no sale and no money', r.sale_known = false and r.duplicate = false
    and pg_temp.n('select count(*) from public.event_sales where client_id = ''devC:Q2''') = 0);
  select * into r from public.record_event_sale(pg_temp.sale('Q2', '{"sc-choc": 1}', 0, 10000, 'Cash', 1));
  perform pg_temp.ok('void first: the sale then arrives already voided: stored, no ledger line, counts nowhere', r.duplicate = false and r.voided = true
    and pg_temp.n($q$select count(*) from public.ledger_entries where memo like '%devC:Q2'$q$) = 0
    and pg_temp.q($q$select (voided_at is not null)::text from public.event_sales where client_id = 'devC:Q2'$q$) = 'true');

  -- Void S2 (a reversal line, not a delete).
  select * into r from public.void_event_sale(pg_temp.void('S2'));
  perform pg_temp.ok('void S2: a reversing line of -350.00 beside the sale line; the sale stays on record flagged voided', r.sale_known = true and r.duplicate = false
    and pg_temp.n($q$select sum(amount_cents) from public.ledger_entries where sale_id = (select id from public.event_sales where client_id = 'devC:S2')$q$) = 0
    and pg_temp.n($q$select count(*) from public.ledger_entries where sale_id = (select id from public.event_sales where client_id = 'devC:S2')$q$) = 2
    and pg_temp.q($q$select (voided_at is not null)::text from public.event_sales where client_id = 'devC:S2'$q$) = 'true');
  fp := pg_temp.fp();
  select * into r from public.void_event_sale(pg_temp.void('S2'));
  perform pg_temp.ok('void S2 again: acknowledged, no second reversal', r.duplicate = true and fp = pg_temp.fp());

  -- The expense bought at the till, and a lost cookie.
  x := jsonb_build_object('clientId', 'devC:E1', 'eventId', pg_temp.eid(), 'label', 'Tape', 'category', 'Supplies', 'amountCents', 1500, 'at', pg_temp.ms());
  perform public.add_event_expense(x);
  fp := pg_temp.fp();
  perform pg_temp.ok('expense: Tape 15.00 is a cost line at once; the same request again adds nothing',
    pg_temp.n($q$select amount_cents from public.ledger_entries where memo like '% — Tape'$q$) = -1500
    and (select e.duplicate from public.add_event_expense(x) e) = true and fp = pg_temp.fp());
  perform public.save_bazaar_loss(jsonb_build_object('client_id', 'devC:L1', 'day_id', pg_temp.did(), 'product_id', 'sc-oat', 'qty', 1, 'reason', 'Dropped', 'at', pg_temp.ms()));

  -- The phone still holds Q1 (rung before the change, queued offline); it closes with 4 sales and 560.00 cash, the server holds 3 and 340.00.
  s := pg_temp.day();
  perform pg_temp.ok('before reconnect: the server holds 3 sales, 340.00 cash, 2 voided', s @> '{"sales": 3, "voided": 2, "cash_sales_cents": 34000}');
  perform pg_temp.refused('close with a queued sale not yet sent is refused: sync first', format($$select public.close_bazaar_day(%L::jsonb)$$,
    pg_temp.closing(105700, jsonb_build_object('sc-oat', pg_temp.cl(16, 0, 10, 6), 'sc-choc', pg_temp.cl(5, 0, 3, 2)), '{"sales_count": 4, "cash_cents": 56000}')::text), '40001');

  -- Reconnect: Q1 is sent; it was rung 5 minutes before the change, so it is priced on the old list (22000), not 23000.
  select * into r from public.record_event_sale(pg_temp.sale('Q1', '{"sc-oat": 1, "sc-choc": 1}', 0, 22000, 'Cash', -5));
  perform pg_temp.ok('queued sale Q1 (old price, sent after the change) is accepted at Oat 120.00, once', r.duplicate = false and r.voided = false
    and pg_temp.unit('Q1', 'sc-oat') = 12000 and pg_temp.unit('Q1', 'sc-choc') = 10000
    and pg_temp.n($q$select amount_cents from public.ledger_entries where memo = 'Stall sale devC:Q1'$q$) = 22000);
  fp := pg_temp.fp();
  select * into r from public.record_event_sale(pg_temp.sale('Q1', '{"sc-oat": 1, "sc-choc": 1}', 0, 22000, 'Cash', -5));
  perform pg_temp.ok('after a reload the phone sends Q1 again before it saw the acknowledgement: duplicate, nothing moves', r.duplicate = true and fp = pg_temp.fp());
  perform pg_temp.refused('a total that fits no list the day has had is refused (Q1 at 210.00)', format($$select * from public.record_event_sale(%L::jsonb)$$,
    pg_temp.sale('Q3', '{"sc-oat": 1, "sc-choc": 1}', 0, 21000, 'Cash', -5)::text), '22023');
end $c$;

-- ---------------------------------------------------------------- close the day, then the event
do $c$
declare
  s jsonb; fp text; h text; lines jsonb := jsonb_build_object('sc-oat', pg_temp.cl(16, 0, 10, 6), 'sc-choc', pg_temp.cl(5, 0, 3, 2));
  till jsonb := '{"sales_count": 4, "cash_cents": 56000}'; b jsonb;
begin
  s := pg_temp.day();
  perform pg_temp.ok('the day before her count: revenue 820.00, gross 920.00, freebie 100.00, cash expected 1060.00',
    s @> '{"state": "open", "revenue_cents": 82000, "gross_cents": 92000, "discount_cents": 0, "freebie_cents": 10000, "sales": 4, "voided": 2,
           "cash_sales_cents": 56000, "cash_expected_cents": 106000, "fees_cents": 1500, "float_cents": 50000}'
    and s -> 'by_pay' = '{"Cash": 56000, "GCash": 26000}');
  perform pg_temp.ok('stock by flavour: Oat 22 made, 5 sold, 1 lost; Choc 8 on the table, 2 sold, 1 given (a voided sale counts nowhere)',
    (select x from jsonb_array_elements(s -> 'lines') x where x ->> 'product_id' = 'sc-oat') @> '{"made": 22, "sold": 5, "given": 0, "lost": 1, "price_cents": 13000}'
    and (select x from jsonb_array_elements(s -> 'lines') x where x ->> 'product_id' = 'sc-choc') @> '{"made": 8, "sold": 2, "given": 1, "lost": 0}');
  h := s ->> 'hash';
  perform pg_temp.refused('close: a stale summary is refused', format($$select public.close_bazaar_day(%L::jsonb)$$,
    (pg_temp.closing(105700, lines, till) || jsonb_build_object('expected', repeat('0', 64)))::text), '40001');
  perform pg_temp.refused('close: her count must account for every cookie (Oat left 17 of 16)', format($$select public.close_bazaar_day(%L::jsonb)$$,
    pg_temp.closing(105700, lines || jsonb_build_object('sc-oat', pg_temp.cl(17, 0, 10, 7)), till)::text), '22023');
  perform pg_temp.ok('close refusals left the day open', pg_temp.q($q$select (closed_at is null)::text from public.events where id = 'c6e00000-0000-4000-8000-000000000001'$q$) = 'true');
  s := public.close_bazaar_day(pg_temp.closing(105700, lines, till));
  perform pg_temp.ok('close: counted 1057.00 against 1060.00 expected is SHORT 3.00; every cookie accounted for',
    (select x from jsonb_array_elements(s -> 'days') x limit 1) @> '{"state": "closed", "counted_cents": 105700, "short_cents": 300, "over_cents": 0}'
    and (select x from jsonb_array_elements((select x from jsonb_array_elements(s -> 'days') x limit 1) -> 'count') x where x ->> 'product_id' = 'sc-oat')
        = '{"product_id": "sc-oat", "left": 16, "carry_next": 0, "to_shop": 10, "written_off": 6, "not_accounted": 0}'
    and (select x from jsonb_array_elements((select x from jsonb_array_elements(s -> 'days') x limit 1) -> 'count') x where x ->> 'product_id' = 'sc-choc')
        = '{"product_id": "sc-choc", "left": 5, "carry_next": 0, "to_shop": 3, "written_off": 2, "not_accounted": 0}');
  perform pg_temp.ok('close: Choc sent back to the shop-kitchen is credited to the kitchen (2 left + 3 back = 5); closing books no money and no stock',
    pg_temp.kitchen('sc-choc') = 5 and pg_temp.n('select count(*) from public.ledger_entries where kind = ''cost''') = 1
    and pg_temp.n('select count(*) from public.stock_movements') = 0 and pg_temp.stock() = 'sc-bag=10,sc-flour=2000,sc-pouch=100');
  fp := pg_temp.fp();
  perform pg_temp.ok('close again with the same answer: acknowledged, nothing moves', public.close_bazaar_day(pg_temp.closing(105700, lines, till)) is not null and fp = pg_temp.fp());
  perform pg_temp.refused('close again with another count is refused', format($$select public.close_bazaar_day(%L::jsonb)$$,
    pg_temp.closing(106000, lines, till)::text), '23505');
  perform pg_temp.refused('a sale rung after the close is refused', format($$select * from public.record_event_sale(%L::jsonb)$$,
    pg_temp.sale('Z1', '{"sc-oat": 1}', 0, 13000, 'Cash', 10)::text), '55000');
  perform pg_temp.refused('the day''s prices cannot change once it is closed', format($$select public.set_bazaar_day_price(%L::jsonb)$$, pg_temp.price(2, 14000)::text), '55000');
  perform pg_temp.refused('no kitchen cookies move to a closed day', format($$select public.transfer_bazaar_stock(%L::jsonb)$$, pg_temp.xfer(4, 1)::text), '55000');

  s := pg_temp.sm();
  perform pg_temp.ok('event: revenue 820.00 (cash 560.00, GCash 260.00), short 3.00, fees 365.00 (rent 300.00, Permit 50.00, Tape 15.00)',
    s -> 'revenue' @> '{"revenue_cents": 82000, "gross_cents": 92000, "freebie_cents": 10000, "sales": 4, "voided": 2}' and s -> 'revenue' -> 'by_pay' = '{"Cash": 56000, "GCash": 26000}'
    and s -> 'cash' = '{"over_cents": 0, "short_cents": 300}' and (s #>> '{fees,total_cents}')::bigint = 36500 and (s #>> '{fees,event_cents}')::bigint = 35000);
  perform pg_temp.ok('event: cookie cost Oat 78.00 + Choc 22.50 = 100.50; profit 351.50 (820.00 - 365.00 - 100.50 - 3.00)',
    (select x from jsonb_array_elements(s -> 'cookie_cost' -> 'lines') x where x ->> 'product_id' = 'sc-oat') @> '{"made": 22, "to_shop": 10, "sold": 5, "lost": 1, "written_off": 6, "made_cents": 14300, "to_shop_cents": 6500, "cost_cents": 7800}'
    and (select x from jsonb_array_elements(s -> 'cookie_cost' -> 'lines') x where x ->> 'product_id' = 'sc-choc') @> '{"made": 8, "to_shop": 3, "sold": 2, "given": 1, "written_off": 2, "cost_cents": 2250}'
    and s -> 'cookie_cost' @> '{"cents": 10050}' and s -> 'profit' @> '{"cents": 35150}');

  -- Before finalise the event is held, out of the books.
  b := pg_temp.books();
  perform pg_temp.ok('books before finalise: the open event is held (6 lines: revenue 820.00, expense 15.00) and counts in no total',
    pg_temp.sumk(b, 'revenue') = 0 and pg_temp.sumk(b, 'expense') = 0 and jsonb_array_length(b -> 'lines') = 0 and jsonb_array_length(b -> 'held') = 1
    and b -> 'held' -> 0 = jsonb_build_object('scheduled_id', pg_temp.bid(), 'name', 'SC Fair', 'count', 6, 'revenue_cents', 82000, 'expense_cents', 1500));
  perform pg_temp.refused('finalise: a stale summary is refused', format($$select public.finalise_bazaar(%L::uuid, %L, 7, null)$$, pg_temp.bid(), repeat('0', 64)), '40001');
  perform pg_temp.refused('finalise: a phone still holding sales (5, not 4) is told to sync', format($$select public.finalise_bazaar(%L::uuid, %L, 7, %L::jsonb)$$,
    pg_temp.bid(), s ->> 'hash', jsonb_build_object('day_id', pg_temp.did(), 'sales_count', 5, 'cash_cents', 56000)::text), '40001');
  perform pg_temp.ok('finalise refusals posted nothing', pg_temp.n('select count(*) from public.ledger_entries') = 6 and pg_temp.stock() = 'sc-bag=10,sc-flour=2000,sc-pouch=100');

  -- Finalise: the books and the stock, once.
  h := s ->> 'hash';
  s := public.finalise_bazaar(pg_temp.bid(), h, 7, till || jsonb_build_object('day_id', pg_temp.did()));
  perform pg_temp.ok('finalise: the event is finalised on the summary shown', s ->> 'hash' = h
    and pg_temp.q($q$select (finalised_at is not null)::text from public.scheduled_events where id = 'c6b00000-0000-4000-8000-000000000001'$q$) = 'true');
  perform pg_temp.ok('books: rent -300.00, Permit -50.00 and the drawer short -3.00 posted once; Tape stays the one line from the till',
    pg_temp.n($q$select count(*) from public.ledger_entries where kind = 'cost' and category = 'Bazaar rent' and amount_cents = -30000$q$) = 1
    and pg_temp.n($q$select count(*) from public.ledger_entries where kind = 'cost' and category = 'Bazaar fees' and amount_cents = -5000$q$) = 1
    and pg_temp.n($q$select count(*) from public.ledger_entries where kind = 'cost' and category = 'Cash variance' and amount_cents = -300$q$) = 1
    and pg_temp.n($q$select count(*) from public.ledger_entries where category = 'Supplies' and amount_cents = -1500$q$) = 1
    and pg_temp.n('select count(*) from public.ledger_entries') = 9);
  b := pg_temp.books();
  perform pg_temp.ok('books after finalise: revenue 820.00 = 340.00 + 350.00 - 350.00 + 260.00 + 220.00; expense 368.00; nothing held',
    pg_temp.sumk(b, 'revenue') = 82000 and pg_temp.sumk(b, 'expense') = 36800 and jsonb_array_length(b -> 'lines') = 9 and jsonb_array_length(b -> 'held') = 0);
  perform pg_temp.ok('stock: Oat sent to the shop is a batch of 10 (flour 200); the 12 left and the 5 Choc not returned take their flour and pouches; 4 bags',
    pg_temp.n($q$select qty from public.production_records where kind = 'batch' and product_id = 'sc-oat' and drop_no = 7$q$) = 10 and pg_temp.kitchen('sc-oat') = 10
    and pg_temp.stock() = 'sc-bag=6,sc-flour=1560,sc-pouch=83');

  -- A retry of the same finalise is answered and changes nothing.
  fp := pg_temp.fp();
  perform pg_temp.ok('finalise again: the stored summary is returned; no ledger line, stock use or record is added',
    public.finalise_bazaar(pg_temp.bid(), h, 7, till || jsonb_build_object('day_id', pg_temp.did())) = s and fp = pg_temp.fp());
  perform pg_temp.refused('finalise again on another summary is refused', format($$select public.finalise_bazaar(%L::uuid, %L, 7, null)$$, pg_temp.bid(), repeat('0', 64)), '23505');
  perform pg_temp.ok('finalise refusals changed nothing', fp = pg_temp.fp());
end $c$;

-- ---------------------------------------------------------------- after finalise: nothing more is sold or voided; a test event is reversed whole
do $c$
declare
  fp text := pg_temp.fp(); rv jsonb; b jsonb; h text; d2 uuid := 'c6d00000-0000-4000-8000-000000000002'; e2 uuid := 'c6e00000-0000-4000-8000-000000000002';
  b2 uuid := 'c6b00000-0000-4000-8000-000000000002'; sale jsonb;
begin
  perform pg_temp.refused('a finalised event takes no void (S1)', format($$select * from public.void_event_sale(%L::jsonb)$$, pg_temp.void('S1')::text), '55000');
  perform pg_temp.refused('an event that sent cookies to the shop is not reversed by the test-event tool', format($$select public.reverse_bazaar_test(%L::uuid, 'SC Fair')$$, pg_temp.bid()), '55000');
  perform pg_temp.ok('the refusals changed nothing', fp = pg_temp.fp());

  -- A second, small event (test fair, nothing to the shop) is run to the books and then reversed: the books and the stock go back exactly.
  perform public.save_bazaar_day(jsonb_build_object('id', d2, 'scheduled_id', b2, 'day', (current_date + 1)::text, 'float_cents', 0,
    'lines', jsonb_build_array(jsonb_build_object('product_id', 'sc-oat', 'made_qty', 3, 'carried_qty', 0, 'price_cents', 13000))), null);
  perform public.start_bazaar_day(d2, 'devC', e2);
  sale := pg_temp.sale('R1', '{"sc-oat": 1}', 0, 13000, 'Cash', 0) || jsonb_build_object('eventId', e2);
  perform public.record_event_sale(sale);
  perform public.close_bazaar_day(jsonb_build_object('day_id', d2, 'at', pg_temp.ms() + 60000, 'counted_cents', 13000, 'lines', jsonb_build_object('sc-oat', pg_temp.cl(1, 0, 0, 1)),
    'expected', (public.get_bazaar(b2) -> 'summary' -> 'days' -> 0) ->> 'hash', 'sales_count', null, 'cash_cents', null));
  perform pg_temp.ok('test fair: she counts 1 Oat left (the server knows 3 made - 1 sold = 2): one cookie not accounted for yet',
    (public.get_bazaar(b2) -> 'summary' -> 'days' -> 0 -> 'count' -> 0) @> '{"left": 1, "not_accounted": 1}');
  -- A freebie rung 1 minute before the close, still in the phone's queue, arrives after it: accepted (never lost), the day is flagged as changed
  -- after its close, and the summary she was shown is stale.
  h := public.get_bazaar(b2) -> 'summary' ->> 'hash';
  perform public.record_event_sale(pg_temp.sale('R2', '{"sc-oat": 1}', 13000, 0, 'Freebie', -1) || jsonb_build_object('eventId', e2));
  perform pg_temp.ok('late queued sale: accepted after the close; the freebie explains the missing cookie (not accounted 1 -> 0); the day is flagged changed after close; the old summary is stale',
    (public.get_bazaar(b2) -> 'summary' -> 'days' -> 0) @> '{"changed_after_close": true, "sales": 2, "freebie_cents": 13000, "revenue_cents": 13000}'
    and (public.get_bazaar(b2) -> 'summary' -> 'days' -> 0 -> 'count' -> 0) @> '{"left": 1, "not_accounted": 0}'
    and (public.get_bazaar(b2) -> 'summary' ->> 'hash') <> h);
  perform pg_temp.refused('finalise on the summary from before the late sale is refused', format($$select public.finalise_bazaar(%L::uuid, %L, 7, null)$$, b2, h), '40001');
  perform public.finalise_bazaar(b2, public.get_bazaar(b2) -> 'summary' ->> 'hash', 7, null);
  perform pg_temp.ok('test fair: finalised; rent -200.00 and sale 130.00 posted, flour 60, pouches 3 and 2 bags (one per sale, the freebie too) taken',
    pg_temp.stock() = 'sc-bag=4,sc-flour=1500,sc-pouch=80' and pg_temp.n('select count(*) from public.ledger_entries') = 11);
  rv := public.reverse_bazaar_test(b2, 'SC Test Fair');
  perform pg_temp.ok('reverse: its 2 ledger lines (net -70.00) each get an equal and opposite line; the stock goes back to the unit', rv @> '{"ledger_lines": 2, "ledger_total_cents": -7000}'
    and pg_temp.stock() = 'sc-bag=6,sc-flour=1560,sc-pouch=83' and pg_temp.n('select count(*) from public.ledger_entries') = 13);
  b := pg_temp.books();
  perform pg_temp.ok('reverse: the books are as before the test fair (revenue 820.00, expense 368.00); the lines stay, reversed',
    pg_temp.sumk(b, 'revenue') = 82000 and pg_temp.sumk(b, 'expense') = 36800 and pg_temp.n('select sum(amount_cents) from public.ledger_entries') = 45200);
  fp := pg_temp.fp();
  perform pg_temp.ok('reverse again: the first answer, nothing moves', public.reverse_bazaar_test(b2, 'SC Test Fair') = rv and fp = pg_temp.fp());
end $c$;

-- ---------------------------------------------------------------- the helper and the public hold none of it
select pg_temp.claims(pg_temp.uid(2)::text, 'authenticated');
do $c$
declare
  bad text[] := array[
    format($$select * from public.record_event_sale(%L::jsonb)$$, pg_temp.sale('H1', '{"sc-oat": 1}', 0, 13000, 'Cash', 0)::text),
    format($$select * from public.void_event_sale(%L::jsonb)$$, pg_temp.void('S3')::text),
    format($$select public.set_bazaar_day_price(%L::jsonb)$$, pg_temp.price(9, 14000)::text),
    format($$select public.transfer_bazaar_stock(%L::jsonb)$$, pg_temp.xfer(9, 1)::text),
    format($$select * from public.start_bazaar_day(%L, 'devC', %L)$$, pg_temp.did(), pg_temp.eid()),
    format($$select * from public.add_bazaar_day_stock(%L, 'sc-oat', 1, 'made', 'c6a30000-0000-4000-8000-000000000009')$$, pg_temp.did()),
    $$select public.close_bazaar_day('{}'::jsonb)$$,
    format($$select public.finalise_bazaar(%L::uuid, repeat('0', 64), 7, null)$$, pg_temp.bid()),
    format($$select public.reverse_bazaar_test(%L::uuid, 'SC Fair')$$, pg_temp.bid()),
    $$select * from public.add_event_expense('{}'::jsonb)$$, $$select * from public.save_bazaar_fee('{}'::jsonb)$$, $$select public.get_bazaar(null)$$, $$select public.get_books(now(), now())$$];
  i integer;
begin
  for i in 1..array_length(bad, 1) loop
    perform pg_temp.refused('helper is refused: ' || split_part(substr(bad[i], 8), '(', 1), bad[i], '42501');
  end loop;
end $c$;
reset role;
set local role anon;
select pg_temp.claims(null, 'anon');
do $c$
declare
  bad text[] := array[
    format($$select * from public.record_event_sale(%L::jsonb)$$, pg_temp.sale('H2', '{"sc-oat": 1}', 0, 13000, 'Cash', 0)::text),
    format($$select * from public.void_event_sale(%L::jsonb)$$, pg_temp.void('S3')::text),
    $$select public.close_bazaar_day('{}'::jsonb)$$,
    format($$select public.finalise_bazaar(%L::uuid, repeat('0', 64), 7, null)$$, pg_temp.bid()),
    $$select public.get_books(now(), now())$$, $$select public.get_bazaar(null)$$];
  i integer;
begin
  for i in 1..array_length(bad, 1) loop
    perform pg_temp.refused('anon is refused: ' || split_part(substr(bad[i], 8), '(', 1), bad[i], '42501');
  end loop;
end $c$;
reset role;

select 'STEP|' || n || '|' || label from pg_temp.steps order by n;
select 'SCENARIO_C|passed|' || count(*) from pg_temp.steps;
rollback;
