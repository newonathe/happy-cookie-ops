-- C2 production with real SQL roles; all data rolls back.
--
-- record_production / record_pack / get_production: the active owner only (a helper, support, an inactive owner and anon are all
-- refused; anon does not even hold EXECUTE; the records table has no API grant; the internal functions have no EXECUTE for any API
-- role). A batch or a dough mix takes every recipe line of the version it was made on off stock in one transaction, never more than
-- is there; packing an order and a bazaar sale take their packaging once. The harness neutralises each `-- rule:` line of
-- supabase/migrations/20260101004700_production.sql in turn (scripts/test-db-security.py, PRODUCTION_MUTATIONS) and requires the
-- named case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('c2c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('c2c00000-0000-4000-8000-000000000001', 'owner', 'Production owner', true),
  ('c2c00000-0000-4000-8000-000000000002', 'helper', 'Production helper', true),
  ('c2c00000-0000-4000-8000-000000000003', 'support', 'Production support', true),
  ('c2c00000-0000-4000-8000-000000000004', 'owner', 'Production inactive owner', false);
insert into public.products(id, name, short_name, price_cents, kind) values
  ('c2p1', 'C2 cookie one', 'C2-1', 10000, 'cookie'),
  ('c2p2', 'C2 cookie two', 'C2-2', 10000, 'cookie'),
  ('c2p3', 'C2 cookie three', 'C2-3', 10000, 'cookie'),
  ('c2p4', 'C2 cookie four', 'C2-4', 10000, 'cookie');
-- The packaging names the ported packing rule uses: any seeded item of that name is replaced by the fixture's.
delete from public.inventory_items where lower(name) in ('box of 6', 'single cookie pouch', 'brand sticker', 'thank-you card', 'paper bag');
insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('c2i-flour', 'C2 Flour', 'g', 'Ingredients', true, 1000),
  ('c2i-butter', 'C2 Butter', 'g', 'Ingredients', true, 20),
  ('c2i-egg', 'C2 Egg', 'pcs', 'Ingredients', true, 10),
  ('c2i-off', 'C2 Off', 'g', 'Ingredients', false, 500),
  ('c2i-box', 'Box of 6', 'pcs', 'Packaging', true, 10),
  ('c2i-pouch', 'Single cookie pouch', 'pcs', 'Packaging', true, 10),
  ('c2i-sticker', 'Brand sticker', 'pcs', 'Packaging', true, 2),
  ('c2i-card', 'Thank-you card', 'pcs', 'Packaging', true, 10),
  ('c2i-bag', 'Paper bag', 'pcs', 'Packaging', true, 5),
  ('c2i-milk', 'C2 Milk', 'ml', 'Ingredients', true, 1000),
  ('c2i-yolk', 'C2 Yolk', 'pcs', 'Ingredients', true, 20);
insert into public.recipes(product_id, yield_count) values ('c2p1', 12), ('c2p2', 6), ('c2p4', 9);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('c2p1', 'C2 Flour', 300, 'g', 0), ('c2p1', 'C2 Butter', 100, 'g', 1), ('c2p1', 'C2 Egg', 1, 'pcs', 2),
  ('c2p2', 'C2 Flour', 100, 'g', 0), ('c2p2', 'C2 Ghost', 10, 'g', 1), ('c2p2', 'C2 Off', 20, 'g', 2),
  ('c2p4', 'C2 Yolk', 9, 'pcs', 0), ('c2p4', 'C2 Milk', 100, 'ml', 1);
-- The fixture wrote the recipes directly, so it gives them their version rows (and item links) the way the operator does: a batch
-- is refused unless the version it was made on has its row.
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
insert into public.orders(id, customer_name, phone) values
  ('C2-ORD-1', 'Pack Me', '09170000001'), ('C2-ORD-EMPTY', 'Nothing', '09170000002');
insert into public.order_items(order_id, product_id, qty, unit_price_cents) values ('C2-ORD-1', 'c2p1', 13, 10000);
-- B3b: what a pack and a bazaar sale take is the owner's packaging rules (records), no longer code. The fixture enters the ported rule as
-- records, so every assertion below is the one it always was: an order's boxes are its own (13 cookies in two boxes of 6, one loose); a
-- box takes a box, a sticker and a card; a loose cookie takes a pouch and a sticker; a bazaar sale takes a pouch a cookie and a bag.
insert into public.order_boxes(order_id, size, qty, charge_cents) values ('C2-ORD-1', 6, 2, 0);
insert into public.packaging_rules(container, box_size, item_id, qty, per, position) values
  ('box', 6, 'c2i-box', 1, 'container', 0), ('box', 6, 'c2i-sticker', 1, 'container', 1), ('box', 6, 'c2i-card', 1, 'container', 2),
  ('loose', null, 'c2i-pouch', 1, 'container', 0), ('loose', null, 'c2i-sticker', 1, 'container', 1),
  ('bazaar_sale', null, 'c2i-pouch', 1, 'cookie', 0), ('bazaar_sale', null, 'c2i-bag', 1, 'container', 1);
insert into public.events(id, name, starts_at, selling_device, price_snapshot)
values ('c2e0c105-0000-4000-8000-000000000001', 'C2 stall', now() - interval '1 hour', 'devP', '{"c2p1": 10000}');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'c2c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'production outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'production check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

create function pg_temp.on_hand(item text) returns numeric language sql stable security definer as $$
  select on_hand from public.inventory_items where id = item $$;
create function pg_temp.uses(item text) returns bigint language sql stable security definer as $$
  select count(*) from public.stock_movements where item_id = item and kind = 'use' $$;
create function pg_temp.use_reason(item text) returns text language sql stable security definer as $$
  select reason from public.stock_movements where item_id = item and kind = 'use' order by at, id limit 1 $$;
create function pg_temp.records(k text) returns bigint language sql stable security definer as $$
  select count(*) from public.production_records where kind = k $$;

-- Pins for a bazaar sale's packaging (B3a): exactly what record_event_sale does to stock today, so a later migration can prove it
-- changed nothing. The movements of one sale are read by production_id (the sale's id); the row id must be
-- md5(sale_id || ':' || seq || ':' || item_id) with seq 1 for the pouches and 2 for the bag.
create function pg_temp.sale_id(client text) returns uuid language sql stable security definer as $$
  select id from public.event_sales where client_id = client $$;
create function pg_temp.sale_moves(client text) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', m.item_id, 'kind', m.kind, 'delta', m.qty_delta::text, 'reason', m.reason,
           'id_ok', m.id = md5(m.production_id::text || ':' || (case m.item_id when 'c2i-pouch' then 1 else 2 end)::text || ':' || m.item_id)::uuid)
           order by m.item_id), '[]'::jsonb)
    from public.stock_movements m where m.production_id = pg_temp.sale_id(client) $$;
create function pg_temp.sale_short(client text) returns jsonb language sql stable security definer as $$
  select r.short from public.production_records r where r.id = pg_temp.sale_id(client) and r.kind = 'sale' $$;
create function pg_temp.sale_short_text(client text) returns text language sql stable security definer as $$
  select r.short::text from public.production_records r where r.id = pg_temp.sale_id(client) and r.kind = 'sale' $$;
create function pg_temp.sale_qty(client text) returns integer language sql stable security definer as $$
  select r.qty from public.production_records r where r.id = pg_temp.sale_id(client) and r.kind = 'sale' $$;
create function pg_temp.set_active(item text, flag boolean) returns void language sql volatile security definer as $$
  update public.inventory_items set active = flag where id = item $$;

create function pg_temp.pid(n integer) returns text language sql immutable as $$
  select 'c2a00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
-- A valid record: number n gives its id; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.pr(n integer, kind text, product text, qty numeric, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', pg_temp.pid(n), 'kind', kind, 'product_id', product, 'qty', qty,
    'target', case when kind = 'batch' then qty else null end, 'rejects', 0, 'adj', '{}'::jsonb, 'recipe_version', 1,
    'drop_no', 5, 'at', (extract(epoch from now()) * 1000)::bigint) || over) - dropkeys $$;
create function pg_temp.rec(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_production(%L::jsonb)', body::text), wanted);
end $$;

-- A valid discard: number n gives its id; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.dr(n integer, kind text, product text, qty numeric, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', 'c2d00000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'kind', kind, 'product_id', product, 'qty', qty,
    'reason', 'Spoiled', 'drop_no', 5, 'at', (extract(epoch from now()) * 1000)::bigint) || over) - dropkeys $$;
create function pg_temp.dis(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_discard(%L::jsonb)', body::text), wanted);
end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['record_production(jsonb)', 'record_pack(text,integer)', 'get_production(integer)', 'record_discard(jsonb)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden production call succeeded: anon / %', f;
    end if;
  end loop;
  foreach f in array array['use_stock(uuid,integer,text,numeric,text,timestamptz)', 'lock_stock_items(text[])',
                           'record_sale_packaging(uuid,integer,timestamptz)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden production call succeeded: an API role / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'production_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'records_select', 'select * from public.production_records', '42501');
  perform pg_temp.expect(actor, 'records_insert',
    'insert into public.production_records(id, kind, qty, at, payload_hash) values (gen_random_uuid(), ''pack'', 1, now(), repeat(''a'', 64))', '42501');
  perform pg_temp.expect(actor, 'records_update', 'update public.production_records set qty = 1', '42501');
  perform pg_temp.expect(actor, 'records_delete', 'delete from public.production_records', '42501');
  perform pg_temp.expect(actor, 'use_movement_direct',
    'insert into public.stock_movements(id, item_id, kind, qty_delta, at, payload_hash) values (gen_random_uuid(), ''c2i-flour'', ''use'', -1, now(), repeat(''a'', 64))', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'record_production', 'select * from public.record_production(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'record_pack', 'select * from public.record_pack(''C2-ORD-1'', 5)', '42501');
  perform pg_temp.expect(actor, 'get_production', 'select public.get_production(5)', '42501');
  perform pg_temp.expect(actor, 'record_discard', 'select * from public.record_discard(''{}''::jsonb)', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare r record; j jsonb;
begin
  -- shape and bounds (each changes nothing)
  perform pg_temp.rec(a, 'prod_not_object', '[]'::jsonb, '22023');
  perform pg_temp.rec(a, 'prod_keys_missing', pg_temp.pr(1, 'batch', 'c2p1', 12, '{}', array['adj']), '22023');
  perform pg_temp.rec(a, 'prod_keys_extra', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"on_hand": 9}'), '22023');
  perform pg_temp.rec(a, 'prod_type_qty', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"qty": "12"}'), '22023');
  perform pg_temp.rec(a, 'prod_id_bad', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"id": "nope"}'), '22023');
  perform pg_temp.rec(a, 'prod_kind_pack', pg_temp.pr(1, 'pack', 'c2p1', 12), '22023');
  perform pg_temp.rec(a, 'prod_qty_zero', pg_temp.pr(1, 'batch', 'c2p1', 0), '22023');
  perform pg_temp.rec(a, 'prod_qty_fraction', pg_temp.pr(1, 'batch', 'c2p1', 1.5), '22023');
  perform pg_temp.rec(a, 'prod_rejects_over', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"rejects": 13}'), '22023');
  perform pg_temp.rec(a, 'prod_rejects_on_dough', pg_temp.pr(1, 'dough', 'c2p1', 6, '{"rejects": 1}'), '22023');
  perform pg_temp.rec(a, 'prod_target_missing', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"target": null}'), '22023');
  perform pg_temp.rec(a, 'prod_target_on_dough', pg_temp.pr(1, 'dough', 'c2p1', 6, '{"target": 6}'), '22023');
  perform pg_temp.rec(a, 'prod_at_future', pg_temp.pr(1, 'batch', 'c2p1', 12, jsonb_build_object('at', (extract(epoch from now() + interval '3 days') * 1000)::bigint)), '22023');
  perform pg_temp.rec(a, 'prod_adj_on_dough', pg_temp.pr(1, 'dough', 'c2p1', 6, '{"adj": {"C2 Flour": 1}}'), '22023');
  perform pg_temp.rec(a, 'prod_adj_range', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"adj": {"C2 Flour": 51}}'), '22023');
  perform pg_temp.rec(a, 'prod_adj_unknown', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"adj": {"C2 Sugar": 1}}'), '22023');
  perform pg_temp.rec(a, 'prod_no_recipe', pg_temp.pr(1, 'batch', 'c2p3', 12), 'P0002');
  perform pg_temp.rec(a, 'prod_stale_version', pg_temp.pr(1, 'batch', 'c2p1', 12, '{"recipe_version": 2}'), 'P0002');
  perform pg_temp.rec(a, 'prod_dough_too_big', pg_temp.pr(1, 'dough', 'c2p1', 13), '22023');
  perform pg_temp.assert_ok(a, 'prod_refusals_changed_nothing',
    pg_temp.on_hand('c2i-flour') = 1000 and pg_temp.on_hand('c2i-butter') = 20 and pg_temp.records('batch') = 0 and pg_temp.records('dough') = 0);

  -- a batch of 12: every line of the recipe comes off, never more than is there (butter: 20 of the 100 asked for)
  select * into r from public.record_production(pg_temp.pr(1, 'batch', 'c2p1', 12));
  perform pg_temp.assert_ok(a, 'prod_batch_takes_every_line', pg_temp.on_hand('c2i-flour') = 700 and pg_temp.on_hand('c2i-egg') = 9 and not r.duplicate and r.used_dough = 0);
  perform pg_temp.assert_ok(a, 'prod_batch_takes_what_is_there', pg_temp.on_hand('c2i-butter') = 0);
  perform pg_temp.assert_ok(a, 'prod_shortfall_recorded', r.shortfall = '[{"name": "C2 Butter", "by": 80, "unit": "g"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'prod_use_names_the_version', pg_temp.use_reason('c2i-flour') = 'Baked: C2 cookie one, Version 1');
  -- a replay is answered and applies nothing twice; another body under the id is refused
  select * into r from public.record_production(pg_temp.pr(1, 'batch', 'c2p1', 12));
  perform pg_temp.assert_ok(a, 'prod_replay_is_duplicate_no_double',
    r.duplicate and pg_temp.on_hand('c2i-flour') = 700 and pg_temp.uses('c2i-flour') = 1 and pg_temp.records('batch') = 1
    and r.shortfall = '[{"name": "C2 Butter", "by": 80, "unit": "g"}]'::jsonb);
  perform pg_temp.rec(a, 'prod_replay_other_body', pg_temp.pr(1, 'batch', 'c2p1', 11), '23505');

  -- dough: half a recipe (6 of 12): the lines are halved, pieces round up; a batch then draws on it first
  select * into r from public.record_production(pg_temp.pr(2, 'dough', 'c2p1', 6));
  perform pg_temp.assert_ok(a, 'prod_dough_takes_the_scaled_lines', pg_temp.on_hand('c2i-flour') = 550 and pg_temp.on_hand('c2i-egg') = 8);
  perform pg_temp.assert_ok(a, 'prod_dough_short_recorded', r.shortfall = '[{"name": "C2 Butter", "by": 50, "unit": "g"}]'::jsonb);
  select * into r from public.record_production(pg_temp.pr(3, 'batch', 'c2p1', 8, '{"rejects": 1, "target": 6}'));
  perform pg_temp.assert_ok(a, 'prod_batch_uses_dough_first', r.used_dough = 6 and pg_temp.on_hand('c2i-flour') = 500 and pg_temp.on_hand('c2i-egg') = 7);
  perform pg_temp.assert_ok(a, 'prod_batch_of_ingredients_only_for_the_rest', r.shortfall = '[{"name": "C2 Butter", "by": 16.7, "unit": "g"}]'::jsonb);

  -- the plus and minus steps: 10 g each for grams, one piece each for pieces (a line at 0 takes nothing)
  select * into r from public.record_production(pg_temp.pr(4, 'batch', 'c2p1', 12, '{"adj": {"C2 Flour": 2, "C2 Egg": -5}}'));
  perform pg_temp.assert_ok(a, 'prod_adjustment_steps', pg_temp.on_hand('c2i-flour') = 180 and pg_temp.on_hand('c2i-egg') = 7);
  -- flour is never taken below 0 and the missing part is the shortfall
  select * into r from public.record_production(pg_temp.pr(5, 'batch', 'c2p1', 12));
  perform pg_temp.assert_ok(a, 'prod_never_below_zero', pg_temp.on_hand('c2i-flour') = 0 and r.shortfall @> '[{"name": "C2 Flour", "by": 120, "unit": "g"}]'::jsonb);
  -- an ingredient with no stock item, and one that is switched off, are shortfalls; the switched-off stock is not touched
  select * into r from public.record_production(pg_temp.pr(6, 'batch', 'c2p2', 6, '{}', '{}'));
  perform pg_temp.assert_ok(a, 'prod_missing_and_switched_off_are_shortfalls',
    r.shortfall @> '[{"name": "C2 Ghost", "by": 10, "unit": "g"}, {"name": "C2 Off", "by": 20, "unit": "g"}]'::jsonb and pg_temp.on_hand('c2i-off') = 500);
  perform pg_temp.assert_ok(a, 'prod_records_count', pg_temp.records('batch') = 5 and pg_temp.records('dough') = 1);
  perform pg_temp.expect(a, 'stock_movement_kind_use_refused',
    'select * from public.record_stock_movement(''{"id":"c2b00000-0000-4000-8000-000000000001","item_id":"c2i-flour","kind":"use","qty":5,"cost_cents":null,"supplier":"","reason":"","at":' || (extract(epoch from now()) * 1000)::bigint || '}''::jsonb)', '22023');

  -- packing an order: 13 cookies are 2 boxes and 1 pouch, 3 stickers (2 on hand), 2 cards; once per order
  perform pg_temp.expect(a, 'pack_order_missing', 'select * from public.record_pack(''C2-NOPE'', 5)', 'P0002');
  perform pg_temp.expect(a, 'pack_empty', 'select * from public.record_pack(''C2-ORD-EMPTY'', 5)', '22023');
  select * into r from public.record_pack('C2-ORD-1', 5);
  perform pg_temp.assert_ok(a, 'pack_takes_the_packaging',
    not r.duplicate and pg_temp.on_hand('c2i-box') = 8 and pg_temp.on_hand('c2i-pouch') = 9 and pg_temp.on_hand('c2i-card') = 8);
  perform pg_temp.assert_ok(a, 'pack_shortfall_recorded', pg_temp.on_hand('c2i-sticker') = 0 and r.shortfall = '[{"name": "Brand sticker", "by": 1, "unit": "pcs"}]'::jsonb);
  select * into r from public.record_pack('C2-ORD-1', 5);
  perform pg_temp.assert_ok(a, 'pack_twice_takes_nothing_more',
    r.duplicate and pg_temp.on_hand('c2i-box') = 8 and pg_temp.on_hand('c2i-pouch') = 9 and pg_temp.records('pack') = 1);

  -- a bazaar sale uses a pouch per cookie and a bag per customer, on its first insert only
  perform pg_temp.expect(a, 'sale_records', 'select * from public.record_event_sale(pg_temp.sale(''devP:S1:1'', 3))', '00000');
  perform pg_temp.assert_ok(a, 'sale_uses_packaging', pg_temp.on_hand('c2i-pouch') = 6 and pg_temp.on_hand('c2i-bag') = 4);
  -- situation (a), pinned: enough pouches and bags on hand. Two use movements on the sale's own id, nothing short.
  perform pg_temp.assert_ok(a, 'sale_pin_enough_movements',
    pg_temp.sale_moves('devP:S1:1') = jsonb_build_array(
      jsonb_build_object('item', 'c2i-bag', 'kind', 'use', 'delta', '-1.000', 'reason', 'Bazaar sale', 'id_ok', true),
      jsonb_build_object('item', 'c2i-pouch', 'kind', 'use', 'delta', '-3.000', 'reason', 'Bazaar sale', 'id_ok', true)));
  perform pg_temp.assert_ok(a, 'sale_pin_enough_short', pg_temp.sale_short('devP:S1:1') = '[]'::jsonb and pg_temp.sale_short_text('devP:S1:1') = '[]');
  perform pg_temp.assert_ok(a, 'sale_pin_enough_record', pg_temp.sale_qty('devP:S1:1') = 3);
  perform pg_temp.expect(a, 'sale_replayed', 'select * from public.record_event_sale(pg_temp.sale(''devP:S1:1'', 3))', '00000');
  perform pg_temp.assert_ok(a, 'sale_replay_uses_nothing_more', pg_temp.on_hand('c2i-pouch') = 6 and pg_temp.on_hand('c2i-bag') = 4 and pg_temp.records('sale') = 1);
  perform pg_temp.expect(a, 'sale_void_first', 'select * from public.void_event_sale(pg_temp.void(''devP:S2:1''))', '00000');
  perform pg_temp.expect(a, 'sale_arrives_voided', 'select * from public.record_event_sale(pg_temp.sale(''devP:S2:1'', 2))', '00000');
  perform pg_temp.assert_ok(a, 'sale_voided_uses_nothing', pg_temp.on_hand('c2i-pouch') = 6 and pg_temp.on_hand('c2i-bag') = 4 and pg_temp.records('sale') = 1);

  -- what the screens read: the batches (with their version), the chiller, the cookies baked and not packed, the shortfalls
  perform pg_temp.rec(a, 'prod_dough_again_ok', pg_temp.pr(7, 'dough', 'c2p1', 4), '00000');
  j := public.get_production(5);
  perform pg_temp.assert_ok(a, 'get_production_batches',
    jsonb_array_length(j -> 'batches') = 5 and (select count(*) from jsonb_array_elements(j -> 'batches') b where (b ->> 'version')::int = 1 and b ->> 'product_id' = 'c2p1') = 4);
  perform pg_temp.assert_ok(a, 'get_production_dough_balance',
    (select (d ->> 'balls')::int from jsonb_array_elements(j -> 'dough') d where d ->> 'product_id' = 'c2p1') = 4 and jsonb_array_length(j -> 'dough') = 1);
  -- 12 + 7 + 12 + 12 baked and good, 13 packed this drop: 30 left
  perform pg_temp.assert_ok(a, 'get_production_baked_not_packed',
    (select (k ->> 'qty')::int from jsonb_array_elements(j -> 'baked') k where k ->> 'product_id' = 'c2p1') = 30
    and (select count(*) from jsonb_array_elements(public.get_production(6) -> 'baked') k where k ->> 'product_id' = 'c2p1') = 0);
  perform pg_temp.assert_ok(a, 'get_production_shortfalls', jsonb_array_length(j -> 'shortfalls') >= 5);

  -- exact arithmetic: half of a 9-cookie recipe (5 balls) of a 9-piece line is exactly 5 pieces, never 6; 100 ml over 9 is 55.6
  perform pg_temp.rec(a, 'prod_dough_fractions_ok', pg_temp.pr(8, 'dough', 'c2p4', 5), '00000');
  perform pg_temp.assert_ok(a, 'prod_dough_pieces_not_rounded_up', pg_temp.on_hand('c2i-yolk') = 15 and pg_temp.on_hand('c2i-milk') = 944.4);
  -- 4 more are mixed from ingredients (the 5 balls of dough go first): 4/9 of the pieces, 44.4 ml less 3 steps of 5 ml
  select * into r from public.record_production(pg_temp.pr(9, 'batch', 'c2p4', 9, '{"adj": {"C2 Milk": -3}}'));
  perform pg_temp.assert_ok(a, 'prod_ml_step_and_rounding', r.used_dough = 5 and pg_temp.on_hand('c2i-yolk') = 11 and pg_temp.on_hand('c2i-milk') = 915.0);

  -- binned dough and cookies: c2p1 has 4 chilled dough and 30 baked (drop 5) at this point
  perform pg_temp.dis(a, 'disc_keys_missing', pg_temp.dr(10, 'dough', 'c2p1', 2, '{}', array['reason']), '22023');
  perform pg_temp.dis(a, 'disc_keys_extra', pg_temp.dr(10, 'dough', 'c2p1', 2, '{"cost": 1}'), '22023');
  perform pg_temp.dis(a, 'disc_type_qty', pg_temp.dr(10, 'dough', 'c2p1', 2, '{"qty": "2"}'), '22023');
  perform pg_temp.dis(a, 'disc_id_bad', pg_temp.dr(10, 'dough', 'c2p1', 2, '{"id": "nope"}'), '22023');
  perform pg_temp.dis(a, 'disc_kind_bad', pg_temp.dr(10, 'pack', 'c2p1', 2), '22023');
  perform pg_temp.dis(a, 'disc_qty_zero', pg_temp.dr(10, 'dough', 'c2p1', 0), '22023');
  perform pg_temp.dis(a, 'disc_qty_fraction', pg_temp.dr(10, 'dough', 'c2p1', 1.5), '22023');
  perform pg_temp.dis(a, 'disc_reason_blank', pg_temp.dr(10, 'dough', 'c2p1', 2, '{"reason": "  "}'), '22023');
  perform pg_temp.dis(a, 'disc_at_future', pg_temp.dr(10, 'dough', 'c2p1', 2, jsonb_build_object('at', (extract(epoch from now() + interval '3 days') * 1000)::bigint)), '22023');
  perform pg_temp.dis(a, 'disc_product_unknown', pg_temp.dr(10, 'dough', 'nope', 2), '22023');
  perform pg_temp.assert_ok(a, 'disc_refusals_changed_nothing', pg_temp.records('discard_dough') = 0 and pg_temp.records('discard_baked') = 0);
  perform pg_temp.dis(a, 'disc_dough_ok', pg_temp.dr(10, 'dough', 'c2p1', 2), '00000');
  select * into r from public.record_discard(pg_temp.dr(10, 'dough', 'c2p1', 2));
  perform pg_temp.assert_ok(a, 'disc_replay_is_duplicate', r.duplicate and pg_temp.records('discard_dough') = 1);
  perform pg_temp.dis(a, 'disc_replay_other_body', pg_temp.dr(10, 'dough', 'c2p1', 3), '23505');
  perform pg_temp.dis(a, 'disc_dough_more_than_there', pg_temp.dr(11, 'dough', 'c2p1', 3), '22023');
  j := public.get_production(5);
  perform pg_temp.assert_ok(a, 'get_production_dough_after_discard',
    (select (d ->> 'balls')::int from jsonb_array_elements(j -> 'dough') d where d ->> 'product_id' = 'c2p1') = 2);
  perform pg_temp.dis(a, 'disc_baked_ok', pg_temp.dr(12, 'baked', 'c2p1', 5), '00000');
  perform pg_temp.dis(a, 'disc_baked_more_than_there', pg_temp.dr(13, 'baked', 'c2p1', 26), '22023');
  perform pg_temp.assert_ok(a, 'get_production_baked_after_discard',
    (select (k ->> 'qty')::int from jsonb_array_elements(public.get_production(5) -> 'baked') k where k ->> 'product_id' = 'c2p1') = 25);
  -- a batch of 4 draws only on the dough that is left (2 of the 4 mixed), and mixes the other 2
  select * into r from public.record_production(pg_temp.pr(10, 'batch', 'c2p1', 4));
  perform pg_temp.assert_ok(a, 'prod_discard_reduces_dough', r.used_dough = 2);
end $$;

-- A bazaar sale's packaging when stock is short or missing (pinned as it is today). Runs after phase_owner: the pouches are at 6
-- and the bags at 4 here.
create function pg_temp.phase_bazaar_pin(a text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.assert_ok(a, 'sale_pin_start_state', pg_temp.on_hand('c2i-pouch') = 6 and pg_temp.on_hand('c2i-bag') = 4);
  -- (b) fewer pouches than cookies: 8 cookies, 6 pouches. What is there is taken (a movement of -6) and the rest is the shortfall;
  -- the bag is taken as usual.
  perform pg_temp.expect(a, 'sale_pin_short_sale', 'select * from public.record_event_sale(pg_temp.sale(''devP:S3:1'', 8))', '00000');
  perform pg_temp.assert_ok(a, 'sale_pin_short_movements',
    pg_temp.sale_moves('devP:S3:1') = jsonb_build_array(
      jsonb_build_object('item', 'c2i-bag', 'kind', 'use', 'delta', '-1.000', 'reason', 'Bazaar sale', 'id_ok', true),
      jsonb_build_object('item', 'c2i-pouch', 'kind', 'use', 'delta', '-6.000', 'reason', 'Bazaar sale', 'id_ok', true)));
  perform pg_temp.assert_ok(a, 'sale_pin_short_stock', pg_temp.on_hand('c2i-pouch') = 0 and pg_temp.on_hand('c2i-bag') = 3);
  perform pg_temp.assert_ok(a, 'sale_pin_short_short',
    pg_temp.sale_short('devP:S3:1') = '[{"name": "Single cookie pouch", "by": 2, "unit": "pcs"}]'::jsonb
    and pg_temp.sale_short_text('devP:S3:1') = '[{"by": 2.0, "name": "Single cookie pouch", "unit": "pcs"}]');
  -- (b2) no pouches left at all: no pouch movement is written (nothing could be taken), the whole count is the shortfall
  perform pg_temp.expect(a, 'sale_pin_empty_sale', 'select * from public.record_event_sale(pg_temp.sale(''devP:S4:1'', 4))', '00000');
  perform pg_temp.assert_ok(a, 'sale_pin_empty_movements',
    pg_temp.sale_moves('devP:S4:1') = jsonb_build_array(
      jsonb_build_object('item', 'c2i-bag', 'kind', 'use', 'delta', '-1.000', 'reason', 'Bazaar sale', 'id_ok', true)));
  perform pg_temp.assert_ok(a, 'sale_pin_empty_stock', pg_temp.on_hand('c2i-pouch') = 0 and pg_temp.on_hand('c2i-bag') = 2);
  perform pg_temp.assert_ok(a, 'sale_pin_empty_short',
    pg_temp.sale_short('devP:S4:1') = '[{"name": "Single cookie pouch", "by": 4, "unit": "pcs"}]'::jsonb
    and pg_temp.sale_short_text('devP:S4:1') = '[{"by": 4.0, "name": "Single cookie pouch", "unit": "pcs"}]');
  -- (c) no active item with either name: nothing is written to stock and both are shortfalls (the stock is not touched)
  perform pg_temp.set_active('c2i-pouch', false);
  perform pg_temp.set_active('c2i-bag', false);
  perform pg_temp.expect(a, 'sale_pin_absent_sale', 'select * from public.record_event_sale(pg_temp.sale(''devP:S5:1'', 2))', '00000');
  perform pg_temp.assert_ok(a, 'sale_pin_absent_movements', pg_temp.sale_moves('devP:S5:1') = '[]'::jsonb);
  perform pg_temp.assert_ok(a, 'sale_pin_absent_stock', pg_temp.on_hand('c2i-pouch') = 0 and pg_temp.on_hand('c2i-bag') = 2);
  perform pg_temp.assert_ok(a, 'sale_pin_absent_short',
    pg_temp.sale_short('devP:S5:1') = '[{"name": "Single cookie pouch", "by": 2, "unit": "pcs"}, {"name": "Paper bag", "by": 1, "unit": "pcs"}]'::jsonb
    and pg_temp.sale_short_text('devP:S5:1') =
      '[{"by": 2.0, "name": "Single cookie pouch", "unit": "pcs"}, {"by": 1.0, "name": "Paper bag", "unit": "pcs"}]');
  perform pg_temp.assert_ok(a, 'sale_pin_absent_record', pg_temp.sale_qty('devP:S5:1') = 2);
end $$;

create function pg_temp.sale(client text, cookies integer) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'deviceId', 'devP', 'eventId', 'c2e0c105-0000-4000-8000-000000000001',
    'items', jsonb_build_object('c2p1', cookies), 'discountCents', 0, 'totalCents', cookies * 10000, 'pay', 'Cash',
    'ref', '', 'clerk', 'Owner', 'at', (extract(epoch from now()) * 1000)::bigint, 'tenderedCents', cookies * 10000, 'changeCents', 0)
$$;
create function pg_temp.void(client text) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'deviceId', 'devP', 'at', (extract(epoch from now()) * 1000)::bigint)
$$;

grant execute on function
  pg_temp.on_hand(text), pg_temp.uses(text), pg_temp.use_reason(text), pg_temp.records(text), pg_temp.pid(integer),
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.pr(integer, text, text, numeric, jsonb, text[]), pg_temp.rec(text, text, jsonb, text), pg_temp.dr(integer, text, text, numeric, jsonb, text[]), pg_temp.dis(text, text, jsonb, text),
  pg_temp.sale(text, integer), pg_temp.void(text),
  pg_temp.sale_id(text), pg_temp.sale_moves(text), pg_temp.sale_short(text), pg_temp.sale_short_text(text), pg_temp.sale_qty(text), pg_temp.set_active(text, boolean),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text), pg_temp.phase_owner(text), pg_temp.phase_bazaar_pin(text)
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
select pg_temp.phase_bazaar_pin('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
