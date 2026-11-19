-- Connected scenario B (docs/state/full-goal.md section 8): planned bake -> supplier shopping -> inventory addition -> dough ->
-- partial baking -> remaining dough -> ingredient and cost reconciliation, driven through the real RPCs with real SQL roles
-- (anon, a helper, the owner). One transaction; it rolls back.
--
-- HOW TO RUN (disposable local database only; never a hosted one): the setup in docs/TESTING.md under "Scenario A" applies unchanged
-- (a Postgres 17 Supabase database with every migration applied, no seed), then
--     node scripts/test-scenario.mjs b [container-name]     (default hc-scenario-b)  prints PASS or FAIL.
--
-- The bake plan itself is a note on the owner's device (src/store/bake-plan.ts): it writes nothing. What it reads is the server's recipes,
-- stock, pack sizes and supplier prices, so this file works out the same plan and shopping list from those reads (pg_temp.shopping) and
-- then proves the dough the owner records takes the recipe amounts the plan is built from. The plan is a note: what is mixed is what is
-- recorded (1 full oat, then half an oat after a recipe edit, then 1 choc: 525 g of flour, not the planned 700 g), and each record stands alone.
--
-- Fixture: SB Flour 400 g, SB Butter 150 g, SB Egg 5 pcs, SB Cocoa 30 g. Oat (12 per batch: 300 g flour, 100 g butter, 1 egg) and choc
-- (6 per batch: 100 g flour, 50 g cocoa). Plan: 24 oat + 6 choc.
-- What it proves, in order:
--   plan      exact needs, shortages and packs to buy; with no supplier price the cost is unknown (null), never 0; an item with nothing to buy
--             costs 0
--   shopping  only the owner saves a supplier and its prices; the plan then prices 1 bag of flour and 1 block of butter; cocoa has no price
--   receive   1000 g flour for 9400 and 250 g butter for 15000 add stock; replays add nothing; another body under a used id is refused;
--             costs follow the average (flour 9: the 400 g already on the shelf at its quote of 8 plus 1000 g for 9400; butter 60), eggs her usual price (800 a piece), cocoa none
--   dough     13 balls from one full oat recipe (variable yield) take the recipe once (9500 centavos); balls never change the deduction
--   bake      8 of 13 balls with 1 reject: 7 good cookies, 5 balls left, no ingredient taken; baking more than is left is refused
--   recipe    editing oat makes version 2 and keeps version 1; the first dough keeps its version 1 snapshot; stale and old-version
--             records are refused; a half recipe of dough (6 balls) takes the version 2 amounts, a piece line rounded up
--   remaining 11 balls in the pool; 9 baked with 1 reject leave 2; totals reconcile (19 made, 17 used, 2 left, 15 good, 2 rejects)
--   shortage  choc dough with 30 g of cocoa for a 50 g line takes 30, flags 20 short, never goes below 0; the cocoa has no price, so
--             the recipe cost is incomplete and the use is uncosted, not 0
--   cost      the Production page lists baked cookies, the dough waiting and the shortage; each bake is costed at the average per ball of
--             the doughs dated at or before it (5846.1538, then 7117.1053), and a later dough never reprices an earlier bake; the choc bake
--             is marked incomplete
--   books     expense is what was bought (33400); a later dearer delivery lifts the average and rewrites no earlier cost; a receipt with no
--             price adds stock and no expense and no invented cost
--   replays   every write again changes no stock, no record, no movement and no money
--   discard   1 of the 2 waiting balls thrown away: the pool shrinks, no ingredient or cost is given back; over-discarding is refused
-- The transaction keeps one clock (now() does not advance), so a "stale stamp" here is an old stamp, not a competing write, and the kitchen's
-- records are dated one second apart on purpose (pg_temp.at_of).
begin;
create temporary table steps (n serial, label text);
grant select, insert on steps to anon, authenticated;
grant usage on sequence steps_n_seq to anon, authenticated;

insert into auth.users(id) values
  ('b6a00000-0000-4000-8000-000000000001'), ('b6a00000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
  ('b6a00000-0000-4000-8000-000000000001', 'owner', 'Scenario owner', true),
  ('b6a00000-0000-4000-8000-000000000002', 'helper', 'Scenario helper', true);

-- ---------------------------------------------------------------- helpers
create function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'scenario B failed: %', label; end if;
  insert into pg_temp.steps(label) values (label);
end $$;
-- Runs one statement; it must fail with exactly `wanted`.
create function pg_temp.refused(label text, stmt text, wanted text) returns void language plpgsql as $$
declare got text := '00000';
begin
  begin execute stmt; exception when others then got := sqlstate; end;
  if got <> wanted then raise exception 'scenario B failed: % (wanted %, got %)', label, wanted, got; end if;
  insert into pg_temp.steps(label) values (label);
end $$;
-- Reads private data as the table owner (the test's eyes, not a caller's).
create function pg_temp.q(stmt text) returns text language plpgsql security definer as $$
declare r text; begin execute stmt into r; return r; end $$;
create function pg_temp.claims(sub text, claim_role text) returns void language plpgsql as $$
begin
  -- An anonymous caller has no sub at all (an empty one is not a uuid, and the hosted auth.uid() casts it).
  perform set_config('request.jwt.claim.sub', coalesce(sub, ''), true);
  perform set_config('request.jwt.claims',
    (case when sub is null then '{}'::jsonb else jsonb_build_object('sub', sub) end || jsonb_build_object('role', claim_role))::text, true);
end $$;
create function pg_temp.ms() returns bigint language sql stable as $$
  select (extract(epoch from now()) * 1000)::bigint $$;
create function pg_temp.pid(n integer) returns text language sql immutable as $$
  select 'b6b00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.xid(n integer) returns text language sql immutable as $$
  select 'b6d00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.on_hand(item text) returns numeric language sql volatile security definer as $$
  select on_hand from public.inventory_items where id = item $$;
-- Dough balls waiting for a flavour: made, less discarded, less used by bakes.
create function pg_temp.dough_left(product text) returns bigint language sql volatile security definer as $$
  select coalesce(sum(case kind when 'dough' then qty when 'discard_dough' then -qty else -dough_used end), 0)::bigint
    from public.production_records where product_id = product and kind in ('dough', 'batch', 'discard_dough') $$;
-- What one production's ingredient uses cost, in centavos (a use with no cost counts for nothing here; see unpriced()).
create function pg_temp.use_cents(n integer) returns numeric language sql volatile security definer as $$
  select coalesce(sum(-qty_delta * unit_cost), 0) from public.stock_movements where production_id = pg_temp.pid(n)::uuid and kind = 'use' $$;
create function pg_temp.unpriced(n integer) returns bigint language sql volatile security definer as $$
  select count(*) from public.stock_movements where production_id = pg_temp.pid(n)::uuid and kind = 'use' and unit_cost is null $$;
create function pg_temp.recipe_stamp(product text) returns timestamptz language sql stable as $$
  select (x ->> 'updated_at')::timestamptz from jsonb_array_elements(public.get_recipes()) x where x ->> 'product_id' = product $$;
create function pg_temp.save_oat(flour numeric, butter numeric) returns integer language plpgsql as $$
begin
  return (select r.version from public.save_recipe(jsonb_build_object('product_id', 'sb-oat', 'yield', 12, 'lines', jsonb_build_array(
    jsonb_build_object('name', 'SB Flour', 'qty', flour, 'unit', 'g'), jsonb_build_object('name', 'SB Butter', 'qty', butter, 'unit', 'g'),
    jsonb_build_object('name', 'SB Egg', 'qty', 1, 'unit', 'pcs'))), pg_temp.recipe_stamp('sb-oat')) r);
end $$;
create function pg_temp.costs(product text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_recipe_costs()) x where x ->> 'product_id' = product $$;
create function pg_temp.item_cost(item text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_item_costs()) x where x ->> 'item_id' = item $$;
create function pg_temp.sumk(j jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'kind' = k $$;
create function pg_temp.books() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '30 days', now() + interval '1 day') $$;
-- The kitchen's real order, one second apart (a dough is dated at or before the bakes that use it): dough 1, bake 11, dough 2, bake 14, dough 3, bake 15.
create function pg_temp.at_of(n integer) returns bigint language sql stable as $$
  select pg_temp.ms() - case n when 1 then 6000 when 11 then 5000 when 2 then 4000 when 14 then 3000 when 3 then 2000 when 15 then 1000 else 0 end $$;
-- What the Production page says about one bake.
create function pg_temp.batch(n integer) returns jsonb language sql volatile as $$
  select b from jsonb_array_elements(public.get_production(7) -> 'batches') b where b ->> 'id' = pg_temp.pid(n) $$;
create function pg_temp.prod() returns jsonb language sql volatile as $$ select public.get_production(7) $$;
create function pg_temp.prep(n integer, product text, amount numeric, balls integer, ver integer) returns jsonb language sql stable as $$
  select jsonb_build_object('id', pg_temp.pid(n), 'product_id', product, 'recipe_version', ver, 'recipe_amount', amount,
    'balls', balls, 'drop_no', 7, 'at', pg_temp.at_of(n)) $$;
create function pg_temp.bake(n integer, product text, qty integer, rejects integer, ver integer) returns jsonb language sql stable as $$
  select jsonb_build_object('id', pg_temp.pid(n), 'product_id', product, 'qty', qty, 'target', qty, 'rejects', rejects,
    'recipe_version', ver, 'drop_no', 7, 'at', pg_temp.at_of(n)) $$;
create function pg_temp.receipt(n integer, item text, qty numeric, cost bigint, supplier text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', pg_temp.pid(n), 'item_id', item, 'kind', 'receipt', 'qty', qty, 'cost_cents', cost,
    'supplier', supplier, 'reason', '', 'at', pg_temp.ms()) $$;
-- The bake plan's arithmetic from the server's own reads: what the plan needs of each item against what is on hand, and the packs and
-- known cost to cover the shortage at the cheapest active supplier price that has a pack size. No pack size or price: packs and cost are
-- null (unknown, never 0). Nothing short: 0 packs, 0 cost.
create function pg_temp.shopping(plan jsonb) returns jsonb language sql volatile security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'need', t.need, 'have', t.have, 'short', t.short, 'packs', t.packs,
    'cost_cents', case when t.packs = 0 then 0 else t.packs * t.price end) order by t.name), '[]'::jsonb)
  from (
    select n.name, n.need, i.on_hand as have, greatest(n.need - i.on_hand, 0) as short, q.price_cents as price,
           case when n.need <= i.on_hand then 0 when q.pack_size is null then null else ceil((n.need - i.on_hand) / q.pack_size) end as packs
      from (select x ->> 'item_id' as item_id, x ->> 'name' as name, sum((x ->> 'amount')::numeric) as need
              from jsonb_array_elements(plan) p
              cross join lateral jsonb_array_elements(public.recipe_stock_plan(p ->> 'product_id', (p ->> 'cookies')::numeric, 'dough', '{}'::jsonb)) x
             group by 1, 2) n
      join public.inventory_items i on i.id = n.item_id
      left join lateral (select s.pack_size, s.price_cents from public.supplier_prices s join public.suppliers u on u.id = s.supplier_id
                          where s.item_id = n.item_id and s.active and u.active and s.pack_size is not null and s.price_cents > 0
                          order by s.price_cents::numeric / s.pack_size limit 1) q on true
  ) t $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------- fixture (rows an operator would have entered)
insert into public.products(id, name, short_name, price_cents, kind, item_type, capacity_weight, published, active, sort_order, type_id) values
  ('sb-oat', 'Scenario oat', 'Oat', 12000, 'Permanent', 'cookie', 1, true, true, 1, 'cookie'),
  ('sb-choc', 'Scenario choc', 'Choc', 13000, 'Permanent', 'cookie', 1, true, true, 2, 'cookie');
insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('sb-flour', 'SB Flour', 'g', 'Ingredients', true, 400), ('sb-butter', 'SB Butter', 'g', 'Ingredients', true, 150),
  ('sb-egg', 'SB Egg', 'pcs', 'Ingredients', true, 5), ('sb-cocoa', 'SB Cocoa', 'g', 'Ingredients', true, 30);
select pg_temp.ok('fixture: no production, no movements, no suppliers yet',
  pg_temp.q('select count(*) from public.production_records') = '0' and pg_temp.q('select count(*) from public.stock_movements') = '0'
  and pg_temp.q('select count(*) from public.suppliers') = '0');

-- ---------------------------------------------------------------- recipes: owner only
set local role authenticated;
select pg_temp.claims('b6a00000-0000-4000-8000-000000000002', 'authenticated');
select pg_temp.refused('helper cannot save a recipe', $$select pg_temp.save_oat(300, 100)$$, '42501');
select pg_temp.refused('helper cannot read recipe costs', $$select public.get_recipe_costs()$$, '42501');
select pg_temp.claims('b6a00000-0000-4000-8000-000000000001', 'authenticated');
select public.save_recipe('{"product_id":"sb-choc","yield":6,"lines":[{"name":"SB Flour","qty":100,"unit":"g"},{"name":"SB Cocoa","qty":50,"unit":"g"}]}', null);
select pg_temp.ok('oat recipe saved as version 1 (stamp null creates)', (select r.version = 1 from public.save_recipe(jsonb_build_object('product_id', 'sb-oat',
  'yield', 12, 'lines', jsonb_build_array(jsonb_build_object('name', 'SB Flour', 'qty', 300, 'unit', 'g'), jsonb_build_object('name', 'SB Butter', 'qty', 100, 'unit', 'g'),
  jsonb_build_object('name', 'SB Egg', 'qty', 1, 'unit', 'pcs'))), null) r));

-- ---------------------------------------------------------------- plan: 24 oat + 6 choc against what is on the shelf
select pg_temp.ok('plan: flour 700 of 400 and butter 200 of 150 and cocoa 50 of 30 are short, eggs are not; with no price the cost is unknown, not 0',
  pg_temp.shopping('[{"product_id":"sb-oat","cookies":24},{"product_id":"sb-choc","cookies":6}]') =
  '[{"name":"SB Butter","need":200,"have":150,"short":50,"packs":null,"cost_cents":null},
    {"name":"SB Cocoa","need":50,"have":30,"short":20,"packs":null,"cost_cents":null},
    {"name":"SB Egg","need":2,"have":5,"short":0,"packs":0,"cost_cents":0},
    {"name":"SB Flour","need":700,"have":400,"short":300,"packs":null,"cost_cents":null}]'::jsonb);

-- ---------------------------------------------------------------- shopping: the owner saves a supplier and its prices
select pg_temp.claims('b6a00000-0000-4000-8000-000000000002', 'authenticated');
select pg_temp.refused('helper cannot save a supplier', $$select public.save_supplier('{"id":"sb-mill","name":"SB Mill","phone":"","notes":"","place":"","active":true}', null)$$, '42501');
select pg_temp.refused('helper cannot record a receipt', format($$select * from public.record_stock_movement(%L::jsonb)$$, pg_temp.receipt(31, 'sb-flour', 1000, 9400, 'SB Mill')::text), '42501');
select pg_temp.claims('b6a00000-0000-4000-8000-000000000001', 'authenticated');
select public.save_supplier('{"id":"sb-mill","name":"SB Mill","phone":"","notes":"","place":"","active":true}', null);
select public.save_supplier_price(jsonb_build_object('id', pg_temp.xid(1), 'supplier_id', 'sb-mill', 'item_name', 'SB Flour', 'pack_label', '1 kg bag',
  'price_cents', 8000, 'last_bought', '2026-11', 'preferred', true, 'active', true, 'pack_size', 1000), null);
select public.save_supplier_price(jsonb_build_object('id', pg_temp.xid(2), 'supplier_id', 'sb-mill', 'item_name', 'SB Butter', 'pack_label', '250 g block',
  'price_cents', 15000, 'last_bought', '2026-11', 'preferred', true, 'active', true, 'pack_size', 250), null);
select pg_temp.ok('shopping list: 1 bag of flour for 8000 and 1 block of butter for 15000; cocoa has no price, so its cost stays unknown',
  pg_temp.shopping('[{"product_id":"sb-oat","cookies":24},{"product_id":"sb-choc","cookies":6}]') =
  '[{"name":"SB Butter","need":200,"have":150,"short":50,"packs":1,"cost_cents":15000},
    {"name":"SB Cocoa","need":50,"have":30,"short":20,"packs":null,"cost_cents":null},
    {"name":"SB Egg","need":2,"have":5,"short":0,"packs":0,"cost_cents":0},
    {"name":"SB Flour","need":700,"have":400,"short":300,"packs":1,"cost_cents":8000}]'::jsonb);
select pg_temp.ok('a supplier quote costs an item before it is bought: flour 8 and butter 60 centavos a gram, cocoa nothing',
  (pg_temp.item_cost('sb-flour') ->> 'unit_cost')::numeric = 8 and pg_temp.item_cost('sb-flour') ->> 'source' = 'supplier'
  and (pg_temp.item_cost('sb-butter') ->> 'unit_cost')::numeric = 60
  and pg_temp.item_cost('sb-cocoa') -> 'unit_cost' = 'null'::jsonb and pg_temp.item_cost('sb-cocoa') -> 'source' = 'null'::jsonb);
select pg_temp.ok('her usual egg price (30 for 24000) is saved',
  (select not r.duplicate from public.save_item_price(jsonb_build_object('id', pg_temp.xid(3), 'item_id', 'sb-egg', 'price_cents', 24000,
     'pack_size', 30, 'as_of', to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD'))) r));
-- Separate statements throughout: a stable read (a cost, the books) sees only what was written before its own statement began.
select pg_temp.ok('and costs an egg 800 centavos', (pg_temp.item_cost('sb-egg') ->> 'unit_cost')::numeric = 800 and pg_temp.item_cost('sb-egg') ->> 'source' = 'usual');

-- ---------------------------------------------------------------- inventory addition: the owner buys
select pg_temp.ok('buying 1000 g of flour for 9400 adds stock',
  (select not r.duplicate and r.on_hand = 1400 from public.record_stock_movement(pg_temp.receipt(31, 'sb-flour', 1000, 9400, 'SB Mill')) r));
select pg_temp.ok('buying 250 g of butter for 15000 adds stock',
  (select not r.duplicate and r.on_hand = 400 from public.record_stock_movement(pg_temp.receipt(32, 'sb-butter', 250, 15000, 'SB Mill')) r));
select pg_temp.ok('replaying a receipt adds nothing',
  (select r.duplicate and r.on_hand = 1400 from public.record_stock_movement(pg_temp.receipt(31, 'sb-flour', 1000, 9400, 'SB Mill')) r));
select pg_temp.refused('another body under a used receipt id is refused', format($$select * from public.record_stock_movement(%L::jsonb)$$,
  pg_temp.receipt(31, 'sb-flour', 1000, 9500, 'SB Mill')::text), '23505');
select pg_temp.ok('costs now follow the average: flour 9 (400 g at the quote of 8 and 1000 g for 9400) and butter 60 centavos a gram, egg still her usual price, cocoa none',
  (pg_temp.item_cost('sb-flour') ->> 'unit_cost')::numeric = 9 and pg_temp.item_cost('sb-flour') ->> 'source' = 'average'
  and (pg_temp.item_cost('sb-butter') ->> 'unit_cost')::numeric = 60 and pg_temp.item_cost('sb-butter') ->> 'source' = 'average'
  and (pg_temp.item_cost('sb-egg') ->> 'unit_cost')::numeric = 800 and pg_temp.item_cost('sb-cocoa') -> 'unit_cost' = 'null'::jsonb);
select pg_temp.ok('the plan after buying: flour and butter are covered (0 to buy, 0 cost), only cocoa is still short and unpriced',
  pg_temp.shopping('[{"product_id":"sb-oat","cookies":24},{"product_id":"sb-choc","cookies":6}]') =
  '[{"name":"SB Butter","need":200,"have":400,"short":0,"packs":0,"cost_cents":0},
    {"name":"SB Cocoa","need":50,"have":30,"short":20,"packs":null,"cost_cents":null},
    {"name":"SB Egg","need":2,"have":5,"short":0,"packs":0,"cost_cents":0},
    {"name":"SB Flour","need":700,"have":1400,"short":0,"packs":0,"cost_cents":0}]'::jsonb);
select pg_temp.ok('recipe costs: oat 9500 a batch and complete; choc is incomplete (cocoa: no cost), never costed as if cocoa were free',
  (pg_temp.costs('sb-oat') ->> 'batch_cents')::numeric = 9500 and (pg_temp.costs('sb-oat') ->> 'complete')::boolean
  and not (pg_temp.costs('sb-choc') ->> 'complete')::boolean
  and pg_temp.costs('sb-choc') -> 'missing' = '[{"name":"SB Cocoa","why":"no cost"}]'::jsonb);

-- ---------------------------------------------------------------- dough: one full oat recipe makes 13 balls
select pg_temp.claims('b6a00000-0000-4000-8000-000000000002', 'authenticated');
select pg_temp.refused('helper cannot prepare dough', format($$select * from public.record_dough_preparation(%L::jsonb)$$, pg_temp.prep(1, 'sb-oat', 1, 13, 1)::text), '42501');
select pg_temp.claims('b6a00000-0000-4000-8000-000000000001', 'authenticated');
select pg_temp.refused('baking before any dough is recorded is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(11, 'sb-oat', 1, 0, 1)::text), 'ZD001');
select pg_temp.ok('one full recipe takes 300 g flour, 100 g butter, 1 egg once, whatever the 13 balls; nothing short',
  (select not r.duplicate and r.shortfall = '[]'::jsonb from public.record_dough_preparation(pg_temp.prep(1, 'sb-oat', 1, 13, 1)) r)
  and pg_temp.on_hand('sb-flour') = 1100 and pg_temp.on_hand('sb-butter') = 300 and pg_temp.on_hand('sb-egg') = 4
  and pg_temp.dough_left('sb-oat') = 13);
select pg_temp.ok('that dough cost 9500 centavos (2700 flour + 6000 butter + 800 egg), every use stamped with its cost',
  pg_temp.use_cents(1) = 9500 and pg_temp.unpriced(1) = 0);
select pg_temp.ok('the dough record keeps its recipe: version 1, amount 1, 13 balls',
  pg_temp.q($$select (qty = 13 and recipe_amount = 1 and recipe_version = 1 and (preparation_recipe ->> 'version')::integer = 1
    and (preparation_recipe -> 'lines' -> 0 ->> 'qty')::numeric = 300)::text from public.production_records where id = pg_temp.pid(1)::uuid$$) = 'true');

-- ---------------------------------------------------------------- partial baking
select pg_temp.ok('baking 8 of the 13 balls with 1 reject makes 7 and uses 8 balls; baking takes no ingredient',
  (select not r.duplicate and r.used_dough = 8 from public.record_bake(pg_temp.bake(11, 'sb-oat', 8, 1, 1)) r)
  and pg_temp.q($$select qty || '/' || rejects || '/' || dough_used from public.production_records where id = pg_temp.pid(11)::uuid and kind = 'batch'$$) = '7/1/8'
  and pg_temp.on_hand('sb-flour') = 1100 and pg_temp.on_hand('sb-butter') = 300 and pg_temp.on_hand('sb-egg') = 4
  and pg_temp.dough_left('sb-oat') = 5);
select pg_temp.ok('the Production page costs that bake at the dough it drew on: 8 balls x 9500 / 13 = 5846.1538, 835.1648 a cookie, complete',
  (pg_temp.batch(11) ->> 'cost_cents')::numeric = 5846.1538 and (pg_temp.batch(11) ->> 'per_cookie_cents')::numeric = 835.1648
  and (pg_temp.batch(11) ->> 'cost_complete')::boolean);
select pg_temp.refused('baking 6 when 5 balls are left is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(12, 'sb-oat', 6, 0, 1)::text), 'ZD001');
select pg_temp.ok('the refused bake left no record and the 5 balls waiting', pg_temp.dough_left('sb-oat') = 5
  and pg_temp.q($$select count(*) from public.production_records where kind = 'batch'$$) = '1');

-- ---------------------------------------------------------------- recipe change between doughs
select pg_temp.ok('editing oat (250 g flour, 120 g butter) makes version 2', pg_temp.save_oat(250, 120) = 2);
select pg_temp.refused('a recipe save on a stale stamp is refused', $$select * from public.save_recipe('{"product_id":"sb-oat","yield":12,"lines":[{"name":"SB Flour","qty":1,"unit":"g"}]}', '2000-01-01'::timestamptz)$$, 'P0002');
select pg_temp.ok('saving the same recipe again makes no third version', pg_temp.save_oat(250, 120) = 2);
select pg_temp.ok('version 1 stays in the history, choc is untouched at version 1',
  (select x ->> 'version' = '2' and (x -> 'history' -> 0 ->> 'version') = '1' and (x -> 'history' -> 0 -> 'lines' -> 0 ->> 'qty')::numeric = 300
     from jsonb_array_elements(public.get_recipes()) x where x ->> 'product_id' = 'sb-oat')
  and (select x ->> 'version' = '1' and x -> 'history' = '[]'::jsonb from jsonb_array_elements(public.get_recipes()) x where x ->> 'product_id' = 'sb-choc'));
select pg_temp.ok('the edit moved no stock and left the first dough on its version 1 snapshot (300 g flour, 9500 centavos)',
  pg_temp.on_hand('sb-flour') = 1100 and pg_temp.on_hand('sb-butter') = 300 and pg_temp.use_cents(1) = 9500
  and pg_temp.q($$select ((preparation_recipe ->> 'version')::integer = 1 and (preparation_recipe -> 'lines' -> 0 ->> 'qty')::numeric = 300)::text from public.production_records where id = pg_temp.pid(1)::uuid$$) = 'true');
select pg_temp.ok('oat now costs 10250 a batch (2250 flour + 7200 butter + 800 egg)', (pg_temp.costs('sb-oat') ->> 'batch_cents')::numeric = 10250);
select pg_temp.refused('dough on the old recipe version is refused', format($$select * from public.record_dough_preparation(%L::jsonb)$$, pg_temp.prep(2, 'sb-oat', 0.5, 6, 1)::text), 'P0002');
select pg_temp.refused('a bake on the old recipe version is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(13, 'sb-oat', 1, 0, 1)::text), 'P0002');
select pg_temp.ok('half a recipe of dough, 6 balls, takes the version 2 amounts: 125 g flour, 60 g butter, and 1 egg (a piece line is rounded up)',
  (select not r.duplicate and r.shortfall = '[]'::jsonb from public.record_dough_preparation(pg_temp.prep(2, 'sb-oat', 0.5, 6, 2)) r)
  and pg_temp.on_hand('sb-flour') = 975 and pg_temp.on_hand('sb-butter') = 240 and pg_temp.on_hand('sb-egg') = 3);
select pg_temp.ok('that dough cost 5525 (1125 + 3600 + 800) and carries version 2; 11 balls now wait',
  pg_temp.use_cents(2) = 5525 and pg_temp.unpriced(2) = 0 and pg_temp.dough_left('sb-oat') = 11
  and pg_temp.q($$select ((preparation_recipe ->> 'version')::integer = 2 and recipe_amount = 0.5 and qty = 6 and (preparation_recipe -> 'lines' -> 0 ->> 'qty')::numeric = 250)::text from public.production_records where id = pg_temp.pid(2)::uuid$$) = 'true');

select pg_temp.ok('recording dough 2 and its cost left the earlier bake exactly as it was (5846.1538), not repriced to the new recipe',
  (pg_temp.batch(11) ->> 'cost_cents')::numeric = 5846.1538 and (pg_temp.batch(11) ->> 'per_cookie_cents')::numeric = 835.1648);

-- ---------------------------------------------------------------- remaining dough
select pg_temp.refused('baking 12 when 11 balls wait is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(13, 'sb-oat', 12, 0, 2)::text), 'ZD001');
select pg_temp.ok('baking 9 of the 11 (old and new dough share the pool) with 1 reject makes 8; ingredients untouched; 2 balls remain',
  (select not r.duplicate and r.used_dough = 9 from public.record_bake(pg_temp.bake(14, 'sb-oat', 9, 1, 2)) r)
  and pg_temp.dough_left('sb-oat') = 2 and pg_temp.on_hand('sb-flour') = 975 and pg_temp.on_hand('sb-butter') = 240 and pg_temp.on_hand('sb-egg') = 3);
select pg_temp.ok('oat reconciles: 19 balls made, 17 used, 2 left; 15 good cookies and 2 rejects; ingredients cost 15025 over 6 uses; baking took none',
  pg_temp.q($$select sum(qty) from public.production_records where kind = 'dough' and product_id = 'sb-oat'$$) = '19'
  and pg_temp.q($$select sum(dough_used) from public.production_records where kind = 'batch' and product_id = 'sb-oat'$$) = '17'
  and pg_temp.q($$select sum(qty) from public.production_records where kind = 'batch' and product_id = 'sb-oat'$$) = '15'
  and pg_temp.q($$select sum(rejects) from public.production_records where kind = 'batch' and product_id = 'sb-oat'$$) = '2'
  and pg_temp.use_cents(1) + pg_temp.use_cents(2) = 15025
  and pg_temp.q($$select count(*) from public.stock_movements where kind = 'use' and production_id in (select id from public.production_records where product_id = 'sb-oat')$$) = '6'
  and pg_temp.use_cents(11) = 0 and pg_temp.use_cents(14) = 0);

select pg_temp.refused('a bake dated a day before any dough was recorded is refused',
  format($$select * from public.record_bake(%L::jsonb)$$, (pg_temp.bake(16, 'sb-oat', 1, 0, 2) || jsonb_build_object('at', pg_temp.ms() - 86400000))::text), 'ZD002');
select pg_temp.refused('more rejects than the oven count is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(16, 'sb-oat', 1, 2, 2)::text), '22023');
select pg_temp.ok('the refused bakes left the 2 balls and no record', pg_temp.dough_left('sb-oat') = 2 and pg_temp.q($$select count(*) from public.production_records where kind = 'batch'$$) = '2');

-- ---------------------------------------------------------------- an independent product, a shortage and a missing price
select pg_temp.ok('choc dough needs 50 g of cocoa and 30 g is there: it takes 30, flags 20 short, never goes below 0',
  (select not r.duplicate and r.shortfall = '[{"name":"SB Cocoa","by":20,"unit":"g"}]'::jsonb from public.record_dough_preparation(pg_temp.prep(3, 'sb-choc', 1, 6, 1)) r)
  and pg_temp.on_hand('sb-cocoa') = 0 and pg_temp.on_hand('sb-flour') = 875);
select pg_temp.ok('the short is kept on the record and on the cocoa use (30 taken, 20 short); flour was costed at 900 and the cocoa use has no cost, not 0',
  pg_temp.q($$select (short = '[{"name":"SB Cocoa","by":20,"unit":"g"}]'::jsonb)::text from public.production_records where id = pg_temp.pid(3)::uuid$$) = 'true'
  and pg_temp.q($$select (qty_delta = -30 and short_qty = 20 and unit_cost is null)::text from public.stock_movements where production_id = pg_temp.pid(3)::uuid and item_id = 'sb-cocoa'$$) = 'true'
  and pg_temp.use_cents(3) = 900 and pg_temp.unpriced(3) = 1);
select pg_temp.ok('baking the 6 choc balls leaves the oat pool alone',
  (select not r.duplicate and r.used_dough = 6 from public.record_bake(pg_temp.bake(15, 'sb-choc', 6, 0, 1)) r)
  and pg_temp.dough_left('sb-choc') = 0 and pg_temp.dough_left('sb-oat') = 2);
select pg_temp.ok('a delivery of 100 g of cocoa with no price adds stock and sets no cost',
  (select not r.duplicate and r.on_hand = 100 from public.record_stock_movement(pg_temp.receipt(33, 'sb-cocoa', 100, null, 'SB Mill')) r));
select pg_temp.ok('a later delivery of 100 g of butter at 90 a gram lifts the average, and rewrites no earlier cost',
  (select not r.duplicate and r.on_hand = 340 from public.record_stock_movement(pg_temp.receipt(34, 'sb-butter', 100, 9000, 'SB Mill')) r)
  and pg_temp.use_cents(1) = 9500 and pg_temp.use_cents(2) = 5525);
select pg_temp.ok('butter now costs the new average (23400 for 340 g, about 68.8 a gram), not the old 60', (pg_temp.item_cost('sb-butter') ->> 'unit_cost')::numeric > 68.8
  and (pg_temp.item_cost('sb-butter') ->> 'unit_cost')::numeric < 68.9 and pg_temp.use_cents(1) = 9500 and pg_temp.use_cents(2) = 5525);
select pg_temp.ok('cocoa still has no cost (unknown, not 0), and choc is still an incomplete recipe',
  pg_temp.item_cost('sb-cocoa') -> 'unit_cost' = 'null'::jsonb and not (pg_temp.costs('sb-choc') ->> 'complete')::boolean
  and pg_temp.costs('sb-choc') -> 'missing' = '[{"name":"SB Cocoa","why":"no cost"}]'::jsonb);

-- ---------------------------------------------------------------- books
select pg_temp.ok('books: the expense is what was bought (9400 + 15000 + 9000), no revenue, no zero line, nothing invented for the unpriced delivery',
  pg_temp.sumk(pg_temp.books(), 'expense') = 33400 and pg_temp.sumk(pg_temp.books(), 'revenue') = 0
  and (select count(*) from jsonb_array_elements(pg_temp.books() -> 'lines') l where l ->> 'kind' = 'expense') = 3
  and not exists (select 1 from jsonb_array_elements(pg_temp.books() -> 'lines') l where (l ->> 'amount_cents')::bigint = 0)
  and pg_temp.books() ->> 'basis' = 'bought');

-- ---------------------------------------------------------------- what the Production page reads, and the cost reconciliation
select pg_temp.ok('production page: 15 oat and 6 choc cookies baked, 2 oat balls of dough waiting, choc dough all used',
  pg_temp.prod() -> 'baked' = '[{"qty":6,"product_id":"sb-choc"},{"qty":15,"product_id":"sb-oat"}]'::jsonb
  and (select jsonb_agg(jsonb_build_object('balls', d ->> 'balls', 'product_id', d ->> 'product_id')) from jsonb_array_elements(pg_temp.prod() -> 'dough') d)
      = '[{"balls":"2","product_id":"sb-oat"}]'::jsonb);
select pg_temp.ok('production page: the cocoa shortage is listed, 20 g short on the choc dough',
  pg_temp.prod() -> 'shortfalls' -> 0 -> 'short' = '[{"name":"SB Cocoa","by":20,"unit":"g"}]'::jsonb and pg_temp.prod() -> 'shortfalls' -> 0 ->> 'product_id' = 'sb-choc');
select pg_temp.ok('bake costs: bake 14 drew on both doughs, 9 balls x 15025 / 19 = 7117.1053 (8 cookies); bake 11 is still 5846.1538; all complete',
  (pg_temp.batch(14) ->> 'cost_cents')::numeric = 7117.1053 and (pg_temp.batch(14) ->> 'per_cookie_cents')::numeric = 889.6382
  and (pg_temp.batch(11) ->> 'cost_cents')::numeric = 5846.1538 and (pg_temp.batch(14) ->> 'cost_complete')::boolean);
select pg_temp.ok('the ingredients themselves reconcile to the centavo: oat doughs took 15025 of stock, baking took none',
  pg_temp.use_cents(1) + pg_temp.use_cents(2) = 15025 and pg_temp.use_cents(11) + pg_temp.use_cents(14) = 0);
select pg_temp.ok('choc bake is costed at 900 (flour only) and marked incomplete, not presented as a full cost',
  (select (b ->> 'cost_cents')::numeric = 900 and not (b ->> 'cost_complete')::boolean from jsonb_array_elements(pg_temp.prod() -> 'batches') b where b ->> 'product_id' = 'sb-choc'));

-- ---------------------------------------------------------------- replays and a last look at everything
select pg_temp.ok('replaying every write again is a duplicate everywhere',
  (select r.duplicate from public.record_dough_preparation(pg_temp.prep(1, 'sb-oat', 1, 13, 1)) r)
  and (select r.duplicate from public.record_dough_preparation(pg_temp.prep(2, 'sb-oat', 0.5, 6, 2)) r)
  and (select r.duplicate from public.record_dough_preparation(pg_temp.prep(3, 'sb-choc', 1, 6, 1)) r)
  and (select r.duplicate from public.record_bake(pg_temp.bake(11, 'sb-oat', 8, 1, 1)) r)
  and (select r.duplicate from public.record_bake(pg_temp.bake(14, 'sb-oat', 9, 1, 2)) r)
  and (select r.duplicate from public.record_bake(pg_temp.bake(15, 'sb-choc', 6, 0, 1)) r)
  and (select r.duplicate from public.record_stock_movement(pg_temp.receipt(31, 'sb-flour', 1000, 9400, 'SB Mill')) r)
  and (select r.duplicate from public.record_stock_movement(pg_temp.receipt(32, 'sb-butter', 250, 15000, 'SB Mill')) r)
  and (select r.duplicate from public.record_stock_movement(pg_temp.receipt(33, 'sb-cocoa', 100, null, 'SB Mill')) r)
  and (select r.duplicate from public.record_stock_movement(pg_temp.receipt(34, 'sb-butter', 100, 9000, 'SB Mill')) r)
  and (select r.duplicate from public.save_item_price(jsonb_build_object('id', pg_temp.xid(3), 'item_id', 'sb-egg', 'price_cents', 24000,
     'pack_size', 30, 'as_of', to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD'))) r));
select pg_temp.ok('after those replays the shelves, the pools, the records and the books are exactly as before',
  pg_temp.on_hand('sb-flour') = 875 and pg_temp.on_hand('sb-butter') = 340 and pg_temp.on_hand('sb-egg') = 3 and pg_temp.on_hand('sb-cocoa') = 100
  and pg_temp.dough_left('sb-oat') = 2 and pg_temp.dough_left('sb-choc') = 0
  and pg_temp.q($$select count(*) from public.production_records where kind = 'dough'$$) = '3'
  and pg_temp.q($$select count(*) from public.production_records where kind = 'batch'$$) = '3'
  and pg_temp.q($$select count(*) from public.stock_movements where kind = 'use'$$) = '8'
  and pg_temp.q($$select count(*) from public.stock_movements where kind = 'receipt'$$) = '4'
  and pg_temp.sumk(pg_temp.books(), 'expense') = 33400);
select pg_temp.refused('another body under a used dough id is refused', format($$select * from public.record_dough_preparation(%L::jsonb)$$, pg_temp.prep(1, 'sb-oat', 1, 12, 1)::text), '23505');
select pg_temp.refused('another body under a used bake id is refused', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(11, 'sb-oat', 8, 2, 1)::text), '23505');

-- ---------------------------------------------------------------- dough lost on the floor: the pool shrinks, nothing else moves
create function pg_temp.discard(n integer, qty integer) returns jsonb language sql stable as $$
  select jsonb_build_object('id', pg_temp.pid(n), 'kind', 'dough', 'product_id', 'sb-oat', 'qty', qty, 'reason', 'Dropped',
    'drop_no', 7, 'at', pg_temp.ms()) $$;
grant execute on function pg_temp.discard(integer, integer) to authenticated;
select pg_temp.refused('throwing away 5 balls when 2 wait is refused', format($$select * from public.record_discard(%L::jsonb)$$, pg_temp.discard(17, 5)::text), '22023');
select pg_temp.ok('throwing away 1 of the 2 balls leaves 1; the ingredients and their cost are not given back',
  (select not r.duplicate from public.record_discard(pg_temp.discard(17, 1)) r)
  and pg_temp.dough_left('sb-oat') = 1 and pg_temp.on_hand('sb-flour') = 875 and pg_temp.on_hand('sb-butter') = 340
  and pg_temp.use_cents(1) + pg_temp.use_cents(2) = 15025);
select pg_temp.ok('throwing it away again is a duplicate and the pool stays at 1',
  (select r.duplicate from public.record_discard(pg_temp.discard(17, 1)) r) and pg_temp.dough_left('sb-oat') = 1);
reset role;

-- ---------------------------------------------------------------- the public sees none of it
set local role anon;
select pg_temp.claims(null, 'anon');
select pg_temp.refused('anon cannot read recipes', $$select public.get_recipes()$$, '42501');
select pg_temp.refused('anon cannot read item costs', $$select public.get_item_costs()$$, '42501');
select pg_temp.refused('anon cannot bake', format($$select * from public.record_bake(%L::jsonb)$$, pg_temp.bake(16, 'sb-oat', 1, 0, 2)::text), '42501');
select pg_temp.refused('anon cannot read the books', $$select pg_temp.books()$$, '42501');
reset role;

select 'STEP|' || n || '|' || label from pg_temp.steps order by n;
select 'SCENARIO_B|passed|' || count(*) from pg_temp.steps;
rollback;
