-- E1 books with real SQL roles; all data rolls back.
--
-- get_books / record_expense / record_cost_correction / set_cost_basis: the active owner only (a helper, support, an inactive owner and anon
-- are all refused; anon does not even hold EXECUTE; the new tables have no API grant). The harness neutralises each `-- rule:` line of
-- supabase/migrations/20260101004900_books.sql in turn (scripts/test-db-security.py, BOOKS_MUTATIONS) and requires the named case here to
-- fail. Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('c3c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('c3c00000-0000-4000-8000-000000000001', 'owner', 'Books owner', true),
  ('c3c00000-0000-4000-8000-000000000002', 'helper', 'Books helper', true),
  ('c3c00000-0000-4000-8000-000000000003', 'support', 'Books support', true),
  ('c3c00000-0000-4000-8000-000000000004', 'owner', 'Books inactive owner', false);
-- The flour's quantity and average are what the movements below leave: 10 - 10 + 1000 - 200 - 50 + 500 - 100 = 1150 g, and the second
-- delivery moved the average to (750 x 10 + 7500) / 1250 = 12 centavos a gram.
insert into public.inventory_items(id, name, unit, category, active, on_hand, avg_cost, avg_cost_at) values
  ('c3i-flour', 'C3 Flour', 'g', 'Ingredients', true, 1150, 12, now() - interval '3 days'),
  ('c3i-box', 'C3 Box', 'pcs', 'Packaging', true, 10, null, null);
-- Orders: two paid (one refunded), one unpaid.
insert into public.orders(id, customer_name, phone, paid_cents, pay_state, paid_at, refunded_at) values
  ('c3-o1', 'Paid Payer', '09170000001', 20000, 'confirmed', now() - interval '5 days', null),
  ('c3-o2', 'Refunded Ref', '09170000002', 5000, 'refunded', now() - interval '6 days', now() - interval '1 day'),
  ('c3-o3', 'Not Yet', '09170000003', null, 'unpaid', null, null);
-- The books: two receipts' costs, a stall sale, an event cost.
insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
  ('c3a00000-0000-4000-8000-0000000000a1', 'cost', 'Ingredients', 'C3 Flour', -10000, now() - interval '10 days'),
  ('c3a00000-0000-4000-8000-0000000000a2', 'cost', 'Ingredients', 'C3 Flour', -7500, now() - interval '3 days'),
  ('c3a00000-0000-4000-8000-0000000000a3', 'sale', 'Bazaar', 'Stall sale', 30000, now() - interval '3 days'),
  ('c3a00000-0000-4000-8000-0000000000a4', 'cost', 'Bazaar rent', 'Stall rent', -3000, now() - interval '3 days');
-- Stock, inserted in time order (the movement order follows the time) with the stamps the cost rules write: 10 g in and 10 g used before any
-- delivery was costed (that use has no cost), a receipt of 1000 g for 100 pesos, 200 g used and 50 g wasted at 10 c/g, a receipt of 500 g for
-- 75 pesos (the average becomes 12), 100 g used at 12.
insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, supplier, reason, at, ledger_id, payload_hash, unit_cost, cost_source) values
  ('c3b00000-0000-4000-8000-0000000000b9', 'c3i-flour', 'opening', 10, null, '', '', now() - interval '12 days', null, repeat('9', 64), null, null),
  ('c3b00000-0000-4000-8000-0000000000b0', 'c3i-flour', 'use', -10, null, '', 'Baked', now() - interval '11 days', null, repeat('0', 64), null, null),
  ('c3b00000-0000-4000-8000-0000000000b1', 'c3i-flour', 'receipt', 1000, 10000, 'Landers', '', now() - interval '10 days', 'c3a00000-0000-4000-8000-0000000000a1', repeat('1', 64), null, null),
  ('c3b00000-0000-4000-8000-0000000000b2', 'c3i-flour', 'use', -200, null, '', 'Baked', now() - interval '5 days', null, repeat('2', 64), 10, 'average'),
  ('c3b00000-0000-4000-8000-0000000000b3', 'c3i-flour', 'waste', -50, null, '', 'Dropped', now() - interval '4 days', null, repeat('3', 64), 10, 'average'),
  ('c3b00000-0000-4000-8000-0000000000b4', 'c3i-flour', 'receipt', 500, 7500, 'Landers', '', now() - interval '3 days', 'c3a00000-0000-4000-8000-0000000000a2', repeat('4', 64), null, null),
  ('c3b00000-0000-4000-8000-0000000000b5', 'c3i-flour', 'use', -100, null, '', 'Baked', now() - interval '2 days', null, repeat('5', 64), 12, 'average');

-- B4a: "when used" starts at the cutover. This fixture's cutover is long before any of its rows (as postgres: choosing the used basis is
-- refused until used_from is set; the cutover itself is cutover.sql's), so every row below is on the used rules once the owner chooses it.
update public.books_settings set used_from = timestamptz '2020-01-01 00:00+00' where id;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'c3c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'books outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'books check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- What the trigger stamped, read as the fixture owner (an API role cannot read orders).
create function pg_temp.stamp_paid() returns boolean language plpgsql security definer as $$
declare ok boolean;
begin
  update public.orders set paid_cents = 1000 where id = 'c3-o3';
  select paid_at is not null and refunded_at is null into ok from public.orders where id = 'c3-o3';
  return ok;
end $$;
create function pg_temp.stamp_refund() returns boolean language plpgsql security definer as $$
declare ok boolean;
begin
  update public.orders set pay_state = 'refunded' where id = 'c3-o3';
  select refunded_at is not null and paid_at is not null into ok from public.orders where id = 'c3-o3';
  return ok;
end $$;

-- B3b-2: the basis a fresh database starts on, read as the fixture owner (an API role cannot read the settings table).
create function pg_temp.basis_row() returns text language sql stable security definer as $$
  select cost_basis from public.books_settings where id $$;
create function pg_temp.basis_default() returns text language sql stable security definer as $$
  select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.books_settings'::regclass and a.attname = 'cost_basis' $$;

create function pg_temp.paid_at_o1() returns timestamptz language sql stable security definer as $$
  select paid_at from public.orders where id = 'c3-o1' $$;
create function pg_temp.books() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '30 days', now() + interval '1 day') $$;
create function pg_temp.sumk(j jsonb, k text) returns bigint language sql immutable as $$
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0)::bigint from jsonb_array_elements(j -> 'lines') l where l ->> 'kind' = k $$;
create function pg_temp.eid(n integer) returns text language sql immutable as $$
  select 'c3e00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.ex(n integer, cat text, memo text, cents numeric, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', pg_temp.eid(n), 'category', cat, 'memo', memo, 'amount_cents', cents,
    'at', (extract(epoch from now()) * 1000)::bigint) || over) - dropkeys $$;
create function pg_temp.exp(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_expense(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.dw(n integer, memo text, cents numeric, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', 'c3f00000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'memo', memo, 'amount_cents', cents,
    'at', (extract(epoch from now()) * 1000)::bigint) || over) - dropkeys $$;
create function pg_temp.draw(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_draw(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.co(n integer, mid text, cents numeric, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', 'c3d00000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'movement_id', mid, 'cost_cents', cents,
    'at', (extract(epoch from now()) * 1000)::bigint) || over) - dropkeys $$;
create function pg_temp.cor(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_cost_correction(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.flour_avg() returns numeric language sql stable security definer as $$
  select avg_cost from public.inventory_items where id = 'c3i-flour' $$;
create function pg_temp.paid(item text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_last_paid()) x where x ->> 'item_name' = item $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['get_books(timestamptz,timestamptz)', 'record_expense(jsonb)', 'record_cost_correction(jsonb)', 'set_cost_basis(text)', 'record_draw(jsonb)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden books call succeeded: anon / %', f;
    end if;
  end loop;
  foreach f in array array['receipt_cost(uuid)', 'item_unit_cost(text)', 'orders_books_stamp()'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden books call succeeded: an API role / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'books_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'settings_select', 'select * from public.books_settings', '42501');
  perform pg_temp.expect(actor, 'settings_update', 'update public.books_settings set cost_basis = ''used''', '42501');
  perform pg_temp.expect(actor, 'corrections_select', 'select * from public.stock_cost_corrections', '42501');
  perform pg_temp.expect(actor, 'corrections_insert',
    'insert into public.stock_cost_corrections(id, movement_id, cost_cents, at, payload_hash) values (gen_random_uuid(), ''c3b00000-0000-4000-8000-0000000000b1'', 1, now(), repeat(''a'', 64))', '42501');
  perform pg_temp.expect(actor, 'corrections_delete', 'delete from public.stock_cost_corrections', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_books', 'select public.get_books(now() - interval ''1 day'', now())', '42501');
  perform pg_temp.expect(actor, 'record_expense', 'select * from public.record_expense(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'record_cost_correction', 'select * from public.record_cost_correction(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'set_cost_basis', 'select public.set_cost_basis(''used'')', '42501');
  perform pg_temp.expect(actor, 'record_draw', 'select * from public.record_draw(''{}''::jsonb)', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare j jsonb; r record;
begin
  -- the period
  perform pg_temp.expect(a, 'books_period_reversed', 'select public.get_books(now(), now() - interval ''1 day'')', '22023');
  perform pg_temp.expect(a, 'books_period_too_long', 'select public.get_books(now() - interval ''500 days'', now())', '22023');

  -- a fresh database counts stock as it is bought, until the cost cutover (B4a): the first read says so, and so does the row and the column
  -- default; the cases below choose the used basis once the fixture's cutover has been set (above)
  perform pg_temp.assert_ok(a, 'books_default_basis_is_bought', pg_temp.books() ->> 'basis' = 'bought' and pg_temp.basis_row() = 'bought');
  perform pg_temp.assert_ok(a, 'books_column_default_is_bought', pg_temp.basis_default() = '''bought''::text');
  perform pg_temp.expect(a, 'basis_bought_to_start', 'select public.set_cost_basis(''bought'')', '00000');

  -- bought: revenue is when an order was paid (less refunds) and stall sales; costs are each receipt and the event cost
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'books_revenue_paid_orders_and_sales', pg_temp.sumk(j, 'revenue') = 55000);
  perform pg_temp.assert_ok(a, 'books_refunds', pg_temp.sumk(j, 'refund') = 5000);
  perform pg_temp.assert_ok(a, 'books_bought_expenses', pg_temp.sumk(j, 'expense') = 20500 and j ->> 'basis' = 'bought');
  perform pg_temp.assert_ok(a, 'books_receipts_to_correct', jsonb_array_length(j -> 'receipts') = 2);
  -- bought: nothing is listed as uncosted (stock used is not a cost on this basis)
  perform pg_temp.assert_ok(a, 'books_bought_has_no_uncosted', j -> 'uncosted' = '[]'::jsonb);
  -- the period ends before its upper bound: an order paid exactly then is in the next period
  perform pg_temp.assert_ok(a, 'books_period_upper_bound_exclusive',
    pg_temp.sumk(public.get_books(now() - interval '30 days', pg_temp.paid_at_o1()), 'revenue') = 5000
    and pg_temp.sumk(public.get_books(now() - interval '30 days', pg_temp.paid_at_o1() + interval '1 microsecond'), 'revenue') = 25000);
  perform pg_temp.assert_ok(a, 'books_period_excludes',
    pg_temp.sumk(public.get_books(now() - interval '4 days', now() + interval '1 day'), 'expense') = 10500);

  -- a plain expense
  perform pg_temp.exp(a, 'exp_keys_missing', pg_temp.ex(1, 'Helper wages', 'Week 1', 50000, '{}', array['memo']), '22023');
  perform pg_temp.exp(a, 'exp_keys_extra', pg_temp.ex(1, 'Helper wages', 'Week 1', 50000, '{"kind": "sale"}'), '22023');
  perform pg_temp.exp(a, 'exp_type_amount', pg_temp.ex(1, 'Helper wages', 'Week 1', 50000, '{"amount_cents": "5"}'), '22023');
  perform pg_temp.exp(a, 'exp_id_bad', pg_temp.ex(1, 'Helper wages', 'Week 1', 50000, '{"id": "nope"}'), '22023');
  perform pg_temp.exp(a, 'exp_category_blank', pg_temp.ex(1, '  ', 'Week 1', 50000), '22023');
  perform pg_temp.exp(a, 'exp_memo_long', pg_temp.ex(1, 'Helper wages', repeat('m', 121), 50000), '22023');
  perform pg_temp.exp(a, 'exp_amount_zero', pg_temp.ex(1, 'Helper wages', 'Week 1', 0), '22023');
  perform pg_temp.exp(a, 'exp_amount_fraction', pg_temp.ex(1, 'Helper wages', 'Week 1', 10.5), '22023');
  perform pg_temp.exp(a, 'exp_amount_huge', pg_temp.ex(1, 'Helper wages', 'Week 1', 100000001), '22023');
  perform pg_temp.exp(a, 'exp_at_future', pg_temp.ex(1, 'Helper wages', 'Week 1', 50000, jsonb_build_object('at', (extract(epoch from now() + interval '3 days') * 1000)::bigint)), '22023');
  perform pg_temp.assert_ok(a, 'exp_refusals_changed_nothing', pg_temp.sumk(pg_temp.books(), 'expense') = 20500);
  perform pg_temp.exp(a, 'exp_ok', pg_temp.ex(1, 'Helper wages', 'Week 1', 50000), '00000');
  select * into r from public.record_expense(pg_temp.ex(1, 'Helper wages', 'Week 1', 50000));
  perform pg_temp.assert_ok(a, 'exp_replay_is_duplicate_no_double', r.duplicate and pg_temp.sumk(pg_temp.books(), 'expense') = 70500);
  perform pg_temp.exp(a, 'exp_replay_other_body', pg_temp.ex(1, 'Helper wages', 'Week 1', 40000), '23505');
  perform pg_temp.assert_ok(a, 'exp_in_her_category', exists (select 1 from jsonb_array_elements(pg_temp.books() -> 'lines') l where l ->> 'cat' = 'Helper wages' and (l ->> 'amount_cents')::bigint = 50000));

  -- money the owner takes out is a draw: kept apart, never an expense
  perform pg_temp.exp(a, 'exp_reserved_category', pg_temp.ex(9, 'Owner Draw', 'x', 1000), '22023');
  perform pg_temp.draw(a, 'draw_keys_missing', pg_temp.dw(1, 'Rent share', 30000, '{}', array['memo']), '22023');
  perform pg_temp.draw(a, 'draw_id_bad', pg_temp.dw(1, 'Rent share', 30000, '{"id": "nope"}'), '22023');
  perform pg_temp.draw(a, 'draw_amount_zero', pg_temp.dw(1, 'Rent share', 0), '22023');
  perform pg_temp.draw(a, 'draw_at_future', pg_temp.dw(1, 'Rent share', 30000, jsonb_build_object('at', (extract(epoch from now() + interval '3 days') * 1000)::bigint)), '22023');
  perform pg_temp.draw(a, 'draw_ok', pg_temp.dw(1, 'Rent share', 30000), '00000');
  select * into r from public.record_draw(pg_temp.dw(1, 'Rent share', 30000));
  perform pg_temp.assert_ok(a, 'draw_replay_is_duplicate_no_double', r.duplicate and pg_temp.sumk(pg_temp.books(), 'draw') = 30000);
  perform pg_temp.draw(a, 'draw_replay_other_body', pg_temp.dw(1, 'Rent share', 20000), '23505');
  perform pg_temp.assert_ok(a, 'draw_is_not_an_expense', pg_temp.sumk(pg_temp.books(), 'draw') = 30000 and pg_temp.sumk(pg_temp.books(), 'expense') = 70500);

  -- the cost basis
  perform pg_temp.expect(a, 'basis_bad', 'select public.set_cost_basis(''sometimes'')', '22023');
  perform pg_temp.expect(a, 'basis_used', 'select public.set_cost_basis(''used'')', '00000');
  -- used: receipts are not costs; the stock used and wasted is, at the cost stamped on it when it was written. Was: the price of the latest
  -- receipt up to then (10 c/g, then 15 c/g) = 3000 + 50000 + 2000 + 500 + 1500. Now: 200 g and 50 g at 10, 100 g at the average 12 = 1200,
  -- and the 10 g used before any costed delivery has no cost, so it is listed as uncosted and is not a line (never a zero line).
  j := pg_temp.books();
  perform pg_temp.assert_ok(a, 'used_excludes_receipts_and_prices_use',
    j ->> 'basis' = 'used' and pg_temp.sumk(j, 'expense') = 3000 + 50000 + 2000 + 500 + 1200 and pg_temp.sumk(j, 'draw') = 30000);
  perform pg_temp.assert_ok(a, 'used_lists_the_uncosted_use',
    jsonb_array_length(j -> 'uncosted') = 1 and j -> 'uncosted' -> 0 ->> 'item' = 'C3 Flour' and (j -> 'uncosted' -> 0 ->> 'qty')::numeric = 10
    and j -> 'uncosted' -> 0 ->> 'unit' = 'g' and j -> 'uncosted' -> 0 ->> 'kind' = 'use'
    and not exists (select 1 from jsonb_array_elements(j -> 'lines') l where l ->> 'id' = 'm:c3b00000-0000-4000-8000-0000000000b0'));
  perform pg_temp.assert_ok(a, 'used_lines_carry_short_qty',
    not exists (select 1 from jsonb_array_elements(j -> 'lines') l where not (l ? 'short_qty')));
  perform pg_temp.assert_ok(a, 'used_keeps_revenue', pg_temp.sumk(j, 'revenue') = 55000 and pg_temp.sumk(j, 'refund') = 5000);
  perform pg_temp.expect(a, 'basis_bought', 'select public.set_cost_basis(''bought'')', '00000');

  -- a wrong receipt cost is answered by a correcting entry
  perform pg_temp.cor(a, 'cor_keys_missing', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', 9000, '{}', array['at']), '22023');
  perform pg_temp.cor(a, 'cor_id_bad', pg_temp.co(1, 'nope', 9000), '22023');
  perform pg_temp.cor(a, 'cor_cost_negative', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', -1), '22023');
  perform pg_temp.cor(a, 'cor_cost_fraction', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', 90.5), '22023');
  perform pg_temp.cor(a, 'cor_at_future', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', 9000, jsonb_build_object('at', (extract(epoch from now() + interval '3 days') * 1000)::bigint)), '22023');
  perform pg_temp.cor(a, 'cor_movement_missing', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000ff', 9000), 'P0002');
  perform pg_temp.cor(a, 'cor_not_a_costed_receipt', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b2', 9000), '22023');
  perform pg_temp.cor(a, 'cor_no_change', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', 10000), '22023');
  perform pg_temp.assert_ok(a, 'cor_refusals_changed_nothing', pg_temp.sumk(pg_temp.books(), 'expense') = 70500);
  perform pg_temp.cor(a, 'cor_ok', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', 9000), '00000');
  perform pg_temp.assert_ok(a, 'cor_lowers_the_cost_by_the_difference', pg_temp.sumk(pg_temp.books(), 'expense') = 69500);
  select * into r from public.record_cost_correction(pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', 9000));
  perform pg_temp.assert_ok(a, 'cor_replay_is_duplicate_no_double', r.duplicate and pg_temp.sumk(pg_temp.books(), 'expense') = 69500);
  perform pg_temp.cor(a, 'cor_replay_other_body', pg_temp.co(1, 'c3b00000-0000-4000-8000-0000000000b1', 8000), '23505');
  -- the latest receipt is what was last paid; correcting it changes what the cost per unit is worked out from
  perform pg_temp.assert_ok(a, 'last_paid_before_correcting_the_latest', (pg_temp.paid('C3 Flour') ->> 'cost_cents')::bigint = 7500);
  perform pg_temp.cor(a, 'cor_latest_ok', pg_temp.co(2, 'c3b00000-0000-4000-8000-0000000000b4', 6000), '00000');
  perform pg_temp.assert_ok(a, 'last_paid_uses_the_corrected_cost', (pg_temp.paid('C3 Flour') ->> 'cost_cents')::bigint = 6000);
  perform pg_temp.assert_ok(a, 'cor_second_correction_builds_on_the_first', pg_temp.sumk(pg_temp.books(), 'expense') = 68000);
  -- used again, with the corrected prices (9 c/g, then 12 c/g): the correcting entries are not costs of their own
  perform pg_temp.expect(a, 'basis_used_again', 'select public.set_cost_basis(''used'')', '00000');
  -- Was: the corrected prices (9 c/g, then 12 c/g) re-priced the uses = 3000 + 50000 + 1800 + 450 + 1200. Now a stamp is never changed: the
  -- uses stay 2000 + 500 + 1200, and each correction adds the share of its change that belongs to stock already used. 1150 g are on hand:
  -- the first correction (-1000) leaves 0.69 of the delivery on hand (1150/1250 x 750/800 x 800/1000), so -690 goes to the average and
  -- -1000 + 690 = -310 is cost already used; the second (-1500) leaves 0.92 (1150/1250): -1380 to the average, -1500 + 1380 = -120.
  perform pg_temp.assert_ok(a, 'used_reads_corrected_prices', pg_temp.sumk(pg_temp.books(), 'expense') = 3000 + 50000 + 2000 + 500 + 1200 - 310 - 120);
  perform pg_temp.assert_ok(a, 'cor_moves_the_average', pg_temp.flour_avg() = 10.2);
  -- the correction lines are dated when the corrections were made (both sent now), not when the deliveries were
  perform pg_temp.assert_ok(a, 'cor_used_lines_are_dated_at_the_correction',
    (select count(*) from jsonb_array_elements(pg_temp.books() -> 'lines') l where l ->> 'id' like 'c:%' and l ->> 'kind' = 'expense') = 2
    and (select sum((l ->> 'amount_cents')::bigint) from jsonb_array_elements(pg_temp.books() -> 'lines') l where l ->> 'id' like 'c:%') = -430
    and not exists (select 1 from jsonb_array_elements(pg_temp.books() -> 'lines') l
                     where l ->> 'id' like 'c:%' and (l ->> 'at')::bigint <> (extract(epoch from now()) * 1000)::bigint));

  -- the latest correction is the one saved last, whatever time the phone sent with it (a retried older one)
  perform pg_temp.cor(a, 'cor_older_time_still_latest', pg_temp.co(3, 'c3b00000-0000-4000-8000-0000000000b4', 5500,
    jsonb_build_object('at', ((extract(epoch from now()) - 86400) * 1000)::bigint)), '00000');
  perform pg_temp.assert_ok(a, 'cor_latest_is_the_one_saved_last', (pg_temp.paid('C3 Flour') ->> 'cost_cents')::bigint = 5500);
  -- 5500 against 6000 is -500, 0.92 of it on hand: -460 to the average (10.2 - 460 / 1150 = 9.8) and -40 cost already used
  perform pg_temp.assert_ok(a, 'cor_third_correction_moves_the_average', pg_temp.flour_avg() = 9.8);

  -- the trigger stamps when an order is paid and refunded
  perform pg_temp.assert_ok(a, 'trigger_stamps_paid_at', pg_temp.stamp_paid());
  perform pg_temp.assert_ok(a, 'trigger_stamps_refunded_at', pg_temp.stamp_refund());
end $$;

grant execute on function
  pg_temp.basis_row(), pg_temp.basis_default(),   pg_temp.paid_at_o1(), pg_temp.stamp_paid(), pg_temp.stamp_refund(), pg_temp.books(), pg_temp.sumk(jsonb, text), pg_temp.eid(integer),
  pg_temp.ex(integer, text, text, numeric, jsonb, text[]), pg_temp.exp(text, text, jsonb, text),
  pg_temp.dw(integer, text, numeric, jsonb, text[]), pg_temp.draw(text, text, jsonb, text),
  pg_temp.co(integer, text, numeric, jsonb, text[]), pg_temp.cor(text, text, jsonb, text), pg_temp.paid(text), pg_temp.flour_avg(),
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
