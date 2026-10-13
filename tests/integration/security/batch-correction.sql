-- B3a batch correction with real SQL roles; all data rolls back.
--
-- record_batch_correction: the active owner only (a helper, support, an inactive owner and anon are all refused; anon does not even
-- hold EXECUTE). A correction never edits the batch row: it writes an opposite entry (kind batch_correction) and moves no stock, no
-- dough and no money. get_production reports each batch's EFFECTIVE good count and rejects, its cost and whether that cost is
-- complete; record_discard and get_production count the corrections in a drop's baked balance. The harness neutralises each `-- rule:`
-- line of record_batch_correction in turn, and the text rules named in scripts/test-db-security.py (BATCH_CORRECTION_MUTATIONS), and
-- requires the named case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
--
-- The money is worked by hand. Stock is delivered at 40 c/g for flour (3000 g for 1,200 pesos), 100 c/g for butter (1000 g for 1,000
-- pesos) and 60 c/g for sugar (10 g for 6 pesos); a delivery sets the average, and every use is stamped with it.
--   bcp1 makes 12 cookies from 120 g flour and 60 g butter (10 g and 5 g a cookie).
--   A: 24 cookies = 240 g flour (9600) + 120 g butter (12000) = 21600; 900 a cookie.
--   dough: 6 balls = 60 g flour (2400) + 30 g butter (3000) = 5400; 900 a ball.
--   D: 8 cookies, 6 of them from that dough: 6 x 900 = 5400, plus 2 mixed = 20 g flour (800) + 10 g butter (1000) = 1800; 7200; 900 a cookie.
--   E: 12 cookies = 120 g flour (4800) + 60 g butter (6000) = 10800.
--   A corrected up to 26 good: the cost is still 21600; per cookie 21600 / 26 = 830.7692. To 20 good (4 rejects): 1080. Then to 22: 981.8182.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('bcc00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('bcc00000-0000-4000-8000-000000000001', 'owner', 'Correction owner', true),
  ('bcc00000-0000-4000-8000-000000000002', 'helper', 'Correction helper', true),
  ('bcc00000-0000-4000-8000-000000000003', 'support', 'Correction support', true),
  ('bcc00000-0000-4000-8000-000000000004', 'owner', 'Correction inactive owner', false);
insert into public.inventory_items(id, name, unit, on_hand) values
  ('bci-flour', 'BC Flour', 'g', 0), ('bci-butter', 'BC Butter', 'g', 0), ('bci-sugar', 'BC Sugar', 'g', 0), ('bci-plain', 'BC Plain', 'g', 100);
insert into public.products(id, name, short_name, price_cents, kind) values
  ('bcp1', 'BC cookie one', 'BC-1', 10000, 'cookie'), ('bcp2', 'BC cookie two', 'BC-2', 10000, 'cookie'),
  ('bcp3', 'BC cookie three', 'BC-3', 10000, 'cookie'), ('bcp4', 'BC cookie four', 'BC-4', 10000, 'cookie'),
  ('bcp5', 'BC cookie five', 'BC-5', 10000, 'cookie');
insert into public.recipes(product_id, yield_count) values ('bcp1', 12), ('bcp2', 6), ('bcp3', 6), ('bcp4', 6), ('bcp5', 6);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('bcp1', 'BC Flour', 120, 'g', 0), ('bcp1', 'BC Butter', 60, 'g', 1),
  ('bcp2', 'BC Flour', 60, 'g', 0), ('bcp2', 'BC Plain', 10, 'g', 1),
  ('bcp3', 'BC Flour', 60, 'g', 0), ('bcp3', 'BC Ghost', 10, 'g', 1),
  ('bcp4', 'BC Flour', 60, 'g', 0),
  ('bcp5', 'BC Sugar', 30, 'g', 0);
-- The fixture wrote the recipes directly, so it gives them their version rows and item links the way the operator does.
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
insert into public.orders(id, customer_name, phone) values ('BC-ORD-1', 'Pack One', '09170000011'), ('BC-ORD-2', 'Pack Two', '09170000012');
insert into public.order_items(order_id, product_id, qty, unit_price_cents) values ('BC-ORD-1', 'bcp1', 5, 10000), ('BC-ORD-2', 'bcp1', 9, 10000);

-- B4a: these cases read the books on the used basis, which a fresh database no longer starts on: it needs the cost cutover (cutover.sql's).
-- The cutover here is long before any row, set as postgres, so every row below is on the used rules.
update public.books_settings set used_from = timestamptz '2020-01-01 00:00+00', cost_basis = 'used' where id;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'bcc00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'correction outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'correction check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- ---- readers (as the fixture owner: an API role cannot read these tables)
create function pg_temp.uid(tag text) returns text language sql immutable as $$ select md5('bc:' || tag)::uuid::text $$;
create function pg_temp.row_json(tag text) returns jsonb language sql stable security definer as $$
  select to_jsonb(r) from public.production_records r where r.id = pg_temp.uid(tag)::uuid $$;
-- A record as it was written before shortfalls were costed: the short part is on the record only, not on its movements.
create function pg_temp.make_legacy(tag text) returns void language sql security definer as $$
  update public.stock_movements set short_qty = 0 where production_id = (pg_temp.row_json(tag) ->> 'id')::uuid $$;
create function pg_temp.n_rows(k text) returns bigint language sql stable security definer as $$
  select count(*) from public.production_records where kind = k $$;
create function pg_temp.moves_n() returns bigint language sql stable security definer as $$ select count(*) from public.stock_movements $$;
create function pg_temp.ledger_n() returns bigint language sql stable security definer as $$ select count(*) from public.ledger_entries $$;
create function pg_temp.audit_n(act text) returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log a where a.action = act $$;
create function pg_temp.onhand(item text) returns numeric language sql stable security definer as $$
  select on_hand from public.inventory_items where id = item $$;
-- What the correction rows of one batch say, oldest reason first (the reasons sort in the order they were made).
create function pg_temp.corrections(tag text) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'ref', r.ref, 'qty', r.qty, 'qty_delta', r.qty_delta, 'rejects_delta', r.rejects_delta,
           'drop_no', r.drop_no, 'product_id', r.product_id, 'recipe_version', r.recipe_version, 'corrects', r.corrects) order by r.ref), '[]'::jsonb)
    from public.production_records r where r.corrects = pg_temp.uid(tag)::uuid $$;
create function pg_temp.deltas(tag text) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_array(r.qty_delta, r.rejects_delta) order by r.ref), '[]'::jsonb)
    from public.production_records r where r.corrects = pg_temp.uid(tag)::uuid $$;
-- What the owner's screens read (these run as the owner).
create function pg_temp.bj(tag text, drop_no integer) returns jsonb language sql stable as $$
  select b from jsonb_array_elements(public.get_production(drop_no) -> 'batches') b where b ->> 'id' = pg_temp.uid(tag) $$;
create function pg_temp.baked(drop_no integer, pid text) returns integer language sql stable as $$
  select (k ->> 'qty')::integer from jsonb_array_elements(public.get_production(drop_no) -> 'baked') k where k ->> 'product_id' = pid $$;
create function pg_temp.dough(pid text) returns integer language sql stable as $$
  select (d ->> 'balls')::integer from jsonb_array_elements(public.get_production(0) -> 'dough') d where d ->> 'product_id' = pid $$;
create function pg_temp.books() returns jsonb language sql stable as $$
  select public.get_books(now() - interval '30 days', now() + interval '1 day') $$;
create function pg_temp.jt(j jsonb, k text) returns text language sql immutable as $$ select coalesce(jsonb_typeof(j -> k), 'missing') $$;
-- Every key the app's parser reads keeps its type, and the new keys are the types the screens will be written against.
create function pg_temp.shape_ok(j jsonb) returns boolean language sql stable as $$
  select pg_temp.jt(j, 'batches') = 'array' and pg_temp.jt(j, 'dough') = 'array' and pg_temp.jt(j, 'baked') = 'array' and pg_temp.jt(j, 'shortfalls') = 'array'
    and not exists (select 1 from jsonb_array_elements(j -> 'batches') b
                     where pg_temp.jt(b, 'product_id') <> 'string' or pg_temp.jt(b, 'qty') <> 'number' or pg_temp.jt(b, 'rejects') <> 'number'
                        or pg_temp.jt(b, 'version') <> 'number' or pg_temp.jt(b, 'at') <> 'number' or pg_temp.jt(b, 'target') not in ('number', 'null')
                        or pg_temp.jt(b, 'id') <> 'string' or pg_temp.jt(b, 'corrected') <> 'boolean' or pg_temp.jt(b, 'cost_complete') <> 'boolean'
                        or pg_temp.jt(b, 'cost_cents') not in ('number', 'null') or pg_temp.jt(b, 'per_cookie_cents') not in ('number', 'null'))
    and not exists (select 1 from jsonb_array_elements(j -> 'dough') d
                     where pg_temp.jt(d, 'product_id') <> 'string' or pg_temp.jt(d, 'balls') <> 'number' or pg_temp.jt(d, 'at') not in ('number', 'null'))
    and not exists (select 1 from jsonb_array_elements(j -> 'baked') k where pg_temp.jt(k, 'product_id') <> 'string' or pg_temp.jt(k, 'qty') <> 'number') $$;

-- ---- writers
create function pg_temp.ms(hours numeric) returns bigint language sql stable as $$
  select ((extract(epoch from now()) - hours * 3600) * 1000)::bigint $$;
create function pg_temp.mv(actor text, op text, item text, kind text, qty numeric, cost numeric, hours numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'corr_mv_' || op, format('select * from public.record_stock_movement(%L::jsonb)', jsonb_build_object(
    'id', pg_temp.uid('mv:' || op), 'item_id', item, 'kind', kind, 'qty', qty, 'cost_cents', cost, 'supplier', '', 'reason', '', 'at', pg_temp.ms(hours))::text), '00000');
end $$;
-- A batch (everything out of the oven, rejects, the drop, hours ago) or a dough mix (balls).
create function pg_temp.batch(actor text, tag text, pid text, qty numeric, rejects numeric, drop_no integer, hours numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'corr_batch_' || tag, format('select * from public.record_production(%L::jsonb)', jsonb_build_object(
    'id', pg_temp.uid(tag), 'kind', 'batch', 'product_id', pid, 'qty', qty, 'target', qty, 'rejects', rejects, 'adj', '{}'::jsonb,
    'recipe_version', 1, 'drop_no', drop_no, 'at', pg_temp.ms(hours))::text), '00000');
end $$;
create function pg_temp.dough_mix(actor text, tag text, pid text, balls numeric, hours numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'corr_dough_' || tag, format('select * from public.record_production(%L::jsonb)', jsonb_build_object(
    'id', pg_temp.uid(tag), 'kind', 'dough', 'product_id', pid, 'qty', balls, 'target', null, 'rejects', 0, 'adj', '{}'::jsonb,
    'recipe_version', 1, 'drop_no', 0, 'at', pg_temp.ms(hours))::text), '00000');
end $$;
-- A valid correction: tag gives its id, batch_tag the batch; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.cb(tag text, batch_tag text, qty numeric, rejects numeric, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', pg_temp.uid('c:' || tag), 'batch_id', pg_temp.uid(batch_tag), 'qty', qty, 'rejects', rejects,
    'reason', 'Fix', 'at', pg_temp.ms(0)) || over) - dropkeys $$;
create function pg_temp.cor(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_batch_correction(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.db(tag text, pid text, qty numeric, drop_no integer) returns jsonb language sql stable as $$
  select jsonb_build_object('id', pg_temp.uid('d:' || tag), 'kind', 'baked', 'product_id', pid, 'qty', qty, 'reason', 'Dropped', 'drop_no', drop_no, 'at', pg_temp.ms(0)) $$;
create function pg_temp.dis(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_discard(%L::jsonb)', body::text), wanted);
end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.record_batch_correction(jsonb)', 'EXECUTE') then
    raise exception 'forbidden correction call succeeded: anon / record_batch_correction';
  end if;
  insert into pg_temp.authority_results values ('corr_acl', 'anon', 'correction_rpc_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'corr_records_insert',
    'insert into public.production_records(id, kind, product_id, qty, at, payload_hash, corrects, qty_delta, rejects_delta) values (gen_random_uuid(), ''batch_correction'', ''bcp1'', 0, now(), repeat(''a'', 64), gen_random_uuid(), 1, 0)', '42501');
  perform pg_temp.expect(actor, 'corr_records_update', 'update public.production_records set qty_delta = 1', '42501');
  perform pg_temp.expect(actor, 'corr_records_select', 'select corrects, qty_delta, rejects_delta from public.production_records', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'corr_record_batch_correction', 'select * from public.record_batch_correction(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'corr_get_production', 'select public.get_production(5)', '42501');
  perform pg_temp.expect(actor, 'corr_record_discard', 'select * from public.record_discard(''{}''::jsonb)', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare r record; j jsonb; row0 jsonb; mv0 bigint; led0 bigint; books0 jsonb; flour0 numeric; butter0 numeric; dough0 integer;
begin
  -- stock: the deliveries every cost below is worked from
  perform pg_temp.mv(a, 'flour', 'bci-flour', 'receipt', 3000, 120000, 100);
  perform pg_temp.mv(a, 'butter', 'bci-butter', 'receipt', 1000, 100000, 100);
  perform pg_temp.mv(a, 'sugar', 'bci-sugar', 'receipt', 10, 600, 100);

  -- A: 24 good, none rejected, drop 5; then 6 balls of dough are mixed and left in the chiller
  perform pg_temp.batch(a, 'A', 'bcp1', 24, 0, 5, 10);
  perform pg_temp.dough_mix(a, 'DA', 'bcp1', 6, 9);
  j := pg_temp.bj('A', 5);
  perform pg_temp.assert_ok(a, 'corr_a_before',
    (j ->> 'qty')::int = 24 and (j ->> 'rejects')::int = 0 and (j ->> 'target')::int = 24 and not (j ->> 'corrected')::boolean
    and (j ->> 'cost_cents')::numeric = 21600 and (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 900
    and (j ->> 'version')::int = 1 and j ->> 'id' = pg_temp.uid('A') and pg_temp.baked(5, 'bcp1') = 24 and pg_temp.dough('bcp1') = 6);

  -- every refusal changes nothing
  perform pg_temp.cor(a, 'corr_not_object', '[]'::jsonb, '22023');
  perform pg_temp.cor(a, 'corr_keys_extra', pg_temp.cb('x1', 'A', 26, 0, '{"cost": 1}'), '22023');
  perform pg_temp.cor(a, 'corr_keys_missing', pg_temp.cb('x2', 'A', 26, 0, '{}', array['reason']), '22023');
  perform pg_temp.cor(a, 'corr_type_qty', pg_temp.cb('x3', 'A', 26, 0, '{"qty": "26"}'), '22023');
  perform pg_temp.cor(a, 'corr_id_bad', pg_temp.cb('x4', 'A', 26, 0, '{"id": "nope"}'), '22023');
  perform pg_temp.cor(a, 'corr_batch_id_bad', pg_temp.cb('x5', 'A', 26, 0, '{"batch_id": "nope"}'), '22023');
  perform pg_temp.cor(a, 'corr_id_uppercase', pg_temp.cb('x6', 'A', 26, 0, jsonb_build_object('id', upper(pg_temp.uid('c:x6')))), '22023');
  perform pg_temp.cor(a, 'corr_qty_over', pg_temp.cb('x7', 'A', 10001, 0), '22023');
  perform pg_temp.cor(a, 'corr_qty_fraction', pg_temp.cb('x8', 'A', 25.5, 0), '22023');
  perform pg_temp.cor(a, 'corr_qty_negative', pg_temp.cb('x9', 'A', -1, 0), '22023');
  perform pg_temp.cor(a, 'corr_rejects_over', pg_temp.cb('x10', 'A', 26, 10001), '22023');
  perform pg_temp.cor(a, 'corr_rejects_fraction', pg_temp.cb('x11', 'A', 26, 1.5), '22023');
  perform pg_temp.cor(a, 'corr_rejects_negative', pg_temp.cb('x12', 'A', 26, -1), '22023');
  perform pg_temp.cor(a, 'corr_reason_blank', pg_temp.cb('x13', 'A', 26, 0, '{"reason": "   "}'), '22023');
  perform pg_temp.cor(a, 'corr_reason_long', pg_temp.cb('x14', 'A', 26, 0, jsonb_build_object('reason', repeat('x', 81))), '22023');
  perform pg_temp.cor(a, 'corr_reason_control', pg_temp.cb('x15', 'A', 26, 0, jsonb_build_object('reason', 'a' || chr(9) || 'b')), '22023');
  perform pg_temp.cor(a, 'corr_at_future', pg_temp.cb('x16', 'A', 26, 0, jsonb_build_object('at', pg_temp.ms(-72))), '22023');
  perform pg_temp.cor(a, 'corr_at_not_ms', pg_temp.cb('x17', 'A', 26, 0, '{"at": 5}'), '22023');
  perform pg_temp.cor(a, 'corr_batch_missing', pg_temp.cb('x18', 'NOPE', 26, 0), 'P0002');
  perform pg_temp.cor(a, 'corr_not_a_batch', pg_temp.cb('x19', 'DA', 26, 0), 'P0002');
  perform pg_temp.cor(a, 'corr_no_change', pg_temp.cb('x20', 'A', 24, 0), '22023');
  perform pg_temp.assert_ok(a, 'corr_refusals_changed_nothing',
    pg_temp.n_rows('batch_correction') = 0 and pg_temp.audit_n('production.batch_correction') = 0 and pg_temp.baked(5, 'bcp1') = 24);

  -- A corrected UP to 26: the batch row is not touched, one opposite entry is written, nothing else moves
  row0 := pg_temp.row_json('A');
  mv0 := pg_temp.moves_n(); led0 := pg_temp.ledger_n(); books0 := pg_temp.books();
  flour0 := pg_temp.onhand('bci-flour'); butter0 := pg_temp.onhand('bci-butter'); dough0 := pg_temp.dough('bcp1');
  select * into r from public.record_batch_correction(pg_temp.cb('c1', 'A', 26, 0, '{"reason": "Fix 1"}'));
  perform pg_temp.assert_ok(a, 'corr_up_returns_effective', not r.duplicate and r.qty = 26 and r.rejects = 0 and r.record_id::text = pg_temp.uid('c:c1'));
  perform pg_temp.assert_ok(a, 'corr_up_batch_row_unchanged', pg_temp.row_json('A') = row0);
  perform pg_temp.assert_ok(a, 'corr_up_writes_one_row',
    pg_temp.corrections('A') = jsonb_build_array(jsonb_build_object('kind', 'batch_correction', 'ref', 'Fix 1', 'qty', 0, 'qty_delta', 2, 'rejects_delta', 0,
      'drop_no', 5, 'product_id', 'bcp1', 'recipe_version', 1, 'corrects', pg_temp.uid('A'))));
  j := pg_temp.bj('A', 5);
  perform pg_temp.assert_ok(a, 'corr_up_batch_list',
    (j ->> 'qty')::int = 26 and (j ->> 'rejects')::int = 0 and (j ->> 'target')::int = 24 and (j ->> 'corrected')::boolean and (j ->> 'version')::int = 1);
  perform pg_temp.assert_ok(a, 'corr_up_cost', (j ->> 'cost_cents')::numeric = 21600 and (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 830.7692);
  perform pg_temp.assert_ok(a, 'corr_baked_follows', pg_temp.baked(5, 'bcp1') = 26);
  perform pg_temp.assert_ok(a, 'corr_up_moves_nothing',
    pg_temp.moves_n() = mv0 and pg_temp.ledger_n() = led0 and pg_temp.onhand('bci-flour') = flour0 and pg_temp.onhand('bci-butter') = butter0 and pg_temp.books() = books0);
  perform pg_temp.assert_ok(a, 'corr_up_dough_unmoved', pg_temp.dough('bcp1') = dough0 and dough0 = 6);
  perform pg_temp.assert_ok(a, 'corr_up_one_audit_row', pg_temp.audit_n('production.batch_correction') = 1);
  -- an identical retry is a duplicate and writes nothing; another body under the id is refused
  select * into r from public.record_batch_correction(pg_temp.cb('c1', 'A', 26, 0, '{"reason": "Fix 1"}'));
  perform pg_temp.assert_ok(a, 'corr_replay_is_duplicate',
    r.duplicate and r.qty = 26 and r.rejects = 0 and pg_temp.n_rows('batch_correction') = 1 and pg_temp.audit_n('production.batch_correction') = 1 and pg_temp.moves_n() = mv0);
  perform pg_temp.cor(a, 'corr_replay_other_body', pg_temp.cb('c1', 'A', 27, 0, '{"reason": "Fix 1"}'), '23505');

  -- corrected DOWN to 20 good with 4 rejects, then again: every change builds on the effective values
  select * into r from public.record_batch_correction(pg_temp.cb('c2', 'A', 20, 4, '{"reason": "Fix 2"}'));
  j := pg_temp.bj('A', 5);
  perform pg_temp.assert_ok(a, 'corr_down_effective',
    r.qty = 20 and r.rejects = 4 and (j ->> 'qty')::int = 20 and (j ->> 'rejects')::int = 4 and (j ->> 'corrected')::boolean
    and (j ->> 'per_cookie_cents')::numeric = 1080 and pg_temp.baked(5, 'bcp1') = 20 and pg_temp.deltas('A') = '[[2, 0], [-6, 4]]'::jsonb);
  select * into r from public.record_batch_correction(pg_temp.cb('c3', 'A', 22, 2, '{"reason": "Fix 3"}'));
  j := pg_temp.bj('A', 5);
  perform pg_temp.assert_ok(a, 'corr_again_builds_on_effective',
    r.qty = 22 and r.rejects = 2 and (j ->> 'qty')::int = 22 and (j ->> 'rejects')::int = 2 and (j ->> 'cost_cents')::numeric = 21600
    and (j ->> 'per_cookie_cents')::numeric = 981.8182 and pg_temp.baked(5, 'bcp1') = 22
    and pg_temp.deltas('A') = '[[2, 0], [-6, 4], [2, -2]]'::jsonb and pg_temp.row_json('A') = row0);

  -- D: a batch of 8 draws on the 6 balls of dough: 6 x 900 + the 2 mixed (1800) = 7200
  perform pg_temp.batch(a, 'D', 'bcp1', 8, 0, 5, 5);
  j := pg_temp.bj('D', 5);
  perform pg_temp.assert_ok(a, 'corr_d_cost_draws_dough',
    (j ->> 'cost_cents')::numeric = 7200 and (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 900
    and (pg_temp.row_json('D') ->> 'dough_used')::int = 6 and pg_temp.dough('bcp1') is null);
  perform pg_temp.assert_ok(a, 'corr_baked_sums_the_drop', pg_temp.baked(5, 'bcp1') = 30);

  -- E: 12 cookies in drop 6, 5 of them packed
  perform pg_temp.batch(a, 'E', 'bcp1', 12, 0, 6, 4);
  perform pg_temp.assert_ok(a, 'corr_e_cost', (pg_temp.bj('E', 6) ->> 'cost_cents')::numeric = 10800 and (pg_temp.bj('E', 6) ->> 'per_cookie_cents')::numeric = 900);
  select * into r from public.record_pack('BC-ORD-1', 6);
  perform pg_temp.assert_ok(a, 'corr_e_pack', not r.duplicate and pg_temp.baked(6, 'bcp1') = 7);
  perform pg_temp.cor(a, 'corr_down_below_packed', pg_temp.cb('e0', 'E', 3, 0), '22023');
  perform pg_temp.assert_ok(a, 'corr_e_refused_changed_nothing', pg_temp.deltas('E') = '[]'::jsonb and pg_temp.baked(6, 'bcp1') = 7);
  select * into r from public.record_batch_correction(pg_temp.cb('e1', 'E', 8, 0, '{"reason": "Fix 1"}'));
  perform pg_temp.assert_ok(a, 'corr_e_down_accepted', r.qty = 8 and pg_temp.baked(6, 'bcp1') = 3);
  -- a discard sees the corrected balance, both ways: 7 were there before the correction, 3 now
  perform pg_temp.dis(a, 'corr_disc_after_down', pg_temp.db('e1', 'bcp1', 4, 6), '22023');
  perform pg_temp.dis(a, 'corr_disc_exact_ok', pg_temp.db('e2', 'bcp1', 3, 6), '00000');
  perform pg_temp.assert_ok(a, 'corr_e_balance_zero', pg_temp.baked(6, 'bcp1') is null);
  perform pg_temp.cor(a, 'corr_down_below_discarded', pg_temp.cb('e3', 'E', 7, 0), '22023');
  perform pg_temp.dis(a, 'corr_disc_refused_at_zero', pg_temp.db('e4', 'bcp1', 1, 6), '22023');
  select * into r from public.record_batch_correction(pg_temp.cb('e5', 'E', 10, 0, '{"reason": "Fix 2"}'));
  perform pg_temp.assert_ok(a, 'corr_e_up_accepted', r.qty = 10 and pg_temp.baked(6, 'bcp1') = 2 and pg_temp.deltas('E') = '[[-4, 0], [2, 0]]'::jsonb);
  perform pg_temp.dis(a, 'corr_disc_more_than_corrected', pg_temp.db('e6', 'bcp1', 3, 6), '22023');
  perform pg_temp.dis(a, 'corr_disc_after_up', pg_temp.db('e7', 'bcp1', 2, 6), '00000');
  perform pg_temp.assert_ok(a, 'corr_e_balance_zero_again', pg_temp.baked(6, 'bcp1') is null);

  -- F: 4 cookies in drop 7 and 9 packed: the baked count is already below zero (-5). Raising the count is never refused for that.
  perform pg_temp.batch(a, 'F', 'bcp1', 4, 0, 7, 3.5);
  select * into r from public.record_pack('BC-ORD-2', 7);
  perform pg_temp.assert_ok(a, 'corr_f_pack', not r.duplicate and pg_temp.baked(7, 'bcp1') is null);
  perform pg_temp.cor(a, 'corr_up_when_negative_ok', pg_temp.cb('f1', 'F', 6, 0, '{"reason": "Fix 1"}'), '00000');
  perform pg_temp.cor(a, 'corr_down_when_negative_refused', pg_temp.cb('f2', 'F', 2, 0), '22023');
  perform pg_temp.cor(a, 'corr_rejects_only_ok', pg_temp.cb('f3', 'F', 6, 1, '{"reason": "Fix 2"}'), '00000');
  perform pg_temp.assert_ok(a, 'corr_f_rejects_only',
    pg_temp.deltas('F') = '[[2, 0], [0, 1]]'::jsonb and (pg_temp.bj('F', 7) ->> 'qty')::int = 6 and (pg_temp.bj('F', 7) ->> 'rejects')::int = 1);

  -- a batch whose cost is not all known: a line with no cost (G), a line that is not a stock item (H), dough with such a line (J),
  -- dough that comes after the batch (I) -- each says so, and what is known is still added up
  perform pg_temp.batch(a, 'G', 'bcp2', 6, 0, 8, 3);
  j := pg_temp.bj('G', 8);
  perform pg_temp.assert_ok(a, 'corr_cost_uncosted_movement',
    (j ->> 'cost_cents')::numeric = 2400 and not (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 400);
  perform pg_temp.batch(a, 'H', 'bcp3', 6, 0, 8, 3);
  j := pg_temp.bj('H', 8);
  perform pg_temp.assert_ok(a, 'corr_cost_line_not_a_stock_item',
    (j ->> 'cost_cents')::numeric = 2400 and not (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 400);
  perform pg_temp.dough_mix(a, 'DJ', 'bcp3', 3, 6);
  perform pg_temp.batch(a, 'J', 'bcp3', 3, 0, 8, 2);
  j := pg_temp.bj('J', 8);
  perform pg_temp.assert_ok(a, 'corr_cost_dough_line_not_costed',
    (j ->> 'cost_cents')::numeric = 1200 and not (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 400);
  perform pg_temp.dough_mix(a, 'DI', 'bcp4', 6, 1);
  perform pg_temp.batch(a, 'I', 'bcp4', 6, 0, 8, 2);
  j := pg_temp.bj('I', 8);
  perform pg_temp.assert_ok(a, 'corr_cost_dough_after_batch',
    (j ->> 'cost_cents') is null and not (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents') is null and (pg_temp.row_json('I') ->> 'dough_used')::int = 6);
  -- K: 30 g of sugar asked, 10 on hand: 10 taken and 20 short, all costed at 60 = 1800 (the shortfall carries no why: its cost is known)
  perform pg_temp.batch(a, 'K', 'bcp5', 6, 0, 9, 3);
  j := pg_temp.bj('K', 9);
  perform pg_temp.assert_ok(a, 'corr_cost_counts_the_short',
    (j ->> 'cost_cents')::numeric = 1800 and (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 300);
  -- K corrected to no good cookies at all (6 rejects): nothing is left to bake, the cost stays, and there is no cost per cookie
  perform pg_temp.cor(a, 'corr_zero_good_ok', pg_temp.cb('k1', 'K', 0, 6), '00000');
  j := pg_temp.bj('K', 9);
  perform pg_temp.assert_ok(a, 'corr_zero_good_has_no_per_cookie',
    (j ->> 'qty')::int = 0 and (j ->> 'rejects')::int = 6 and (j ->> 'cost_cents')::numeric = 1800 and (j ->> 'per_cookie_cents') is null
    and pg_temp.baked(9, 'bcp5') is null);
  -- L: the dough of the same flavour takes all 30 g of sugar as short (nothing on hand): 30 x 60 = 1800 for 6 balls, 300 a ball; a batch of 6
  -- from it costs 6 x 300 = 1800
  perform pg_temp.dough_mix(a, 'DL', 'bcp5', 6, 2.5);
  perform pg_temp.batch(a, 'L', 'bcp5', 6, 0, 9, 1.5);
  j := pg_temp.bj('L', 9);
  perform pg_temp.assert_ok(a, 'corr_cost_dough_counts_the_short',
    (j ->> 'cost_cents')::numeric = 1800 and (j ->> 'cost_complete')::boolean and (j ->> 'per_cookie_cents')::numeric = 300 and pg_temp.baked(9, 'bcp5') = 6);
  -- K as a record from before shortfalls were costed (the 20 g short is only a note on it): the 10 g taken is all that is added
  -- up (600), and the cost says it is not complete
  perform pg_temp.make_legacy('K');
  j := pg_temp.bj('K', 9);
  perform pg_temp.assert_ok(a, 'corr_cost_legacy_short_not_complete',
    (j ->> 'cost_cents')::numeric = 600 and not (j ->> 'cost_complete')::boolean);

  -- the screens' parser still reads every answer; correction rows are never listed as batches
  perform pg_temp.assert_ok(a, 'corr_parser_shape',
    pg_temp.shape_ok(public.get_production(5)) and pg_temp.shape_ok(public.get_production(6)) and pg_temp.shape_ok(public.get_production(7))
    and pg_temp.shape_ok(public.get_production(8)) and pg_temp.shape_ok(public.get_production(9)));
  perform pg_temp.assert_ok(a, 'corr_batches_exclude_corrections',
    jsonb_array_length(public.get_production(5) -> 'batches') = pg_temp.n_rows('batch') and pg_temp.n_rows('batch_correction') = 8);
end $$;

grant execute on function
  pg_temp.uid(text), pg_temp.row_json(text), pg_temp.make_legacy(text), pg_temp.n_rows(text), pg_temp.moves_n(), pg_temp.ledger_n(), pg_temp.audit_n(text), pg_temp.onhand(text),
  pg_temp.corrections(text), pg_temp.deltas(text), pg_temp.bj(text, integer), pg_temp.baked(integer, text), pg_temp.dough(text), pg_temp.books(),
  pg_temp.jt(jsonb, text), pg_temp.shape_ok(jsonb), pg_temp.ms(numeric),
  pg_temp.mv(text, text, text, text, numeric, numeric, numeric), pg_temp.batch(text, text, text, numeric, numeric, integer, numeric),
  pg_temp.dough_mix(text, text, text, numeric, numeric), pg_temp.cb(text, text, numeric, numeric, jsonb, text[]), pg_temp.cor(text, text, jsonb, text),
  pg_temp.db(text, text, numeric, integer), pg_temp.dis(text, text, jsonb, text),
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
