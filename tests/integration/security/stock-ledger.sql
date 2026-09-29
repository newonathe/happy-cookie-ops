-- C1 stock ledger with real SQL roles; all data rolls back.
--
-- record_stock_movement / get_last_paid: the active owner only (a helper, support, an inactive owner and anon are all refused;
-- anon does not even hold EXECUTE; the movements table has no API grant). The harness neutralises each `-- rule:` line of
-- supabase/migrations/20260101004600_stock_ledger.sql in turn (scripts/test-db-security.py, LEDGER_MUTATIONS) and requires the
-- named case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('c1c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('c1c00000-0000-4000-8000-000000000001', 'owner', 'Ledger owner', true),
  ('c1c00000-0000-4000-8000-000000000002', 'helper', 'Ledger helper', true),
  ('c1c00000-0000-4000-8000-000000000003', 'support', 'Ledger support', true),
  ('c1c00000-0000-4000-8000-000000000004', 'owner', 'Ledger inactive owner', false);
insert into public.inventory_items(id, name, unit, category, active) values
  ('c1i-flour', 'C1 Flour', 'g', 'Ingredients', true),
  ('c1i-box', 'C1 Box', 'pcs', 'Packaging', true),
  ('c1i-off', 'C1 Off', 'g', 'Ingredients', false),
  ('c1i-count', 'C1 Count', 'g', 'Ingredients', true),
  ('c1i-waste', 'C1 Waste', 'g', 'Ingredients', true),
  ('c1i-adj', 'C1 Adjust', 'g', 'Ingredients', true);

-- Reads the books as the fixture owner (an API role cannot read them): how many cost entries a receipt wrote.
create function pg_temp.book_total(cat text) returns bigint language sql security definer as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.ledger_entries where kind = 'cost' and category = cat $$;
create function pg_temp.book_rows(cat text) returns bigint language sql security definer as $$
  select count(*) from public.ledger_entries where kind = 'cost' and category = cat $$;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'c1c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'ledger outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'ledger check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- A valid movement body: number n gives its id; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.mid(n integer) returns text language sql immutable as $$
  select 'c1a00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.mv(n integer, item text, kind text, qty numeric, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', pg_temp.mid(n), 'item_id', item, 'kind', kind, 'qty', qty, 'cost_cents', null,
    'supplier', '', 'reason', case when kind in ('waste', 'adjust') then 'because' else '' end,
    'at', (extract(epoch from now()) * 1000)::bigint) || over) - dropkeys $$;
create function pg_temp.rec(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_stock_movement(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.on_hand(item text) returns numeric language sql stable security definer as $$
  select on_hand from public.inventory_items where id = item $$;
create function pg_temp.deltas(item text) returns numeric[] language sql stable security definer as $$
  select array_agg(qty_delta order by id) from public.stock_movements where item_id = item $$;
create function pg_temp.moves(item text) returns bigint language sql stable security definer as $$
  select count(*) from public.stock_movements where item_id = item $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['record_stock_movement(jsonb)', 'get_last_paid()'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden ledger call succeeded: anon / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'ledger_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'movements_select', 'select * from public.stock_movements', '42501');
  perform pg_temp.expect(actor, 'movements_insert',
    'insert into public.stock_movements(id, item_id, kind, qty_delta, at, payload_hash) values (gen_random_uuid(), ''c1i-flour'', ''count'', 1, now(), repeat(''a'', 64))', '42501');
  perform pg_temp.expect(actor, 'movements_update', 'update public.stock_movements set qty_delta = 1', '42501');
  perform pg_temp.expect(actor, 'movements_delete', 'delete from public.stock_movements', '42501');
  perform pg_temp.expect(actor, 'on_hand_direct_update', 'update public.inventory_items set on_hand = 99', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'record_stock_movement', 'select * from public.record_stock_movement(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'get_last_paid', 'select public.get_last_paid()', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare r record;
begin
  -- opening: the first movement of an item
  perform pg_temp.rec(a, 'mv_opening_ok', pg_temp.mv(1, 'c1i-flour', 'opening', 1000), '00000');
  perform pg_temp.assert_ok(a, 'mv_opening_sets_on_hand', pg_temp.on_hand('c1i-flour') = 1000 and pg_temp.moves('c1i-flour') = 1);
  perform pg_temp.rec(a, 'mv_opening_twice', pg_temp.mv(2, 'c1i-flour', 'opening', 5), '22023');

  -- replay: an identical retry is answered and changes nothing; another body under the id is refused
  select * into r from public.record_stock_movement(pg_temp.mv(1, 'c1i-flour', 'opening', 1000));
  perform pg_temp.assert_ok(a, 'mv_replay_is_duplicate_no_double', r.duplicate and r.on_hand = 1000 and pg_temp.on_hand('c1i-flour') = 1000 and pg_temp.moves('c1i-flour') = 1);
  perform pg_temp.rec(a, 'mv_replay_other_body', pg_temp.mv(1, 'c1i-flour', 'opening', 999), '23505');

  -- shape and bounds
  perform pg_temp.rec(a, 'mv_not_object', '[]'::jsonb, '22023');
  perform pg_temp.rec(a, 'mv_keys_missing', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{}', array['reason']), '22023');
  perform pg_temp.rec(a, 'mv_keys_extra', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{"on_hand": 9}'), '22023');
  perform pg_temp.rec(a, 'mv_type_qty', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{"qty": "5"}'), '22023');
  perform pg_temp.rec(a, 'mv_id_bad', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{"id": "nope"}'), '22023');
  perform pg_temp.rec(a, 'mv_kind_bad', pg_temp.mv(3, 'c1i-flour', 'sale', 5), '22023');
  perform pg_temp.rec(a, 'mv_receipt_qty_zero', pg_temp.mv(3, 'c1i-flour', 'receipt', 0), '22023');
  perform pg_temp.rec(a, 'mv_receipt_qty_negative', pg_temp.mv(3, 'c1i-flour', 'receipt', -1), '22023');
  perform pg_temp.rec(a, 'mv_count_negative', pg_temp.mv(3, 'c1i-flour', 'count', -1), '22023');
  perform pg_temp.rec(a, 'mv_adjust_zero', pg_temp.mv(3, 'c1i-flour', 'adjust', 0), '22023');
  perform pg_temp.rec(a, 'mv_qty_decimals', pg_temp.mv(3, 'c1i-flour', 'receipt', 1.2345), '22023');
  perform pg_temp.rec(a, 'mv_qty_huge', pg_temp.mv(3, 'c1i-flour', 'receipt', 1000000000), '22023');
  perform pg_temp.rec(a, 'mv_cost_negative', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{"cost_cents": -1}'), '22023');
  perform pg_temp.rec(a, 'mv_cost_fraction', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{"cost_cents": 12.5}'), '22023');
  perform pg_temp.rec(a, 'mv_cost_huge', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{"cost_cents": 100000001}'), '22023');
  perform pg_temp.rec(a, 'mv_cost_on_waste', pg_temp.mv(3, 'c1i-flour', 'waste', 5, '{"cost_cents": 100}'), '22023');
  perform pg_temp.rec(a, 'mv_supplier_long', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, jsonb_build_object('supplier', repeat('s', 81))), '22023');
  perform pg_temp.rec(a, 'mv_reason_control', pg_temp.mv(3, 'c1i-flour', 'waste', 5, jsonb_build_object('reason', 'a' || chr(7))), '22023');
  perform pg_temp.rec(a, 'mv_waste_no_reason', pg_temp.mv(3, 'c1i-flour', 'waste', 5, '{"reason": "  "}'), '22023');
  perform pg_temp.rec(a, 'mv_adjust_no_reason', pg_temp.mv(3, 'c1i-flour', 'adjust', 5, '{"reason": ""}'), '22023');
  perform pg_temp.rec(a, 'mv_at_future', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, jsonb_build_object('at', (extract(epoch from now() + interval '3 days') * 1000)::bigint)), '22023');
  perform pg_temp.rec(a, 'mv_at_not_ms', pg_temp.mv(3, 'c1i-flour', 'receipt', 5, '{"at": 12}'), '22023');
  perform pg_temp.rec(a, 'mv_item_missing', pg_temp.mv(3, 'no-such-item', 'receipt', 5), 'P0002');
  perform pg_temp.rec(a, 'mv_item_inactive', pg_temp.mv(3, 'c1i-off', 'receipt', 5), '22023');
  perform pg_temp.assert_ok(a, 'mv_refusals_changed_nothing', pg_temp.on_hand('c1i-flour') = 1000 and pg_temp.moves('c1i-flour') = 1);

  -- a receipt adds, and with a cost writes the cost to the books once
  perform pg_temp.rec(a, 'mv_receipt_no_cost_ok', pg_temp.mv(4, 'c1i-flour', 'receipt', 500), '00000');
  perform pg_temp.assert_ok(a, 'mv_receipt_no_cost_books_nothing', pg_temp.on_hand('c1i-flour') = 1500 and pg_temp.book_rows('Ingredients') = 0);
  perform pg_temp.rec(a, 'mv_receipt_costed_ok', pg_temp.mv(5, 'c1i-flour', 'receipt', 1000, '{"cost_cents": 9200, "supplier": " Landers "}'), '00000');
  perform pg_temp.assert_ok(a, 'mv_receipt_books_the_cost',
    pg_temp.on_hand('c1i-flour') = 2500 and pg_temp.book_rows('Ingredients') = 1 and pg_temp.book_total('Ingredients') = -9200);
  perform pg_temp.rec(a, 'mv_receipt_costed_replay', pg_temp.mv(5, 'c1i-flour', 'receipt', 1000, '{"cost_cents": 9200, "supplier": " Landers "}'), '00000');
  perform pg_temp.assert_ok(a, 'mv_receipt_replay_books_once', pg_temp.on_hand('c1i-flour') = 2500 and pg_temp.book_rows('Ingredients') = 1);
  perform pg_temp.rec(a, 'mv_packaging_receipt_ok', pg_temp.mv(6, 'c1i-box', 'receipt', 25, '{"cost_cents": 37500}'), '00000');
  perform pg_temp.assert_ok(a, 'mv_packaging_cost_in_its_category', pg_temp.book_rows('Packaging') = 1 and pg_temp.book_total('Packaging') = -37500);
  perform pg_temp.rec(a, 'mv_free_receipt_books_nothing', pg_temp.mv(7, 'c1i-box', 'receipt', 5, '{"cost_cents": 0}'), '00000');
  perform pg_temp.assert_ok(a, 'mv_free_receipt_added', pg_temp.on_hand('c1i-box') = 30 and pg_temp.book_rows('Packaging') = 1);

  -- what was last paid: the latest receipt with a cost, per item
  perform pg_temp.assert_ok(a, 'last_paid_latest_costed_receipt',
    (select (x ->> 'cost_cents')::bigint = 9200 and (x ->> 'qty')::numeric = 1000 and x ->> 'supplier' = 'Landers'
       from jsonb_array_elements(public.get_last_paid()) x where x ->> 'item_name' = 'C1 Flour')
    and (select count(*) from jsonb_array_elements(public.get_last_paid()) x where x ->> 'item_name' = 'C1 Box') = 1);

  -- a count is the total counted; the variance comes from what the database held
  perform pg_temp.rec(a, 'mv_count_opening', pg_temp.mv(8, 'c1i-count', 'opening', 100), '00000');
  perform pg_temp.rec(a, 'mv_count_ok', pg_temp.mv(9, 'c1i-count', 'count', 90), '00000');
  perform pg_temp.assert_ok(a, 'mv_count_sets_the_total', pg_temp.on_hand('c1i-count') = 90);
  perform pg_temp.rec(a, 'mv_count_up', pg_temp.mv(10, 'c1i-count', 'count', 120), '00000');
  perform pg_temp.assert_ok(a, 'mv_count_up_sets_the_total', pg_temp.on_hand('c1i-count') = 120);
  perform pg_temp.assert_ok(a, 'mv_count_variance_recorded',
    pg_temp.deltas('c1i-count') = array[100, -10, 30]::numeric[]);

  -- waste never takes more than is there; an adjustment likewise
  perform pg_temp.rec(a, 'mv_waste_opening', pg_temp.mv(11, 'c1i-waste', 'opening', 40), '00000');
  perform pg_temp.rec(a, 'mv_waste_ok', pg_temp.mv(12, 'c1i-waste', 'waste', 15, '{"reason": "dropped"}'), '00000');
  perform pg_temp.assert_ok(a, 'mv_waste_subtracts', pg_temp.on_hand('c1i-waste') = 25);
  perform pg_temp.rec(a, 'mv_waste_more_than_there', pg_temp.mv(13, 'c1i-waste', 'waste', 100, '{"reason": "spilled"}'), '00000');
  perform pg_temp.assert_ok(a, 'mv_waste_stops_at_zero', pg_temp.on_hand('c1i-waste') = 0);
  perform pg_temp.rec(a, 'mv_adjust_up_ok', pg_temp.mv(14, 'c1i-adj', 'adjust', 10, '{"reason": "found some"}'), '00000');
  perform pg_temp.rec(a, 'mv_adjust_down_more_than_there', pg_temp.mv(15, 'c1i-adj', 'adjust', -50, '{"reason": "lost"}'), '00000');
  perform pg_temp.assert_ok(a, 'mv_adjust_stops_at_zero', pg_temp.on_hand('c1i-adj') = 0);
end $$;

grant execute on function
  pg_temp.book_total(text), pg_temp.book_rows(text), pg_temp.on_hand(text), pg_temp.moves(text), pg_temp.deltas(text),
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.mid(integer), pg_temp.mv(integer, text, text, numeric, jsonb, text[]),
  pg_temp.rec(text, text, jsonb, text),
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
