-- B3b cost cutover by apply order (migration 20260101006200) with real SQL roles; all data rolls back.
--
-- "When used" starts from a CUTOVER that is the order rows were applied in, not a date: set_cost_basis takes it the first time the owner
-- chooses used (books_settings.used_from_seq = the highest stock_movements.seq then, books_cutover = what is on hand then). get_books
-- classifies by seq: a delivery applied by the cutover is an expense through its own ledger line (and so is its correction, in full); a
-- delivery applied after it is expensed when used, and so is its correction (the share of stock already used). What was on hand at the
-- cutover is an allowance that every movement applied after it which takes stock away (a use, a waste, a count that found less, an
-- adjustment down) draws on in seq order; only a use or a waste is expensed. A line is never dated before the cutover day.
--
-- Every case goes through the real owner RPCs (record_stock_movement, record_production, record_cost_correction, set_cost_basis) with made-up
-- items; a recipe line takes 10 g per 10 cookies, so a batch of N cookies uses exactly N g. The money is worked by hand in the comment above
-- each case. Dates are days from now (the whole suite runs in one transaction): the cutover is taken at now, so a negative day is a date
-- before it that is written after it. The harness changes the redefined functions in one place at a time (scripts/test-db-security.py,
-- CUTOVER_MUTATIONS) and requires the named case here to fail. Not mutation-tested (one session cannot observe a lock): the catalogue and
-- item locks set_cost_basis takes before it reads the highest seq and the stock on hand. Outcome messages carry no quote character: the harness
-- redacts quoted literals.
--
-- The cutover is taken after these (every cost is a stamp in centavos per unit, from a delivery at 100 a unit unless said):
--   alpha    receipt 100 for 10000 (d-5)                         papa   receipt 100 for 10000 (d-5), 40 used (d-4): 60 on hand
--   quebec   receipt 100 for 10000 (d-5), 100 used (d-4): 0      charlie receipt 100 for 10000     delta  receipt 100 for 10000
--   dingo    receipt 50 for 5000      echo   receipt 100 for 10000   golf   receipt 20 for 2000 (a stamp of 100)
--   hotel    opening 30, no cost      india  opening 30, no cost    whiskey receipt 50 for 500 (a stamp of 10)
--   uniform  opening 100, no cost: a bake (d-3) of a flavour with a line that names no stock item
-- and after it (the day is from now, in hours when under one): see the cases.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('c4c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('c4c00000-0000-4000-8000-000000000001', 'owner', 'Cutover owner', true),
  ('c4c00000-0000-4000-8000-000000000002', 'helper', 'Cutover helper', true),
  ('c4c00000-0000-4000-8000-000000000003', 'support', 'Cutover support', true),
  ('c4c00000-0000-4000-8000-000000000004', 'owner', 'Cutover inactive owner', false);

-- The books have never been switched to used: no cutover, and a stale row of an old snapshot that the first cutover must replace.
update public.books_settings set cost_basis = 'bought', used_from = null, used_from_seq = null where id;
delete from public.books_cutover;

-- One item, one flavour and one recipe (10 g per 10 cookies) for each case.
create temporary table c4_items (sfx text primary key, name text not null);
insert into c4_items values
  ('a', 'C4 Alpha'), ('p1', 'C4 Papa'), ('p2', 'C4 Quebec'), ('b', 'C4 Bravo'), ('c', 'C4 Charlie'), ('d', 'C4 Delta'), ('d2', 'C4 Dingo'),
  ('e', 'C4 Echo'), ('f', 'C4 Foxtrot'), ('g', 'C4 Golf'), ('h', 'C4 Hotel'), ('h2', 'C4 India'), ('k', 'C4 Kilo'), ('o', 'C4 Oscar'),
  ('w', 'C4 Whiskey'), ('u', 'C4 Uniform');
insert into public.inventory_items(id, name, unit, category, active, on_hand)
select 'c4i-' || s.sfx, s.name, 'g', 'Ingredients', true, 0 from c4_items s;
insert into public.books_cutover(item_id, qty) values ('c4i-a', 999);
insert into public.products(id, name, short_name, price_cents, kind)
select 'c4p-' || s.sfx, s.name || ' cookie', 'C4-' || s.sfx, 100, 'cookie' from c4_items s
union all select 'c4p-ug', 'C4 Ghost cookie', 'C4-ug', 100, 'cookie';
insert into public.recipes(product_id, yield_count)
select 'c4p-' || s.sfx, 10 from c4_items s union all select 'c4p-ug', 10;
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position)
select 'c4p-' || s.sfx, s.name, 10, 'g', 0 from c4_items s
union all select 'c4p-u', 'C4 Ghost', 10, 'g', 1 -- uniform's flavour has a line that names no stock item
union all select 'c4p-ug', 'C4 Ghost', 10, 'g', 0; -- and one flavour has nothing else: its bake takes no stock at all
select public.apply_identity_links(public.preview_identity_links() -> 'counts');

-- Two plain costs written before the cutover (linked to no stock): rent and wages.
insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
  (md5('c4lg:1')::uuid, 'cost', 'Rent', 'C4 Rent', -2000, now() - interval '15 days'),
  (md5('c4lg:2')::uuid, 'cost', 'Helper wages', 'C4 Wages', -1500, now() - interval '7 days');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'c4c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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

-- ---- what the fixture owner sees and changes (an API role can read none of these tables)
create function pg_temp.fixture(statement text) returns void language plpgsql security definer as $$
begin
  execute statement;
end $$;
create function pg_temp.cut_state() returns jsonb language sql stable security definer as $$
  select jsonb_build_object('used_from', (select b.used_from from public.books_settings b where b.id),
    'used_from_seq', (select b.used_from_seq from public.books_settings b where b.id),
    'snapshot', coalesce((select jsonb_object_agg(c.item_id, c.qty) from public.books_cutover c), '{}'::jsonb)) $$;
create function pg_temp.max_seq() returns bigint language sql stable security definer as $$
  select coalesce(max(m.seq), 0) from public.stock_movements m $$;
create function pg_temp.on_hand_now() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_object_agg(i.id, greatest(i.on_hand, 0)), '{}'::jsonb) from public.inventory_items i $$;
create function pg_temp.table_closed() returns boolean language plpgsql stable security definer as $$
begin
  return not has_table_privilege('anon', 'public.books_cutover', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     and not has_table_privilege('authenticated', 'public.books_cutover', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     and (select c.relrowsecurity from pg_class c where c.oid = 'public.books_cutover'::regclass);
end $$;
-- The ids the books give the rows the real writers made (the operation names the row; the ids are derived from it).
create function pg_temp.rl(op text) returns text language sql stable security definer as $$ -- a delivery's ledger line
  select 'l:' || m.ledger_id::text from public.stock_movements m where m.id = md5('c4mv:' || op)::uuid $$;
create function pg_temp.cl(op text) returns text language sql stable security definer as $$ -- a correction's ledger line
  select 'l:' || c.ledger_id::text from public.stock_cost_corrections c where c.id = md5('c4co:' || op)::uuid $$;
create function pg_temp.cc(op text) returns text language sql immutable as $$ -- a correction's cost-used line
  select 'c:' || md5('c4co:' || op)::uuid::text $$;
create function pg_temp.mm(op text) returns text language sql immutable as $$ -- a waste written by record_stock_movement
  select 'm:' || md5('c4mv:' || op)::uuid::text $$;
create function pg_temp.mu(op text, sfx text) returns text language sql stable security definer as $$ -- the use a bake wrote for one item
  select 'm:' || m.id::text from public.stock_movements m where m.production_id = md5('c4pr:' || op)::uuid and m.item_id = 'c4i-' || sfx $$;
create function pg_temp.pp(op text, n integer) returns text language sql immutable as $$ -- the n-th line a bake could not take
  select 'p:' || md5('c4pr:' || op)::uuid::text || ':' || n::text $$;
create function pg_temp.lg(n integer) returns uuid language sql immutable as $$ select md5('c4lg:' || n::text)::uuid $$;

-- ---- readers of the books
create function pg_temp.books() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '30 days', now() + interval '1 day') $$;
create function pg_temp.past() returns jsonb language sql stable as $$ -- everything before the cutover moment (to is exclusive)
  select public.get_books(now() - interval '30 days', now()) $$;
create function pg_temp.sumk(j jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'kind' = k $$;
create function pg_temp.has(j jsonb, id text) returns boolean language sql immutable as $$
  select exists (select 1 from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = id) $$;
create function pg_temp.amt(j jsonb, id text) returns bigint language sql immutable as $$
  select (l ->> 'amount_cents')::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = id $$;
create function pg_temp.at_of(j jsonb, id text) returns bigint language sql immutable as $$
  select (l ->> 'at')::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = id $$;
create function pg_temp.short(j jsonb, id text) returns numeric language sql immutable as $$
  select (l ->> 'short_qty')::numeric from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = id $$;
create function pg_temp.n(j jsonb, prefix text) returns integer language sql immutable as $$
  select count(*)::integer from jsonb_array_elements(j -> 'lines') l where l ->> 'id' like prefix || '%' $$;
-- What an item cost the books: its delivery's line, its correction's line, its uses and wastes and its cost-used lines.
create function pg_temp.item_total(j jsonb, name text) returns bigint language sql immutable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(j -> 'lines') l
   where l ->> 'kind' = 'expense' and (l ->> 'label') like '%' || name || '%' $$;
create function pg_temp.uncosted_ids(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(u ->> 'id' order by u ->> 'id'), '{}') from jsonb_array_elements(j -> 'uncosted') u $$;
create function pg_temp.uncosted_qty(j jsonb, id text) returns numeric language sql immutable as $$
  select (u ->> 'qty')::numeric from jsonb_array_elements(j -> 'uncosted') u where u ->> 'id' = id $$;
create function pg_temp.uncosted_at(j jsonb, id text) returns bigint language sql immutable as $$
  select (u ->> 'at')::bigint from jsonb_array_elements(j -> 'uncosted') u where u ->> 'id' = id $$;
create function pg_temp.ids(variadic v text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(v) x $$;
create function pg_temp.t_ms() returns bigint language sql stable as $$ -- the cutover moment, as the books say it
  select (extract(epoch from now()) * 1000)::bigint $$;
create function pg_temp.at_ms(days numeric) returns bigint language sql stable as $$
  select ((extract(epoch from now()) + days * 86400) * 1000)::bigint $$;

-- ---- writers (the real owner RPCs)
create function pg_temp.mv(actor text, op text, sfx text, kind text, qty numeric, cost numeric, days numeric, reason text default '') returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_stock_movement(%L::jsonb)', jsonb_build_object(
    'id', md5('c4mv:' || op)::uuid::text, 'item_id', 'c4i-' || sfx, 'kind', kind, 'qty', qty, 'cost_cents', cost, 'supplier', '', 'reason', reason,
    'at', pg_temp.at_ms(days))::text), '00000');
end $$;
create function pg_temp.batch(actor text, op text, sfx text, qty numeric, days numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_production(%L::jsonb)', jsonb_build_object(
    'id', md5('c4pr:' || op)::uuid::text, 'kind', 'batch', 'product_id', 'c4p-' || sfx, 'qty', qty, 'target', qty, 'rejects', 0,
    'adj', '{}'::jsonb, 'recipe_version', 1, 'drop_no', 1, 'at', pg_temp.at_ms(days))::text), '00000');
end $$;
create function pg_temp.cor(actor text, op text, mv_op text, cents numeric, days numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_cost_correction(%L::jsonb)', jsonb_build_object(
    'id', md5('c4co:' || op)::uuid::text, 'movement_id', md5('c4mv:' || mv_op)::uuid::text, 'cost_cents', cents,
    'at', pg_temp.at_ms(days))::text), '00000');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'cutover_select', 'select * from public.books_cutover', '42501');
  perform pg_temp.expect(actor, 'cutover_insert', 'insert into public.books_cutover(item_id, qty) values (''c4i-a'', 1)', '42501');
  perform pg_temp.expect(actor, 'cutover_update', 'update public.books_cutover set qty = 0', '42501');
  perform pg_temp.expect(actor, 'cutover_delete', 'delete from public.books_cutover', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'cut_get_books', 'select public.get_books(now() - interval ''1 day'', now())', '42501');
  perform pg_temp.expect(actor, 'cut_set_cost_basis', 'select public.set_cost_basis(''used'')', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare j jsonb; p jsonb; st jsonb; j1 jsonb; p1 jsonb;
begin
  perform pg_temp.assert_ok(a, 'cut_table_has_no_api_grant_and_rls_on', pg_temp.table_closed());
  perform pg_temp.assert_ok(a, 'cut_no_cutover_before_the_first_choice', pg_temp.books() -> 'used_from' = 'null'::jsonb);
  -- choosing bought is not the first choice of used: it takes no cutover (the stale row of the old snapshot is still there)
  st := pg_temp.cut_state();
  perform pg_temp.expect(a, 'switch_first_bought', 'select public.set_cost_basis(''bought'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_bought_before_the_first_choice_takes_no_cutover',
    pg_temp.cut_state() = st and st -> 'used_from' = 'null'::jsonb and st -> 'used_from_seq' = 'null'::jsonb and st -> 'snapshot' = '{"c4i-a": 999}'::jsonb);

  -- ================================================ written before the cutover (the owner is on bought, the stock is received and used)
  perform pg_temp.mv(a, 'a_r', 'a', 'receipt', 100, 10000, -5);
  perform pg_temp.mv(a, 'p1_r', 'p1', 'receipt', 100, 10000, -5);
  perform pg_temp.batch(a, 'p1_u', 'p1', 40, -4);
  perform pg_temp.mv(a, 'p2_r', 'p2', 'receipt', 100, 10000, -5);
  perform pg_temp.batch(a, 'p2_u', 'p2', 100, -4);
  perform pg_temp.mv(a, 'c_r', 'c', 'receipt', 100, 10000, -5);
  perform pg_temp.mv(a, 'd_r', 'd', 'receipt', 100, 10000, -5);
  perform pg_temp.mv(a, 'd2_r', 'd2', 'receipt', 50, 5000, -5);
  perform pg_temp.mv(a, 'e_r', 'e', 'receipt', 100, 10000, -5);
  perform pg_temp.mv(a, 'g_r', 'g', 'receipt', 20, 2000, -5);
  perform pg_temp.mv(a, 'h_o', 'h', 'opening', 30, null, -5);
  perform pg_temp.mv(a, 'h2_o', 'h2', 'opening', 30, null, -5);
  perform pg_temp.mv(a, 'w_r', 'w', 'receipt', 50, 500, -5);
  perform pg_temp.mv(a, 'u_o', 'u', 'opening', 100, null, -5);
  perform pg_temp.batch(a, 'u_pre', 'u', 10, -3);

  -- the owner chooses used for the first time: the cutover is taken now, with what is on hand and the highest seq so far
  perform pg_temp.expect(a, 'switch_first_used', 'select public.set_cost_basis(''used'')', '00000');
  st := pg_temp.cut_state();
  perform pg_temp.assert_ok(a, 'cut_first_choice_takes_the_cutover_date', (st ->> 'used_from')::timestamptz = now());
  perform pg_temp.assert_ok(a, 'cut_books_report_the_cutover', pg_temp.books() ->> 'basis' = 'used' and (pg_temp.books() ->> 'used_from')::bigint = pg_temp.t_ms());
  perform pg_temp.assert_ok(a, 'cut_first_choice_takes_the_order_mark', (st ->> 'used_from_seq')::bigint = pg_temp.max_seq() and pg_temp.max_seq() > 0);
  perform pg_temp.assert_ok(a, 'cut_first_choice_takes_the_snapshot',
    st -> 'snapshot' = pg_temp.on_hand_now() and (st -> 'snapshot' ->> 'c4i-a')::numeric = 100 and (st -> 'snapshot' ->> 'c4i-p1')::numeric = 60
    and (st -> 'snapshot' ->> 'c4i-p2')::numeric = 0 and (st -> 'snapshot' ->> 'c4i-h')::numeric = 30 and (st -> 'snapshot' ->> 'c4i-b')::numeric = 0);
  -- at the cutover nothing is expensed but what the ledger says: seven deliveries, two plain costs
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_nothing_is_expensed_at_the_cutover',
    pg_temp.n(j, 'm:') = 0 and pg_temp.n(j, 'c:') = 0
    and pg_temp.sumk(j, 'expense') = 6 * 10000 + 5000 + 2000 + 500 + 2000 + 1500 and j -> 'uncosted' = '[]'::jsonb);

  -- ================================================ written after the cutover
  perform pg_temp.fixture($f$insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at)
    values (pg_temp.lg(3), 'cost', 'Supplies', 'C4 Late plain cost', -800, now() + interval '1 hour')$f$);
  -- P0-1: corrections of deliveries applied before the cutover, made after it
  perform pg_temp.cor(a, 'a_c', 'a_r', 5000, 1.0 / 24);
  perform pg_temp.cor(a, 'p1_c', 'p1_r', 5000, 1.0 / 24);
  perform pg_temp.cor(a, 'p2_c', 'p2_r', 6000, 1.0 / 24);
  -- P0-2: a delivery dated before the cutover but entered after it, then used
  perform pg_temp.mv(a, 'b_r', 'b', 'receipt', 100, 10000, -3);
  perform pg_temp.batch(a, 'b_u', 'b', 100, 1.0 / 24);
  -- P0-2 and P2-5: bakes dated before the cutover but synced after it
  perform pg_temp.batch(a, 'c_u1', 'c', 30, -2);
  perform pg_temp.batch(a, 'c_u2', 'c', 90, -1);
  -- P0-3: a count down, then a delivery and a waste; an adjustment down, then a delivery and a use
  perform pg_temp.mv(a, 'd_cnt', 'd', 'count', 40, null, 1.0 / 24);
  perform pg_temp.mv(a, 'd_r2', 'd', 'receipt', 100, 10000, 2.0 / 24);
  perform pg_temp.mv(a, 'd_w', 'd', 'waste', 140, null, 3.0 / 24, 'Dropped');
  perform pg_temp.mv(a, 'd2_adj', 'd2', 'adjust', -20, null, 1.0 / 24, 'Lost');
  perform pg_temp.mv(a, 'd2_r2', 'd2', 'receipt', 20, 2000, 2.0 / 24);
  perform pg_temp.batch(a, 'd2_u', 'd2', 40, 3.0 / 24);
  -- more than the stock: 100 on hand, 130 baked (30 short)
  perform pg_temp.batch(a, 'e_u', 'e', 130, 1.0 / 24);
  perform pg_temp.mv(a, 'f_r', 'f', 'receipt', 50, 5000, 0.5 / 24);
  perform pg_temp.batch(a, 'f_u', 'f', 50, 1.0 / 24);
  -- a delivery after the cutover at another cost than the snapshot's, used beyond the allowance: 20 + 80 at an average of 110
  perform pg_temp.mv(a, 'g_r2', 'g', 'receipt', 80, 9000, 1.0 / 24);
  perform pg_temp.batch(a, 'g_u', 'g', 100, 2.0 / 24);
  -- no cost known: a delivery of 40 with no price, then 50 used (30 covered): 20 uncosted; a use the allowance covers in full
  perform pg_temp.mv(a, 'h_r', 'h', 'receipt', 40, null, 1.0 / 24);
  perform pg_temp.batch(a, 'h_u', 'h', 50, 2.0 / 24);
  perform pg_temp.batch(a, 'h_late', 'h', 20, -1); -- sold a day before the cutover, synced after it: nothing left of the allowance, all 20 expensed
  perform pg_temp.batch(a, 'h2_u', 'h2', 20, 1.0 / 24);
  -- an opening counted after the cutover is an allowance: 40 in, 25 used, 25 used (15 taken, 10 short)
  perform pg_temp.mv(a, 'o_o', 'o', 'opening', 40, null, 1.0 / 24);
  perform pg_temp.batch(a, 'o_u1', 'o', 25, 2.0 / 24);
  perform pg_temp.batch(a, 'o_u2', 'o', 25, 3.0 / 24);
  -- the allowance goes to the first use written, not the first dated: 120 (dated later) is written first, then 80
  perform pg_temp.mv(a, 'w_r2', 'w', 'receipt', 200, 2000, 0.5 / 24);
  perform pg_temp.batch(a, 'w_a', 'w', 120, 2.0 / 24);
  perform pg_temp.batch(a, 'w_b', 'w', 80, 1.0 / 24);
  -- a delivery after the cutover, 40 used, then corrected (dated before the cutover): the share of stock used is the expense
  perform pg_temp.mv(a, 'k_r', 'k', 'receipt', 100, 10000, 1.0 / 24);
  perform pg_temp.batch(a, 'k_u', 'k', 40, 2.0 / 24);
  perform pg_temp.cor(a, 'k_c', 'k_r', 5000, -2);
  -- bakes with a line that names no stock item: one after the cutover, one dated before it and synced after, one that takes no stock at all
  perform pg_temp.batch(a, 'u_post', 'u', 10, 1.0 / 24);
  perform pg_temp.batch(a, 'u_late', 'u', 10, -3);
  perform pg_temp.batch(a, 'ug_post', 'ug', 10, 1.0 / 24);

  j := pg_temp.books();
  p := pg_temp.past();

  -- (1) stock applied by the cutover is not expensed again, whatever its date and whatever is done to it later
  perform pg_temp.assert_ok(a, 'cut_stock_applied_by_the_cutover_writes_nothing',
    not pg_temp.has(j, pg_temp.mu('p1_u', 'p1')) and not pg_temp.has(j, pg_temp.mu('p2_u', 'p2')) and not pg_temp.has(j, pg_temp.mu('u_pre', 'u'))
    and not (pg_temp.mu('u_pre', 'u') = any (pg_temp.uncosted_ids(j))) and not (pg_temp.pp('u_pre', 0) = any (pg_temp.uncosted_ids(j))));
  -- the past period is what it was at the cutover: the ledger, and nothing written after it
  perform pg_temp.assert_ok(a, 'cut_past_period_is_unchanged_by_what_follows',
    pg_temp.sumk(p, 'expense') = 6 * 10000 + 5000 + 2000 + 500 + 2000 + 1500 and pg_temp.n(p, 'm:') = 0 and pg_temp.n(p, 'c:') = 0
    and p -> 'uncosted' = '[]'::jsonb);

  -- (2) P0-1: a correction after the cutover of a delivery applied before it counts once, in full, on its own date, from its ledger line:
  -- alpha 10000 - 5000 = 5000 (all on hand: no share used); papa 10000 - 5000 = 5000 (40 of the 100 used: 2000 of the 5000 was cost used,
  -- and is not a second line); quebec 10000 - 4000 = 6000 (nothing on hand: all of the 4000 was cost used)
  perform pg_temp.assert_ok(a, 'cut_correction_of_an_earlier_delivery_counts_in_full',
    pg_temp.amt(j, pg_temp.cl('a_c')) = -5000 and pg_temp.amt(j, pg_temp.cl('p1_c')) = -5000 and pg_temp.amt(j, pg_temp.cl('p2_c')) = -4000
    and pg_temp.item_total(j, 'C4 Alpha') = 5000 and pg_temp.item_total(j, 'C4 Papa') = 5000 and pg_temp.item_total(j, 'C4 Quebec') = 6000);
  perform pg_temp.assert_ok(a, 'cut_correction_of_an_earlier_delivery_is_not_counted_twice',
    not pg_temp.has(j, pg_temp.cc('a_c')) and not pg_temp.has(j, pg_temp.cc('p1_c')) and not pg_temp.has(j, pg_temp.cc('p2_c')));
  perform pg_temp.assert_ok(a, 'cut_correction_is_dated_when_it_was_made',
    pg_temp.at_of(j, pg_temp.cl('p1_c')) = pg_temp.at_ms(1.0 / 24) and pg_temp.at_of(j, pg_temp.cl('p2_c')) = pg_temp.at_ms(1.0 / 24));

  -- (3) P0-2: bravo was dated three days before the cutover but entered after it: its ledger line is left out and the 100 used cost 10000,
  -- once; not in the past period
  perform pg_temp.assert_ok(a, 'cut_backdated_receipt_entered_after_is_expensed_once',
    not pg_temp.has(j, pg_temp.rl('b_r')) and pg_temp.amt(j, pg_temp.mu('b_u', 'b')) = 10000 and pg_temp.item_total(j, 'C4 Bravo') = 10000
    and not pg_temp.has(p, pg_temp.rl('b_r')));
  -- charlie: 100 on hand at the cutover, two sales dated before it and synced after: 30 covered, then 70 covered + 20 short expensed
  -- (2000), the ledger line of the delivery 10000: 12000, not 22000
  perform pg_temp.assert_ok(a, 'cut_offline_use_dated_before_the_cutover_is_drawn_from_the_allowance',
    not pg_temp.has(j, pg_temp.mu('c_u1', 'c')) and pg_temp.amt(j, pg_temp.mu('c_u2', 'c')) = 2000 and pg_temp.short(j, pg_temp.mu('c_u2', 'c')) = 20
    and pg_temp.item_total(j, 'C4 Charlie') = 12000);
  -- P2-5: that use is dated at the cutover, not the day it was sold (a period already reported)
  perform pg_temp.assert_ok(a, 'cut_late_use_is_dated_at_the_cutover',
    pg_temp.at_of(j, pg_temp.mu('c_u2', 'c')) = pg_temp.t_ms() and not pg_temp.has(p, pg_temp.mu('c_u2', 'c')));

  -- (4) P0-3: delta had 100 at the cutover; a count found 40 (60 gone), 100 more came, 140 were wasted: 40 covered, 100 at 100 = 10000.
  -- Its second delivery's ledger line is left out; the first (10000) counts: 20000 in all
  perform pg_temp.assert_ok(a, 'cut_stock_removed_by_a_count_is_no_allowance',
    pg_temp.amt(j, pg_temp.mm('d_w')) = 10000 and pg_temp.item_total(j, 'C4 Delta') = 20000
    and pg_temp.has(j, pg_temp.rl('d_r')) and not pg_temp.has(j, pg_temp.rl('d_r2')));
  -- dingo had 50; an adjustment down of 20 left 30 allowance; 20 more came; 40 used: 30 covered, 10 at 100 = 1000 (plus the delivery 5000)
  perform pg_temp.assert_ok(a, 'cut_stock_removed_by_an_adjustment_is_no_allowance',
    pg_temp.amt(j, pg_temp.mu('d2_u', 'd2')) = 1000 and pg_temp.item_total(j, 'C4 Dingo') = 6000 and not pg_temp.has(j, pg_temp.rl('d2_r2')));

  -- the allowance is drawn in seq order: whiskey has 50; the 120 written first takes it (70 x 10 = 700), then the 80 (800)
  perform pg_temp.assert_ok(a, 'cut_allowance_is_consumed_in_seq_order',
    pg_temp.amt(j, pg_temp.mu('w_a', 'w')) = 700 and pg_temp.amt(j, pg_temp.mu('w_b', 'w')) = 800 and pg_temp.item_total(j, 'C4 Whiskey') = 500 + 700 + 800);
  -- a delivery after the cutover used beyond the allowance is expensed at the cost stamped on the use (110, the average), not the delivery's price
  perform pg_temp.assert_ok(a, 'cut_use_beyond_the_allowance_is_expensed_in_part',
    pg_temp.amt(j, pg_temp.mu('g_u', 'g')) = 8800 and not pg_temp.has(j, pg_temp.rl('g_r2')) and pg_temp.item_total(j, 'C4 Golf') = 2000 + 8800);
  -- what was short was not in stock, so the allowance never covers it: 100 taken (all covered), 30 short at 100
  perform pg_temp.assert_ok(a, 'cut_short_part_is_expensed_with_allowance_left',
    pg_temp.amt(j, pg_temp.mu('e_u', 'e')) = 3000 and pg_temp.short(j, pg_temp.mu('e_u', 'e')) = 30 and pg_temp.item_total(j, 'C4 Echo') = 13000);
  -- a delivery after the cutover is expensed by its use alone
  perform pg_temp.assert_ok(a, 'cut_delivery_after_the_cutover_is_expensed_when_used',
    pg_temp.amt(j, pg_temp.mu('f_u', 'f')) = 5000 and not pg_temp.has(j, pg_temp.rl('f_r')) and pg_temp.item_total(j, 'C4 Foxtrot') = 5000);
  -- a correction of a delivery after the cutover is the share of stock used (60 of 100 on hand: 2000 of the 5000), dated no earlier than
  -- the cutover; neither the delivery's line nor the correction's own ledger line counts: 4000 - 2000 = 2000
  perform pg_temp.assert_ok(a, 'cut_correction_of_a_later_delivery_is_cost_used',
    pg_temp.amt(j, pg_temp.cc('k_c')) = -2000 and not pg_temp.has(j, pg_temp.rl('k_r')) and not pg_temp.has(j, pg_temp.cl('k_c'))
    and pg_temp.amt(j, pg_temp.mu('k_u', 'k')) = 4000 and pg_temp.item_total(j, 'C4 Kilo') = 2000 and pg_temp.n(j, 'c:') = 1);
  perform pg_temp.assert_ok(a, 'cut_correction_is_never_dated_before_the_cutover',
    pg_temp.at_of(j, pg_temp.cc('k_c')) = pg_temp.t_ms() and not pg_temp.has(p, pg_temp.cc('k_c')));

  -- uncosted: exactly the uses and wastes after the cutover with part expensed and no cost, with the quantity expensed (hotel 20 and 20, oscar 10),
  -- and the bakes' lines that could not be taken at all, for the bakes after the cutover (dated at the cutover when they were dated before)
  perform pg_temp.assert_ok(a, 'cut_uncosted_lists_only_what_was_expensed',
    pg_temp.uncosted_ids(j) = pg_temp.ids(pg_temp.mu('h_u', 'h'), pg_temp.mu('h_late', 'h'), pg_temp.mu('o_u2', 'o'), pg_temp.pp('u_post', 0), pg_temp.pp('u_late', 0),
                                          pg_temp.pp('ug_post', 0))
    and pg_temp.uncosted_qty(j, pg_temp.mu('h_u', 'h')) = 20 and pg_temp.uncosted_qty(j, pg_temp.mu('h_late', 'h')) = 20 and pg_temp.uncosted_qty(j, pg_temp.mu('o_u2', 'o')) = 10
    and jsonb_array_length(j -> 'uncosted') = 6);
  perform pg_temp.assert_ok(a, 'cut_uncosted_leaves_out_what_the_allowance_covered',
    not pg_temp.has(j, pg_temp.mu('h_u', 'h')) and not pg_temp.has(j, pg_temp.mu('h2_u', 'h2')) and not pg_temp.has(j, pg_temp.mu('o_u1', 'o'))
    and not (pg_temp.mu('h2_u', 'h2') = any (pg_temp.uncosted_ids(j))) and not (pg_temp.mu('o_u1', 'o') = any (pg_temp.uncosted_ids(j))));
  perform pg_temp.assert_ok(a, 'cut_uncosted_bake_is_dated_no_earlier_than_the_cutover',
    pg_temp.uncosted_at(j, pg_temp.pp('u_late', 0)) = pg_temp.t_ms() and pg_temp.uncosted_at(j, pg_temp.pp('u_post', 0)) = pg_temp.at_ms(1.0 / 24)
    and pg_temp.uncosted_at(j, pg_temp.mu('h_late', 'h')) = pg_temp.t_ms() and pg_temp.uncosted_at(j, pg_temp.mu('h_u', 'h')) = pg_temp.at_ms(2.0 / 24));
  perform pg_temp.assert_ok(a, 'cut_uncosted_bake_that_took_no_stock_is_listed', pg_temp.pp('ug_post', 0) = any (pg_temp.uncosted_ids(j)));

  -- the whole book: plain costs 2000 + 1500 + 800, alpha 5000, papa 5000, quebec 6000, charlie 12000, bravo 10000, delta 20000, dingo 6000,
  -- echo 13000, foxtrot 5000, golf 10800, whiskey 2000, kilo 2000
  perform pg_temp.assert_ok(a, 'cut_total_expense',
    pg_temp.sumk(j, 'expense') = 2000 + 1500 + 800 + 5000 + 5000 + 6000 + 12000 + 10000 + 20000 + 6000 + 13000 + 5000 + 10800 + 2000 + 2000);
  -- a plain cost linked to no stock counts whenever it is dated
  perform pg_temp.assert_ok(a, 'cut_plain_costs_count_before_and_after',
    pg_temp.amt(j, 'l:' || pg_temp.lg(1)) = 2000 and pg_temp.amt(j, 'l:' || pg_temp.lg(2)) = 1500 and pg_temp.amt(j, 'l:' || pg_temp.lg(3)) = 800);

  -- a database that was never switched (no order mark) costs the stock used as it did before the cutover: no allowance, every line of a
  -- delivery left out, every correction's share used. Charlie: 30 + 90 (70 taken, 20 short) at 100 = 12000; papa: 40 at 100 less 2000 = 2000
  st := pg_temp.cut_state();
  perform pg_temp.fixture('update public.books_settings set used_from = null, used_from_seq = null where id');
  j1 := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_none_means_no_cutover_lines',
    j1 -> 'used_from' = 'null'::jsonb and pg_temp.item_total(j1, 'C4 Charlie') = 12000 and pg_temp.item_total(j1, 'C4 Papa') = 4000 - 2000
    and pg_temp.amt(j1, pg_temp.mu('p1_u', 'p1')) = 4000 and pg_temp.amt(j1, pg_temp.cc('p1_c')) = -2000 and not pg_temp.has(j1, pg_temp.rl('p1_r')));
  perform pg_temp.assert_ok(a, 'cut_none_means_no_cutover_uncosted',
    pg_temp.uncosted_qty(j1, pg_temp.mu('h2_u', 'h2')) = 20 and pg_temp.pp('u_pre', 0) = any (pg_temp.uncosted_ids(j1))
    and pg_temp.uncosted_at(j1, pg_temp.pp('u_late', 0)) = pg_temp.at_ms(-3));
  perform pg_temp.fixture(format('update public.books_settings set used_from = %L, used_from_seq = %s where id', st ->> 'used_from', st ->> 'used_from_seq'));
  perform pg_temp.assert_ok(a, 'cut_cutover_restored_for_the_rest', pg_temp.cut_state() = st and pg_temp.books() = j);

  -- ================================================ the basis after the first choice: the cutover is taken once
  j1 := pg_temp.books();
  p1 := pg_temp.past();
  perform pg_temp.expect(a, 'switch_used_to_used', 'select public.set_cost_basis(''used'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_used_to_used_keeps_the_cutover', pg_temp.cut_state() = st);
  perform pg_temp.expect(a, 'switch_used_to_bought', 'select public.set_cost_basis(''bought'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_used_to_bought_keeps_the_cutover', pg_temp.cut_state() = st);
  -- bought: every ledger line counts, no stock used. Plain 4300; deliveries 6 x 10000 + 5000 + 2000 + 500 before, 10000 (bravo) + 10000
  -- (delta) + 2000 (dingo) + 5000 (foxtrot) + 9000 (golf) + 2000 (whiskey) + 10000 (kilo) after; corrections -5000, -5000, -4000, -5000
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_bought_counts_every_ledger_line_and_no_stock_used',
    j ->> 'basis' = 'bought' and (j ->> 'used_from')::bigint = pg_temp.t_ms() and pg_temp.n(j, 'm:') = 0 and pg_temp.n(j, 'c:') = 0
    and pg_temp.sumk(j, 'expense') = 4300 + (60000 + 5000 + 2000 + 500) + (10000 + 10000 + 2000 + 5000 + 9000 + 2000 + 10000) - (5000 + 5000 + 4000 + 5000));
  perform pg_temp.expect(a, 'switch_bought_to_bought', 'select public.set_cost_basis(''bought'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_bought_to_bought_keeps_the_cutover', pg_temp.cut_state() = st);
  -- P2-4: back to used: the first cutover stands. The months between the two switches read as they did: nothing is re-read as bought
  perform pg_temp.fixture('update public.inventory_items set on_hand = 123.5 where id = ''c4i-k''');
  perform pg_temp.expect(a, 'switch_bought_to_used', 'select public.set_cost_basis(''used'')', '00000');
  perform pg_temp.assert_ok(a, 'cut_second_switch_keeps_the_first_cutover', pg_temp.cut_state() = st);
  perform pg_temp.assert_ok(a, 'cut_second_switch_keeps_the_months_between', pg_temp.books() = j1 and pg_temp.past() = p1);
  perform pg_temp.fixture('update public.inventory_items set on_hand = 0 where id = ''c4i-k''');
end $$;

grant execute on function
  pg_temp.fixture(text), pg_temp.cut_state(), pg_temp.max_seq(), pg_temp.on_hand_now(), pg_temp.table_closed(),
  pg_temp.rl(text), pg_temp.cl(text), pg_temp.cc(text), pg_temp.mm(text), pg_temp.mu(text, text), pg_temp.pp(text, integer), pg_temp.lg(integer),
  pg_temp.books(), pg_temp.past(), pg_temp.sumk(jsonb, text), pg_temp.has(jsonb, text), pg_temp.amt(jsonb, text), pg_temp.at_of(jsonb, text),
  pg_temp.short(jsonb, text), pg_temp.n(jsonb, text), pg_temp.item_total(jsonb, text), pg_temp.uncosted_ids(jsonb), pg_temp.uncosted_qty(jsonb, text),
  pg_temp.uncosted_at(jsonb, text), pg_temp.ids(text[]), pg_temp.t_ms(), pg_temp.at_ms(numeric),
  pg_temp.mv(text, text, text, text, numeric, numeric, numeric, text), pg_temp.batch(text, text, text, numeric, numeric),
  pg_temp.cor(text, text, text, numeric, numeric),
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.assert_table(text), pg_temp.assert_refused(text), pg_temp.phase_owner(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

set local role anon;
select pg_temp.set_subject(null, 'anon');
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
