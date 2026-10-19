-- B5-1 get_item_movements with real SQL roles; all data rolls back.
--
-- The owner's read of one stock item's history (migration 66): the active owner only (a helper, support, an inactive owner and anon are
-- all refused; anon does not even hold EXECUTE). The limit is 1 to 200 (22023) and the item must exist (P0002). Rows come newest first by
-- the order the movements were APPLIED (seq), not by their stated date: the fixture's dates are deliberately out of order. A row carries
-- exactly nine keys and never a person: not created_by, not the owner's id anywhere in the answer. A stamped cost shows, an unknown cost
-- stays null (never 0). The harness neutralises each `-- rule:` line of get_item_movements and the text rules named in
-- scripts/test-db-security.py (MOVEMENT_MUTATIONS) in turn and requires the named case here to fail. Outcome messages carry no quote
-- character: the harness redacts quoted literals. Money: unit_cost is centavos per unit, paid_cents is the whole receipt in centavos.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b5a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b5a00000-0000-4000-8000-000000000001', 'owner', 'Movement owner', true),
  ('b5a00000-0000-4000-8000-000000000002', 'helper', 'Movement helper', true),
  ('b5a00000-0000-4000-8000-000000000003', 'support', 'Movement support', true),
  ('b5a00000-0000-4000-8000-000000000004', 'owner', 'Movement inactive owner', false);

insert into public.inventory_items(id, name, unit) values ('m5i-a', 'M5 Alpha', 'g'), ('m5i-b', 'M5 Bravo', 'g');

-- Six movements of M5 Alpha, written in this order (r1 first). Their stated dates are NOT in that order: the newest by date is r6, then r4, r3,
-- r1, r5, r2. The newest two by seq are r6, r5; by date they would be r6, r4. r6 was written by the fixture owner, who must not show.
insert into public.stock_movements(id, item_id, kind, qty_delta, counted, cost_cents, unit_cost, cost_source, supplier, reason, at, payload_hash, created_by) values
  (md5('m5mv:r1')::uuid, 'm5i-a', 'opening', 1000, 1000, null, null, null, '', 'r1', now() - interval '5 days', repeat('a', 64), null),
  (md5('m5mv:r2')::uuid, 'm5i-a', 'receipt', 500, null, 4500, null, null, 'M5 Co', 'r2', now() - interval '9 days', repeat('b', 64), null),
  (md5('m5mv:r3')::uuid, 'm5i-a', 'waste', -20, null, null, 9.5, 'average', '', 'r3', now() - interval '3 days', repeat('c', 64), null),
  (md5('m5mv:r4')::uuid, 'm5i-a', 'count', -30, 1450, null, null, null, '', 'r4', now() - interval '2 days', repeat('d', 64), null),
  (md5('m5mv:r5')::uuid, 'm5i-a', 'adjust', 5, null, null, null, null, '', 'r5', now() - interval '8 days', repeat('e', 64), null),
  (md5('m5mv:r6')::uuid, 'm5i-a', 'use', -100, null, null, 9.5, 'average', '', 'r6', now() - interval '1 day', repeat('f', 64),
   'b5a00000-0000-4000-8000-000000000001');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b5a00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'item movement outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'item movement check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- The reasons of the rows an item answers, in the order answered.
create function pg_temp.reasons(item text, lim integer) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(e.v ->> 'reason' order by e.n), '[]'::jsonb)
    from jsonb_array_elements(public.get_item_movements(item, lim)) with ordinality e(v, n) $$;
create function pg_temp.row_of(reason text) returns jsonb language sql stable as $$
  select e.v from jsonb_array_elements(public.get_item_movements('m5i-a', 50)) e(v) where e.v ->> 'reason' = reason $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.get_item_movements(text,integer)', 'EXECUTE') then
    raise exception 'forbidden movements call succeeded: anon / get_item_movements';
  end if;
  insert into pg_temp.authority_results values ('movements_acl', 'anon', 'movements_rpc_owner_only');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'movements_refused', 'select public.get_item_movements(''m5i-a'', 50)', '42501');
  perform pg_temp.expect(actor, 'movements_refused_empty_item', 'select public.get_item_movements(''m5i-b'', 1)', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
begin
  -- limits: 1 to 200 only. The limit is judged before the item, so a bad limit on an unknown item is still a limit error.
  perform pg_temp.expect(a, 'movements_limit_zero', 'select public.get_item_movements(''m5i-a'', 0)', '22023');
  perform pg_temp.expect(a, 'movements_limit_negative', 'select public.get_item_movements(''m5i-a'', -1)', '22023');
  perform pg_temp.expect(a, 'movements_limit_201', 'select public.get_item_movements(''m5i-a'', 201)', '22023');
  perform pg_temp.expect(a, 'movements_limit_null', 'select public.get_item_movements(''m5i-a'', null)', '22023');
  perform pg_temp.expect(a, 'movements_limit_one', 'select public.get_item_movements(''m5i-a'', 1)', '00000');
  perform pg_temp.expect(a, 'movements_limit_200', 'select public.get_item_movements(''m5i-a'', 200)', '00000');
  -- the item must exist
  perform pg_temp.expect(a, 'movements_item_unknown', 'select public.get_item_movements(''m5i-none'', 10)', 'P0002');
  perform pg_temp.expect(a, 'movements_item_null', 'select public.get_item_movements(null, 10)', 'P0002');
  perform pg_temp.expect(a, 'movements_item_empty_text', 'select public.get_item_movements('''', 10)', 'P0002');
  perform pg_temp.expect(a, 'movements_limit_before_item', 'select public.get_item_movements(''m5i-none'', 0)', '22023');

  -- newest first, by the order applied (seq), not by the stated date
  perform pg_temp.assert_ok(a, 'movements_newest_first', pg_temp.reasons('m5i-a', 50) = '["r6", "r5", "r4", "r3", "r2", "r1"]'::jsonb);
  perform pg_temp.assert_ok(a, 'movements_limit_keeps_the_newest', pg_temp.reasons('m5i-a', 2) = '["r6", "r5"]'::jsonb);
  perform pg_temp.assert_ok(a, 'movements_limit_one_is_the_newest', pg_temp.reasons('m5i-a', 1) = '["r6"]'::jsonb);
  perform pg_temp.assert_ok(a, 'movements_limit_larger_than_rows', jsonb_array_length(public.get_item_movements('m5i-a', 200)) = 6);
  perform pg_temp.assert_ok(a, 'movements_item_without_rows_is_empty', public.get_item_movements('m5i-b', 10) = '[]'::jsonb);

  -- exactly nine keys on every row and no person anywhere in the answer
  perform pg_temp.assert_ok(a, 'movements_row_keys', (
    select bool_and((select array_agg(k order by k) from jsonb_object_keys(e.v) k) =
      array['at', 'cost_source', 'id', 'kind', 'paid_cents', 'qty_delta', 'reason', 'supplier', 'unit_cost'])
      from jsonb_array_elements(public.get_item_movements('m5i-a', 50)) e(v)));
  perform pg_temp.assert_ok(a, 'movements_no_person_column',
    position('created_by' in public.get_item_movements('m5i-a', 50)::text) = 0
    and position('b5a00000-0000-4000-8000-000000000001' in public.get_item_movements('m5i-a', 50)::text) = 0);

  -- what each row says
  perform pg_temp.assert_ok(a, 'movements_stamped_cost_shows',
    pg_temp.row_of('r3') ->> 'kind' = 'waste' and (pg_temp.row_of('r3') ->> 'unit_cost')::numeric = 9.5
    and pg_temp.row_of('r3') ->> 'cost_source' = 'average' and (pg_temp.row_of('r3') ->> 'qty_delta')::numeric = -20
    and pg_temp.row_of('r6') ->> 'kind' = 'use' and (pg_temp.row_of('r6') ->> 'unit_cost')::numeric = 9.5);
  perform pg_temp.assert_ok(a, 'movements_unknown_cost_stays_null',
    jsonb_typeof(pg_temp.row_of('r4') -> 'unit_cost') = 'null' and jsonb_typeof(pg_temp.row_of('r4') -> 'cost_source') = 'null'
    and jsonb_typeof(pg_temp.row_of('r1') -> 'unit_cost') = 'null' and jsonb_typeof(pg_temp.row_of('r1') -> 'paid_cents') = 'null');
  perform pg_temp.assert_ok(a, 'movements_receipt_paid_and_supplier',
    (pg_temp.row_of('r2') ->> 'paid_cents')::bigint = 4500 and pg_temp.row_of('r2') ->> 'supplier' = 'M5 Co'
    and (pg_temp.row_of('r2') ->> 'qty_delta')::numeric = 500 and jsonb_typeof(pg_temp.row_of('r2') -> 'unit_cost') = 'null');
  perform pg_temp.assert_ok(a, 'movements_numbers_are_numbers',
    jsonb_typeof(pg_temp.row_of('r3') -> 'qty_delta') = 'number' and jsonb_typeof(pg_temp.row_of('r3') -> 'unit_cost') = 'number'
    and jsonb_typeof(pg_temp.row_of('r2') -> 'paid_cents') = 'number' and jsonb_typeof(pg_temp.row_of('r3') -> 'at') = 'number');
  perform pg_temp.assert_ok(a, 'movements_at_is_epoch_milliseconds',
    (pg_temp.row_of('r6') ->> 'at')::bigint = (extract(epoch from now() - interval '1 day') * 1000)::bigint
    and pg_temp.row_of('r6') ->> 'id' = md5('m5mv:r6')::uuid::text);
end $$;

grant execute on function
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.reasons(text, integer), pg_temp.row_of(text), pg_temp.assert_acl(), pg_temp.assert_refused(text), pg_temp.phase_owner(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_refused('anon');
reset role;

set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_refused('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_refused('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_refused('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.phase_owner('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
