-- B4a-1 the cost cutover, with real SQL roles; all data rolls back.
--
-- preview_cost_cutover / apply_cost_cutover have no API grant at all: the operator runs them as postgres (like preview_identity_links), so
-- anon, a helper, support, an inactive owner and the active owner are all refused (42501). The preview values every item with stock from the
-- one cost function (the average, else her usual price, else the cheapest supplier quote), lists what has no cost, writes nothing, and
-- carries a hash that moves with the stock, a cost or the ledger. The apply is exact (a 64-hex hash and a whole total_cents), refused when
-- the preview moved, applied once, writes no average cost. From the cutover "when used" starts: get_books follows the bought rules for every
-- line before used_from and the used rules from it, and credits the opening stock once. set_cost_basis refuses 'used' before a cutover.
-- save_recipe refuses an INGREDIENT that a packaging rule takes. B4a-4 (migration 64, the review of 62): the preview also lists the active items
-- that have never had a stock movement (`not_counted`: what the credit cannot include), counts them and hashes them; an `opening` stock movement
-- is refused once the cutover has been applied (the item's purchase is already in the historical lines, and it was not in the credit, so its
-- uses would be expensed twice); and a cutover cleared by hand while the basis is still `used` is read as the bought basis, so every purchase and
-- every use is not counted at once. The harness neutralises each `-- rule:` line of
-- supabase/migrations/20260101006100_cost_cutover.sql (and 20260101006400_cutover_guard.sql) in turn (scripts/test-db-security.py, COST_CUTOVER_MUTATIONS) and requires the named
-- case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
--
-- The money, worked by hand. T is the cutover instant: the apply takes it with clock_timestamp() once the stock locks are held, so it is
-- NOT the transaction's now(); everything below is dated from pg_temp.used_from(). Which side of the cutover a row is on is the order it
-- was written in, never its date: a stock movement or a correction written after the apply is after the cutover (stock_movements.seq and
-- stock_cost_corrections.seq above the cut_seq / cut_corr_seq the apply stored), whatever date the phone gave it.
-- Stock at the cutover (the made-up items below):
--   CC Flour   2000 g, usual price 1200 c per 1000 g = 1.2 c/g           -> 2000 x 1.2 = 2400
--   CC Sugar    500 g, usual price  500 c per 1000 g = 0.5 c/g           ->  500 x 0.5 =  250
--   CC Butter   300 g, average 3 c/g (her usual price, 2 c/g, is not used while an average exists) -> 300 x 3 = 900
--   CC Old       10 pcs, switched off, usual price 1000 c per 100 pcs = 10 c/pc -> 10 x 10 = 100 (an item switched off still has stock)
--   CC Spice     40 g, no price and no average: listed as unvalued, valued at nothing, and the cutover is REFUSED while it is on hand;
--                it is used up (0 g) before the apply, so the credit is made of four items
--   CC Empty      0 g, priced: not listed (nothing on hand); CC Card 0 pcs, no price: not listed
--   total 2400 + 250 + 900 + 100 = 3650 at the first preview; 5 items on hand, 4 valued, 1 unvalued.
-- A delivery of 10 g of sugar lands between the first preview and the apply (so the apply must be refused): sugar 510 g x 0.5 = 255,
-- total 2400 + 255 + 900 + 100 = 3655, and 3655 is what the cutover credits (4 items on hand, 4 valued, none unvalued).
-- The books, all in the period [T - 10 days, T + 1 day) unless said:
--   before the cutover:  a purchase with no stock movement  50000 (T - 3 days)
--                        a purchase that took flour in      30000 (T - 2 days; its receipt is linked to it)
--                        flour used 100 g at 1.2 = 120 (T - 1 day) and a correction worth 900 (T - 1 day): neither is an expense (the cutover
--                        carries the stock they came out of in the opening credit)
--   after the cutover (written after the apply): a purchase that took flour in 40000 (exactly T, linked to its receipt): NOT an expense, its
--                        use is; flour used 200 g at 1.5 = 300 (exactly T); rent with no stock movement 7000 (T + 1 hour, written before:
--                        a line with no movement is an expense on either side); a correction worth 400 (T + 1 hour)
--   the opening credit:  -3655 at T - 1 millisecond.
-- On the used basis the expense for the whole period is 50000 + 30000 - 3655 + 7000 + 300 + 400 = 84045. On the bought basis (no cutover
-- yet, or the owner chooses it) every purchase is an expense and no use is: 50000 + 30000 + 40000 + 7000 = 127000.
-- Written after the apply with dates that disagree with it (the second half of the suite), whole span [T - 10 days, T + 2 days):
--   a delivery of 1000 g for 30000 dated T - 1 hour: NOT an expense (it was not in the opening credit), and 100 g of it used at
--   T + 2 hours at 30 c/g is: 3000
--   flour used 100 g at 1.2 dated T - 1 hour, written after the apply: an expense, 120 (its stock WAS in the opening credit and the use
--   was not counted before it), and the opening credit stays -3655
--   flour used 50 g at 2 c/g dated T + 1 day: 100; a delivery of 200 g for 9000 dated T + 1 day: not an expense
--   a correction dated T - 30 minutes to the delivery from before the cutover (cost 30000 -> 31000, 600 of it already used): its ledger line
--   (1000) is NOT an expense and the correction's 600 is: counted once
--   84045 + 3000 + 120 + 100 + 600 = 87865.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b4a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b4a00000-0000-4000-8000-000000000001', 'owner', 'Cutover owner', true),
  ('b4a00000-0000-4000-8000-000000000002', 'helper', 'Cutover helper', true),
  ('b4a00000-0000-4000-8000-000000000003', 'support', 'Cutover support', true),
  ('b4a00000-0000-4000-8000-000000000004', 'owner', 'Cutover inactive owner', false);

create function pg_temp.uid(prefix text, n integer) returns uuid language sql immutable as $$
  select ('b4a' || prefix || '0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into public.products(id, name, short_name, price_cents, kind) values
  ('ccp1', 'CC cookie one', 'CC-1', 10000, 'cookie'), ('ccp2', 'CC cookie two', 'CC-2', 10000, 'cookie'),
  ('ccp3', 'CC cookie three', 'CC-3', 10000, 'cookie'), ('ccp4', 'CC cookie four', 'CC-4', 10000, 'cookie');
-- Made-up names on purpose: nothing here depends on what her stock is called.
insert into public.inventory_items(id, name, unit, category, active, on_hand, avg_cost, avg_cost_at) values
  ('cci-flour', 'CC Flour', 'g', 'Ingredients', true, 2000, null, null),
  ('cci-sugar', 'CC Sugar', 'g', 'Ingredients', true, 500, null, null),
  ('cci-butter', 'CC Butter', 'g', 'Ingredients', true, 300, 3, now() - interval '5 days'),
  ('cci-spice', 'CC Spice', 'g', 'Ingredients', true, 40, null, null),
  ('cci-old', 'CC Old', 'pcs', 'Packaging', false, 10, null, null),
  ('cci-empty', 'CC Empty', 'g', 'Ingredients', true, 0, null, null),
  ('cci-card', 'CC Card', 'pcs', 'Packaging', true, 0, null, null);
insert into public.item_prices(id, item_id, price_cents, pack_size, as_of, payload_hash) values
  (gen_random_uuid(), 'cci-flour', 1200, 1000, current_date, repeat('a', 64)),
  (gen_random_uuid(), 'cci-sugar', 500, 1000, current_date, repeat('a', 64)),
  (gen_random_uuid(), 'cci-butter', 2000, 1000, current_date, repeat('a', 64)),
  (gen_random_uuid(), 'cci-old', 1000, 100, current_date, repeat('a', 64)),
  (gen_random_uuid(), 'cci-empty', 100, 100, current_date, repeat('a', 64));
-- A packaging rule takes the card (per container), so the card may not be an ingredient of a recipe.
insert into public.packaging_rules(container, item_id, qty, per, position) values ('order', 'cci-card', 1, 'container', 1);

-- The books fixture (on_hand is left as it is: the rows are history, not movements the items above were counted from). These are the rows
-- written BEFORE the apply; the rows the cutover plan calls "from the cutover" are written after it (pg_temp.after_rows).
insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
  (pg_temp.uid('1', 1), 'cost', 'Ingredients', 'CC historic purchase', -50000, now() - interval '3 days'),
  (pg_temp.uid('1', 2), 'cost', 'Ingredients', 'CC flour delivery before', -30000, now() - interval '2 days'),
  (pg_temp.uid('1', 4), 'cost', 'Rent', 'CC rent after', -7000, now() + interval '1 hour');
insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, supplier, reason, at, ledger_id, payload_hash, unit_cost, cost_source) values
  (pg_temp.uid('2', 1), 'cci-flour', 'use', -100, null, '', 'Baked', now() - interval '1 day', null, repeat('1', 64), 1.2, 'usual'),
  (pg_temp.uid('2', 2), 'cci-flour', 'receipt', 1000, 30000, 'CC Mill', '', now() - interval '2 days', pg_temp.uid('1', 2), repeat('2', 64), null, null),
  (pg_temp.uid('2', 5), 'cci-spice', 'use', -5, null, '', 'Baked', now() - interval '1 day', null, repeat('5', 64), null, null);
insert into public.stock_cost_corrections(id, movement_id, cost_cents, ledger_id, at, payload_hash, used_cents) values
  (pg_temp.uid('3', 1), pg_temp.uid('2', 2), 31000, null, now() - interval '1 day', repeat('7', 64), 900);
-- A bake line that took nothing, a day before the cutover, with its why: the books list it as uncosted only from the cutover, so it must
-- not be listed (the `r.at >= cutover` side of the production arm).
insert into public.production_records(id, kind, product_id, qty, short, at, payload_hash) values
  (pg_temp.uid('4', 1), 'batch', 'ccp1', 12, '[{"name": "CC Flour", "by": 500, "unit": "g", "why": "no cost"}]'::jsonb, now() - interval '1 day', repeat('c', 64));

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b4a00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'cutover outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'cutover check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- What the tables hold, read as the fixture owner (an API role cannot read them).
create function pg_temp.used_from() returns timestamptz language sql stable security definer as $$
  select used_from from public.books_settings where id $$;
create function pg_temp.basis() returns text language sql stable security definer as $$
  select cost_basis from public.books_settings where id $$;
create function pg_temp.used_ms() returns bigint language sql stable security definer as $$
  select (extract(epoch from used_from) * 1000)::bigint from public.books_settings where id $$;
create function pg_temp.cutover_rows() returns bigint language sql stable security definer as $$
  select count(*) from public.cost_cutover $$;
create function pg_temp.cutover_row() returns jsonb language sql stable security definer as $$
  select to_jsonb(k) from public.cost_cutover k $$;
create function pg_temp.audit_n() returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log where action = 'books.cutover' $$;
create function pg_temp.audit_detail() returns jsonb language sql stable security definer as $$
  select detail from public.audit_log where action = 'books.cutover' $$;
create function pg_temp.avg_cost(item text) returns numeric language sql stable security definer as $$
  select avg_cost from public.inventory_items where id = item $$;
create function pg_temp.recipes_n(pid text) returns bigint language sql stable security definer as $$
  select count(*) from public.recipes where product_id = pid $$;
create function pg_temp.max_seq() returns bigint language sql stable security definer as $$
  select max(seq) from public.stock_movements $$;
-- Read through to_jsonb, so the suite still runs (and its cases fail, rather than the file) against a database without the column.
create function pg_temp.max_cseq() returns bigint language sql stable security definer as $$
  select max((to_jsonb(c) ->> 'seq')::bigint) from public.stock_cost_corrections c $$;
-- The spice is used up, so nothing on hand is left without a cost.
create function pg_temp.use_up_spice() returns void language sql security definer as $$
  update public.inventory_items set on_hand = 0 where id = 'cci-spice' $$;
-- An active item with no movement (it is not counted yet), added and taken away again, and a cutover cleared by hand and put back.
create function pg_temp.add_item(item text, item_name text) returns void language sql security definer as $$
  insert into public.inventory_items(id, name, unit, category, active, on_hand) values (item, item_name, 'g', 'Ingredients', true, 0) $$;
create function pg_temp.drop_item(item text) returns void language sql security definer as $$
  delete from public.inventory_items where id = item $$;
create function pg_temp.clear_cutover() returns void language sql security definer as $$
  update public.books_settings set used_from = null where id $$;
create function pg_temp.set_used_from(ts timestamptz) returns void language sql security definer as $$
  update public.books_settings set used_from = ts where id $$;
-- A stock movement as the owner's screen writes it.
create function pg_temp.mv(mv_id uuid, item text, kind text, qty numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('id', mv_id::text, 'item_id', item, 'kind', kind, 'qty', qty, 'cost_cents', null, 'supplier', '', 'reason', '',
    'at', (extract(epoch from now()) * 1000)::bigint) $$;
create function pg_temp.moves_of(item text) returns bigint language sql stable security definer as $$
  select count(*) from public.stock_movements where item_id = item $$;
-- The rows written right after the apply, dated as the plan says (from the cutover instant, T = used_from).
create function pg_temp.after_rows() returns void language sql security definer as $$
  insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
    (pg_temp.uid('1', 3), 'cost', 'Ingredients', 'CC flour delivery after', -40000, pg_temp.used_from());
  insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, supplier, reason, at, ledger_id, payload_hash, unit_cost, cost_source) values
    (pg_temp.uid('2', 3), 'cci-flour', 'receipt', 500, 40000, 'CC Mill', '', pg_temp.used_from(), pg_temp.uid('1', 3), repeat('3', 64), null, null),
    (pg_temp.uid('2', 4), 'cci-flour', 'use', -200, null, '', 'Baked', pg_temp.used_from(), null, repeat('4', 64), 1.5, 'average'),
    (pg_temp.uid('2', 6), 'cci-spice', 'use', -5, null, '', 'Baked', pg_temp.used_from(), null, repeat('6', 64), null, null);
  insert into public.stock_cost_corrections(id, movement_id, cost_cents, ledger_id, at, payload_hash, used_cents) values
    (pg_temp.uid('3', 2), pg_temp.uid('2', 3), 40400, null, pg_temp.used_from() + interval '1 hour', repeat('8', 64), 400) $$;
-- Rows written after the apply whose dates say otherwise (a phone writes the date it likes: up to a day ahead, any distance back).
create function pg_temp.late_rows() returns void language sql security definer as $$
  -- a delivery of 1000 g for 30000 dated an hour before the cutover, and 100 g of it used later at its cost, 30 c/g
  insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
    (pg_temp.uid('1', 5), 'cost', 'Ingredients', 'CC late flour delivery', -30000, pg_temp.used_from() - interval '1 hour');
  insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, supplier, reason, at, ledger_id, payload_hash, unit_cost, cost_source) values
    (pg_temp.uid('2', 9), 'cci-flour', 'receipt', 1000, 30000, 'CC Mill', '', pg_temp.used_from() - interval '1 hour', pg_temp.uid('1', 5), repeat('d', 64), null, null),
    (pg_temp.uid('2', 10), 'cci-flour', 'use', -100, null, '', 'Baked', pg_temp.used_from() + interval '2 hours', null, repeat('e', 64), 30, 'average'),
    -- stock that was in the opening credit, used: dated an hour before the cutover, written after it
    (pg_temp.uid('2', 11), 'cci-flour', 'use', -100, null, '', 'Baked', pg_temp.used_from() - interval '1 hour', null, repeat('f', 64), 1.2, 'usual'),
    -- a use dated a day ahead (the most the phone may say)
    (pg_temp.uid('2', 12), 'cci-flour', 'use', -50, null, '', 'Baked', pg_temp.used_from() + interval '1 day', null, repeat('0', 64), 2, 'usual'),
    -- a use with no cost, dated before the cutover, written after it
    (pg_temp.uid('2', 14), 'cci-spice', 'use', -5, null, '', 'Baked', pg_temp.used_from() - interval '30 minutes', null, repeat('a', 64), null, null);
  -- a delivery dated a day ahead
  insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
    (pg_temp.uid('1', 6), 'cost', 'Ingredients', 'CC forward flour delivery', -9000, pg_temp.used_from() + interval '1 day');
  insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, supplier, reason, at, ledger_id, payload_hash, unit_cost, cost_source) values
    (pg_temp.uid('2', 13), 'cci-flour', 'receipt', 200, 9000, 'CC Mill', '', pg_temp.used_from() + interval '1 day', pg_temp.uid('1', 6), repeat('b', 64), null, null);
  -- a correction dated 30 minutes before the cutover, written after it, to the delivery from before it: 30000 -> 31000, 600 already used
  insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
    (pg_temp.uid('1', 7), 'adjustment', 'Ingredients', 'CC late correction', -1000, pg_temp.used_from() - interval '30 minutes');
  insert into public.stock_cost_corrections(id, movement_id, cost_cents, ledger_id, at, payload_hash, used_cents) values
    (pg_temp.uid('3', 3), pg_temp.uid('2', 2), 31000, pg_temp.uid('1', 7), pg_temp.used_from() - interval '30 minutes', repeat('9', 64), 600) $$;
-- A delivery of 10 g of sugar (the stock and the ledger both move), and a count that changes nothing but the ledger.
create function pg_temp.receipt_sugar() returns void language sql security definer as $$
  insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, supplier, reason, at, payload_hash)
  values (pg_temp.uid('2', 7), 'cci-sugar', 'receipt', 10, null, 'CC Mill', '', now(), repeat('9', 64));
  update public.inventory_items set on_hand = on_hand + 10 where id = 'cci-sugar' $$;
create function pg_temp.count_sugar() returns void language sql security definer as $$
  insert into public.stock_movements(id, item_id, kind, qty_delta, counted, supplier, reason, at, payload_hash)
  values (pg_temp.uid('2', 8), 'cci-sugar', 'count', 0, 510, '', '', now(), repeat('b', 64)) $$;

-- The operator's calls (as postgres) and the book readers (as the owner).
create function pg_temp.pv() returns jsonb language sql volatile security invoker as $$
  select public.preview_cost_cutover() $$;
create function pg_temp.pi(p jsonb, item text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(p -> 'items') x where x ->> 'item_id' = item $$;
create function pg_temp.field_ids(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(x ->> 'item_id' order by x ->> 'item_id'), '{}') from jsonb_array_elements(j) x $$;
create function pg_temp.eb(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('hash', p ->> 'hash', 'total_cents', (p ->> 'total_cents')::bigint) $$;
create function pg_temp.ap(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select public.apply_cost_cutover(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.bk(p_from timestamptz, p_to timestamptz) returns jsonb language sql stable as $$
  select public.get_books(p_from, p_to) $$;
create function pg_temp.sumk(j jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'kind' = k $$;
create function pg_temp.bl(j jsonb, line_id text) returns jsonb language sql immutable as $$
  select l from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = line_id $$;
create function pg_temp.nl(j jsonb) returns integer language sql immutable as $$
  select jsonb_array_length(j -> 'lines') $$;
create function pg_temp.unc(j jsonb, line_id text) returns jsonb language sql immutable as $$
  select u from jsonb_array_elements(j -> 'uncosted') u where u ->> 'id' = line_id $$;
create function pg_temp.rc(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_recipe(%L::jsonb, null::timestamptz)', body::text), wanted);
end $$;
create function pg_temp.recipe(pid text, item text, unit text, kind text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('product_id', pid, 'yield', 6, 'lines', jsonb_build_array(
    jsonb_build_object('name', item, 'qty', 1, 'unit', unit) || case when kind is null then '{}'::jsonb else jsonb_build_object('kind', kind) end)) $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['preview_cost_cutover()', 'apply_cost_cutover(jsonb)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden cutover call succeeded: anon / %', split_part(f, '(', 1);
    end if;
    if has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') or has_function_privilege('service_role', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden cutover call succeeded: an API role / %', split_part(f, '(', 1);
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'cutover_rpcs_have_no_api_grant');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'cutover_select', 'select * from public.cost_cutover', '42501');
  perform pg_temp.expect(actor, 'cutover_insert',
    'insert into public.cost_cutover(at, total_cents, items, payload_hash) values (now(), 1, ''[]''::jsonb, repeat(''a'', 64))', '42501');
  perform pg_temp.expect(actor, 'cutover_update', 'update public.cost_cutover set total_cents = 1', '42501');
  perform pg_temp.expect(actor, 'cutover_delete', 'delete from public.cost_cutover', '42501');
end $$;

-- No API role can run either function, whoever it is.
create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'preview_cost_cutover', 'select public.preview_cost_cutover()', '42501');
  perform pg_temp.expect(actor, 'apply_cost_cutover', 'select public.apply_cost_cutover(''{}''::jsonb)', '42501');
end $$;

-- The operator, before the cutover (as postgres).
create function pg_temp.phase_operator_1(a text) returns void language plpgsql security invoker as $$
declare p jsonb; p2 jsonb; p3 jsonb; p4 jsonb; p5 jsonb; p6 jsonb; h text; t bigint;
begin
  perform pg_temp.assert_ok(a, 'cutover_nothing_applied_yet',
    pg_temp.used_from() is null and pg_temp.basis() = 'bought' and pg_temp.cutover_rows() = 0 and pg_temp.audit_n() = 0);

  -- ---- the preview: 2400 + 250 + 900 + 100 = 3650, five items on hand, four valued, one not
  p := pg_temp.pv();
  perform pg_temp.assert_ok(a, 'cutover_preview_values_stock',
    jsonb_array_length(p -> 'items') = 5
    and (select jsonb_agg(x ->> 'item_id' order by ord) from jsonb_array_elements(p -> 'items') with ordinality t(x, ord))
        = '["cci-butter", "cci-flour", "cci-old", "cci-spice", "cci-sugar"]'::jsonb
    and pg_temp.pi(p, 'cci-flour') = '{"item_id": "cci-flour", "name": "CC Flour", "unit": "g", "on_hand": 2000, "unit_cost": 1.2, "source": "usual", "value_cents": 2400}'::jsonb
    and pg_temp.pi(p, 'cci-sugar') = '{"item_id": "cci-sugar", "name": "CC Sugar", "unit": "g", "on_hand": 500, "unit_cost": 0.5, "source": "usual", "value_cents": 250}'::jsonb
    and pg_temp.pi(p, 'cci-butter') = '{"item_id": "cci-butter", "name": "CC Butter", "unit": "g", "on_hand": 300, "unit_cost": 3, "source": "average", "value_cents": 900}'::jsonb
    and pg_temp.pi(p, 'cci-old') = '{"item_id": "cci-old", "name": "CC Old", "unit": "pcs", "on_hand": 10, "unit_cost": 10, "source": "usual", "value_cents": 100}'::jsonb
    and (p ->> 'total_cents')::bigint = 3650);
  perform pg_temp.assert_ok(a, 'cutover_preview_counts_and_hash',
    p -> 'counts' = '{"items_on_hand": 5, "valued": 4, "unvalued": 1, "not_counted": 4}'::jsonb and (p ->> 'hash') ~ '^[0-9a-f]{64}$');
  -- B4a-4: the active items that have never had a stock movement are listed (the credit cannot include what was never counted), by id: the
  -- butter, the card, the empty bag and the sugar (its first delivery is written below). The flour and the spice have movements; the old item is
  -- switched off.
  perform pg_temp.assert_ok(a, 'cutover_preview_lists_not_counted',
    p -> 'not_counted' = '[{"item_id": "cci-butter", "name": "CC Butter"}, {"item_id": "cci-card", "name": "CC Card"}, {"item_id": "cci-empty", "name": "CC Empty"}, {"item_id": "cci-sugar", "name": "CC Sugar"}]'::jsonb);
  -- no cost is listed, never a zero: the spice has stock and no price, so it adds nothing and says so
  perform pg_temp.assert_ok(a, 'cutover_preview_lists_the_unvalued',
    p -> 'unvalued' = '[{"item_id": "cci-spice", "name": "CC Spice"}]'::jsonb
    and pg_temp.pi(p, 'cci-spice') = '{"item_id": "cci-spice", "name": "CC Spice", "unit": "g", "on_hand": 40, "unit_cost": null, "source": null, "value_cents": null}'::jsonb
    and pg_temp.pi(p, 'cci-empty') is null and pg_temp.pi(p, 'cci-card') is null);
  p2 := pg_temp.pv();
  perform pg_temp.assert_ok(a, 'cutover_preview_is_stable_and_writes_nothing',
    p2 = p and pg_temp.used_from() is null and pg_temp.basis() = 'bought' and pg_temp.cutover_rows() = 0 and pg_temp.audit_n() = 0);

  -- ---- the expected object is exactly the preview's hash and total, each of the right type
  h := p ->> 'hash'; t := (p ->> 'total_cents')::bigint;
  perform pg_temp.ap(a, 'cutover_keys_null', null, '22023');
  perform pg_temp.ap(a, 'cutover_keys_array', '[]'::jsonb, '22023');
  perform pg_temp.ap(a, 'cutover_keys_empty', '{}'::jsonb, '22023');
  perform pg_temp.ap(a, 'cutover_keys_total_missing', jsonb_build_object('hash', h), '22023');
  perform pg_temp.ap(a, 'cutover_keys_hash_missing', jsonb_build_object('total_cents', t), '22023');
  perform pg_temp.ap(a, 'cutover_keys_extra', jsonb_build_object('hash', h, 'total_cents', t, 'note', 1), '22023');
  perform pg_temp.ap(a, 'cutover_hash_short', jsonb_build_object('hash', 'abc', 'total_cents', t), '22023');
  perform pg_temp.ap(a, 'cutover_hash_uppercase', jsonb_build_object('hash', upper(h), 'total_cents', t), '22023');
  perform pg_temp.ap(a, 'cutover_hash_number', jsonb_build_object('hash', 123, 'total_cents', t), '22023');
  perform pg_temp.ap(a, 'cutover_total_string', jsonb_build_object('hash', h, 'total_cents', t::text), '22023');
  perform pg_temp.ap(a, 'cutover_total_fraction', '{"total_cents": 3650.5}'::jsonb || jsonb_build_object('hash', h), '22023');
  perform pg_temp.assert_ok(a, 'cutover_expected_refusals_changed_nothing',
    pg_temp.used_from() is null and pg_temp.basis() = 'bought' and pg_temp.cutover_rows() = 0 and pg_temp.audit_n() = 0);

  -- ---- a delivery lands between the preview and the apply: refused, and nothing is written
  perform pg_temp.receipt_sugar();
  perform pg_temp.ap(a, 'cutover_changed_after_preview', pg_temp.eb(p), 'P0002');
  perform pg_temp.assert_ok(a, 'cutover_changed_changed_nothing',
    pg_temp.used_from() is null and pg_temp.basis() = 'bought' and pg_temp.cutover_rows() = 0 and pg_temp.audit_n() = 0);
  -- the new preview: sugar 510 g x 0.5 = 255, so 2400 + 255 + 900 + 100 = 3655. Either half of a stale expectation is refused.
  p2 := pg_temp.pv();
  perform pg_temp.assert_ok(a, 'cutover_preview_follows_the_stock',
    pg_temp.pi(p2, 'cci-sugar') ->> 'value_cents' = '255' and (p2 ->> 'total_cents')::bigint = 3655 and p2 ->> 'hash' <> h);
  -- the sugar has a movement now, so it is no longer waiting to be counted
  perform pg_temp.assert_ok(a, 'cutover_not_counted_follows_the_movements',
    p2 -> 'not_counted' = '[{"item_id": "cci-butter", "name": "CC Butter"}, {"item_id": "cci-card", "name": "CC Card"}, {"item_id": "cci-empty", "name": "CC Empty"}]'::jsonb
    and p2 -> 'counts' = '{"items_on_hand": 5, "valued": 4, "unvalued": 1, "not_counted": 3}'::jsonb);
  perform pg_temp.ap(a, 'cutover_changed_total_only', jsonb_build_object('hash', p2 ->> 'hash', 'total_cents', t), 'P0002');
  perform pg_temp.ap(a, 'cutover_changed_hash_only', jsonb_build_object('hash', h, 'total_cents', (p2 ->> 'total_cents')::bigint), 'P0002');
  -- the hash follows the ledger, not only the stock: a count that changes no quantity still moves it
  perform pg_temp.count_sugar();
  p3 := pg_temp.pv();
  perform pg_temp.assert_ok(a, 'cutover_hash_follows_the_ledger',
    p3 ->> 'hash' <> p2 ->> 'hash' and p3 -> 'items' = p2 -> 'items' and p3 -> 'total_cents' = p2 -> 'total_cents');
  perform pg_temp.ap(a, 'cutover_changed_after_a_count', pg_temp.eb(p2), 'P0002');

  -- ---- an item on hand with no cost stops the cutover: the opening credit would be short by what it holds. The expectation is the current
  -- one, so nothing but the unvalued spice refuses it; and the refusal writes nothing
  p4 := pg_temp.pv();
  perform pg_temp.assert_ok(a, 'cutover_unvalued_still_listed', jsonb_array_length(p4 -> 'unvalued') = 1 and p4 -> 'counts' = '{"items_on_hand": 5, "valued": 4, "unvalued": 1, "not_counted": 3}'::jsonb);
  perform pg_temp.ap(a, 'cutover_unvalued_refused', pg_temp.eb(p4), 'P0001');
  perform pg_temp.assert_ok(a, 'cutover_unvalued_changed_nothing',
    pg_temp.used_from() is null and pg_temp.basis() = 'bought' and pg_temp.cutover_rows() = 0 and pg_temp.audit_n() = 0);
  -- the spice is used up: a new preview lists nothing unvalued, the credit is the same 3655, and the apply (below) goes through
  perform pg_temp.use_up_spice();
  p4 := pg_temp.pv();
  perform pg_temp.assert_ok(a, 'cutover_preview_without_unvalued',
    p4 -> 'unvalued' = '[]'::jsonb and p4 -> 'counts' = '{"items_on_hand": 4, "valued": 4, "unvalued": 0, "not_counted": 3}'::jsonb
    and (p4 ->> 'total_cents')::bigint = 3655 and pg_temp.pi(p4, 'cci-spice') is null);
  -- the hash follows the list of items not counted too, not only the stock and the last movement: a new active item with no movement changes
  -- nothing else (no stock, no movement), so it is the list alone that moves the hash; taking it away puts the preview back
  p5 := pg_temp.pv();
  perform pg_temp.add_item('cci-late-item', 'CC Late item');
  p6 := pg_temp.pv();
  perform pg_temp.assert_ok(a, 'cutover_hash_follows_not_counted',
    p6 ->> 'hash' <> p5 ->> 'hash' and p6 -> 'items' = p5 -> 'items' and p6 -> 'total_cents' = p5 -> 'total_cents'
    and jsonb_array_length(p6 -> 'not_counted') = 4 and p6 -> 'counts' ->> 'not_counted' = '4'
    and pg_temp.field_ids(p6 -> 'not_counted') = array['cci-butter', 'cci-card', 'cci-empty', 'cci-late-item']);
  perform pg_temp.drop_item('cci-late-item');
  perform pg_temp.assert_ok(a, 'cutover_not_counted_back_to_the_stock', pg_temp.pv() = p5);
end $$;

-- The owner, before the cutover: "when used" is not there to choose yet.
create function pg_temp.phase_owner_1(a text) returns void language plpgsql security invoker as $$
declare j jsonb;
begin
  perform pg_temp.expect(a, 'basis_needs_cutover', 'select public.set_cost_basis(''used'')', '22023');
  perform pg_temp.assert_ok(a, 'basis_refusal_changed_nothing', pg_temp.basis() = 'bought' and pg_temp.used_from() is null);
  perform pg_temp.expect(a, 'basis_bought_before_cutover', 'select public.set_cost_basis(''bought'')', '00000');
  -- before the cutover every purchase is an expense and a use is not: 50000 + 30000 + 7000 = 87000 (the 40000 delivery is written later)
  j := pg_temp.bk(now() - interval '10 days', now() + interval '1 day');
  perform pg_temp.assert_ok(a, 'books_bought_until_the_cutover',
    j ->> 'basis' = 'bought' and pg_temp.sumk(j, 'expense') = 87000 and pg_temp.bl(j, 'k:opening') is null);
end $$;

-- The operator applies the cutover (as postgres).
create function pg_temp.phase_operator_2(a text) returns void language plpgsql security invoker as $$
declare p jsonb; j jsonb; t0 timestamptz; sq bigint; cq bigint;
begin
  p := pg_temp.pv();
  sq := pg_temp.max_seq(); cq := pg_temp.max_cseq();
  j := public.apply_cost_cutover(pg_temp.eb(p));
  perform pg_temp.assert_ok(a, 'cutover_apply_returns_the_credit',
    (j ->> 'total_cents')::bigint = 3655 and j -> 'counts' = '{"items_on_hand": 4, "valued": 4, "unvalued": 0, "not_counted": 3}'::jsonb
    and (j ->> 'used_from')::timestamptz = pg_temp.used_from());
  -- the instant is taken with clock_timestamp() once the locks are held, so it is later than the transaction's now()
  t0 := pg_temp.used_from();
  perform pg_temp.assert_ok(a, 'cutover_apply_sets_used', t0 > now() and t0 <= clock_timestamp() and pg_temp.basis() = 'used');
  -- the creation order the books rest on: the last movement and the last correction written when the apply held the locks
  perform pg_temp.assert_ok(a, 'cutover_apply_records_the_sequence',
    sq is not null and cq is not null and (pg_temp.cutover_row() ->> 'cut_seq')::bigint = sq and (pg_temp.cutover_row() ->> 'cut_corr_seq')::bigint = cq);
  perform pg_temp.assert_ok(a, 'cutover_apply_records_the_credit',
    pg_temp.cutover_rows() = 1
    and (pg_temp.cutover_row() ->> 'total_cents')::bigint = 3655 and (pg_temp.cutover_row() ->> 'at')::timestamptz = pg_temp.used_from()
    and pg_temp.cutover_row() -> 'items' = p -> 'items' and pg_temp.cutover_row() ->> 'payload_hash' = p ->> 'hash');
  perform pg_temp.assert_ok(a, 'cutover_apply_audits',
    pg_temp.audit_n() = 1 and pg_temp.audit_detail() = jsonb_build_object('counts', p -> 'counts', 'total_cents', 3655, 'hash', p ->> 'hash'));
  -- later uses fall back to her usual price through the cost function: nothing is written as an average
  perform pg_temp.assert_ok(a, 'cutover_writes_no_avg_cost',
    pg_temp.avg_cost('cci-flour') is null and pg_temp.avg_cost('cci-sugar') is null and pg_temp.avg_cost('cci-butter') = 3);
  -- once: even a correct expectation is refused, and so is a stale one (the first refusal is the one that matters)
  perform pg_temp.ap(a, 'cutover_once', pg_temp.eb(pg_temp.pv()), 'P0001');
  perform pg_temp.ap(a, 'cutover_once_before_changed', jsonb_build_object('hash', repeat('0', 64), 'total_cents', 1), 'P0001');
  perform pg_temp.assert_ok(a, 'cutover_once_changed_nothing',
    pg_temp.audit_n() = 1 and pg_temp.cutover_rows() = 1 and pg_temp.used_from() = t0 and (pg_temp.cutover_row() ->> 'total_cents')::bigint = 3655
    and (pg_temp.cutover_row() ->> 'cut_seq')::bigint = sq and (pg_temp.cutover_row() ->> 'cut_corr_seq')::bigint = cq);
  -- the rows the plan calls "from the cutover" are written now, after the apply
  perform pg_temp.after_rows();
end $$;

-- The owner, after the cutover: the books on both sides of it, and the recipe rule.
create function pg_temp.phase_owner_2(a text) returns void language plpgsql security invoker as $$
declare j jsonb; k jsonb;
begin
  -- ---- before the cutover the lines are bought lines, though the basis is used: 50000 + 30000 = 80000. The flour used and the correction
  -- (T - 1 day) are not expenses, and nor is any opening credit (it is at T - 1 ms, after this period).
  j := pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() - interval '1 hour');
  perform pg_temp.assert_ok(a, 'books_before_cutover_is_bought',
    j ->> 'basis' = 'used' and pg_temp.sumk(j, 'expense') = 80000
    and pg_temp.bl(j, 'l:' || pg_temp.uid('1', 1)) ->> 'amount_cents' = '50000' and pg_temp.bl(j, 'l:' || pg_temp.uid('1', 2)) ->> 'amount_cents' = '30000'
    and pg_temp.bl(j, 'm:' || pg_temp.uid('2', 1)) is null and pg_temp.bl(j, 'c:' || pg_temp.uid('3', 1)) is null
    and pg_temp.bl(j, 'k:opening') is null);
  -- the opening credit's own instant is outside a period that ends at it (the end is exclusive)
  j := pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() - interval '1 millisecond');
  perform pg_temp.assert_ok(a, 'books_period_ending_at_the_opening_has_none', pg_temp.bl(j, 'k:opening') is null and pg_temp.sumk(j, 'expense') = 80000);

  -- ---- from the cutover (T, inclusive): the flour used (300), the rent (7000) and the correction (400) are expenses; the delivery that took
  -- flour in (40000, linked to its receipt) is not
  j := pg_temp.bk(pg_temp.used_from(), pg_temp.used_from() + interval '1 day');
  perform pg_temp.assert_ok(a, 'books_after_cutover',
    pg_temp.sumk(j, 'expense') = 7700
    and pg_temp.bl(j, 'm:' || pg_temp.uid('2', 4)) ->> 'amount_cents' = '300' and pg_temp.bl(j, 'l:' || pg_temp.uid('1', 4)) ->> 'amount_cents' = '7000'
    and pg_temp.bl(j, 'c:' || pg_temp.uid('3', 2)) ->> 'amount_cents' = '400'
    and pg_temp.bl(j, 'l:' || pg_temp.uid('1', 3)) is null and pg_temp.bl(j, 'k:opening') is null);

  -- ---- the whole period: the opening stock is credited once. 50000 + 30000 - 3655 + 7000 + 300 + 400 = 84045
  j := pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() + interval '1 day');
  perform pg_temp.assert_ok(a, 'books_opening_credit_once',
    pg_temp.sumk(j, 'expense') = 84045
    and (select count(*) from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = 'k:opening') = 1);
  -- the sums of the two halves are the whole
  perform pg_temp.assert_ok(a, 'books_halves_make_the_whole',
    pg_temp.sumk(pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() - interval '1 millisecond'), 'expense')
    + pg_temp.sumk(pg_temp.bk(pg_temp.used_from() - interval '1 millisecond', pg_temp.used_from()), 'expense')
    + pg_temp.sumk(pg_temp.bk(pg_temp.used_from(), pg_temp.used_from() + interval '1 day'), 'expense') = 84045);
  k := pg_temp.bk(pg_temp.used_from() - interval '1 millisecond', pg_temp.used_from());
  perform pg_temp.assert_ok(a, 'books_opening_line_shape',
    pg_temp.nl(k) = 1 and pg_temp.bl(k, 'k:opening') = jsonb_build_object('id', 'k:opening', 'kind', 'expense', 'cat', 'Stock',
      'label', 'Opening stock carried in', 'amount_cents', -3655, 'at', pg_temp.used_ms() - 1, 'short_qty', 0));
  -- a period that starts after the opening instant has no opening line
  perform pg_temp.assert_ok(a, 'books_period_after_the_opening_has_none', pg_temp.bl(pg_temp.bk(pg_temp.used_from(), pg_temp.used_from() + interval '1 hour'), 'k:opening') is null);

  -- ---- what has no cost is listed from the cutover only: the spice used at T is, the one used a day before is not
  perform pg_temp.assert_ok(a, 'books_uncosted_only_after_cutover',
    pg_temp.unc(j, 'm:' || pg_temp.uid('2', 6)) = jsonb_build_object('id', 'm:' || pg_temp.uid('2', 6), 'kind', 'use', 'item', 'CC Spice', 'qty', 5, 'unit', 'g',
      'at', pg_temp.used_ms())
    and pg_temp.unc(j, 'm:' || pg_temp.uid('2', 5)) is null
    -- the bake line that took nothing a day before the cutover (with its why) is not listed either
    and pg_temp.unc(j, 'p:' || pg_temp.uid('4', 1)::text || ':0') is null and jsonb_array_length(j -> 'uncosted') = 1);

  -- ---- the owner can still choose bought, and then it is bought on both sides: 127000 and no opening credit; and used again afterwards
  perform pg_temp.expect(a, 'basis_bought_after_cutover', 'select public.set_cost_basis(''bought'')', '00000');
  j := pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() + interval '1 day');
  perform pg_temp.assert_ok(a, 'books_bought_after_cutover', j ->> 'basis' = 'bought' and pg_temp.sumk(j, 'expense') = 127000 and pg_temp.bl(j, 'k:opening') is null);
  perform pg_temp.expect(a, 'basis_used_after_cutover', 'select public.set_cost_basis(''used'')', '00000');
  perform pg_temp.assert_ok(a, 'books_used_again', pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() + interval '1 day') ->> 'basis' = 'used');

  -- ---- a recipe may not take as an ingredient what a packaging rule takes (the card is on the order rule, per container)
  perform pg_temp.rc(a, 'recipe_ingredient_off_rule_ok', pg_temp.recipe('ccp1', 'CC Flour', 'g'), '00000');
  perform pg_temp.rc(a, 'recipe_ingredient_on_rule', pg_temp.recipe('ccp2', 'CC Card', 'pcs'), '22023');
  perform pg_temp.rc(a, 'recipe_ingredient_on_rule_kind', pg_temp.recipe('ccp3', 'CC Card', 'pcs', 'ingredient'), '22023');
  perform pg_temp.assert_ok(a, 'recipe_ingredient_on_rule_saved_nothing', pg_temp.recipes_n('ccp2') = 0 and pg_temp.recipes_n('ccp3') = 0 and pg_temp.recipes_n('ccp1') = 1);
  -- as a packaging line it is allowed (a rule per container does not take it per cookie)
  perform pg_temp.rc(a, 'recipe_packaging_on_container_rule_ok', pg_temp.recipe('ccp4', 'CC Card', 'pcs', 'packaging'), '00000');
end $$;

-- The owner, with rows written after the apply whose dates disagree with it. The side of the cutover is the order they were written in.
create function pg_temp.phase_owner_3(a text) returns void language plpgsql security invoker as $$
declare j jsonb; w jsonb; v_t timestamptz;
begin
  -- the whole span, [T - 10 days, T + 2 days): 84045 + 3000 + 120 + 100 + 600 = 87865
  j := pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() + interval '2 days');
  perform pg_temp.assert_ok(a, 'late_delivery_after_cutover',
    pg_temp.bl(j, 'l:' || pg_temp.uid('1', 5)) is null);
  perform pg_temp.assert_ok(a, 'late_delivery_use_at_the_receipts_cost',
    pg_temp.bl(j, 'm:' || pg_temp.uid('2', 10)) ->> 'amount_cents' = '3000');
  perform pg_temp.assert_ok(a, 'late_use_before_cutover_date',
    pg_temp.bl(j, 'm:' || pg_temp.uid('2', 11)) ->> 'amount_cents' = '120'
    and (pg_temp.bl(j, 'm:' || pg_temp.uid('2', 11)) ->> 'at')::bigint = pg_temp.used_ms() - 3600000
    and (pg_temp.bl(j, 'k:opening') ->> 'amount_cents') = '-3655');
  perform pg_temp.assert_ok(a, 'forward_dated_use_is_an_expense_and_receipt_is_not',
    pg_temp.bl(j, 'm:' || pg_temp.uid('2', 12)) ->> 'amount_cents' = '100' and pg_temp.bl(j, 'l:' || pg_temp.uid('1', 6)) is null);
  perform pg_temp.assert_ok(a, 'late_correction_counted_once',
    pg_temp.bl(j, 'c:' || pg_temp.uid('3', 3)) ->> 'amount_cents' = '600' and pg_temp.bl(j, 'l:' || pg_temp.uid('1', 7)) is null);
  perform pg_temp.assert_ok(a, 'late_rows_whole_span_total', pg_temp.sumk(j, 'expense') = 87865);
  -- the late use with no cost is listed (it is after the cutover by order), the one written before the apply is not
  perform pg_temp.assert_ok(a, 'late_uncosted_use_is_listed',
    pg_temp.unc(j, 'm:' || pg_temp.uid('2', 14)) is not null and pg_temp.unc(j, 'm:' || pg_temp.uid('2', 5)) is null
    and pg_temp.unc(j, 'm:' || pg_temp.uid('2', 6)) is not null and jsonb_array_length(j -> 'uncosted') = 2);
  -- the day ahead on its own: the use is an expense, the delivery is not
  w := pg_temp.bk(pg_temp.used_from() + interval '1 day', pg_temp.used_from() + interval '2 days');
  perform pg_temp.assert_ok(a, 'forward_dated_window',
    pg_temp.nl(w) = 1 and pg_temp.sumk(w, 'expense') = 100);
  -- the same span on the bought basis: every purchase is an expense, however it is dated, and no use is.
  -- 50000 + 30000 + 40000 + 7000 + 30000 + 9000 + 1000 = 167000
  perform pg_temp.expect(a, 'basis_bought_late_rows', 'select public.set_cost_basis(''bought'')', '00000');
  j := pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() + interval '2 days');
  perform pg_temp.assert_ok(a, 'late_rows_bought_basis_total', j ->> 'basis' = 'bought' and pg_temp.sumk(j, 'expense') = 167000);
  perform pg_temp.expect(a, 'basis_used_late_rows', 'select public.set_cost_basis(''used'')', '00000');

  -- ---- B4a-4: an opening quantity is the first movement of an item, and after the cutover that is a count instead. The item's purchase is in
  -- the historical lines, but it was not in the opening credit, so its uses would be expensed a second time. The empty bag has no movement
  -- and nothing on hand, so every other rule lets it through; only the cutover stops it, and nothing is written.
  perform pg_temp.expect(a, 'opening_after_cutover',
    format('select * from public.record_stock_movement(%L::jsonb)', pg_temp.mv(pg_temp.uid('5', 1), 'cci-empty', 'opening', 5)::text), '22023');
  perform pg_temp.assert_ok(a, 'opening_after_cutover_wrote_nothing', pg_temp.moves_of('cci-empty') = 0);
  -- the other kinds still go through after it: a count is how the item is brought in now
  perform pg_temp.expect(a, 'count_after_cutover',
    format('select * from public.record_stock_movement(%L::jsonb)', pg_temp.mv(pg_temp.uid('5', 2), 'cci-empty', 'count', 5)::text), '00000');
  perform pg_temp.assert_ok(a, 'count_after_cutover_wrote_one', pg_temp.moves_of('cci-empty') = 1);

  -- ---- B4a-4: a cutover cleared by hand while the basis is still used is read as the bought basis: every purchase counts and no use does
  -- (the whole span: 167000, as when the owner chooses bought), and there is no opening credit. It is put back afterwards.
  j := pg_temp.bk(pg_temp.used_from() - interval '10 days', pg_temp.used_from() + interval '2 days');
  perform pg_temp.assert_ok(a, 'books_before_the_hand_clearing', j ->> 'basis' = 'used' and pg_temp.sumk(j, 'expense') = 87865);
  v_t := pg_temp.used_from();
  perform pg_temp.clear_cutover();
  w := pg_temp.bk(v_t - interval '10 days', v_t + interval '2 days');
  perform pg_temp.assert_ok(a, 'books_hand_cleared_cutover_is_bought',
    w ->> 'basis' = 'bought' and pg_temp.bl(w, 'k:opening') is null and pg_temp.sumk(w, 'expense') = 167000
    and pg_temp.basis() = 'used');
  -- with no cutover an opening is allowed again: the refusal is of the cutover, not of the kind
  perform pg_temp.expect(a, 'opening_before_cutover',
    format('select * from public.record_stock_movement(%L::jsonb)', pg_temp.mv(pg_temp.uid('5', 3), 'cci-card', 'opening', 5)::text), '00000');
  perform pg_temp.assert_ok(a, 'opening_before_cutover_wrote_one', pg_temp.moves_of('cci-card') = 1);
  -- and the same opening sent again once the cutover is back (a phone's queue replays what it wrote before) is the same movement, not a refusal
  perform pg_temp.set_used_from(v_t);
  perform pg_temp.expect(a, 'opening_replay_after_cutover',
    format('select * from public.record_stock_movement(%L::jsonb)', pg_temp.mv(pg_temp.uid('5', 3), 'cci-card', 'opening', 5)::text), '00000');
  perform pg_temp.assert_ok(a, 'opening_replay_wrote_nothing_more', pg_temp.moves_of('cci-card') = 1 and pg_temp.used_from() = v_t);
end $$;

grant execute on function
  pg_temp.uid(text, integer), pg_temp.used_from(), pg_temp.basis(), pg_temp.used_ms(), pg_temp.cutover_rows(), pg_temp.cutover_row(), pg_temp.audit_n(),
  pg_temp.audit_detail(), pg_temp.avg_cost(text), pg_temp.recipes_n(text), pg_temp.receipt_sugar(), pg_temp.count_sugar(), pg_temp.pv(),
  pg_temp.pi(jsonb, text), pg_temp.eb(jsonb), pg_temp.ap(text, text, jsonb, text), pg_temp.bk(timestamptz, timestamptz), pg_temp.sumk(jsonb, text),
  pg_temp.bl(jsonb, text), pg_temp.nl(jsonb), pg_temp.unc(jsonb, text), pg_temp.rc(text, text, jsonb, text), pg_temp.recipe(text, text, text, text),
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text),
  pg_temp.phase_operator_1(text), pg_temp.phase_owner_1(text), pg_temp.phase_operator_2(text), pg_temp.phase_owner_2(text),
  pg_temp.phase_owner_3(text), pg_temp.max_seq(), pg_temp.max_cseq(), pg_temp.use_up_spice(), pg_temp.after_rows(), pg_temp.late_rows(),
  pg_temp.add_item(text, text), pg_temp.drop_item(text), pg_temp.clear_cutover(), pg_temp.set_used_from(timestamptz),
  pg_temp.mv(uuid, text, text, numeric), pg_temp.moves_of(text), pg_temp.field_ids(jsonb)
  to anon, authenticated, service_role;

-- ================================================================ the run

select pg_temp.phase_operator_1('operator');

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
select pg_temp.assert_refused('active_owner');
select pg_temp.phase_owner_1('active_owner');
reset role;

select pg_temp.phase_operator_2('operator');

set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.phase_owner_2('active_owner');
reset role;

select pg_temp.late_rows();

set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.phase_owner_3('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
