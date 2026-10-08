-- B3a item costs with real SQL roles; all data rolls back.
--
-- One cost per ingredient, decided by one database function (item_unit_cost: the average of what was paid, else her usual price,
-- else the cheapest supplier quote, else unknown), stamped on every use and waste when it is written, so a later delivery or
-- correction never changes a period already reported. Every case below goes through the real owner RPCs (record_stock_movement,
-- record_production, save_item_price, save_supplier_price, record_cost_correction) with made-up names, and its money is worked
-- by hand in the comment above it. A recipe line takes 10 g per 10 cookies, so a batch of N cookies uses exactly N g.
--
-- save_item_price / get_item_costs / get_recipe_costs: the active owner only (a helper, support, an inactive owner and anon are all
-- refused; anon does not even hold EXECUTE); the internal functions have no EXECUTE for any API role, service_role included; the
-- item_prices table has no API grant. The harness neutralises each `-- rule:` line of save_item_price and the text rules named in
-- scripts/test-db-security.py (COST_MUTATIONS) in turn and requires the named case here to fail. Outcome messages carry no quote
-- character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b3d00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b3d00000-0000-4000-8000-000000000001', 'owner', 'Cost owner', true),
  ('b3d00000-0000-4000-8000-000000000002', 'helper', 'Cost helper', true),
  ('b3d00000-0000-4000-8000-000000000003', 'support', 'Cost support', true),
  ('b3d00000-0000-4000-8000-000000000004', 'owner', 'Cost inactive owner', false);

-- One stock item, one flavour and one recipe (10 g per 10 cookies) for each case.
insert into public.inventory_items(id, name, unit) values
  ('k3i-a', 'K3 Alpha', 'g'), ('k3i-b1', 'K3 Bravo1', 'g'), ('k3i-b2', 'K3 Bravo2', 'g'), ('k3i-b3', 'K3 Bravo3', 'g'),
  ('k3i-b4', 'K3 Bravo4', 'g'), ('k3i-c', 'K3 Charlie', 'g'), ('k3i-d', 'K3 Delta', 'g'), ('k3i-e', 'K3 Echo', 'g'),
  ('k3i-f', 'K3 Foxtrot', 'g'), ('k3i-o1', 'K3 Order1', 'g'), ('k3i-o2', 'K3 Order2', 'g'), ('k3i-p', 'K3 Price', 'g'),
  ('k3i-g1', 'K3 Golf1', 'g'), ('k3i-g2', 'K3 Golf2', 'g'), ('k3i-h1', 'K3 Hotel1', 'g'), ('k3i-h2', 'K3 Hotel2', 'g'),
  ('k3i-h4', 'K3 Hotel4', 'g'), ('k3i-h5', 'K3 Hotel5', 'g'), ('k3i-y', 'K3 Yankee', 'g'), ('k3i-z', 'K3 Zulu', 'g');
insert into public.products(id, name, short_name, price_cents, kind)
select 'k3p-' || s, 'K3 cookie ' || s, 'K3-' || s, 100, 'cookie' from unnest(array['a', 'b1', 'b2', 'b3', 'b4', 'c', 'd', 'e', 'f', 'o1', 'o2']) s;
insert into public.recipes(product_id, yield_count)
select 'k3p-' || s, 10 from unnest(array['a', 'b1', 'b2', 'b3', 'b4', 'c', 'd', 'e', 'f', 'o1', 'o2']) s;
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position)
select 'k3p-' || m.s, m.n, 10, 'g', 0
  from (values ('a', 'K3 Alpha'), ('b1', 'K3 Bravo1'), ('b2', 'K3 Bravo2'), ('b3', 'K3 Bravo3'), ('b4', 'K3 Bravo4'), ('c', 'K3 Charlie'),
               ('d', 'K3 Delta'), ('e', 'K3 Echo'), ('f', 'K3 Foxtrot'), ('o1', 'K3 Order1'), ('o2', 'K3 Order2')) m(s, n);
-- A flavour whose lines are not all takeable from stock: a linked line, a legacy line that names no stock item, a line linked to
-- an item that is switched off (50 g on hand), and a line in ml linked to an item stocked in g.
insert into public.inventory_items(id, name, unit, active, on_hand) values
  ('k3i-uok', 'K3 U ok', 'g', true, 100), ('k3i-uoff', 'K3 U off', 'g', false, 50), ('k3i-uunit', 'K3 U unit', 'g', true, 100);
insert into public.products(id, name, short_name, price_cents, kind) values ('k3p-u', 'K3 cookie u', 'K3-u', 100, 'cookie');
insert into public.recipes(product_id, yield_count) values ('k3p-u', 10);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('k3p-u', 'K3 U ok', 10, 'g', 0), ('k3p-u', 'K3 U ghost', 10, 'g', 1), ('k3p-u', 'K3 U off', 10, 'g', 2), ('k3p-u', 'K3 U unit', 10, 'ml', 3);
-- A flavour for the recipe cost read: a costed line, a line with no cost, a line that names no stock item, a line in another unit.
insert into public.inventory_items(id, name, unit) values ('k3i-rc', 'K3 R costed', 'g'), ('k3i-rn', 'K3 R nocost', 'g'), ('k3i-ru', 'K3 R unit', 'g');
insert into public.products(id, name, short_name, price_cents, kind) values
  ('k3p-r', 'K3 cookie r', 'K3-r', 100, 'cookie'), ('k3p-r2', 'K3 cookie r2', 'K3-r2', 100, 'cookie'), ('k3p-r3', 'K3 cookie r3', 'K3-r3', 100, 'cookie');
insert into public.recipes(product_id, yield_count) values ('k3p-r', 4), ('k3p-r2', 2), ('k3p-r3', 2);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('k3p-r', 'K3 R costed', 8, 'g', 0), ('k3p-r', 'K3 R nocost', 5, 'g', 1), ('k3p-r', 'K3 R ghost', 3, 'g', 2), ('k3p-r', 'K3 R unit', 2, 'ml', 3),
  ('k3p-r2', 'K3 R costed', 4, 'g', 0), ('k3p-r3', 'K3 R nocost', 3, 'g', 0);
-- The recipes were written directly, so they get their item links and version rows the way the operator gives them.
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
insert into public.suppliers(id, name, active) values
  ('k3s1', 'K3 supplier one', true), ('k3s2', 'K3 supplier two', true), ('k3s3', 'K3 supplier off', false),
  ('k3s4', 'K3 supplier four', true), ('k3s5', 'K3 supplier five', true), ('k3s6', 'K3 supplier six', true);
insert into public.supplier_prices(supplier_id, item_name, item_id, pack_label, price_cents, pack_size, active) values
  ('k3s3', 'K3 Bravo2', 'k3i-b2', 'p', 100, 1000, true), ('k3s4', 'K3 Bravo2', 'k3i-b2', 'p', 100, 1000, false),
  ('k3s5', 'K3 Bravo2', 'k3i-b2', 'p', 10, null, true), ('k3s6', 'K3 Bravo2', 'k3i-b2', 'p', 0, 1000, true);

-- B4a: "when used" starts at the cutover, and choosing the used basis is refused until one is set. This fixture's cutover is long before any of
-- its rows (set here as postgres; the cutover itself is cutover.sql's), so once the owner chooses used every row below is on the used rules.
update public.books_settings set used_from = timestamptz '2020-01-01 00:00+00' where id;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b3d00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'item cost outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'item cost check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- ---- readers (as the fixture owner: an API role cannot read these tables)
create function pg_temp.moves(sfx text) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'qty', m.qty_delta, 'cost', m.unit_cost, 'src', m.cost_source, 'short', m.short_qty) order by m.seq), '[]'::jsonb)
    from public.stock_movements m where m.item_id = 'k3i-' || sfx $$;
create function pg_temp.avg(sfx text) returns numeric language sql stable security definer as $$
  select i.avg_cost from public.inventory_items i where i.id = 'k3i-' || sfx $$;
create function pg_temp.onhand(sfx text) returns numeric language sql stable security definer as $$
  select i.on_hand from public.inventory_items i where i.id = 'k3i-' || sfx $$;
create function pg_temp.corr_used(op text) returns bigint language sql stable security definer as $$
  select c.used_cents from public.stock_cost_corrections c where c.id = md5('k3co:' || op)::uuid $$;
create function pg_temp.audit_n(act text) returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log a where a.action = act $$;
create function pg_temp.today_txt(plus integer) returns text language sql stable security definer as $$
  select (c.today + plus)::text from public.business_clock() c $$;
-- What the books say the item cost in the period (a used or waste line, or a correction's share of stock already used).
create function pg_temp.total(nm text) returns bigint language sql stable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint
    from jsonb_array_elements(public.get_books(now() - interval '30 days', now() + interval '1 day') -> 'lines') l
   where l ->> 'kind' = 'expense' and (l ->> 'label') like '%' || nm || '%' and (l ->> 'id') like any (array['m:%', 'c:%']) $$;
create function pg_temp.line_amounts(nm text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg((l ->> 'amount_cents')::bigint order by (l ->> 'amount_cents')::bigint), '[]'::jsonb)
    from jsonb_array_elements(public.get_books(now() - interval '30 days', now() + interval '1 day') -> 'lines') l
   where l ->> 'kind' = 'expense' and (l ->> 'label') like '%' || nm || '%' and (l ->> 'id') like any (array['m:%', 'c:%']) $$;
create function pg_temp.uncosted(nm text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(u), '[]'::jsonb)
    from jsonb_array_elements(public.get_books(now() - interval '30 days', now() + interval '1 day') -> 'uncosted') u where u ->> 'item' = nm $$;
create function pg_temp.ic(sfx text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_item_costs()) x where x ->> 'item_id' = 'k3i-' || sfx $$;
create function pg_temp.rc(pid text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_recipe_costs()) x where x ->> 'product_id' = pid $$;

-- ---- writers
create function pg_temp.mv(actor text, op text, sfx text, kind text, qty numeric, cost numeric, hours numeric, reason text default '') returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_stock_movement(%L::jsonb)', jsonb_build_object(
    'id', md5('k3mv:' || op)::uuid::text, 'item_id', 'k3i-' || sfx, 'kind', kind, 'qty', qty, 'cost_cents', cost, 'supplier', '', 'reason', reason,
    'at', ((extract(epoch from now()) - hours * 3600) * 1000)::bigint)::text), '00000');
end $$;
create function pg_temp.batch_body(op text, pid text, qty numeric, hours numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('id', md5('k3pr:' || op)::uuid::text, 'kind', 'batch', 'product_id', pid, 'qty', qty, 'target', qty, 'rejects', 0,
    'adj', '{}'::jsonb, 'recipe_version', 1, 'drop_no', 1, 'at', ((extract(epoch from now()) - hours * 3600) * 1000)::bigint) $$;
create function pg_temp.batch(actor text, op text, sfx text, qty numeric, hours numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_production(%L::jsonb)', pg_temp.batch_body(op, 'k3p-' || sfx, qty, hours)::text), '00000');
end $$;
create function pg_temp.cor(actor text, op text, mv_op text, cents numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_cost_correction(%L::jsonb)', jsonb_build_object(
    'id', md5('k3co:' || op)::uuid::text, 'movement_id', md5('k3mv:' || mv_op)::uuid::text, 'cost_cents', cents,
    'at', (extract(epoch from now()) * 1000)::bigint)::text), '00000');
end $$;
-- A valid item price: number n gives its id (ids sort by n); `over` replaces keys, `dropkeys` removes them.
create function pg_temp.ip_body(n integer, sfx text, cents numeric, pack numeric, days_ago integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', 'b3e00000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'item_id', 'k3i-' || sfx, 'price_cents', cents,
    'pack_size', pack, 'as_of', pg_temp.today_txt(-days_ago)) || over) - dropkeys $$;
create function pg_temp.ip(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_item_price(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.quote(actor text, op text, n integer, sfx text, supplier text, cents numeric, pack numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_supplier_price(%L::jsonb, null)', jsonb_build_object(
    'id', 'b3f00000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'supplier_id', supplier, 'item_name', (select i.name from public.inventory_items i where i.id = 'k3i-' || sfx),
    'pack_label', 'pack', 'price_cents', cents, 'last_bought', '', 'preferred', false, 'active', true, 'pack_size', pack)::text), '00000');
end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['save_item_price(jsonb)', 'get_item_costs()', 'get_recipe_costs()'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden cost call succeeded: anon / %', f;
    end if;
  end loop;
  foreach f in array array['item_unit_cost(text)', 'use_stock_item(uuid,integer,text,numeric,text,timestamptz,boolean)', 'lock_stock_item_ids(text[])',
                           'use_stock(uuid,integer,text,numeric,text,timestamptz)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
       or has_function_privilege('service_role', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden cost call succeeded: an API role / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('cost_acl', 'anon', 'cost_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'item_prices_select', 'select * from public.item_prices', '42501');
  perform pg_temp.expect(actor, 'item_prices_insert',
    'insert into public.item_prices(id, item_id, price_cents, pack_size, as_of, payload_hash) values (gen_random_uuid(), ''k3i-a'', 1, 1, current_date, repeat(''a'', 64))', '42501');
  perform pg_temp.expect(actor, 'item_prices_update', 'update public.item_prices set price_cents = 1', '42501');
  perform pg_temp.expect(actor, 'item_prices_delete', 'delete from public.item_prices', '42501');
  perform pg_temp.expect(actor, 'movement_stamp_update', 'update public.stock_movements set unit_cost = 1', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'save_item_price', 'select * from public.save_item_price(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'get_item_costs', 'select public.get_item_costs()', '42501');
  perform pg_temp.expect(actor, 'get_recipe_costs', 'select public.get_recipe_costs()', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare r record; j jsonb; n bigint;
begin
  -- the books default to bought until the cost cutover (B4a; the fixture sets used_from long ago, as postgres, below); these cases choose used
  perform pg_temp.assert_ok(a, 'cost_default_basis_is_bought', public.get_books(now() - interval '1 day', now()) ->> 'basis' = 'bought');
  perform pg_temp.expect(a, 'cost_choose_used', 'select public.set_cost_basis(''used'')', '00000');

  -- A, two deliveries: 1000 g for 400 pesos (40 c/g), 400 g used at 40 = 16000; 600 g for 300 pesos with 600 g on hand: the average
  -- is (600 x 40 + 30000) / 1200 = 45; 300 g used at 45 = 13500.
  perform pg_temp.mv(a, 'a_receipt_1', 'a', 'receipt', 1000, 40000, 96);
  perform pg_temp.batch(a, 'a_batch_1', 'a', 400, 72);
  perform pg_temp.mv(a, 'a_receipt_2', 'a', 'receipt', 600, 30000, 48);
  perform pg_temp.batch(a, 'a_batch_2', 'a', 300, 24);
  perform pg_temp.assert_ok(a, 'cost_a_stamps', pg_temp.moves('a') = '[
    {"kind": "receipt", "qty": 1000, "cost": null, "src": null, "short": 0},
    {"kind": "use", "qty": -400, "cost": 40, "src": "average", "short": 0},
    {"kind": "receipt", "qty": 600, "cost": null, "src": null, "short": 0},
    {"kind": "use", "qty": -300, "cost": 45, "src": "average", "short": 0}]'::jsonb);
  perform pg_temp.assert_ok(a, 'cost_a_average', pg_temp.avg('a') = 45 and pg_temp.onhand('a') = 900);
  perform pg_temp.assert_ok(a, 'cost_a_lines', pg_temp.line_amounts('K3 Alpha') = '[13500, 16000]'::jsonb and pg_temp.total('K3 Alpha') = 29500);

  -- B1, her usual price: 500 g on hand (no cost), usual 9000 c per 300 g = 30 c/g; 100 g used at 30 = 3000
  perform pg_temp.mv(a, 'b1_opening', 'b1', 'opening', 500, null, 96);
  perform pg_temp.ip(a, 'b1_usual', pg_temp.ip_body(1, 'b1', 9000, 300, 1), '00000');
  perform pg_temp.batch(a, 'b1_batch', 'b1', 100, 24);
  perform pg_temp.assert_ok(a, 'cost_b1_usual', pg_temp.moves('b1') -> 1 = '{"kind": "use", "qty": -100, "cost": 30, "src": "usual", "short": 0}'::jsonb
    and pg_temp.avg('b1') is null and pg_temp.total('K3 Bravo1') = 3000);

  -- B2, a supplier quote: no usual price; 5000 c per 250 g (20 c/g) and 8400 c per 600 g (14 c/g): the bigger pack wins. Quotes that
  -- cannot count are cheaper and ignored (written in the fixture): a switched-off supplier, a switched-off price, no pack size, a price of 0.
  perform pg_temp.mv(a, 'b2_opening', 'b2', 'opening', 500, null, 96);
  perform pg_temp.quote(a, 'b2_quote_1', 1, 'b2', 'k3s1', 5000, 250);
  perform pg_temp.quote(a, 'b2_quote_2', 2, 'b2', 'k3s2', 8400, 600);
  perform pg_temp.batch(a, 'b2_batch', 'b2', 100, 24);
  perform pg_temp.assert_ok(a, 'cost_b2_supplier', pg_temp.moves('b2') -> 1 = '{"kind": "use", "qty": -100, "cost": 14, "src": "supplier", "short": 0}'::jsonb
    and pg_temp.total('K3 Bravo2') = 1400);

  -- B3, no cost anywhere: the use is written without a stamp, listed as uncosted, never a line, and the total does not move
  perform pg_temp.mv(a, 'b3_opening', 'b3', 'opening', 500, null, 96);
  perform pg_temp.batch(a, 'b3_batch', 'b3', 100, 24);
  perform pg_temp.assert_ok(a, 'cost_b3_unknown_has_no_stamp', pg_temp.moves('b3') -> 1 = '{"kind": "use", "qty": -100, "cost": null, "src": null, "short": 0}'::jsonb);
  j := pg_temp.uncosted('K3 Bravo3');
  perform pg_temp.assert_ok(a, 'cost_b3_is_listed_uncosted',
    jsonb_array_length(j) = 1 and j -> 0 ->> 'kind' = 'use' and (j -> 0 ->> 'qty')::numeric = 100 and j -> 0 ->> 'unit' = 'g'
    and j -> 0 ? 'id' and j -> 0 ? 'at');
  perform pg_temp.assert_ok(a, 'cost_b3_is_never_a_line', pg_temp.line_amounts('K3 Bravo3') = '[]'::jsonb and pg_temp.total('K3 Bravo3') = 0);

  -- B4, the first costed delivery: 400 g on hand with no cost, usual 30 c/g; 600 g for 240 pesos: (400 x 30 + 24000) / 1000 = 36
  perform pg_temp.mv(a, 'b4_opening', 'b4', 'opening', 400, null, 96);
  perform pg_temp.ip(a, 'b4_usual', pg_temp.ip_body(2, 'b4', 9000, 300, 1), '00000');
  perform pg_temp.mv(a, 'b4_receipt', 'b4', 'receipt', 600, 24000, 48);
  perform pg_temp.assert_ok(a, 'cost_b4_first_costed_delivery', pg_temp.avg('b4') = 36);

  -- C, a shortfall: 250 g needed with 100 g on hand at 45 c/g: the row takes 100 and says 150 were short; the line is 250 x 45 = 11250
  perform pg_temp.mv(a, 'c_receipt', 'c', 'receipt', 100, 4500, 72);
  select * into r from public.record_production(pg_temp.batch_body('c_batch', 'k3p-c', 250, 48));
  perform pg_temp.assert_ok(a, 'cost_c_row', pg_temp.moves('c') -> 1 = '{"kind": "use", "qty": -100, "cost": 45, "src": "average", "short": 150}'::jsonb
    and pg_temp.onhand('c') = 0);
  perform pg_temp.assert_ok(a, 'cost_c_line', pg_temp.total('K3 Charlie') = 11250);
  perform pg_temp.assert_ok(a, 'cost_c_record_lists_the_short', r.shortfall = '[{"name": "K3 Charlie", "by": 150, "unit": "g"}]'::jsonb);
  -- the average survives on hand reaching 0, and the next costed delivery replaces it: (0 x 45 + 5000) / 100 = 50
  perform pg_temp.assert_ok(a, 'cost_c_average_survives_zero_on_hand', pg_temp.avg('c') = 45);
  perform pg_temp.mv(a, 'c_receipt_2', 'c', 'receipt', 100, 5000, 24);
  perform pg_temp.assert_ok(a, 'cost_c_next_delivery_replaces_it', pg_temp.avg('c') = 50);

  -- D, a correction: 1000 g for 400 pesos, 400 g used (stamp 40); corrected to 500 pesos. 600 g are still on hand, so 6000 of the
  -- 10000 goes into the average (40 + 6000 / 600 = 50) and 4000 is cost of the 400 g already used.
  perform pg_temp.mv(a, 'd_receipt', 'd', 'receipt', 1000, 40000, 96);
  perform pg_temp.batch(a, 'd_batch_1', 'd', 400, 72);
  perform pg_temp.cor(a, 'd_correct', 'd_receipt', 50000);
  perform pg_temp.assert_ok(a, 'cost_d_average_and_used', pg_temp.avg('d') = 50 and pg_temp.corr_used('d_correct') = 4000);
  perform pg_temp.assert_ok(a, 'cost_d_lines', pg_temp.line_amounts('K3 Delta') = '[4000, 16000]'::jsonb);
  perform pg_temp.batch(a, 'd_batch_2', 'd', 600, 24);
  perform pg_temp.assert_ok(a, 'cost_d_stamps_never_change',
    pg_temp.moves('d') -> 1 = '{"kind": "use", "qty": -400, "cost": 40, "src": "average", "short": 0}'::jsonb
    and pg_temp.moves('d') -> 2 = '{"kind": "use", "qty": -600, "cost": 50, "src": "average", "short": 0}'::jsonb);
  perform pg_temp.assert_ok(a, 'cost_d_everything_expensed_once_used', pg_temp.total('K3 Delta') = 16000 + 4000 + 30000);

  -- E, two corrections: 1000 g for 100 pesos (10 c/g), 200 g used, 50 g wasted, 500 g for 75 pesos (average (750 x 10 + 7500) / 1250
  -- = 12), 100 g used at 12; 1150 g on hand. The first delivery corrected to 90 pesos (-1000): the share still on hand is
  -- 1 x 1150/1250 x 750/800 x 800/1000 = 0.69, so -690 goes into the average (12 - 690 / 1150 = 11.4) and -310 is cost already used.
  -- The second corrected to 60 pesos (-1500): the share is 1150/1250 = 0.92, so -1380 (11.4 - 1380 / 1150 = 10.2) and -120.
  perform pg_temp.mv(a, 'e_receipt_1', 'e', 'receipt', 1000, 10000, 120);
  perform pg_temp.batch(a, 'e_batch_1', 'e', 200, 96);
  perform pg_temp.mv(a, 'e_waste', 'e', 'waste', 50, null, 72, 'Dropped');
  perform pg_temp.mv(a, 'e_receipt_2', 'e', 'receipt', 500, 7500, 48);
  perform pg_temp.batch(a, 'e_batch_2', 'e', 100, 24);
  perform pg_temp.assert_ok(a, 'cost_e_stamps', pg_temp.moves('e') = '[
    {"kind": "receipt", "qty": 1000, "cost": null, "src": null, "short": 0},
    {"kind": "use", "qty": -200, "cost": 10, "src": "average", "short": 0},
    {"kind": "waste", "qty": -50, "cost": 10, "src": "average", "short": 0},
    {"kind": "receipt", "qty": 500, "cost": null, "src": null, "short": 0},
    {"kind": "use", "qty": -100, "cost": 12, "src": "average", "short": 0}]'::jsonb and pg_temp.avg('e') = 12 and pg_temp.onhand('e') = 1150);
  perform pg_temp.cor(a, 'e_correct_1', 'e_receipt_1', 9000);
  perform pg_temp.assert_ok(a, 'cost_e_first_correction', pg_temp.avg('e') = 11.4 and pg_temp.corr_used('e_correct_1') = -310);
  perform pg_temp.cor(a, 'e_correct_2', 'e_receipt_2', 6000);
  perform pg_temp.assert_ok(a, 'cost_e_second_correction', pg_temp.avg('e') = 10.2 and pg_temp.corr_used('e_correct_2') = -120);
  perform pg_temp.assert_ok(a, 'cost_e_books', pg_temp.total('K3 Echo') = 2000 + 500 + 1200 - 310 - 120);

  -- G1, a count: 1000 g for 100 pesos (10 c/g), a count finds 500; the delivery is corrected to 120 pesos (+2000). The count took half of
  -- it out of the building as surely as a use: 0.5 is on hand, so 1000 goes to the average (10 + 1000 / 500 = 12) and 1000 is cost used.
  perform pg_temp.mv(a, 'g1_receipt', 'g1', 'receipt', 1000, 10000, 120);
  perform pg_temp.mv(a, 'g1_count', 'g1', 'count', 500, null, 96);
  perform pg_temp.cor(a, 'g1_correct', 'g1_receipt', 12000);
  perform pg_temp.assert_ok(a, 'cost_g1_count_scales_the_share', pg_temp.avg('g1') = 12 and pg_temp.corr_used('g1_correct') = 1000);
  -- G2: the count finds 1 g; corrected to 200 pesos (+10000): 0.001 is on hand, so 10 goes to the average (10 + 10 / 1 = 20), 9990 is used
  perform pg_temp.mv(a, 'g2_receipt', 'g2', 'receipt', 1000, 10000, 120);
  perform pg_temp.mv(a, 'g2_count', 'g2', 'count', 1, null, 96);
  perform pg_temp.cor(a, 'g2_correct', 'g2_receipt', 20000);
  perform pg_temp.assert_ok(a, 'cost_g2_count_to_one', pg_temp.avg('g2') = 20 and pg_temp.corr_used('g2_correct') = 9990);

  -- H1, corrected to nothing: 1000 g for 400 pesos, 400 g wasted; corrected to 0 (-40000): 0.6 on hand is -24000, the average would be
  -- 40 - 24000 / 600 = 0, so the average is dropped (the cost falls through to the usual price, a quote, unknown) and the used part is
  -- -40000 - (-24000) = -16000: the on-hand share is never booked as used.
  perform pg_temp.mv(a, 'h1_receipt', 'h1', 'receipt', 1000, 40000, 120);
  perform pg_temp.mv(a, 'h1_waste', 'h1', 'waste', 400, null, 96, 'Dropped');
  perform pg_temp.cor(a, 'h1_correct', 'h1_receipt', 0);
  perform pg_temp.assert_ok(a, 'cost_h1_to_zero', pg_temp.avg('h1') is null and pg_temp.corr_used('h1_correct') = -16000 and pg_temp.onhand('h1') = 600
    and pg_temp.ic('h1') -> 'unit_cost' = 'null'::jsonb);
  -- H3: with stock on hand and no average, a later correction of that delivery (0 to 80 pesos, +8000) is all cost used: nothing to move
  perform pg_temp.cor(a, 'h1_correct_again', 'h1_receipt', 8000);
  perform pg_temp.assert_ok(a, 'cost_h3_no_average_all_used', pg_temp.avg('h1') is null and pg_temp.corr_used('h1_correct_again') = 8000);
  -- H2, nothing on hand: 100 g for 50 pesos (50 c/g), all wasted; corrected to 60 pesos (+1000): all cost used, the average unchanged
  perform pg_temp.mv(a, 'h2_receipt', 'h2', 'receipt', 100, 5000, 120);
  perform pg_temp.mv(a, 'h2_waste', 'h2', 'waste', 100, null, 96, 'Dropped');
  perform pg_temp.cor(a, 'h2_correct', 'h2_receipt', 6000);
  perform pg_temp.assert_ok(a, 'cost_h2_nothing_on_hand', pg_temp.onhand('h2') = 0 and pg_temp.avg('h2') = 50 and pg_temp.corr_used('h2_correct') = 1000);
  -- H4, the newest movement: 100 g for 10 pesos (10 c/g), corrected to 20 pesos (+1000): all of it is on hand, 1000 / 100 = 10 more
  perform pg_temp.mv(a, 'h4_receipt', 'h4', 'receipt', 100, 1000, 120);
  perform pg_temp.cor(a, 'h4_correct', 'h4_receipt', 2000);
  perform pg_temp.assert_ok(a, 'cost_h4_newest_movement', pg_temp.avg('h4') = 20 and pg_temp.corr_used('h4_correct') = 0);
  -- H5, applied order is not dated order: 1000 g for 100 pesos dated a day ago, then 400 g wasted dated two days ago but recorded after
  -- it; the correction to 120 pesos (+2000) still sees the waste (0.6 on hand: 1200, 10 + 1200 / 600 = 12; 800 used)
  perform pg_temp.mv(a, 'h5_receipt', 'h5', 'receipt', 1000, 10000, 24);
  perform pg_temp.mv(a, 'h5_waste', 'h5', 'waste', 400, null, 48, 'Dropped');
  perform pg_temp.cor(a, 'h5_correct', 'h5_receipt', 12000);
  perform pg_temp.assert_ok(a, 'cost_h5_applied_order_not_dated_order', pg_temp.avg('h5') = 12 and pg_temp.corr_used('h5_correct') = 800);

  -- a use or waste of nothing (a waste with nothing on hand takes 0) is neither a line nor an uncosted entry
  perform pg_temp.mv(a, 'y_receipt', 'y', 'receipt', 10, 1000, 120);
  perform pg_temp.mv(a, 'y_waste_all', 'y', 'waste', 10, null, 96, 'Dropped');
  perform pg_temp.mv(a, 'y_waste_none', 'y', 'waste', 5, null, 72, 'Dropped');
  perform pg_temp.assert_ok(a, 'cost_y_zero_waste_is_not_a_line', pg_temp.line_amounts('K3 Yankee') = '[1000]'::jsonb and jsonb_array_length(pg_temp.moves('y')) = 3);
  perform pg_temp.mv(a, 'z_opening', 'z', 'opening', 10, null, 120);
  perform pg_temp.mv(a, 'z_waste_all', 'z', 'waste', 10, null, 96, 'Dropped');
  perform pg_temp.mv(a, 'z_waste_none', 'z', 'waste', 5, null, 72, 'Dropped');
  perform pg_temp.assert_ok(a, 'cost_z_zero_waste_is_not_uncosted', jsonb_array_length(pg_temp.uncosted('K3 Zulu')) = 1 and pg_temp.line_amounts('K3 Zulu') = '[]'::jsonb);

  -- an uncosted delivery, a delivery costed 0, a count and an adjustment leave the average alone
  perform pg_temp.mv(a, 'f_receipt', 'f', 'receipt', 100, 2000, 120);
  perform pg_temp.mv(a, 'f_uncosted', 'f', 'receipt', 50, null, 96);
  perform pg_temp.mv(a, 'f_zero', 'f', 'receipt', 10, 0, 72);
  perform pg_temp.mv(a, 'f_count', 'f', 'count', 170, null, 48);
  perform pg_temp.mv(a, 'f_adjust', 'f', 'adjust', 5, null, 24, 'Found');
  perform pg_temp.assert_ok(a, 'cost_f_average_left_alone', pg_temp.avg('f') = 20 and pg_temp.onhand('f') = 175);

  -- the order of the fallbacks: the average beats her usual price and a quote; her usual price beats a quote
  perform pg_temp.ip(a, 'o1_usual', pg_temp.ip_body(3, 'o1', 9000, 300, 1), '00000');
  perform pg_temp.quote(a, 'o1_quote', 3, 'o1', 'k3s2', 8400, 600);
  perform pg_temp.mv(a, 'o1_receipt', 'o1', 'receipt', 100, 2000, 72);
  perform pg_temp.batch(a, 'o1_batch', 'o1', 10, 48);
  perform pg_temp.assert_ok(a, 'cost_order_average_first', pg_temp.moves('o1') -> 1 = '{"kind": "use", "qty": -10, "cost": 20, "src": "average", "short": 0}'::jsonb);
  perform pg_temp.mv(a, 'o2_opening', 'o2', 'opening', 100, null, 72);
  perform pg_temp.ip(a, 'o2_usual', pg_temp.ip_body(4, 'o2', 9000, 300, 1), '00000');
  perform pg_temp.quote(a, 'o2_quote', 4, 'o2', 'k3s2', 8400, 600);
  perform pg_temp.batch(a, 'o2_batch', 'o2', 10, 48);
  perform pg_temp.assert_ok(a, 'cost_order_usual_before_supplier', pg_temp.moves('o2') -> 1 = '{"kind": "use", "qty": -10, "cost": 30, "src": "usual", "short": 0}'::jsonb);

  -- a flavour whose lines are not all takeable: a legacy line that names no stock item, a line linked to an item that is switched
  -- off, and a line in another unit than its item. Only the first takes stock; the others are short, and say whether they are linked.
  select * into r from public.record_production(pg_temp.batch_body('u_batch', 'k3p-u', 10, 24));
  perform pg_temp.assert_ok(a, 'cost_u_short_lists_every_line_not_taken', r.shortfall = '[
    {"name": "K3 U ghost", "by": 10, "unit": "g", "why": "not a stock item"},
    {"name": "K3 U off", "by": 10, "unit": "g"},
    {"name": "K3 U unit", "by": 10, "unit": "ml", "why": "unit differs"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'cost_u_stock_taken_only_for_the_takeable',
    pg_temp.onhand('uok') = 90 and pg_temp.onhand('uoff') = 50 and pg_temp.onhand('uunit') = 100
    and pg_temp.moves('uunit') = '[]'::jsonb and pg_temp.moves('uok') = '[{"kind": "use", "qty": -10, "cost": null, "src": null, "short": 0}]'::jsonb);
  -- the switched-off item has a row of 0 taken and the 10 short (costed when a cost is known), its stock untouched
  -- an unknown cost is never reported as nothing: the two lines that could not be taken at all are listed as uncosted with their why
  -- (the id is the record and the entry's place in its short list); a line that is merely short has no why and is not listed there
  j := public.get_books(now() - interval '30 days', now() + interval '1 day') -> 'uncosted';
  perform pg_temp.assert_ok(a, 'cost_u_uncosted_lists_the_lines_not_taken',
    (select count(*) from jsonb_array_elements(j) e where e ->> 'id' like 'p:%') = 2
    and (select count(*) from jsonb_array_elements(j) e
          where e ->> 'id' = 'p:' || md5('k3pr:u_batch')::uuid::text || ':0' and e ->> 'kind' = 'use' and e ->> 'item' = 'K3 U ghost'
            and (e ->> 'qty')::numeric = 10 and e ->> 'unit' = 'g' and e ->> 'why' = 'not a stock item' and (select count(*) from jsonb_object_keys(e)) = 7) = 1
    and (select count(*) from jsonb_array_elements(j) e
          where e ->> 'id' = 'p:' || md5('k3pr:u_batch')::uuid::text || ':2' and e ->> 'item' = 'K3 U unit' and (e ->> 'qty')::numeric = 10
            and e ->> 'unit' = 'ml' and e ->> 'why' = 'unit differs') = 1
    and not exists (select 1 from jsonb_array_elements(j) e where e ->> 'item' = 'K3 U off' and e ->> 'id' like 'p:%'));
  perform pg_temp.assert_ok(a, 'cost_u_uncosted_movement_entries_keep_their_shape',
    (select count(*) from jsonb_array_elements(j) e where e ->> 'id' like 'm:%' and not (e ? 'why')) >= 2
    and not exists (select 1 from jsonb_array_elements(j) e where e ->> 'id' like 'm:%' and (select count(*) from jsonb_object_keys(e)) <> 6));
  perform pg_temp.assert_ok(a, 'cost_u_switched_off_row', pg_temp.moves('uoff') = '[{"kind": "use", "qty": 0, "cost": null, "src": null, "short": 10}]'::jsonb);

  -- ---- save_item_price: append-only, idempotent on its id
  n := pg_temp.audit_n('items.price');
  perform pg_temp.ip(a, 'ip_keys_missing', pg_temp.ip_body(10, 'p', 9000, 300, 1, '{}', array['pack_size']), '22023');
  perform pg_temp.ip(a, 'ip_keys_extra', pg_temp.ip_body(10, 'p', 9000, 300, 1, '{"note": "x"}'), '22023');
  perform pg_temp.ip(a, 'ip_id_bad', pg_temp.ip_body(10, 'p', 9000, 300, 1, '{"id": "nope"}'), '22023');
  perform pg_temp.ip(a, 'ip_cents_zero', pg_temp.ip_body(10, 'p', 0, 300, 1), '22023');
  perform pg_temp.ip(a, 'ip_cents_fraction', pg_temp.ip_body(10, 'p', 90.5, 300, 1), '22023');
  perform pg_temp.ip(a, 'ip_cents_huge', pg_temp.ip_body(10, 'p', 100000001, 300, 1), '22023');
  perform pg_temp.ip(a, 'ip_pack_zero', pg_temp.ip_body(10, 'p', 9000, 0, 1), '22023');
  perform pg_temp.ip(a, 'ip_pack_decimals', pg_temp.ip_body(10, 'p', 9000, 1.2345, 1), '22023');
  perform pg_temp.ip(a, 'ip_pack_huge', pg_temp.ip_body(10, 'p', 9000, 1000000000, 1), '22023');
  perform pg_temp.ip(a, 'ip_date_format', pg_temp.ip_body(10, 'p', 9000, 300, 1, '{"as_of": "2026/01/01"}'), '22023');
  perform pg_temp.ip(a, 'ip_date_not_real', pg_temp.ip_body(10, 'p', 9000, 300, 1, '{"as_of": "2026-02-30"}'), '22023');
  perform pg_temp.ip(a, 'ip_date_future', pg_temp.ip_body(10, 'p', 9000, 300, -1), '22023');
  perform pg_temp.ip(a, 'ip_item_missing', pg_temp.ip_body(10, 'nope', 9000, 300, 1), 'P0002');
  perform pg_temp.assert_ok(a, 'ip_refusals_wrote_nothing', pg_temp.audit_n('items.price') = n);
  perform pg_temp.ip(a, 'ip_today_ok', pg_temp.ip_body(10, 'p', 9000, 300, 0), '00000');
  perform pg_temp.assert_ok(a, 'ip_one_audit_row', pg_temp.audit_n('items.price') = n + 1);
  select * into r from public.save_item_price(pg_temp.ip_body(10, 'p', 9000, 300, 0));
  perform pg_temp.assert_ok(a, 'ip_replay_is_duplicate_no_double', r.duplicate and pg_temp.audit_n('items.price') = n + 1);
  perform pg_temp.ip(a, 'ip_replay_other_body', pg_temp.ip_body(10, 'p', 9500, 300, 0), '23505');
  -- an edit is a new dated row: the latest as_of is her usual price; the same day again, the later row (by its id here) wins
  perform pg_temp.ip(a, 'ip_newer_date', pg_temp.ip_body(11, 'p', 12000, 300, 0), '00000');
  perform pg_temp.ip(a, 'ip_older_date_later', pg_temp.ip_body(12, 'p', 6000, 300, 5), '00000');
  j := pg_temp.ic('p');
  perform pg_temp.assert_ok(a, 'ip_usual_is_the_latest_date_then_the_latest_row',
    (j -> 'usual' ->> 'price_cents')::bigint = 12000 and j ->> 'source' = 'usual' and (j ->> 'unit_cost')::numeric = 40);

  -- ---- what the screens read
  j := pg_temp.ic('a');
  perform pg_temp.assert_ok(a, 'ic_average_item', (j ->> 'unit_cost')::numeric = 45 and j ->> 'source' = 'average' and (j ->> 'avg_cost')::numeric = 45
    and j -> 'usual' = 'null'::jsonb and j ->> 'name' = 'K3 Alpha' and j ->> 'unit' = 'g' and (j ->> 'on_hand')::numeric = 900 and (j ->> 'active')::boolean);
  j := pg_temp.ic('b1');
  perform pg_temp.assert_ok(a, 'ic_usual_item', (j ->> 'unit_cost')::numeric = 30 and j ->> 'source' = 'usual' and j -> 'avg_cost' = 'null'::jsonb
    and (j -> 'usual' ->> 'price_cents')::bigint = 9000 and (j -> 'usual' ->> 'pack_size')::numeric = 300 and j -> 'usual' ->> 'as_of' = pg_temp.today_txt(-1)
    and j -> 'usual' ? 'id' and j -> 'quote' = 'null'::jsonb);
  j := pg_temp.ic('b2');
  perform pg_temp.assert_ok(a, 'ic_quote_item', (j ->> 'unit_cost')::numeric = 14 and j ->> 'source' = 'supplier' and j -> 'usual' = 'null'::jsonb
    and (j -> 'quote' ->> 'price_cents')::bigint = 8400 and (j -> 'quote' ->> 'pack_size')::numeric = 600 and j -> 'quote' ->> 'supplier_id' = 'k3s2'
    and j -> 'quote' ? 'price_id');
  j := pg_temp.ic('uoff');
  perform pg_temp.assert_ok(a, 'ic_unknown_item', j -> 'unit_cost' = 'null'::jsonb and j -> 'source' = 'null'::jsonb and j -> 'usual' = 'null'::jsonb
    and j -> 'quote' = 'null'::jsonb and not (j ->> 'active')::boolean);

  perform pg_temp.ip(a, 'rc_usual_costed_line', pg_temp.ip_body(20, 'rc', 1000, 80, 1), '00000');
  perform pg_temp.ip(a, 'rc_usual_unit_line', pg_temp.ip_body(21, 'ru', 100, 100, 1), '00000');
  j := pg_temp.rc('k3p-r');
  perform pg_temp.assert_ok(a, 'rc_incomplete_recipe',
    (j ->> 'version')::int = 1 and (j ->> 'yield')::int = 4 and (j ->> 'batch_cents')::numeric = 100 and (j ->> 'per_cookie_cents')::numeric = 25
    and not (j ->> 'complete')::boolean
    and j -> 'missing' = '[{"name": "K3 R nocost", "why": "no cost"}, {"name": "K3 R ghost", "why": "not a stock item"}, {"name": "K3 R unit", "why": "unit differs"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'rc_lines',
    jsonb_array_length(j -> 'lines') = 4 and j -> 'lines' -> 0 ->> 'name' = 'K3 R costed' and j -> 'lines' -> 0 ->> 'item_id' = 'k3i-rc'
    and (j -> 'lines' -> 0 ->> 'qty')::numeric = 8 and j -> 'lines' -> 0 ->> 'unit' = 'g' and (j -> 'lines' -> 0 ->> 'unit_cost')::numeric = 12.5
    and j -> 'lines' -> 0 ->> 'source' = 'usual' and (j -> 'lines' -> 0 ->> 'cents')::numeric = 100
    and j -> 'lines' -> 1 -> 'unit_cost' = 'null'::jsonb and j -> 'lines' -> 1 -> 'cents' = 'null'::jsonb
    and j -> 'lines' -> 2 -> 'item_id' = 'null'::jsonb and j -> 'lines' -> 3 -> 'cents' = 'null'::jsonb);
  j := pg_temp.rc('k3p-r2');
  perform pg_temp.assert_ok(a, 'rc_complete_recipe',
    (j ->> 'batch_cents')::numeric = 50 and (j ->> 'per_cookie_cents')::numeric = 25 and (j ->> 'complete')::boolean and j -> 'missing' = '[]'::jsonb);
  j := pg_temp.rc('k3p-r3');
  perform pg_temp.assert_ok(a, 'rc_no_costed_line_is_null_not_zero',
    j -> 'batch_cents' = 'null'::jsonb and j -> 'per_cookie_cents' = 'null'::jsonb and not (j ->> 'complete')::boolean
    and j -> 'missing' = '[{"name": "K3 R nocost", "why": "no cost"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'rc_one_per_recipe', jsonb_array_length(public.get_recipe_costs()) >= 2
    and (select count(*) from jsonb_array_elements(public.get_recipe_costs()) x where x ->> 'product_id' = 'k3p-r') = 1);
end $$;

grant execute on function
  pg_temp.moves(text), pg_temp.avg(text), pg_temp.onhand(text), pg_temp.corr_used(text), pg_temp.audit_n(text), pg_temp.today_txt(integer),
  pg_temp.total(text), pg_temp.line_amounts(text), pg_temp.uncosted(text), pg_temp.ic(text), pg_temp.rc(text),
  pg_temp.mv(text, text, text, text, numeric, numeric, numeric, text), pg_temp.batch_body(text, text, numeric, numeric),
  pg_temp.batch(text, text, text, numeric, numeric), pg_temp.cor(text, text, text, numeric),
  pg_temp.ip_body(integer, text, numeric, numeric, integer, jsonb, text[]), pg_temp.ip(text, text, jsonb, text),
  pg_temp.quote(text, text, integer, text, text, numeric, numeric),
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text), pg_temp.phase_owner(text)
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
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
