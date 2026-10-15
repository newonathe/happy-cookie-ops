-- B3b cost cutover (migration 20260101006100) with real SQL roles; all data rolls back.
--
-- "When used" starts from a cutover date: stock bought before the opening count is already an expense in the historical ledger lines, so
-- get_books expenses the stock used only from books_settings.used_from, and what was on hand at the cutover (books_cutover, plus any opening
-- count after it) is an allowance that uses consume in seq order before anything is expensed. set_cost_basis takes a new cutover only on a
-- switch from bought to used. The new table has no API grant. The harness changes the redefined functions in one place at a time
-- (scripts/test-db-security.py, CUTOVER_MUTATIONS) and requires the named case here to fail. Outcome messages carry no quote character:
-- the harness redacts quoted literals.
--
-- The fixture (the cutover T is 10 days ago; d(n) is n days ago; every cost is a stamp in centavos per unit):
--   sugar  snapshot 100: receipt d(20) with its ledger line; use 10 d(12) (before T); use 30 d(5); use 20 d(4) with no cost; use 60 d(3)
--          (50 covered, 10 expensed at 5 = 50); use 5 d(2) with no cost (the allowance is gone: listed as uncosted)
--   butter snapshot 50: receipt d(8) with its ledger line; use 120 d(6) at 10 (50 covered: 70 x 10); then a use of 80 dated d(7) but written
--          after it, at 12 (the allowance is gone in seq order: 960; in date order it would have covered 50 first); waste 10 at 10 = 100
--   short  snapshot 100: use 30 with 20 short at 10 (the 30 covered, the 20 never: 200); a use of nothing with 5 short and no cost (uncosted)
--   open   snapshot 0: an opening count of 15 before T (not an allowance), one of 40 after it; uses of 25 and 25 at 8 (15 covered: 10 x 8 = 80)
--   edge   snapshot 0: a use of 7 at 4 one microsecond before T (not expensed) and one exactly at T (28)
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

create function pg_temp.mid(n integer) returns uuid language sql immutable as $$
  select ('c4b00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.lid(n integer) returns uuid language sql immutable as $$
  select ('c4a00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.cid(n integer) returns uuid language sql immutable as $$
  select ('c4d00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('c4e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.hash(n integer) returns text language sql immutable as $$
  select lpad(to_hex(n), 64, '0') $$;
create function pg_temp.d(n numeric) returns timestamptz language sql stable as $$
  select now() - make_interval(secs => n * 86400) $$;

insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('c4i-sugar', 'C4 Sugar', 'g', 'Ingredients', true, 60),
  ('c4i-butter', 'C4 Butter', 'g', 'Ingredients', true, 300),
  ('c4i-short', 'C4 Short', 'g', 'Ingredients', true, 50),
  ('c4i-open', 'C4 Open', 'g', 'Ingredients', true, 15),
  ('c4i-edge', 'C4 Edge', 'g', 'Ingredients', true, 0);

-- The books: costs of the deliveries (linked to them), a plain cost before and one after the cutover, and the corrections' own entries.
insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
  (pg_temp.lid(1), 'cost', 'Ingredients', 'C4 Sugar delivery', -5000, pg_temp.d(20)),
  (pg_temp.lid(2), 'cost', 'Ingredients', 'C4 Butter delivery', -5000, pg_temp.d(8)),
  (pg_temp.lid(3), 'cost', 'Rent', 'C4 Rent', -2000, pg_temp.d(15)),
  (pg_temp.lid(4), 'cost', 'Helper wages', 'C4 Wages', -1500, pg_temp.d(7)),
  (pg_temp.lid(5), 'adjustment', 'Ingredients', 'C4 Correction of the butter delivery', -300, pg_temp.d(2)),
  (pg_temp.lid(6), 'adjustment', 'Ingredients', 'C4 Correction of the sugar delivery', -400, pg_temp.d(2));

-- Stock, in seq order (the order the rows are written). unit_cost and cost_source go together; a receipt carries its cost and its ledger line.
insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, reason, at, ledger_id, payload_hash, unit_cost, cost_source, short_qty) values
  (pg_temp.mid(1), 'c4i-sugar', 'receipt', 100, 5000, '', pg_temp.d(20), pg_temp.lid(1), pg_temp.hash(1), null, null, 0),
  (pg_temp.mid(2), 'c4i-sugar', 'use', -10, null, 'Baked', pg_temp.d(12), null, pg_temp.hash(2), 5, 'average', 0),
  (pg_temp.mid(3), 'c4i-sugar', 'use', -30, null, 'Baked', pg_temp.d(5), null, pg_temp.hash(3), 5, 'average', 0),
  (pg_temp.mid(4), 'c4i-sugar', 'use', -20, null, 'Baked', pg_temp.d(4), null, pg_temp.hash(4), null, null, 0),
  (pg_temp.mid(5), 'c4i-sugar', 'use', -60, null, 'Baked', pg_temp.d(3), null, pg_temp.hash(5), 5, 'average', 0),
  (pg_temp.mid(6), 'c4i-sugar', 'use', -5, null, 'Baked', pg_temp.d(2), null, pg_temp.hash(6), null, null, 0),
  (pg_temp.mid(11), 'c4i-butter', 'receipt', 500, 5000, '', pg_temp.d(8), pg_temp.lid(2), pg_temp.hash(11), null, null, 0),
  (pg_temp.mid(12), 'c4i-butter', 'use', -120, null, 'Baked', pg_temp.d(6), null, pg_temp.hash(12), 10, 'average', 0),
  (pg_temp.mid(13), 'c4i-butter', 'use', -80, null, 'Baked', pg_temp.d(7), null, pg_temp.hash(13), 12, 'average', 0),
  (pg_temp.mid(14), 'c4i-butter', 'waste', -10, null, 'Dropped', pg_temp.d(4), null, pg_temp.hash(14), 10, 'average', 0),
  (pg_temp.mid(15), 'c4i-butter', 'use', -10, null, 'Baked', pg_temp.d(12), null, pg_temp.hash(15), null, null, 0),
  (pg_temp.mid(21), 'c4i-short', 'use', -30, null, 'Baked', pg_temp.d(5), null, pg_temp.hash(21), 10, 'average', 20),
  (pg_temp.mid(22), 'c4i-short', 'use', 0, null, 'Baked', pg_temp.d(4), null, pg_temp.hash(22), null, null, 5),
  (pg_temp.mid(31), 'c4i-open', 'opening', 15, null, '', pg_temp.d(11), null, pg_temp.hash(31), null, null, 0),
  (pg_temp.mid(32), 'c4i-open', 'opening', 40, null, '', pg_temp.d(7), null, pg_temp.hash(32), null, null, 0),
  (pg_temp.mid(33), 'c4i-open', 'use', -25, null, 'Baked', pg_temp.d(6), null, pg_temp.hash(33), 8, 'average', 0),
  (pg_temp.mid(34), 'c4i-open', 'use', -25, null, 'Baked', pg_temp.d(5), null, pg_temp.hash(34), 8, 'average', 0),
  (pg_temp.mid(41), 'c4i-edge', 'use', -7, null, 'Baked', pg_temp.d(10) - interval '1 microsecond', null, pg_temp.hash(41), 4, 'average', 0),
  (pg_temp.mid(42), 'c4i-edge', 'use', -7, null, 'Baked', pg_temp.d(10), null, pg_temp.hash(42), 4, 'average', 0);

-- Two corrections (their used_cents are what the correction function worked out): one of a delivery after the cutover, one before it.
insert into public.stock_cost_corrections(id, movement_id, cost_cents, ledger_id, at, payload_hash, used_cents) values
  (pg_temp.cid(1), pg_temp.mid(11), 4700, pg_temp.lid(5), pg_temp.d(2), pg_temp.hash(101), 300),
  (pg_temp.cid(2), pg_temp.mid(1), 4600, pg_temp.lid(6), pg_temp.d(2), pg_temp.hash(102), 400);

-- Two production lines that could not be taken: one before the cutover, one after.
insert into public.production_records(id, kind, qty, short, at, payload_hash) values
  (pg_temp.pid(1), 'dough', 0, '[{"name": "C4 Old", "by": 3, "unit": "g", "why": "no stock"}]'::jsonb, pg_temp.d(12), pg_temp.hash(201)),
  (pg_temp.pid(2), 'dough', 0, '[{"name": "C4 New", "by": 4, "unit": "g", "why": "no stock"}]'::jsonb, pg_temp.d(3), pg_temp.hash(202));

-- The books are on "used" with the cutover 10 days ago and what was on hand then.
update public.books_settings set cost_basis = 'used', used_from = pg_temp.d(10) where id;
delete from public.books_cutover;
insert into public.books_cutover(item_id, qty) values
  ('c4i-sugar', 100), ('c4i-butter', 50), ('c4i-short', 100), ('c4i-open', 0), ('c4i-edge', 0);

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

-- What the fixture owner sees and changes (an API role can read none of these tables).
create function pg_temp.cut_state() returns jsonb language sql stable security definer as $$
  select jsonb_build_object('used_from', (select b.used_from from public.books_settings b where b.id),
    'snapshot', coalesce((select jsonb_object_agg(c.item_id, c.qty) from public.books_cutover c), '{}'::jsonb)) $$;
create function pg_temp.on_hand_now() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_object_agg(i.id, greatest(i.on_hand, 0)), '{}'::jsonb) from public.inventory_items i $$;
create function pg_temp.fixture(statement text) returns void language plpgsql security definer as $$
begin
  execute statement;
end $$;
create function pg_temp.table_closed() returns boolean language plpgsql stable security definer as $$
begin
  return not has_table_privilege('anon', 'public.books_cutover', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     and not has_table_privilege('authenticated', 'public.books_cutover', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     and (select c.relrowsecurity from pg_class c where c.oid = 'public.books_cutover'::regclass);
end $$;

create function pg_temp.books() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '30 days', now() + interval '1 day') $$;
create function pg_temp.before_cutover() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '30 days', pg_temp.d(10)) $$;
create function pg_temp.sumk(j jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'kind' = k $$;
create function pg_temp.has(j jsonb, id text) returns boolean language sql immutable as $$
  select exists (select 1 from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = id) $$;
create function pg_temp.amt(j jsonb, id text) returns bigint language sql immutable as $$
  select (l ->> 'amount_cents')::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = id $$;
create function pg_temp.short(j jsonb, id text) returns numeric language sql immutable as $$
  select (l ->> 'short_qty')::numeric from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = id $$;
create function pg_temp.n(j jsonb, prefix text) returns integer language sql immutable as $$
  select count(*)::integer from jsonb_array_elements(j -> 'lines') l where l ->> 'id' like prefix || '%' $$;
create function pg_temp.uncosted_ids(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(u ->> 'id' order by u ->> 'id'), '{}') from jsonb_array_elements(j -> 'uncosted') u $$;
create function pg_temp.uncosted_qty(j jsonb, id text) returns numeric language sql immutable as $$
  select (u ->> 'qty')::numeric from jsonb_array_elements(j -> 'uncosted') u where u ->> 'id' = id $$;
create function pg_temp.t_ms() returns bigint language sql stable as $$
  select (extract(epoch from pg_temp.d(10)) * 1000)::bigint $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'cutover_select', 'select * from public.books_cutover', '42501');
  perform pg_temp.expect(actor, 'cutover_insert', 'insert into public.books_cutover(item_id, qty) values (''c4i-sugar'', 1)', '42501');
  perform pg_temp.expect(actor, 'cutover_update', 'update public.books_cutover set qty = 0', '42501');
  perform pg_temp.expect(actor, 'cutover_delete', 'delete from public.books_cutover', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'cut_get_books', 'select public.get_books(now() - interval ''1 day'', now())', '42501');
  perform pg_temp.expect(actor, 'cut_set_cost_basis', 'select public.set_cost_basis(''used'')', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare j jsonb; p jsonb; state0 jsonb;
begin
  perform pg_temp.assert_ok(a, 'cut_table_has_no_api_grant_and_rls_on', pg_temp.table_closed());

  -- the books say where "when used" starts
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_books_report_the_cutover', j ->> 'basis' = 'used' and (j ->> 'used_from')::bigint = pg_temp.t_ms());

  -- a period before the cutover is what it was on "bought": the receipts' own ledger lines, and no stock used
  p := pg_temp.before_cutover();
  perform pg_temp.assert_ok(a, 'cut_past_period_counts_the_ledger',
    pg_temp.sumk(p, 'expense') = 5000 + 2000 and pg_temp.has(p, 'l:' || pg_temp.lid(1)) and pg_temp.has(p, 'l:' || pg_temp.lid(3)));
  perform pg_temp.assert_ok(a, 'cut_past_period_has_no_stock_used', pg_temp.n(p, 'm:') = 0 and pg_temp.n(p, 'c:') = 0);

  -- from the cutover on, a delivery's ledger line is left out (the stock is expensed when used); a plain cost and what is linked to nothing stay
  perform pg_temp.assert_ok(a, 'cut_later_ledger_follows_the_used_rule',
    pg_temp.has(j, 'l:' || pg_temp.lid(1)) and pg_temp.has(j, 'l:' || pg_temp.lid(3)) and pg_temp.has(j, 'l:' || pg_temp.lid(4))
    and not pg_temp.has(j, 'l:' || pg_temp.lid(2)) and not pg_temp.has(j, 'l:' || pg_temp.lid(5)) and not pg_temp.has(j, 'l:' || pg_temp.lid(6)));

  -- (i) stock on hand at the cutover, then used: already an expense, so no line, and not uncosted
  perform pg_temp.assert_ok(a, 'cut_stock_on_hand_at_the_cutover_is_not_expensed_again',
    not pg_temp.has(j, 'm:' || pg_temp.mid(3)) and not pg_temp.has(j, 'm:' || pg_temp.mid(4))
    and not pg_temp.has(j, 'm:' || pg_temp.mid(2)) and not pg_temp.has(j, 'm:' || pg_temp.mid(15)));
  perform pg_temp.assert_ok(a, 'cut_covered_use_with_no_cost_is_not_uncosted', not ('m:' || pg_temp.mid(4) = any (pg_temp.uncosted_ids(j))));
  -- (ii) the part beyond the allowance is expensed at the stamped cost: 60 used, 50 left of the allowance, 10 x 5
  perform pg_temp.assert_ok(a, 'cut_use_beyond_the_snapshot_is_expensed_in_part', pg_temp.amt(j, 'm:' || pg_temp.mid(5)) = 50);
  -- a delivery after the cutover is used in seq order: the allowance goes to the first use written, not the first dated
  perform pg_temp.assert_ok(a, 'cut_allowance_is_consumed_in_seq_order',
    pg_temp.amt(j, 'm:' || pg_temp.mid(12)) = 700 and pg_temp.amt(j, 'm:' || pg_temp.mid(13)) = 960 and pg_temp.amt(j, 'm:' || pg_temp.mid(14)) = 100);
  -- (iv) what was short was not in stock, so the allowance never covers it
  perform pg_temp.assert_ok(a, 'cut_short_part_is_expensed_with_allowance_left',
    pg_temp.amt(j, 'm:' || pg_temp.mid(21)) = 200 and pg_temp.short(j, 'm:' || pg_temp.mid(21)) = 20);
  -- an opening count after the cutover adds to the allowance; one before it does not (it is in the snapshot)
  perform pg_temp.assert_ok(a, 'cut_opening_after_the_cutover_adds_to_the_allowance',
    pg_temp.amt(j, 'm:' || pg_temp.mid(34)) = 80 and not pg_temp.has(j, 'm:' || pg_temp.mid(33)));
  -- a use exactly at the cutover moment is stock used from the cutover
  perform pg_temp.assert_ok(a, 'cut_the_cutover_moment_counts_as_used',
    pg_temp.amt(j, 'm:' || pg_temp.mid(42)) = 28 and not pg_temp.has(j, 'm:' || pg_temp.mid(41)));
  -- the correction of a delivery after the cutover is cost already used; the correction of an earlier delivery is not (it was expensed
  -- through its ledger line)
  perform pg_temp.assert_ok(a, 'cut_correction_of_a_later_delivery_counts',
    pg_temp.n(j, 'c:') = 1 and pg_temp.amt(j, 'c:' || pg_temp.cid(1)) = 300);
  perform pg_temp.assert_ok(a, 'cut_correction_of_an_earlier_delivery_does_not', not pg_temp.has(j, 'c:' || pg_temp.cid(2)));
  perform pg_temp.assert_ok(a, 'cut_total_expense',
    pg_temp.sumk(j, 'expense') = (5000 + 2000 + 1500) + (50 + 700 + 960 + 100 + 200 + 80 + 28) + 300);
  -- uncosted: only what was expensed and has no cost, with the expensed quantity; production lines only from the cutover
  perform pg_temp.assert_ok(a, 'cut_uncosted_lists_only_what_was_expensed',
    pg_temp.uncosted_ids(j) = (select array_agg(x order by x) from unnest(array['m:' || pg_temp.mid(22), 'm:' || pg_temp.mid(6), 'p:' || pg_temp.pid(2) || ':0']) x)
    and pg_temp.uncosted_qty(j, 'm:' || pg_temp.mid(6)) = 5 and pg_temp.uncosted_qty(j, 'm:' || pg_temp.mid(22)) = 5
    and jsonb_array_length(j -> 'uncosted') = 3);
  perform pg_temp.assert_ok(a, 'cut_uncosted_leaves_out_what_the_allowance_covered',
    not ('m:' || pg_temp.mid(15) = any (pg_temp.uncosted_ids(j))) and not ('p:' || pg_temp.pid(1) || ':0' = any (pg_temp.uncosted_ids(j))));

  -- a database whose setting was never switched (no cutover) costs the stock used as it always did
  perform pg_temp.fixture('update public.books_settings set used_from = null where id');
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_none_means_no_cutover_lines',
    j -> 'used_from' = 'null'::jsonb
    and pg_temp.sumk(j, 'expense') = (2000 + 1500)
      + (50 + 150 + 300) + (1200 + 960 + 100) + 500 + (200 + 200) + (28 + 28) + (300 + 400));
  perform pg_temp.assert_ok(a, 'cut_none_means_no_cutover_uncosted', jsonb_array_length(j -> 'uncosted') = 6);
  perform pg_temp.fixture('update public.books_settings set used_from = pg_temp.d(10) where id');
  perform pg_temp.assert_ok(a, 'cut_cutover_restored_for_the_rest', pg_temp.sumk(pg_temp.books(), 'expense') = 10918);

  -- (v) the cutover is taken on a switch from bought to used, and only then
  state0 := pg_temp.cut_state();
  perform pg_temp.expect(a, 'switch_used_to_used', 'select public.set_cost_basis(''used'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_used_to_used_keeps_the_cutover', pg_temp.cut_state() = state0);
  perform pg_temp.expect(a, 'switch_used_to_bought', 'select public.set_cost_basis(''bought'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_used_to_bought_keeps_the_cutover', pg_temp.cut_state() = state0);
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_bought_counts_every_ledger_line_and_no_stock_used',
    j ->> 'basis' = 'bought' and (j ->> 'used_from')::bigint = pg_temp.t_ms() and pg_temp.n(j, 'm:') = 0 and pg_temp.n(j, 'c:') = 0
    and pg_temp.sumk(j, 'expense') = 5000 + 5000 + 2000 + 1500 + 300 + 400);
  perform pg_temp.expect(a, 'switch_bought_to_bought', 'select public.set_cost_basis(''bought'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_bought_to_bought_keeps_the_cutover', pg_temp.cut_state() = state0);

  -- what is on hand when the owner switches back is the new allowance; the old snapshot is replaced, not added to
  perform pg_temp.fixture('update public.inventory_items set on_hand = 123.5 where id = ''c4i-butter''');
  perform pg_temp.fixture('update public.inventory_items set on_hand = 0 where id = ''c4i-sugar''');
  perform pg_temp.fixture('insert into public.inventory_items(id, name, unit, category, active, on_hand) values (''c4i-new'', ''C4 New'', ''g'', ''Ingredients'', true, 7)');
  perform pg_temp.expect(a, 'switch_bought_to_used', 'select public.set_cost_basis(''used'')', '00000');
  perform pg_temp.assert_ok(a, 'basis_bought_to_used_takes_a_new_cutover_date', (pg_temp.cut_state() ->> 'used_from')::timestamptz = now());
  perform pg_temp.assert_ok(a, 'basis_bought_to_used_replaces_the_snapshot',
    pg_temp.cut_state() -> 'snapshot' = pg_temp.on_hand_now() and (select count(*) from jsonb_object_keys(pg_temp.cut_state() -> 'snapshot')) = 6
    and (pg_temp.cut_state() -> 'snapshot' ->> 'c4i-butter')::numeric = 123.5);
  -- everything written so far is now before the cutover: the past is what it was on "bought"
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_new_cutover_makes_the_past_bought',
    pg_temp.n(j, 'm:') = 0 and pg_temp.n(j, 'c:') = 0 and pg_temp.sumk(j, 'expense') = 5000 + 5000 + 2000 + 1500 + 300 + 400
    and j -> 'uncosted' = '[]'::jsonb);
  -- and what is used from now on draws on the new snapshot: butter (123.5 on hand) is covered, the new item (7) only in part (10 used)
  perform pg_temp.fixture($f$insert into public.stock_movements(id, item_id, kind, qty_delta, reason, at, payload_hash, unit_cost, cost_source)
    values (pg_temp.mid(51), 'c4i-butter', 'use', -10, 'Baked', now(), pg_temp.hash(51), 10, 'average'),
           (pg_temp.mid(52), 'c4i-new', 'use', -10, 'Baked', now(), pg_temp.hash(52), 6, 'average')$f$);
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'cut_new_snapshot_is_the_allowance',
    not pg_temp.has(j, 'm:' || pg_temp.mid(51)) and pg_temp.amt(j, 'm:' || pg_temp.mid(52)) = 18 and pg_temp.n(j, 'm:') = 1);
end $$;

grant execute on function
  pg_temp.mid(integer), pg_temp.lid(integer), pg_temp.cid(integer), pg_temp.pid(integer), pg_temp.hash(integer), pg_temp.d(numeric),
  pg_temp.cut_state(), pg_temp.on_hand_now(), pg_temp.fixture(text), pg_temp.table_closed(),
  pg_temp.books(), pg_temp.before_cutover(), pg_temp.sumk(jsonb, text), pg_temp.has(jsonb, text), pg_temp.amt(jsonb, text),
  pg_temp.short(jsonb, text), pg_temp.n(jsonb, text), pg_temp.uncosted_ids(jsonb), pg_temp.uncosted_qty(jsonb, text), pg_temp.t_ms(),
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
