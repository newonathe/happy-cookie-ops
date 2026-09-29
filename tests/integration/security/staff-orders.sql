-- B3 staff order RPCs with real SQL roles; all data rolls back.
--
-- get_staff_orders / staff_confirm_payment / staff_reject_payment / staff_reopen_order /
-- staff_set_status / staff_flag_item / staff_swap_item / staff_refund / staff_settle_balance: the
-- active owner only (a helper, support, an inactive owner, service_role and anon are all refused; anon
-- does not even hold EXECUTE). The harness neutralises each `-- rule:` line of
-- supabase/migrations/20260101003700_staff_orders.sql in turn (scripts/test-db-security.py,
-- STAFF_MUTATIONS) and requires the matching case here to fail. Direct UPDATE on orders and
-- order_items is revoked from the API roles, so the owner cannot step around the rules.
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b3c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b3c00000-0000-4000-8000-000000000001', 'owner', 'Staff owner', true),
  ('b3c00000-0000-4000-8000-000000000002', 'helper', 'Staff helper', true),
  ('b3c00000-0000-4000-8000-000000000003', 'support', 'Staff support', true),
  ('b3c00000-0000-4000-8000-000000000004', 'owner', 'Staff inactive owner', false);

insert into public.products(id, name, short_name, price_cents, kind, published, active, sort_order, capacity_weight) values
  ('b3-a', 'B3 A', 'A', 10000, 'Permanent', true, true, 1, 1),
  ('b3-b', 'B3 B', 'B', 10000, 'Permanent', true, true, 2, 1),
  ('b3-c', 'B3 C', 'C', 15000, 'Permanent', true, true, 3, 1),
  ('b3-fries', 'B3 fries', 'F', 20000, 'Permanent', true, true, 4, 4),
  ('b3-off', 'B3 off', 'O', 10000, 'Permanent', false, true, 5, 1);

create function pg_temp.monday() returns date language sql stable as $$
  select d from (select (now() at time zone 'Asia/Manila')::date + s as d from generate_series(1, 7) s) q
   where extract(isodow from d) = 1 $$;

-- Fixture orders, written as the fixture owner of the transaction (not through any API role).
-- The capacity week (one Monday) holds S9 (197), S14 (2) and the lapsed unpaid S8 (2): S9 + S14 leave one
-- slot, so paying S8 is refused and a heavier swap on S14 is refused.
insert into public.orders(id, customer_name, phone, state, pay_state, pay_method, total_cents, paid_cents,
                          placed_at, pickup_date, pickup_window, status_token) values
  ('HC-S1',  'S1',  '09170000001', 'Payment review', 'unpaid',    'GCash', 20000, null,  now(), null, '10:00', encode(sha256('S1'::bytea), 'hex')),
  ('HC-S2',  'S2',  '09170000002', 'Payment review', 'unpaid',    'GCash', 10000, null,  now(), null, '10:00', encode(sha256('S2'::bytea), 'hex')),
  ('HC-S2C', 'S2C', '09170000003', 'Cancelled',      'unpaid',    'GCash', 10000, null,  now(), null, '10:00', encode(sha256('S2C'::bytea), 'hex')),
  ('HC-S3',  'S3',  '09170000004', 'Confirmed',      'confirmed', 'GCash', 20000, 20000, now(), null, '10:00', encode(sha256('S3'::bytea), 'hex')),
  ('HC-S4',  'S4',  '09170000005', 'Confirmed',      'confirmed', 'GCash', 10000, 10000, now(), null, '10:00', encode(sha256('S4'::bytea), 'hex')),
  ('HC-S5',  'S5',  '09170000006', 'Confirmed',      'confirmed', 'GCash', 20000, 20000, now(), null, '10:00', encode(sha256('S5'::bytea), 'hex')),
  ('HC-S6',  'S6',  '09170000007', 'Confirmed',      'confirmed', 'GCash', 10000, 10000, now(), null, '10:00', encode(sha256('S6'::bytea), 'hex')),
  ('HC-S7',  'S7',  '09170000008', 'Confirmed',      'confirmed', 'GCash', 20000, 10000, now(), null, '10:00', encode(sha256('S7'::bytea), 'hex')),
  ('HC-S8',  'S8',  '09170000009', 'Payment review', 'unpaid',    'GCash', 20000, null,  now() - interval '3 days', pg_temp.monday(), '10:00', encode(sha256('S8'::bytea), 'hex')),
  ('HC-S9',  'S9',  '09170000010', 'Confirmed',      'confirmed', 'GCash', 1970000, 1970000, now(), pg_temp.monday(), '10:00', encode(sha256('S9'::bytea), 'hex')),
  ('HC-S10', 'S10', '09170000011', 'Cancelled',      'refunded',  'GCash', 10000, 10000, now(), null, '10:00', encode(sha256('S10'::bytea), 'hex')),
  ('HC-S11', 'S11', '09170000012', 'Payment review', 'unpaid',    'GCash', 10000, null,  now(), null, '10:00', encode(sha256('S11'::bytea), 'hex')),
  ('HC-S12', 'S12', '09170000013', 'Ready',          'confirmed', 'GCash', 10000, 10000, now(), null, '10:00', encode(sha256('S12'::bytea), 'hex')),
  ('HC-S13', 'S13', '09170000014', 'Confirmed',      'confirmed', 'GCash', 19000, 19000, now(), null, '10:00', encode(sha256('S13'::bytea), 'hex')),
  ('HC-S14', 'S14', '09170000015', 'Confirmed',      'confirmed', 'GCash', 20000, 20000, now(), pg_temp.monday(), '10:00', encode(sha256('S14'::bytea), 'hex')),
  -- S15: a total that carries more than its items (a surcharge); S16: a line stored at weight 2; S17: rejected, its slots gone.
  ('HC-S15', 'S15', '09170000016', 'Confirmed',      'confirmed', 'GCash', 30000, 30000, now(), null, '10:00', encode(sha256('S15'::bytea), 'hex')),
  ('HC-S16', 'S16', '09170000017', 'Confirmed',      'confirmed', 'GCash', 25000, 25000, now(), null, '10:00', encode(sha256('S16'::bytea), 'hex')),
  ('HC-S17', 'S17', '09170000018', 'Cancelled',      'unpaid',    'GCash', 10000, null,  now(), pg_temp.monday(), '10:00', encode(sha256('S17'::bytea), 'hex')),
  -- S18: one number with two unpaid orders holding slots (the limit is 2) and a rejected third, in an empty week.
  ('HC-S18a', 'S18a', '09170000030', 'Payment review', 'unpaid', 'GCash', 10000, null, now(), null, '10:00', encode(sha256('S18a'::bytea), 'hex')),
  ('HC-S18b', 'S18b', '09170000030', 'Payment review', 'unpaid', 'GCash', 10000, null, now(), null, '10:00', encode(sha256('S18b'::bytea), 'hex')),
  ('HC-S18c', 'S18c', '09170000030', 'Cancelled',      'unpaid', 'GCash', 10000, null, now(), pg_temp.monday() + 14, '10:00', encode(sha256('S18c'::bytea), 'hex'));
insert into public.order_items(order_id, product_id, qty, unit_price_cents, capacity_weight, unavailable) values
  ('HC-S1', 'b3-a', 2, 10000, 1, false), ('HC-S2', 'b3-a', 1, 10000, 1, false), ('HC-S2C', 'b3-a', 1, 10000, 1, false),
  ('HC-S3', 'b3-a', 2, 10000, 1, false), ('HC-S4', 'b3-a', 1, 10000, 1, true), ('HC-S5', 'b3-a', 2, 10000, 1, false),
  ('HC-S6', 'b3-a', 1, 10000, 1, false), ('HC-S7', 'b3-a', 2, 10000, 1, false), ('HC-S8', 'b3-a', 2, 10000, 1, false),
  ('HC-S9', 'b3-a', 197, 10000, 1, false), ('HC-S10', 'b3-a', 1, 10000, 1, false), ('HC-S11', 'b3-a', 1, 10000, 1, false),
  ('HC-S12', 'b3-a', 1, 10000, 1, false), ('HC-S13', 'b3-a', 1, 10000, 1, false), ('HC-S13', 'b3-c', 1, 9000, 1, false),
  ('HC-S14', 'b3-a', 2, 10000, 1, false),
  ('HC-S15', 'b3-a', 2, 10000, 1, false), ('HC-S16', 'b3-a', 1, 10000, 1, false), ('HC-S16', 'b3-c', 1, 15000, 2, false),
  ('HC-S17', 'b3-a', 1, 10000, 1, false), ('HC-S18a', 'b3-a', 1, 10000, 1, false), ('HC-S18b', 'b3-a', 1, 10000, 1, false),
  ('HC-S18c', 'b3-a', 1, 10000, 1, false);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b3c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

-- The order's current stamp, read the way the screen reads it (the owner's list).
create function pg_temp.stamp(id text) returns timestamptz language sql stable security invoker as $$
  select (x ->> 'updated_at')::timestamptz from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' = id $$;
create function pg_temp.st(id text) returns text language sql immutable as $$
  select 'pg_temp.stamp(' || quote_literal(id) || ')' $$;
create function pg_temp.ord(id text) returns jsonb language sql stable security invoker as $$
  select x from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' = id $$;

-- Runs one statement and records its SQLSTATE; anything but `wanted` fails the suite.
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
    raise exception 'staff outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'staff check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- anon must not hold EXECUTE on any staff RPC: the in-function role check alone is not enough.
create function pg_temp.assert_anon_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['get_staff_orders()', 'staff_confirm_payment(text,timestamptz,boolean)',
      'staff_reject_payment(text,timestamptz)', 'staff_reopen_order(text,timestamptz)',
      'staff_set_status(text,public.order_state,timestamptz)', 'staff_flag_item(text,text,boolean,timestamptz)',
      'staff_swap_item(text,text,text,uuid,timestamptz)', 'staff_refund(text,text,timestamptz)',
      'staff_settle_balance(text,timestamptz)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden staff order call succeeded: anon / %', split_part(f, '(', 1);
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'staff_rpcs_no_execute');
end $$;

-- Every staff call, refused (42501) for a caller who is not the active owner.
create function pg_temp.assert_denied(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_staff_orders', 'select public.get_staff_orders()', '42501');
  perform pg_temp.expect(actor, 'staff_confirm_payment', 'select * from public.staff_confirm_payment(''HC-S1'', null, false)', '42501');
  perform pg_temp.expect(actor, 'staff_reject_payment', 'select * from public.staff_reject_payment(''HC-S1'', null)', '42501');
  perform pg_temp.expect(actor, 'staff_reopen_order', 'select * from public.staff_reopen_order(''HC-S2C'', null)', '42501');
  perform pg_temp.expect(actor, 'staff_set_status', 'select * from public.staff_set_status(''HC-S3'', ''Preparing'', null)', '42501');
  perform pg_temp.expect(actor, 'staff_flag_item', 'select * from public.staff_flag_item(''HC-S5'', ''b3-a'', true, null)', '42501');
  perform pg_temp.expect(actor, 'staff_swap_item',
    'select * from public.staff_swap_item(''HC-S5'', ''b3-a'', ''b3-b'', ''b3f00000-0000-4000-8000-000000000001'', null)', '42501');
  perform pg_temp.expect(actor, 'staff_refund', 'select * from public.staff_refund(''HC-S6'', ''x'', null)', '42501');
  perform pg_temp.expect(actor, 'staff_settle_balance', 'select * from public.staff_settle_balance(''HC-S7'', null)', '42501');
  -- service_role is the trusted server role and keeps direct table access; every API role loses it.
  if actor <> 'service_role' then
    perform pg_temp.expect(actor, 'orders_table_update', 'update public.orders set notes = notes where id = ''HC-S1''', '42501');
  end if;
end $$;

create function pg_temp.assert_owner() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  old text := '''2000-01-01 00:00+00''::timestamptz';
  conf text := 'select * from public.staff_confirm_payment(%L, %s, %s)';
  rej text := 'select * from public.staff_reject_payment(%L, %s)';
  reo text := 'select * from public.staff_reopen_order(%L, %s)';
  stat text := 'select * from public.staff_set_status(%L, %L, %s)';
  flag text := 'select * from public.staff_flag_item(%L, %L, %s, %s)';
  swap text := 'select * from public.staff_swap_item(%L, %L, %L, %L, %s)';
  refu text := 'select * from public.staff_refund(%L, %L, %s)';
  sett text := 'select * from public.staff_settle_balance(%L, %s)';
begin
  perform pg_temp.assert_ok(a, 'list_has_orders_and_tokens',
    (select count(*) from jsonb_array_elements(public.get_staff_orders()) x where x ->> 'id' like 'HC-S%') = 21
    and pg_temp.ord('HC-S1') ->> 'status_token' = encode(sha256('S1'::bytea), 'hex'));
  perform pg_temp.assert_ok(a, 'list_marks_lapsed_unpaid_as_not_holding',
    (pg_temp.ord('HC-S8') ->> 'holds')::boolean is false and (pg_temp.ord('HC-S1') ->> 'holds')::boolean is true);
  perform pg_temp.expect(a, 'orders_table_update', 'update public.orders set notes = notes where id = ''HC-S1''', '42501');
  perform pg_temp.expect(a, 'order_items_table_update', 'update public.order_items set qty = qty where order_id = ''HC-S1''', '42501');
  perform pg_temp.expect(a, 'order_swaps_table_select', 'select * from public.order_swaps', '42501');
  perform pg_temp.expect(a, 'unknown_order', format(sett, 'HC-NOPE', old), '02000');

  -- the paid tick
  perform pg_temp.expect(a, 'confirm_stale', format(conf, 'HC-S1', old, 'false'), 'P0002');
  perform pg_temp.expect(a, 'confirm_paid', format(conf, 'HC-S1', pg_temp.st('HC-S1'), 'false'), '00000');
  perform pg_temp.assert_ok(a, 'confirm_sets_paid_in_full',
    pg_temp.ord('HC-S1') ->> 'state' = 'Confirmed' and pg_temp.ord('HC-S1') ->> 'pay_state' = 'confirmed'
    and (pg_temp.ord('HC-S1') ->> 'paid_cents')::bigint = 20000);
  perform pg_temp.expect(a, 'confirm_replay', format(conf, 'HC-S1', old, 'false'), '00000');
  perform pg_temp.expect(a, 'confirm_cancelled', format(conf, 'HC-S2C', pg_temp.st('HC-S2C'), 'false'), '55000');
  perform pg_temp.expect(a, 'confirm_lapsed_over_capacity', format(conf, 'HC-S8', pg_temp.st('HC-S8'), 'false'), 'ZC002');
  perform pg_temp.expect(a, 'confirm_lapsed_forced', format(conf, 'HC-S8', pg_temp.st('HC-S8'), 'true'), '00000');

  -- reject and reopen
  perform pg_temp.expect(a, 'reject_stale', format(rej, 'HC-S2', old), 'P0002');
  perform pg_temp.expect(a, 'reject_paid_order', format(rej, 'HC-S3', pg_temp.st('HC-S3')), '55000');
  perform pg_temp.expect(a, 'reject_ok', format(rej, 'HC-S2', pg_temp.st('HC-S2')), '00000');
  perform pg_temp.expect(a, 'reject_replay', format(rej, 'HC-S2', old), '00000');
  perform pg_temp.expect(a, 'reopen_stale', format(reo, 'HC-S2', old), 'P0002');
  perform pg_temp.expect(a, 'reopen_paid_order', format(reo, 'HC-S3', pg_temp.st('HC-S3')), '55000');
  perform pg_temp.expect(a, 'reopen_refunded', format(reo, 'HC-S10', pg_temp.st('HC-S10')), '55000');
  perform pg_temp.expect(a, 'reopen_ok', format(reo, 'HC-S2', pg_temp.st('HC-S2')), '00000');
  perform pg_temp.expect(a, 'reopen_replay', format(reo, 'HC-S2', old), '00000');
  -- A reopened order holds slots again: the number's unpaid limit and the week's room are checked.
  perform pg_temp.expect(a, 'reopen_phone_limit', format(reo, 'HC-S18c', pg_temp.st('HC-S18c')), 'ZC003');
  perform pg_temp.expect(a, 'reopen_over_capacity', format(reo, 'HC-S17', pg_temp.st('HC-S17')), 'ZC002');

  -- baking, packed, collected
  perform pg_temp.expect(a, 'status_illegal', format(stat, 'HC-S3', 'Completed', pg_temp.st('HC-S3')), '55000');
  perform pg_temp.expect(a, 'status_unpaid_illegal', format(stat, 'HC-S11', 'Preparing', pg_temp.st('HC-S11')), '55000');
  perform pg_temp.expect(a, 'status_stale', format(stat, 'HC-S3', 'Preparing', old), 'P0002');
  perform pg_temp.expect(a, 'status_preparing', format(stat, 'HC-S3', 'Preparing', pg_temp.st('HC-S3')), '00000');
  perform pg_temp.expect(a, 'status_replay', format(stat, 'HC-S3', 'Preparing', old), '00000');
  perform pg_temp.expect(a, 'status_ready', format(stat, 'HC-S3', 'Ready', pg_temp.st('HC-S3')), '00000');
  perform pg_temp.expect(a, 'status_collected', format(stat, 'HC-S3', 'Completed', pg_temp.st('HC-S3')), '00000');
  perform pg_temp.assert_ok(a, 'collect_stamps_the_time', pg_temp.ord('HC-S3') ->> 'collected_at' is not null);
  perform pg_temp.expect(a, 'status_undo_collect', format(stat, 'HC-S3', 'Ready', pg_temp.st('HC-S3')), '00000');
  perform pg_temp.assert_ok(a, 'undo_collect_clears_the_time', pg_temp.ord('HC-S3') ->> 'collected_at' is null);
  perform pg_temp.expect(a, 'status_no_show', format(stat, 'HC-S3', 'No-show', pg_temp.st('HC-S3')), '00000');
  perform pg_temp.expect(a, 'status_no_show_is_final', format(stat, 'HC-S3', 'Preparing', pg_temp.st('HC-S3')), '55000');
  perform pg_temp.expect(a, 'pack_flagged', format(stat, 'HC-S4', 'Ready', pg_temp.st('HC-S4')), '55000');
  perform pg_temp.expect(a, 'unflag_for_pack', format(flag, 'HC-S4', 'b3-a', 'false', pg_temp.st('HC-S4')), '00000');
  perform pg_temp.expect(a, 'pack_after_unflag', format(stat, 'HC-S4', 'Ready', pg_temp.st('HC-S4')), '00000');

  -- an unavailable flavour
  perform pg_temp.expect(a, 'flag_missing_item', format(flag, 'HC-S5', 'b3-zzz', 'true', pg_temp.st('HC-S5')), '55000');
  perform pg_temp.expect(a, 'flag_stale', format(flag, 'HC-S5', 'b3-a', 'true', old), 'P0002');
  perform pg_temp.expect(a, 'flag_finished', format(flag, 'HC-S12', 'b3-a', 'true', pg_temp.st('HC-S12')), '55000');
  perform pg_temp.expect(a, 'flag_ok', format(flag, 'HC-S5', 'b3-a', 'true', pg_temp.st('HC-S5')), '00000');
  perform pg_temp.expect(a, 'flag_replay', format(flag, 'HC-S5', 'b3-a', 'true', old), '00000');
  perform pg_temp.assert_ok(a, 'flag_is_on_the_line',
    (pg_temp.ord('HC-S5') -> 'items' -> 0 ->> 'unavailable')::boolean is true);

  -- the swap
  perform pg_temp.expect(a, 'swap_stale', format(swap, 'HC-S5', 'b3-a', 'b3-b', 'b3f00000-0000-4000-8000-00000000000a', old), 'P0002');
  perform pg_temp.expect(a, 'swap_finished',
    format(swap, 'HC-S12', 'b3-a', 'b3-b', 'b3f00000-0000-4000-8000-00000000000b', pg_temp.st('HC-S12')), '55000');
  perform pg_temp.expect(a, 'swap_same',
    format(swap, 'HC-S5', 'b3-a', 'b3-a', 'b3f00000-0000-4000-8000-00000000000c', pg_temp.st('HC-S5')), '22023');
  perform pg_temp.expect(a, 'swap_missing_item',
    format(swap, 'HC-S5', 'b3-zzz', 'b3-b', 'b3f00000-0000-4000-8000-00000000000d', pg_temp.st('HC-S5')), '55000');
  perform pg_temp.expect(a, 'swap_menu',
    format(swap, 'HC-S5', 'b3-a', 'b3-off', 'b3f00000-0000-4000-8000-00000000000e', pg_temp.st('HC-S5')), '22023');
  perform pg_temp.expect(a, 'swap_price_clash',
    format(swap, 'HC-S13', 'b3-a', 'b3-c', 'b3f00000-0000-4000-8000-00000000000f', pg_temp.st('HC-S13')), '55000');
  perform pg_temp.expect(a, 'swap_capacity',
    format(swap, 'HC-S14', 'b3-a', 'b3-fries', 'b3f00000-0000-4000-8000-000000000010', pg_temp.st('HC-S14')), 'ZC002');
  perform pg_temp.expect(a, 'swap_ok',
    format(swap, 'HC-S5', 'b3-a', 'b3-c', 'b3f00000-0000-4000-8000-000000000001', pg_temp.st('HC-S5')), '00000');
  perform pg_temp.assert_ok(a, 'swap_reprices_and_leaves_a_balance',
    (pg_temp.ord('HC-S5') ->> 'total_cents')::bigint = 30000 and (pg_temp.ord('HC-S5') ->> 'paid_cents')::bigint = 20000
    and pg_temp.ord('HC-S5') -> 'items' -> 0 ->> 'product_id' = 'b3-c'
    and (pg_temp.ord('HC-S5') -> 'items' -> 0 ->> 'unit_price_cents')::bigint = 15000
    and (pg_temp.ord('HC-S5') -> 'items' -> 0 ->> 'unavailable')::boolean is false);
  perform pg_temp.assert_ok(a, 'swap_is_recorded',
    jsonb_array_length(pg_temp.ord('HC-S5') -> 'swaps') = 1
    and (pg_temp.ord('HC-S5') -> 'swaps' -> 0 ->> 'delta_cents')::bigint = 10000);
  perform pg_temp.expect(a, 'swap_replay',
    format(swap, 'HC-S5', 'b3-a', 'b3-c', 'b3f00000-0000-4000-8000-000000000001', old), '00000');
  perform pg_temp.assert_ok(a, 'swap_replay_changes_nothing',
    (pg_temp.ord('HC-S5') ->> 'total_cents')::bigint = 30000 and jsonb_array_length(pg_temp.ord('HC-S5') -> 'swaps') = 1);
  perform pg_temp.expect(a, 'swap_client_id_reuse',
    format(swap, 'HC-S5', 'b3-a', 'b3-b', 'b3f00000-0000-4000-8000-000000000001', pg_temp.st('HC-S5')), '23505');

  -- a swap keeps what is in the total besides the items, and will not merge into a line of another weight
  perform pg_temp.expect(a, 'swap_keeps_surcharge',
    format(swap, 'HC-S15', 'b3-a', 'b3-b', 'b3f00000-0000-4000-8000-000000000020', pg_temp.st('HC-S15')), '00000');
  perform pg_temp.assert_ok(a, 'swap_keeps_the_surcharge', (pg_temp.ord('HC-S15') ->> 'total_cents')::bigint = 30000);
  perform pg_temp.expect(a, 'swap_weight_clash',
    format(swap, 'HC-S16', 'b3-a', 'b3-c', 'b3f00000-0000-4000-8000-000000000021', pg_temp.st('HC-S16')), '55000');

  -- money: refund and balance
  perform pg_temp.expect(a, 'refund_stale', format(refu, 'HC-S6', 'GC-1', old), 'P0002');
  perform pg_temp.expect(a, 'refund_unpaid', format(refu, 'HC-S11', 'GC-1', pg_temp.st('HC-S11')), '55000');
  perform pg_temp.expect(a, 'refund_ok', format(refu, 'HC-S6', 'GC-1', pg_temp.st('HC-S6')), '00000');
  perform pg_temp.assert_ok(a, 'refund_cancels_and_keeps_the_reference',
    pg_temp.ord('HC-S6') ->> 'state' = 'Cancelled' and pg_temp.ord('HC-S6') ->> 'pay_state' = 'refunded'
    and pg_temp.ord('HC-S6') ->> 'refund_ref' = 'GC-1');
  perform pg_temp.expect(a, 'refund_replay', format(refu, 'HC-S6', 'GC-1', old), '00000');
  perform pg_temp.expect(a, 'settle_stale', format(sett, 'HC-S7', old), 'P0002');
  perform pg_temp.expect(a, 'settle_unpaid', format(sett, 'HC-S11', pg_temp.st('HC-S11')), '55000');
  perform pg_temp.expect(a, 'settle_ok', format(sett, 'HC-S7', pg_temp.st('HC-S7')), '00000');
  perform pg_temp.assert_ok(a, 'settle_pays_the_balance',
    (pg_temp.ord('HC-S7') ->> 'paid_cents')::bigint = (pg_temp.ord('HC-S7') ->> 'total_cents')::bigint);
  perform pg_temp.expect(a, 'settle_replay', format(sett, 'HC-S7', old), '00000');
end $$;

grant execute on function pg_temp.monday(), pg_temp.set_subject(integer, text), pg_temp.stamp(text), pg_temp.st(text),
  pg_temp.ord(text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.assert_anon_acl(), pg_temp.assert_denied(text), pg_temp.assert_owner() to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_anon_acl();
select pg_temp.assert_denied('anon');
reset role;
set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_denied('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_denied('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_denied('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_owner();
reset role;
set local role service_role;
-- A subject with no profile: service_role is not staff, so the staff RPCs refuse it.
select pg_temp.set_subject(9, 'service_role');
select pg_temp.assert_denied('service_role');
reset role;

do $$ begin
  -- What the owner changed is exactly what landed; what a refused caller sent changed nothing.
  if (select state from public.orders where id = 'HC-S1') <> 'Confirmed'
     or (select state from public.orders where id = 'HC-S3') <> 'No-show'
     or (select state from public.orders where id = 'HC-S8') <> 'Confirmed'
     or (select state from public.orders where id = 'HC-S5') <> 'Confirmed'
     or (select count(*) from public.order_swaps) <> 2
     or exists (select 1 from public.order_items where order_id = 'HC-S14' and product_id <> 'b3-a')
     or (select state from public.orders where id = 'HC-S11') <> 'Payment review'
     or (select notes from public.orders where id = 'HC-S1') <> '' then
    raise exception 'staff order effects differ: the database is not what the owner sent';
  end if;
  insert into pg_temp.authority_results values ('effects', 'database', 'as_sent');
end $$;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
