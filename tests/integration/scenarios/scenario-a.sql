-- Connected scenario A (docs/state/full-goal.md section 8): customer order -> payment verification -> production -> stock ->
-- pickup -> books, driven through the real RPCs with real SQL roles (anon, a helper, the owner). One transaction; it rolls back.
--
-- HOW TO RUN (disposable local database only; never a hosted one):
--   1. A Postgres 17 Supabase image with every migration applied, for example
--        docker run -d --name hc-scenario-a -p 127.0.0.1:55433:5432 -e POSTGRES_PASSWORD=<any> public.ecr.aws/supabase/postgres:17.6.1.166
--        (bare image has no storage tables: create storage.buckets and storage.objects as supabase_admin first, owner postgres,
--         then `supabase db reset --yes --no-seed --db-url postgresql://postgres@127.0.0.1:55433/postgres?sslmode=disable`;
--         the full recipe is in docs/TESTING.md under "Scenario A")
--   2. node scripts/test-scenario-a.mjs [container-name]     (default hc-scenario-a)  prints PASS or FAIL.
--
-- What it proves, in order:
--   shop      the owner gives a sticker choice a photo, removes a flavour and restores it; anon sees the photo, and the restored
--             flavour stays unpublished, so an order for it is refused (before, while removed, and after restoring)
--   order     anon place_order: 6 cookies, a box of 6, a sticker choice with a photo, a note card, pickup at the campus slot;
--             the total is exact in centavos; a replay of the same client id returns the same order and creates no second one;
--             another body under that client id is refused; the customer token shows the pickup label and no private field
--   payment   only the owner confirms; a stale stamp is refused and changes nothing; the confirmation replays without a second
--             payment; a status change on a stale stamp is refused, an impossible step is refused
--   kitchen   two doughs take their recipe lines off stock once each and two bakes use that dough once (a replay is a duplicate), a stock receipt costs money once,
--             packing the order takes its packaging once
--   pickup    Preparing -> Ready -> Completed, each replay-safe; the pickup label survives the owner changing the place afterwards
--   books     exactly one revenue line for the order, exactly one expense for the receipt, nothing uncosted, and a final round of
--             replays leaves stock and books unchanged
-- The transaction keeps one clock (now() does not advance), so a "stale stamp" here is an old stamp, not a competing write.
begin;
create temporary table steps (n serial, label text);
grant select, insert on steps to anon, authenticated;
grant usage on sequence steps_n_seq to anon, authenticated;
create temporary table ctx (key text primary key, val text);
grant select, insert, update on ctx to anon, authenticated;

insert into auth.users(id) values
  ('a5a00000-0000-4000-8000-000000000001'), ('a5a00000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
  ('a5a00000-0000-4000-8000-000000000001', 'owner', 'Scenario owner', true),
  ('a5a00000-0000-4000-8000-000000000002', 'helper', 'Scenario helper', true);

-- ---------------------------------------------------------------- helpers
create function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'scenario A failed: %', label; end if;
  insert into pg_temp.steps(label) values (label);
end $$;
-- Runs one statement; it must fail with exactly `wanted`.
create function pg_temp.refused(label text, stmt text, wanted text) returns void language plpgsql as $$
declare got text := '00000';
begin
  begin execute stmt; exception when others then got := sqlstate; end;
  if got <> wanted then raise exception 'scenario A failed: % (wanted %, got %)', label, wanted, got; end if;
  insert into pg_temp.steps(label) values (label);
end $$;
-- Reads private data as the table owner (the test's eyes, not a caller's).
create function pg_temp.q(stmt text) returns text language plpgsql security definer as $$
declare r text; begin execute stmt into r; return r; end $$;
create function pg_temp.claims(sub text, claim_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub, ''), true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', coalesce(sub, ''), 'role', claim_role)::text, true);
end $$;
create function pg_temp.set(k text, v text) returns void language sql as $$
  insert into pg_temp.ctx values (k, v) on conflict (key) do update set val = excluded.val $$;
create function pg_temp.get(k text) returns text language sql stable as $$
  select val from pg_temp.ctx where key = k $$;
create function pg_temp.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date $$;
create function pg_temp.nextdow(dow integer, lead integer) returns date language sql stable as $$
  select pg_temp.today() + s from generate_series(lead, lead + 6) s
   where extract(isodow from pg_temp.today() + s) = dow limit 1 $$;
create function pg_temp.ms() returns bigint language sql stable as $$
  select (extract(epoch from now()) * 1000)::bigint $$;
create function pg_temp.on_hand(item text) returns numeric language sql volatile security definer as $$
  select on_hand from public.inventory_items where id = item $$;
create function pg_temp.stamp(oid text) returns timestamptz language sql stable as $$
  select (x ->> 'updated_at')::timestamptz from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' = oid $$;
create function pg_temp.sumk(j jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'kind' = k $$;
create function pg_temp.books() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '30 days', now() + interval '1 day') $$;
create function pg_temp.flavour_stamp(pid text) returns timestamptz language sql stable as $$
  select f.updated_at from public.get_flavours() f where f.id = pid $$;
create function pg_temp.pid(n integer) returns text language sql immutable as $$
  select 'a5b00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.prep(n integer, product text, balls integer) returns jsonb language sql stable as $$
  select jsonb_build_object('id', pg_temp.pid(n), 'product_id', product, 'recipe_version', 1, 'recipe_amount', 1,
    'balls', balls, 'drop_no', 5, 'at', pg_temp.ms()) $$;
create function pg_temp.bake(n integer, product text, qty integer, rejects integer default 0) returns jsonb language sql stable as $$
  select jsonb_build_object('id', pg_temp.pid(n), 'product_id', product, 'qty', qty, 'target', qty, 'rejects', rejects,
    'recipe_version', 1, 'drop_no', 5, 'at', pg_temp.ms()) $$;
create function pg_temp.save_photos(images jsonb) returns void language plpgsql as $$
declare x jsonb := public.get_order_extras();
begin
  perform public.save_order_extras_with_images(x - 'updated_at' - 'choice_images', images,
    (public.get_order_extras() ->> 'updated_at')::timestamptz);
end $$;
create function pg_temp.save_location(label text) returns void language plpgsql as $$
declare r public.order_rules;
begin
  perform public.save_order_rules((select to_jsonb(x) - 'updated_at' from public.get_order_rules() x) || jsonb_build_object('campus_label', label),
    (select x.updated_at from public.get_order_rules() x));
end $$;
-- The customer's order: slot-independent, one client id; `over` replaces keys.
create function pg_temp.body(over jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'client_id', 'a5c00000-0000-4000-8000-000000000001', 'name', 'Scenario Buyer', 'ig', '@scenario.buyer',
    'mobile', '09170000555', 'pickup_date', to_char(pg_temp.nextdow(1, 1), 'YYYY-MM-DD'), 'pickup_window', 'campus',
    'pay_method', 'SA GCash', 'pay_ref', 'GCASH-REF-1', 'notes', 'private note',
    'items', jsonb_build_array(jsonb_build_object('product_id', 'sa-oat', 'qty', 4), jsonb_build_object('product_id', 'sa-choc', 'qty', 2)),
    'boxes', jsonb_build_array(jsonb_build_object('size', 6, 'qty', 1)),
    'add_ons', jsonb_build_array(jsonb_build_object('id', 'sticker', 'variant', '2', 'qty', 2),
                                 jsonb_build_object('id', 'note-card', 'qty', 1, 'text', 'Happy birthday Mika'))
  ) || over $$;
create function pg_temp.place(over jsonb default '{}'::jsonb) returns text language plpgsql as $$
declare r record;
begin
  select * into r from public.place_order(pg_temp.body(over));
  perform pg_temp.set('order_no', r.order_no); perform pg_temp.set('token', r.status_token);
  perform pg_temp.set('total', r.total_cents::text); perform pg_temp.set('replayed', r.replayed::text);
  return r.order_no;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------- fixture (rows an operator would have entered)
insert into public.products(id, name, short_name, price_cents, kind, item_type, capacity_weight, published, active, sort_order, type_id) values
  ('sa-oat', 'Scenario oat', 'Oat', 12000, 'Permanent', 'cookie', 1, true, true, 1, 'cookie'),
  ('sa-choc', 'Scenario choc', 'Choc', 13000, 'Permanent', 'cookie', 1, true, true, 2, 'cookie'),
  ('sa-gone', 'Scenario removed', 'Gone', 12500, 'Permanent', 'cookie', 1, true, true, 3, 'cookie');
insert into public.payment_methods(id, label, account_number, account_name, active, sort_order)
values ('sa-gcash', 'SA GCash', '0917', 'Holder', true, 1);
insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('sa-flour', 'SA Flour', 'g', 'Ingredients', true, 1000), ('sa-butter', 'SA Butter', 'g', 'Ingredients', true, 500),
  ('sa-egg', 'SA Egg', 'pcs', 'Ingredients', true, 20), ('sa-cocoa', 'SA Cocoa', 'g', 'Ingredients', true, 200),
  ('sa-box', 'Box of 6', 'pcs', 'Packaging', true, 10), ('sa-sticker', 'Brand sticker', 'pcs', 'Packaging', true, 20),
  ('sa-card', 'Thank-you card', 'pcs', 'Packaging', true, 10);
insert into public.recipes(product_id, yield_count) values ('sa-oat', 12), ('sa-choc', 6);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('sa-oat', 'SA Flour', 300, 'g', 0), ('sa-oat', 'SA Butter', 100, 'g', 1), ('sa-oat', 'SA Egg', 1, 'pcs', 2),
  ('sa-choc', 'SA Flour', 100, 'g', 0), ('sa-choc', 'SA Cocoa', 50, 'g', 1);
select public.apply_packaging_rule(jsonb_build_object('container', 'box', 'box_size', 6, 'lines', jsonb_build_array(
  jsonb_build_object('name', 'Box of 6', 'qty', 1, 'per', 'container'), jsonb_build_object('name', 'Brand sticker', 'qty', 1, 'per', 'container'))));
select public.apply_packaging_rule(jsonb_build_object('container', 'order', 'box_size', null, 'lines', jsonb_build_array(
  jsonb_build_object('name', 'Thank-you card', 'qty', 1, 'per', 'container'))));
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
-- Ordering open all of today and tomorrow (Asia/Manila), capacity 10 cookies a pickup week.
insert into public.settings(key, int_value) select k, v from (values ('capacity', 10), ('openDow', extract(dow from now() at time zone 'Asia/Manila')::integer),
  ('openH', 0), ('openM', 0), ('closeDow', extract(dow from now() at time zone 'Asia/Manila')::integer), ('closeH', 23), ('closeM', 59), ('extendH', 24)) s(k, v);
select pg_temp.ok('fixture: clean database, no orders yet', pg_temp.q('select count(*) from public.orders') = '0');

-- ---------------------------------------------------------------- shop: the owner's preparation
set local role authenticated;
select pg_temp.claims('a5a00000-0000-4000-8000-000000000002', 'authenticated');
select pg_temp.refused('helper cannot give a choice a photo', $$select pg_temp.save_photos('{"sticker":{"2":"flavours/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp"}}')$$, '42501');
select pg_temp.refused('helper cannot remove a flavour', $$select public.archive_flavour('sa-gone', now())$$, '42501');
select pg_temp.claims('a5a00000-0000-4000-8000-000000000001', 'authenticated');
select pg_temp.save_photos(jsonb_build_object('sticker', jsonb_build_object('2', 'flavours/' || repeat('a', 32) || '.webp')));
select public.archive_flavour('sa-gone', pg_temp.flavour_stamp('sa-gone'));
reset role;
select pg_temp.ok('removed flavour is off the menu', pg_temp.q($$select archived_at is not null and not active and not published from public.products where id = 'sa-gone'$$) = 'true');
set local role anon;
select pg_temp.claims(null, 'anon');
select pg_temp.refused('order for a removed flavour is refused', $$select pg_temp.place('{"items":[{"product_id":"sa-gone","qty":1}],"boxes":[],"add_ons":[]}')$$, '22023');
reset role;
set local role authenticated;
select pg_temp.claims('a5a00000-0000-4000-8000-000000000001', 'authenticated');
select public.restore_flavour('sa-gone', pg_temp.flavour_stamp('sa-gone'));
reset role;
select pg_temp.ok('restored flavour stays unpublished', pg_temp.q($$select archived_at is null and not active and not published from public.products where id = 'sa-gone'$$) = 'true');
set local role anon;
select pg_temp.claims(null, 'anon');
select pg_temp.refused('order for a restored flavour is still refused', $$select pg_temp.place('{"items":[{"product_id":"sa-gone","qty":1}],"boxes":[],"add_ons":[]}')$$, '22023');
select pg_temp.ok('anon sees the sticker choice photo on the shop',
  public.get_shop_extras() -> 'add_ons' @> jsonb_build_array(jsonb_build_object('id', 'sticker',
    'choice_images', jsonb_build_object('2', 'flavours/' || repeat('a', 32) || '.webp'))));
select pg_temp.ok('anon does not see the restored flavour on the shop', not exists (select 1 from public.shop_products where id = 'sa-gone'));
select pg_temp.ok('anon sees no private extras key', not (public.get_shop_extras() -> 'add_ons' @> '[{"active": true}]'::jsonb));

-- ---------------------------------------------------------------- order: anon places it
select pg_temp.place();
select pg_temp.ok('order accepted, exact centavo total (4 x 12000 + 2 x 13000 + 2 x 1500 + 1000 = 78000)',
  pg_temp.get('total') = '78000' and pg_temp.get('replayed') = 'false' and pg_temp.get('order_no') like 'HC-%');
select pg_temp.place();
select pg_temp.ok('replay of the same client id returns the same order, replayed', pg_temp.get('replayed') = 'true' and pg_temp.get('total') = '78000');
select pg_temp.refused('another body under the same client id is refused', $$select pg_temp.place('{"mobile":"09170000556"}')$$, '23505');
select pg_temp.ok('anon sees no order rows', (select count(*) from public.orders) = 0 and (select count(*) from public.order_items) = 0);
select pg_temp.refused('the unpaid order already holds its cookies: 5 more in that pickup week (capacity 10) are refused',
  $$select pg_temp.place('{"client_id":"a5c00000-0000-4000-8000-000000000002","mobile":"09170000556","items":[{"product_id":"sa-oat","qty":5}],"boxes":[],"add_ons":[]}')$$, 'ZC002');
select pg_temp.refused('anon cannot confirm payment', format($$select * from public.staff_confirm_payment(%L, now(), false)$$, pg_temp.get('order_no')), '42501');
select pg_temp.refused('anon cannot read the books', $$select pg_temp.books()$$, '42501');
select pg_temp.ok('customer token shows the pickup place and slot, unpaid, under review',
  (public.order_status(pg_temp.get('token')) ->> 'pickup_label') = 'JSEC Ateneo ' || chr(183) || ' 2:00 PM ' || chr(8211) || ' 3:30 PM'
  and (public.order_status(pg_temp.get('token')) ->> 'state') = 'Payment review'
  and (public.order_status(pg_temp.get('token')) ->> 'pay_state') = 'unpaid'
  and (public.order_status(pg_temp.get('token')) ->> 'total_cents') = '78000'
  and (public.order_status(pg_temp.get('token')) ->> 'paid_cents') is null);
select pg_temp.ok('customer token shows the sticker choice and no card message',
  public.order_status(pg_temp.get('token')) -> 'add_ons' @> '[{"name": "Sticker", "variant": "2", "qty": 2, "unit_price_cents": 1500}]'::jsonb
  and not (public.order_status(pg_temp.get('token')) -> 'add_ons' @> '[{"note": "Happy birthday Mika"}]'::jsonb));
select pg_temp.ok('customer token never carries a private field',
  (select array_agg(k order by k) from jsonb_object_keys(public.order_status(pg_temp.get('token'))) k) =
  array['add_ons', 'boxes', 'hold_expires_at', 'items', 'order_no', 'paid_cents', 'pay_method', 'pay_state', 'pickup_date',
        'pickup_label', 'pickup_window', 'placed_at', 'same_day', 'state', 'surcharge_cents', 'total_cents']);
select pg_temp.ok('an unknown token shows nothing', public.order_status(repeat('b', 64)) is null);
reset role;
select pg_temp.ok('exactly one order and one stock-free payment so far',
  pg_temp.q('select count(*) from public.orders') = '1' and pg_temp.q('select coalesce(paid_cents, 0) from public.orders') = '0');

-- ---------------------------------------------------------------- payment: the owner verifies
set local role authenticated;
select pg_temp.claims('a5a00000-0000-4000-8000-000000000002', 'authenticated');
select pg_temp.refused('helper cannot confirm payment', format($$select * from public.staff_confirm_payment(%L, now(), false)$$, pg_temp.get('order_no')), '42501');
select pg_temp.claims('a5a00000-0000-4000-8000-000000000001', 'authenticated');
select pg_temp.ok('owner sees the order with the private fields',
  (select x ->> 'phone' = '09170000555' and x ->> 'pay_ref' = 'GCASH-REF-1' and x ->> 'notes' = 'private note'
     and x -> 'add_ons' @> '[{"note": "Happy birthday Mika"}]'::jsonb
     from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' = pg_temp.get('order_no')));
select pg_temp.refused('payment on a stale stamp is refused', format($$select * from public.staff_confirm_payment(%L, '2000-01-01'::timestamptz, false)$$, pg_temp.get('order_no')), 'P0002');
select pg_temp.refused('status change before payment is refused', format($$select * from public.staff_set_status(%L, 'Preparing', pg_temp.stamp(%L))$$, pg_temp.get('order_no'), pg_temp.get('order_no')), '55000');
reset role;
select pg_temp.ok('the refusals changed nothing', pg_temp.q('select state::text || pay_state::text || coalesce(paid_cents, 0)::text from public.orders') = 'Payment reviewunpaid0');
set local role authenticated;
select pg_temp.claims('a5a00000-0000-4000-8000-000000000001', 'authenticated');
select pg_temp.ok('owner confirms payment: paid in full, exactly the total',
  (select r.state = 'Confirmed' and r.pay_state = 'confirmed' and r.paid_cents = 78000 and r.total_cents = 78000 and not r.replayed
     from public.staff_confirm_payment(pg_temp.get('order_no'), pg_temp.stamp(pg_temp.get('order_no')), false) r));
select pg_temp.ok('confirming again replays and takes no second payment',
  (select r.replayed and r.paid_cents = 78000 from public.staff_confirm_payment(pg_temp.get('order_no'), '2000-01-01'::timestamptz, false) r));
select pg_temp.ok('books hold the order once, at its paid amount',
  pg_temp.sumk(pg_temp.books(), 'revenue') = 78000
  and (select count(*) from jsonb_array_elements(pg_temp.books() -> 'lines') l where l ->> 'kind' = 'revenue' and l ->> 'cat' = 'Orders') = 1);
select pg_temp.refused('a status change on a stale stamp is refused', format($$select * from public.staff_set_status(%L, 'Preparing', '2000-01-01'::timestamptz)$$, pg_temp.get('order_no')), 'P0002');
select pg_temp.ok('Preparing', (select r.state = 'Preparing' and not r.replayed
  from public.staff_set_status(pg_temp.get('order_no'), 'Preparing', pg_temp.stamp(pg_temp.get('order_no'))) r));
select pg_temp.refused('Preparing cannot jump to Completed', format($$select * from public.staff_set_status(%L, 'Completed', pg_temp.stamp(%L))$$, pg_temp.get('order_no'), pg_temp.get('order_no')), '55000');

-- ---------------------------------------------------------------- kitchen: production, stock, packing (owner only)
select pg_temp.claims('a5a00000-0000-4000-8000-000000000002', 'authenticated');
select pg_temp.refused('helper cannot prepare dough', format($$select * from public.record_dough_preparation(%L::jsonb)$$, pg_temp.prep(1, 'sa-oat', 12)::text), '42501');
select pg_temp.refused('helper cannot bake', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(1, 'sa-oat', 12)::text), '42501');
select pg_temp.refused('helper cannot pack', format($$select * from public.record_pack(%L, 5)$$, pg_temp.get('order_no')), '42501');
select pg_temp.claims('a5a00000-0000-4000-8000-000000000001', 'authenticated');
select pg_temp.refused('baking before any dough is recorded is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(1, 'sa-oat', 12)::text), 'ZD001');
select pg_temp.ok('dough for 12 oat takes its recipe once, nothing short',
  (select not r.duplicate and r.shortfall = '[]'::jsonb from public.record_dough_preparation(pg_temp.prep(5, 'sa-oat', 12)) r)
  and pg_temp.on_hand('sa-flour') = 700 and pg_temp.on_hand('sa-butter') = 400 and pg_temp.on_hand('sa-egg') = 19);
select pg_temp.ok('dough for 6 choc takes its recipe once',
  (select not r.duplicate and r.shortfall = '[]'::jsonb from public.record_dough_preparation(pg_temp.prep(6, 'sa-choc', 6)) r)
  and pg_temp.on_hand('sa-flour') = 600 and pg_temp.on_hand('sa-cocoa') = 150);
select pg_temp.ok('replaying a dough record is a duplicate and takes nothing more',
  (select r.duplicate from public.record_dough_preparation(pg_temp.prep(5, 'sa-oat', 12)) r)
  and pg_temp.on_hand('sa-flour') = 600 and pg_temp.on_hand('sa-egg') = 19);
select pg_temp.ok('baking 12 oat with 1 reject makes 11 and uses 12 dough; baking uses no ingredients',
  (select not r.duplicate and r.used_dough = 12 from public.record_bake(pg_temp.bake(1, 'sa-oat', 12, 1)) r)
  and pg_temp.q($$select qty || '/' || rejects || '/' || dough_used from public.production_records where id = 'a5b00000-0000-4000-8000-000000000001'$$) = '11/1/12'
  and pg_temp.on_hand('sa-flour') = 600);
select pg_temp.ok('baking 6 choc makes 6',
  (select not r.duplicate and r.used_dough = 6 from public.record_bake(pg_temp.bake(2, 'sa-choc', 6)) r)
  and pg_temp.q($$select qty from public.production_records where id = 'a5b00000-0000-4000-8000-000000000002'$$) = '6');
select pg_temp.ok('replaying a bake is a duplicate and uses no more dough',
  (select r.duplicate and r.used_dough = 12 from public.record_bake(pg_temp.bake(1, 'sa-oat', 12, 1)) r)
  and pg_temp.q($$select count(*) from public.production_records where kind = 'batch'$$) = '2');
select pg_temp.refused('another body under a used bake id is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(1, 'sa-oat', 12, 2)::text), '23505');
select pg_temp.refused('baking more than the dough left is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(3, 'sa-oat', 1)::text), 'ZD001');
select pg_temp.ok('buying 1000 g of flour for 8000 centavos adds stock',
  (select not r.duplicate and r.on_hand = 1600 from public.record_stock_movement(jsonb_build_object('id', pg_temp.pid(9), 'item_id', 'sa-flour',
     'kind', 'receipt', 'qty', 1000, 'cost_cents', 8000, 'supplier', 'SA Mill', 'reason', '', 'at', pg_temp.ms())) r));
select pg_temp.ok('replaying the receipt is a duplicate, stock and cost unchanged',
  (select r.duplicate and r.on_hand = 1600 from public.record_stock_movement(jsonb_build_object('id', pg_temp.pid(9), 'item_id', 'sa-flour',
     'kind', 'receipt', 'qty', 1000, 'cost_cents', 8000, 'supplier', 'SA Mill', 'reason', '', 'at', pg_temp.ms())) r)
  and pg_temp.on_hand('sa-flour') = 1600);
select pg_temp.ok('packing takes one box, one sticker and one card, nothing short',
  (select not r.duplicate and r.shortfall = '[]'::jsonb from public.record_pack(pg_temp.get('order_no'), 5) r)
  and pg_temp.on_hand('sa-box') = 9 and pg_temp.on_hand('sa-sticker') = 19 and pg_temp.on_hand('sa-card') = 9);
select pg_temp.ok('packing again is a duplicate and takes nothing more',
  (select r.duplicate from public.record_pack(pg_temp.get('order_no'), 5) r)
  and pg_temp.on_hand('sa-box') = 9 and pg_temp.on_hand('sa-sticker') = 19 and pg_temp.on_hand('sa-card') = 9);

-- ---------------------------------------------------------------- pickup
select pg_temp.ok('Ready', (select r.state = 'Ready' from public.staff_set_status(pg_temp.get('order_no'), 'Ready', pg_temp.stamp(pg_temp.get('order_no'))) r));
select pg_temp.save_location('Other place');
select pg_temp.ok('Completed (collected)', (select r.state = 'Completed' and not r.replayed
  from public.staff_set_status(pg_temp.get('order_no'), 'Completed', pg_temp.stamp(pg_temp.get('order_no'))) r));
select pg_temp.ok('Completed again replays', (select r.replayed from public.staff_set_status(pg_temp.get('order_no'), 'Completed', '2000-01-01'::timestamptz) r));
reset role;
select pg_temp.ok('collected time is set once the order is completed', pg_temp.q('select (collected_at is not null)::text from public.orders') = 'true');
set local role anon;
select pg_temp.claims(null, 'anon');
select pg_temp.ok('customer sees Completed, paid in full, and still the place they ordered for',
  (public.order_status(pg_temp.get('token')) ->> 'state') = 'Completed'
  and (public.order_status(pg_temp.get('token')) ->> 'paid_cents') = '78000'
  and (public.order_status(pg_temp.get('token')) ->> 'pickup_label') = 'JSEC Ateneo ' || chr(183) || ' 2:00 PM ' || chr(8211) || ' 3:30 PM');
select pg_temp.place();
select pg_temp.ok('the customer retrying the order after pickup gets the same order back, not a second one',
  pg_temp.get('replayed') = 'true' and pg_temp.get('total') = '78000'
  and (select count(*) from public.orders) = 0 and public.order_status(pg_temp.get('token')) ->> 'order_no' = pg_temp.get('order_no'));
reset role;

-- ---------------------------------------------------------------- books, and a last round of replays
set local role authenticated;
select pg_temp.claims('a5a00000-0000-4000-8000-000000000002', 'authenticated');
select pg_temp.refused('helper cannot read the books', $$select pg_temp.books()$$, '42501');
select pg_temp.claims('a5a00000-0000-4000-8000-000000000001', 'authenticated');
select pg_temp.ok('books: 78000 revenue, 8000 expense, no refund, nothing uncosted, one receipt to correct',
  pg_temp.sumk(pg_temp.books(), 'revenue') = 78000 and pg_temp.sumk(pg_temp.books(), 'expense') = 8000
  and pg_temp.sumk(pg_temp.books(), 'refund') = 0 and pg_temp.books() -> 'uncosted' = '[]'::jsonb
  and jsonb_array_length(pg_temp.books() -> 'receipts') = 1 and pg_temp.books() ->> 'basis' = 'bought');
select pg_temp.ok('replaying every write again changes no money and no stock',
  (select r.replayed from public.staff_confirm_payment(pg_temp.get('order_no'), '2000-01-01'::timestamptz, false) r)
  and (select r.duplicate from public.record_dough_preparation(pg_temp.prep(5, 'sa-oat', 12)) r)
  and (select r.duplicate from public.record_dough_preparation(pg_temp.prep(6, 'sa-choc', 6)) r)
  and (select r.duplicate from public.record_bake(pg_temp.bake(1, 'sa-oat', 12, 1)) r)
  and (select r.duplicate from public.record_bake(pg_temp.bake(2, 'sa-choc', 6)) r)
  and (select r.duplicate from public.record_pack(pg_temp.get('order_no'), 5) r)
  and (select r.duplicate from public.record_stock_movement(jsonb_build_object('id', pg_temp.pid(9), 'item_id', 'sa-flour',
     'kind', 'receipt', 'qty', 1000, 'cost_cents', 8000, 'supplier', 'SA Mill', 'reason', '', 'at', pg_temp.ms())) r)
  and (select r.replayed from public.staff_set_status(pg_temp.get('order_no'), 'Completed', '2000-01-01'::timestamptz) r)
  and pg_temp.sumk(pg_temp.books(), 'revenue') = 78000 and pg_temp.sumk(pg_temp.books(), 'expense') = 8000
  and pg_temp.on_hand('sa-flour') = 1600 and pg_temp.on_hand('sa-butter') = 400 and pg_temp.on_hand('sa-egg') = 19
  and pg_temp.on_hand('sa-cocoa') = 150 and pg_temp.on_hand('sa-box') = 9 and pg_temp.on_hand('sa-sticker') = 19 and pg_temp.on_hand('sa-card') = 9);
reset role;
select pg_temp.ok('after all of it: one order, one payment of 78000, 2 dough, 2 bakes, 1 pack, 1 receipt',
  pg_temp.q('select count(*) from public.orders') = '1' and pg_temp.q('select paid_cents from public.orders') = '78000'
  and pg_temp.q($$select count(*) from public.production_records where kind = 'dough'$$) = '2'
  and pg_temp.q($$select count(*) from public.production_records where kind = 'batch'$$) = '2'
  and pg_temp.q($$select count(*) from public.production_records where kind = 'pack'$$) = '1'
  and pg_temp.q($$select count(*) from public.stock_movements where kind = 'receipt'$$) = '1');

select 'STEP|' || n || '|' || label from pg_temp.steps order by n;
select 'SCENARIO_A|passed|' || count(*) from pg_temp.steps;
rollback;
