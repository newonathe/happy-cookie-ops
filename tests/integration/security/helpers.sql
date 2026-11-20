-- S3 helper accounts (migration 20260101009500): expiry, the owner's four commands, and what an active helper may do on the day that is open
-- now (read it, sell, take back their own sale, add a stall expense, close it) and nothing else. Real calls as each caller; all data rolls back.
begin;
insert into auth.users(id, email) values
 ('b0950000-0000-4000-8000-000000000001', 'owner@example.test'),
 ('b0950000-0000-4000-8000-000000000002', 'helper.a@example.test'),
 ('b0950000-0000-4000-8000-000000000003', 'helper.b@example.test'),
 ('b0950000-0000-4000-8000-000000000004', 'helper.expired@example.test'),
 ('b0950000-0000-4000-8000-000000000005', 'helper.removed@example.test'),
 ('b0950000-0000-4000-8000-000000000006', 'support@example.test');
insert into public.profiles(id, role, display_name, active, access_expires_at) values
 ('b0950000-0000-4000-8000-000000000001', 'owner', 'Owner', true, null),
 ('b0950000-0000-4000-8000-000000000002', 'helper', 'Helper A', true, null),
 ('b0950000-0000-4000-8000-000000000003', 'helper', 'Helper B', true, now() + interval '1 hour'),
 ('b0950000-0000-4000-8000-000000000004', 'helper', 'Helper expired', true, now() - interval '1 minute'),
 ('b0950000-0000-4000-8000-000000000005', 'helper', 'Helper removed', false, null),
 ('b0950000-0000-4000-8000-000000000006', 'support', 'Support', true, null);
insert into public.products(id, name, short_name, price_cents, kind) values
 ('hp-a', 'Helper flavour A', 'A', 10000, 'Permanent'), ('hp-b', 'Helper flavour B', 'B', 5000, 'Permanent');

create function pg_temp.act(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$f$;
create function pg_temp.expect(label text, q text, wanted text) returns void language plpgsql as $f$
declare got text; msg text;
begin
  begin
    execute q;
    got := null;
  exception when others then
    got := sqlstate;
    msg := sqlerrm;
  end;
  if got is distinct from wanted then
    raise exception 'HELPERS % : wanted %, got % (%)', label, coalesce(wanted, 'success'), coalesce(got, 'success'), msg;
  end if;
end;
$f$;
-- A booking of `n_days` days from today; its first day is started (the event is open) unless `state` says otherwise.
-- state: 'open' | 'closed' | 'planned'. 40 of A and 30 of B on the table; A 100.00, B 50.00.
create function pg_temp.day(p uuid, p_name text, state text, n_days integer default 1) returns uuid language plpgsql as $f$
declare d uuid := md5(p::text || ':d')::uuid; e uuid := md5(p::text || ':e')::uuid;
begin
  insert into public.scheduled_events(id, name, starts_on, ends_on, rent_cents) values (p, p_name, current_date, current_date + (n_days - 1), 0);
  if state <> 'planned' then
    insert into public.events(id, name, starts_at, selling_device, price_snapshot, opened_at, loaded, closed_at)
      values (e, p_name || ' day', now() - interval '1 hour', 'devP', '{"hp-a": 10000, "hp-b": 5000}', now() - interval '1 hour',
              '{"hp-a": 40, "hp-b": 30}', case when state = 'closed' then now() - interval '10 minutes' end);
  end if;
  insert into public.bazaar_days(id, scheduled_id, day, float_cents, event_id, plan_hash)
    values (d, p, current_date, 25000, case when state <> 'planned' then e end, repeat('a', 64));
  insert into public.bazaar_day_lines(day_id, product_id, made_qty, carried_qty, price_cents)
    values (d, 'hp-a', 40, 0, 10000), (d, 'hp-b', 30, 0, 5000);
  return d;
end;
$f$;
create function pg_temp.event_of(d uuid) returns uuid language sql stable as $f$ select event_id from public.bazaar_days where id = d $f$;
create function pg_temp.sale(dev text, n integer, d uuid, items jsonb, total bigint, secs integer default 0)
returns jsonb language sql stable as $f$
  select jsonb_build_object('clientId', dev || ':S' || n, 'deviceId', dev, 'eventId', pg_temp.event_of(d), 'items', items,
    'discountCents', 0, 'totalCents', total, 'pay', 'Cash', 'ref', '', 'clerk', 'Someone',
    'at', (extract(epoch from now() + make_interval(secs => secs)) * 1000)::bigint, 'tenderedCents', total, 'changeCents', 0)
$f$;
create function pg_temp.void(client text, secs integer default 0) returns jsonb language sql stable as $f$
  select jsonb_build_object('clientId', client, 'deviceId', split_part(client, ':', 1),
    'at', (extract(epoch from now() + make_interval(secs => secs)) * 1000)::bigint)
$f$;
create function pg_temp.expense(client text, d uuid, cents bigint) returns jsonb language sql stable as $f$
  select jsonb_build_object('clientId', client, 'eventId', pg_temp.event_of(d), 'label', 'Ice', 'category', 'Bazaar rent',
    'amountCents', cents, 'at', (extract(epoch from now()) * 1000)::bigint)
$f$;
-- The helper's close: what is left of each flavour, counted; the split they send is ignored.
create function pg_temp.closing(d uuid, left_a integer, left_b integer, secs integer default 0) returns jsonb language sql stable as $f$
  select jsonb_build_object('day_id', d, 'at', (extract(epoch from now() + make_interval(secs => secs)) * 1000)::bigint,
    'counted_cents', 41000, 'expected', repeat('0', 64), 'sales_count', null, 'cash_cents', null,
    'lines', jsonb_build_object(
      'hp-a', jsonb_build_object('left', left_a, 'carry_next', 0, 'to_shop', 0, 'written_off', left_a),
      'hp-b', jsonb_build_object('left', left_b, 'carry_next', 0, 'to_shop', 0, 'written_off', left_b)))
$f$;

do $$
declare
  owner uuid := 'b0950000-0000-4000-8000-000000000001';
  ha uuid := 'b0950000-0000-4000-8000-000000000002';
  hb uuid := 'b0950000-0000-4000-8000-000000000003';
  hx uuid := 'b0950000-0000-4000-8000-000000000004';
  hr uuid := 'b0950000-0000-4000-8000-000000000005';
  sup uuid := 'b0950000-0000-4000-8000-000000000006';
  bad uuid;
  d_open uuid; d_closed uuid; d_plan uuid; d_last uuid;
  ev uuid;
  r record;
  j jsonb;
  n integer;
  inv uuid;
  line jsonb;
begin
  d_open := pg_temp.day('b0951000-0000-4000-8000-000000000001', 'Open fair', 'open', 2);
  d_closed := pg_temp.day('b0951000-0000-4000-8000-000000000002', 'Closed fair', 'closed');
  d_plan := pg_temp.day('b0951000-0000-4000-8000-000000000003', 'Planned fair', 'planned');
  ev := pg_temp.event_of(d_open);

  -- ---- who may call what
  if has_function_privilege('anon', 'public.get_open_bazaar_day()', 'EXECUTE') or not has_function_privilege('authenticated', 'public.get_open_bazaar_day()', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_people()', 'EXECUTE') or not has_function_privilege('authenticated', 'public.list_people()', 'EXECUTE')
     or has_function_privilege('anon', 'public.add_helper(text, timestamptz)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.add_helper(text, timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_helper_expiry(uuid, timestamptz)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.set_helper_expiry(uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.revoke_helper(uuid)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.revoke_helper(uuid)', 'EXECUTE') then
    raise exception 'HELPERS_GRANTS the owner commands changed';
  end if;
  if has_function_privilege('anon', 'public.is_active_helper()', 'EXECUTE') or has_function_privilege('authenticated', 'public.is_active_helper()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.is_active_helper()', 'EXECUTE')
     or has_function_privilege('anon', 'public.bazaar_event_open(uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'public.bazaar_event_open(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.bazaar_event_open(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.bazaar_day_open(uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'public.bazaar_day_open(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.bazaar_day_open(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.bazaar_event_accepts(uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.bazaar_event_accepts(uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.bazaar_event_accepts(uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.bazaar_day_access(uuid)', 'EXECUTE') then
    raise exception 'HELPERS_GRANTS an internal function is callable';
  end if;
  if has_table_privilege('authenticated', 'public.helper_invites', 'SELECT') or has_table_privilege('anon', 'public.helper_invites', 'SELECT')
     or has_table_privilege('authenticated', 'public.helper_invites', 'INSERT') then
    raise exception 'HELPERS_GRANTS helper_invites is reachable';
  end if;

  -- ---- roles by expiry: an expired or removed profile has no role at all
  perform pg_temp.act(ha);
  if public.current_role_name() is distinct from 'helper' or not public.is_staff() or public.is_owner() or not public.is_active_helper() then
    raise exception 'HELPERS a permanent helper reads wrong';
  end if;
  perform pg_temp.act(hb);
  if public.current_role_name() is distinct from 'helper' then raise exception 'HELPERS a helper before the expiry has no role'; end if;
  perform pg_temp.act(hx);
  if public.current_role_name() is not null or public.is_staff() or public.is_owner() or public.is_active_helper() then
    raise exception 'HELPERS an expired helper still has a role';
  end if;
  perform pg_temp.act(hr);
  if public.current_role_name() is not null or public.is_active_helper() then raise exception 'HELPERS a removed helper still has a role'; end if;
  perform pg_temp.act(owner);
  if public.current_role_name() is distinct from 'owner' or not public.is_owner() or public.is_active_helper() then raise exception 'HELPERS the owner changed'; end if;
  -- An expired owner (should one ever be set) loses the role too: one rule for every profile.
  update public.profiles set access_expires_at = now() - interval '1 second' where id = sup;
  perform pg_temp.act(sup);
  if public.current_role_name() is not null then raise exception 'HELPERS an expired support profile kept its role'; end if;
  update public.profiles set access_expires_at = null where id = sup;

  -- ---- the one rule for "open"
  if not public.bazaar_day_open(d_open) or public.bazaar_day_open(d_closed) or public.bazaar_day_open(d_plan) or public.bazaar_day_open(gen_random_uuid())
     or not public.bazaar_event_open(ev) or public.bazaar_event_open(pg_temp.event_of(d_closed)) or public.bazaar_event_open(null) then
    raise exception 'HELPERS what is open reads wrong';
  end if;

  -- ---- reading: an active helper reads the open day and no other; everybody else is refused
  perform pg_temp.act(ha);
  j := public.get_bazaar_day(d_open);
  if j ->> 'status' <> 'open' or j -> 'table_stock' <> '{"hp-a": 40, "hp-b": 30}'::jsonb then raise exception 'HELPERS the helper reads the open day wrong: %', j; end if;
  perform pg_temp.expect('read closed day', format('select public.get_bazaar_day(%L)', d_closed), '42501');
  perform pg_temp.expect('read planned day', format('select public.get_bazaar_day(%L)', d_plan), '42501');
  perform pg_temp.expect('read no such day', format('select public.get_bazaar_day(%L)', gen_random_uuid()), '42501');
  perform pg_temp.expect('read null day', 'select public.get_bazaar_day(null)', '42501');
  j := public.get_open_bazaar_day();
  if j ->> 'day_id' <> d_open::text or j ->> 'name' <> 'Open fair' or j ->> 'event_id' <> ev::text
     or j ->> 'booking_id' <> 'b0951000-0000-4000-8000-000000000001' or j ->> 'day' <> to_char(current_date, 'YYYY-MM-DD') then
    raise exception 'HELPERS the open day reads wrong: %', j;
  end if;
  foreach bad in array array[hx, hr, sup] loop
    perform pg_temp.act(bad);
    perform pg_temp.expect('refused read', format('select public.get_bazaar_day(%L)', d_open), '42501');
    perform pg_temp.expect('refused open day', 'select public.get_open_bazaar_day()', '42501');
    perform pg_temp.expect('refused sale', format('select * from public.record_event_sale(%L)', pg_temp.sale('devX', 1, d_open, '{"hp-a": 1}', 10000)), '42501');
    perform pg_temp.expect('refused void', format('select * from public.void_event_sale(%L)', pg_temp.void('devX:S1')), '42501');
    perform pg_temp.expect('refused expense', format('select * from public.add_event_expense(%L)', pg_temp.expense('x1', d_open, 100)), '42501');
    perform pg_temp.expect('refused close', format('select public.close_bazaar_day(%L)', pg_temp.closing(d_open, 1, 1)), '42501');
  end loop;
  perform pg_temp.act(null);
  perform pg_temp.expect('anonymous read', format('select public.get_bazaar_day(%L)', d_open), '42501');
  perform pg_temp.expect('anonymous sale', format('select * from public.record_event_sale(%L)', pg_temp.sale('devX', 1, d_open, '{"hp-a": 1}', 10000)), '42501');
  perform pg_temp.act(owner);
  if public.get_open_bazaar_day() ->> 'day_id' <> d_open::text or public.get_bazaar_day(d_closed) ->> 'status' <> 'closed' then raise exception 'HELPERS the owner read changed'; end if;

  -- ---- selling: the helper sells the open day, recorded under their id; a repeat is answered once
  perform pg_temp.act(ha);
  select * into r from public.record_event_sale(pg_temp.sale('devA', 1, d_open, '{"hp-a": 2}', 20000, -120));
  if r.duplicate or r.voided or r.sale_id is null then raise exception 'HELPERS the helper sale was not accepted'; end if;
  select * into r from public.record_event_sale(pg_temp.sale('devA', 1, d_open, '{"hp-a": 2}', 20000, -120));
  if not r.duplicate then raise exception 'HELPERS a repeat was written again'; end if;
  select * into r from public.record_event_sale(pg_temp.sale('devA', 2, d_open, '{"hp-b": 1}', 5000, -90));
  perform pg_temp.act(hb);
  select * into r from public.record_event_sale(pg_temp.sale('devB', 1, d_open, '{"hp-b": 3}', 15000, -60));
  perform pg_temp.act(owner);
  select * into r from public.record_event_sale(pg_temp.sale('devO', 1, d_open, '{"hp-a": 1}', 10000, -30));
  if (select recorded_by from public.event_sales where client_id = 'devA:S1') <> ha
     or (select recorded_by from public.event_sales where client_id = 'devB:S1') <> hb
     or (select recorded_by from public.event_sales where client_id = 'devO:S1') <> owner
     or (select count(*) from public.event_sales where event_id = ev) <> 4 then
    raise exception 'HELPERS who rang a sale up was not recorded';
  end if;
  -- Not on a closed day, a planned day (no event), or an event that is not a bazaar day.
  perform pg_temp.act(ha);
  perform pg_temp.expect('sale on a closed day', format('select * from public.record_event_sale(%L)', pg_temp.sale('devA', 5, d_closed, '{"hp-a": 1}', 10000, 5)), '42501');
  insert into public.events(id, name, starts_at, selling_device, price_snapshot) values
    ('b0952000-0000-4000-8000-000000000001', 'Loose event', now() - interval '1 hour', 'devP', '{"hp-a": 10000}');
  perform pg_temp.expect('sale on a loose event', format('select * from public.record_event_sale(%L)',
    pg_temp.sale('devA', 6, d_open, '{"hp-a": 1}', 10000) || '{"eventId": "b0952000-0000-4000-8000-000000000001"}'), '42501');
  perform pg_temp.expect('sale with a wrong total is still refused', format('select * from public.record_event_sale(%L)', pg_temp.sale('devA', 7, d_open, '{"hp-a": 1}', 1)), '22023');
  perform pg_temp.expect('same id other body', format('select * from public.record_event_sale(%L)', pg_temp.sale('devA', 1, d_open, '{"hp-a": 3}', 30000, -120)), '23505');
  -- A sale stamped before an earlier day's close that only now arrives (an offline phone) is accepted, exactly as the owner's is; one
  -- stamped after that close is refused above (42501). Nothing is accepted for a helper who is not active (refused for every command above).
  perform pg_temp.expect('late sale before the close of an old day', format('select * from public.record_event_sale(%L)', pg_temp.sale('devA', 8, d_closed, '{"hp-a": 1}', 10000, -2000)), null);
  if (select recorded_by from public.event_sales where client_id = 'devA:S8') is distinct from ha then raise exception 'HELPERS a late sale was not recorded under the helper'; end if;

  -- ---- taking back: only their own sale, on the open day
  select * into r from public.void_event_sale(pg_temp.void('devA:S2', -10));
  if not r.sale_known or r.duplicate then raise exception 'HELPERS the helper could not take back their own sale'; end if;
  if (select voided_at from public.event_sales where client_id = 'devA:S2') is null
     or (select count(*) from public.ledger_entries where memo = 'Void of stall sale devA:S2' and amount_cents = -5000 and created_by = ha) <> 1 then
    raise exception 'HELPERS the void was not booked';
  end if;
  select * into r from public.void_event_sale(pg_temp.void('devA:S2', -5));
  if not r.duplicate then raise exception 'HELPERS a repeat void was applied twice'; end if;
  perform pg_temp.expect('void the owner sale', format('select * from public.void_event_sale(%L)', pg_temp.void('devO:S1')), '42501');
  perform pg_temp.expect('void another helper sale', format('select * from public.void_event_sale(%L)', pg_temp.void('devB:S1')), '42501');
  perform pg_temp.expect('void a sale that is not known', format('select * from public.void_event_sale(%L)', pg_temp.void('devA:S99')), '42501');
  if exists (select 1 from public.event_sale_voids where client_id in ('devA:S99', 'devO:S1', 'devB:S1')) then
    raise exception 'HELPERS a void was planted for a sale the helper does not own';
  end if;
  if (select voided_at from public.event_sales where client_id = 'devO:S1') is not null
     or (select voided_at from public.event_sales where client_id = 'devB:S1') is not null then
    raise exception 'HELPERS a helper voided a sale that is not theirs';
  end if;
  -- A sale with no recorded user (an older row) is not theirs.
  update public.event_sales set recorded_by = null where client_id = 'devB:S1';
  perform pg_temp.act(hb);
  perform pg_temp.expect('void an older sale', format('select * from public.void_event_sale(%L)', pg_temp.void('devB:S1')), '42501');
  update public.event_sales set recorded_by = hb where client_id = 'devB:S1';
  -- The owner voids anything, as before.
  perform pg_temp.act(owner);
  select * into r from public.void_event_sale(pg_temp.void('devB:S1'));
  if not r.sale_known or r.duplicate then raise exception 'HELPERS the owner could not void'; end if;
  -- The owner may still plant a void for a sale that has not arrived (the offline order of events).
  select * into r from public.void_event_sale(pg_temp.void('devO:S7'));
  if r.sale_known then raise exception 'HELPERS the owner void marker changed'; end if;

  -- ---- a stall expense on the open day, under the helper's id
  perform pg_temp.act(ha);
  select * into r from public.add_event_expense(pg_temp.expense('ex-1', d_open, 15000));
  if r.duplicate then raise exception 'HELPERS the expense was not accepted'; end if;
  select * into r from public.add_event_expense(pg_temp.expense('ex-1', d_open, 15000));
  if not r.duplicate then raise exception 'HELPERS the expense repeat was written again'; end if;
  if (select count(*) from public.event_expenses where client_id = 'ex-1') <> 1
     or (select count(*) from public.ledger_entries where kind = 'cost' and amount_cents = -15000 and created_by = ha) <> 1 then
    raise exception 'HELPERS the expense was not booked once';
  end if;
  perform pg_temp.expect('expense on a closed day', format('select * from public.add_event_expense(%L)', pg_temp.expense('ex-2', d_closed, 100)), '42501');
  perform pg_temp.expect('expense on a loose event', format('select * from public.add_event_expense(%L)',
    pg_temp.expense('ex-3', d_open, 100) || '{"eventId": "b0952000-0000-4000-8000-000000000001"}'), '42501');

  -- ---- everything else stays the owner's: every one of these is refused to a helper
  foreach bad in array array[ha, hb] loop
    perform pg_temp.act(bad);
    perform pg_temp.expect('helper: get_bazaar', format('select public.get_bazaar(%L)', 'b0951000-0000-4000-8000-000000000001'::uuid), '42501');
    perform pg_temp.expect('helper: save_bazaar_day', 'select * from public.save_bazaar_day(''{}''::jsonb, null)', '42501');
    perform pg_temp.expect('helper: start_bazaar_day', format('select * from public.start_bazaar_day(%L, ''devA'', %L)', d_plan, gen_random_uuid()), '42501');
    perform pg_temp.expect('helper: add_bazaar_day_stock', format('select * from public.add_bazaar_day_stock(%L, ''hp-a'', 1, ''made'', %L)', d_open, gen_random_uuid()), '42501');
    perform pg_temp.expect('helper: save_bazaar_loss', 'select * from public.save_bazaar_loss(''{}''::jsonb)', '42501');
    perform pg_temp.expect('helper: save_bazaar_fee', 'select * from public.save_bazaar_fee(''{}''::jsonb)', '42501');
    perform pg_temp.expect('helper: finalise_bazaar', format('select public.finalise_bazaar(%L, repeat(''0'', 64), 7, null)', 'b0951000-0000-4000-8000-000000000001'::uuid), '42501');
    perform pg_temp.expect('helper: close_event', 'select * from public.close_event(''{}''::jsonb)', '42501');
    perform pg_temp.expect('helper: start_event', 'select * from public.start_event(''Loose'', ''devA'', 0, null)', '42501');
    perform pg_temp.expect('helper: load_event_stock', format('select * from public.load_event_stock(%L, ''{}''::jsonb, 0)', ev), '42501');
    perform pg_temp.expect('helper: set_bazaar_day_price', format('select * from public.set_bazaar_day_price(%L)',
      jsonb_build_object('requestId', gen_random_uuid(), 'eventId', ev, 'productId', 'hp-a', 'priceCents', 1)), '42501');
    perform pg_temp.expect('helper: get_event_prices', format('select public.get_event_prices(%L)', ev), '42501');
    perform pg_temp.expect('helper: record_expense', 'select * from public.record_expense(''{}''::jsonb)', '42501');
    perform pg_temp.expect('helper: get_books', 'select public.get_books(now() - interval ''1 day'', now())', '42501');
    perform pg_temp.expect('helper: staff_refund', 'select * from public.staff_refund(''x'', ''r'', now())', '42501');
    perform pg_temp.expect('helper: save_setting', 'select * from public.save_setting(''helperSeesSales'', ''1''::jsonb, null)', '42501');
    perform pg_temp.expect('helper: list_people', 'select public.list_people()', '42501');
    perform pg_temp.expect('helper: add_helper', 'select public.add_helper(''x@example.test'', null)', '42501');
    perform pg_temp.expect('helper: set_helper_expiry', format('select public.set_helper_expiry(%L, null)', ha), '42501');
    perform pg_temp.expect('helper: revoke_helper', format('select public.revoke_helper(%L)', hb), '42501');
    perform pg_temp.expect('helper: set_event_device', format('select public.set_event_device(%L, ''devB'')', ev), '42501');
  end loop;
  -- Raw tables are closed to a helper too: no policy on these lets anyone but the owner in (the check does not depend on rows existing).
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename = any (array['orders', 'order_items', 'inventory_items', 'recipes', 'recipe_ingredients', 'suppliers',
                'supplier_prices', 'event_sales', 'event_sale_items', 'events', 'bake_batches', 'ledger_entries', 'profiles'])
              and policyname not in ('own profile', 'orders public insert', 'order items public insert')
              and position('is_owner' in coalesce(qual, '') || coalesce(with_check, '')) = 0) then
    raise exception 'HELPERS a table a helper must not reach has a policy that is not the owner''s: %',
      (select string_agg(tablename || '/' || policyname, ', ') from pg_policies where schemaname = 'public'
        and tablename = any (array['orders', 'order_items', 'inventory_items', 'recipes', 'recipe_ingredients', 'suppliers',
          'supplier_prices', 'event_sales', 'event_sale_items', 'events', 'bake_batches', 'ledger_entries', 'profiles'])
        and policyname not in ('own profile', 'orders public insert', 'order items public insert') and position('is_owner' in coalesce(qual, '') || coalesce(with_check, '')) = 0);
  end if;
  -- And the rows themselves answer nothing (RLS answers no rows, never data).
  perform pg_temp.act(ha);
  set local role authenticated;
  select count(*) into n from public.orders;
  if n <> 0 then raise exception 'HELPERS a helper reads orders'; end if;
  select count(*) into n from public.inventory_items;
  if n <> 0 then raise exception 'HELPERS a helper reads stock'; end if;
  select count(*) into n from public.event_sales;
  if n <> 0 then raise exception 'HELPERS a helper reads sales directly'; end if;
  select count(*) into n from public.ledger_entries;
  if n <> 0 then raise exception 'HELPERS a helper reads the ledger directly'; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'HELPERS a helper reads other profiles'; end if;
  reset role;

  -- ---- the close: a helper closes the open day; the server decides the split; the reply carries no money
  perform pg_temp.act(ha);
  perform pg_temp.expect('close a closed day', format('select public.close_bazaar_day(%L)', pg_temp.closing(d_closed, 1, 1)), '23505');
  perform pg_temp.expect('close a planned day', format('select public.close_bazaar_day(%L)', pg_temp.closing(d_plan, 1, 1)), '55000');
  perform pg_temp.expect('close with a missing flavour', format('select public.close_bazaar_day(%L)',
    pg_temp.closing(d_open, 1, 1) #- '{lines,hp-b}'), '22023');
  perform pg_temp.expect('close with more than is there', format('select public.close_bazaar_day(%L)', pg_temp.closing(d_open, 99, 1)), '22023');
  perform pg_temp.expect('close with a sale not held', format('select public.close_bazaar_day(%L)',
    pg_temp.closing(d_open, 1, 1) || '{"sales_count": 99, "cash_cents": 1}'), '40001');
  perform pg_temp.expect('close with an extra key', format('select public.close_bazaar_day(%L)', pg_temp.closing(d_open, 1, 1) || '{"x": 1}'), '22023');
  if (select closed_at from public.events where id = ev) is not null then raise exception 'HELPERS a refused close closed the day'; end if;
  line := pg_temp.closing(d_open, 30, 25, 0);
  j := public.close_bazaar_day(line);
  if j <> jsonb_build_object('closed', true, 'day_id', d_open) then raise exception 'HELPERS the close reply leaks more than an acknowledgement: %', j; end if;
  if (select closed_at from public.events where id = ev) is null or (select closed_hash from public.bazaar_days where id = d_open) is null then
    raise exception 'HELPERS the day was not closed';
  end if;
  -- Day 1 of a two-day booking: what is left carries to the next day; the helper's own split (all written off) was not used.
  if (select (left_qty, carry_next_qty, to_shop_qty, written_off_qty) from public.bazaar_day_lines where day_id = d_open and product_id = 'hp-a') is distinct from (30, 30, 0, 0)
     or (select (left_qty, carry_next_qty, to_shop_qty, written_off_qty) from public.bazaar_day_lines where day_id = d_open and product_id = 'hp-b') is distinct from (25, 25, 0, 0) then
    raise exception 'HELPERS the server did not decide the split: %', (select jsonb_agg(l) from public.bazaar_day_lines l where day_id = d_open);
  end if;
  if (select count(*) from public.audit_log where action = 'bazaar.day_closed' and actor = ha and (detail ->> 'by_helper') = 'true') <> 1 then
    raise exception 'HELPERS the close is not audited as the helper''s';
  end if;
  -- The same close again (a lost reply) is answered, a different one is refused, and the day is closed for everything else now.
  j := public.close_bazaar_day(line);
  if j <> jsonb_build_object('closed', true, 'day_id', d_open) then raise exception 'HELPERS the close repeat was not answered'; end if;
  perform pg_temp.expect('another close of the same day', format('select public.close_bazaar_day(%L)', pg_temp.closing(d_open, 29, 25, 1)), '23505');
  perform pg_temp.expect('read after the close', format('select public.get_bazaar_day(%L)', d_open), '42501');
  perform pg_temp.expect('sale after the close', format('select * from public.record_event_sale(%L)', pg_temp.sale('devA', 9, d_open, '{"hp-a": 1}', 10000, 5)), '42501');
  perform pg_temp.expect('expense after the close', format('select * from public.add_event_expense(%L)', pg_temp.expense('ex-9', d_open, 100)), '42501');
  select * into r from public.record_event_sale(pg_temp.sale('devA', 1, d_open, '{"hp-a": 2}', 20000, -120));
  if not r.duplicate then raise exception 'HELPERS a sale repeat after the close was not acknowledged'; end if;
  select * into r from public.void_event_sale(pg_temp.void('devA:S2', -5));
  if not r.duplicate then raise exception 'HELPERS a void repeat after the close was not acknowledged'; end if;
  perform pg_temp.expect('take back an own sale after the close', format('select * from public.void_event_sale(%L)', pg_temp.void('devA:S1', 5)), '42501');
  -- Stamped before the close but arriving after it: a sale of this phone and the void of its own sale are accepted, as the owner's are.
  select * into r from public.record_event_sale(pg_temp.sale('devA', 10, d_open, '{"hp-b": 1}', 5000, -3));
  if r.duplicate or r.sale_id is null then raise exception 'HELPERS a sale stamped before the close and arriving after it was not accepted'; end if;
  if (select recorded_by from public.event_sales where client_id = 'devA:S10') is distinct from ha then raise exception 'HELPERS a late sale was not recorded under the helper'; end if;
  select * into r from public.void_event_sale(pg_temp.void('devA:S10', -2));
  if not r.sale_known or r.duplicate then raise exception 'HELPERS a void stamped before the close and arriving after it was not accepted'; end if;
  perform pg_temp.expect('late void of another helper sale', format('select * from public.void_event_sale(%L)', pg_temp.void('devO:S1', -2)), '42501');
  perform pg_temp.expect('open day after the close', 'select public.get_open_bazaar_day() ->> ''day_id''', null);
  if public.get_open_bazaar_day() is not null then raise exception 'HELPERS a closed day is still the open day'; end if;
  -- On the booking's last day the left cookies go to the shop, none carry.
  d_last := pg_temp.day('b0951000-0000-4000-8000-000000000004', 'Last fair', 'open', 1);
  j := public.close_bazaar_day(pg_temp.closing(d_last, 10, 5));
  if (select (carry_next_qty, to_shop_qty, written_off_qty) from public.bazaar_day_lines where day_id = d_last and product_id = 'hp-a') is distinct from (0, 10, 0) then
    raise exception 'HELPERS the last day did not send the left cookies to the shop';
  end if;
  -- The owner is untouched: the booking review still reads the helper-closed day.
  perform pg_temp.act(owner);
  j := public.get_bazaar('b0951000-0000-4000-8000-000000000001'::uuid);
  if (select count(*) from jsonb_array_elements(j -> 'summary' -> 'days') x where x ->> 'id' = d_open::text and x ->> 'state' = 'closed') <> 1 then
    raise exception 'HELPERS the owner does not see the helper-closed day as closed: %', j -> 'summary' -> 'days';
  end if;
end $$;
select 'HELPERS_DAY|passed';

-- ---- the people Cine manages: expiry takes effect at once, the four owner commands, and who may use them
do $$
declare
  owner uuid := 'b0950000-0000-4000-8000-000000000001';
  ha uuid := 'b0950000-0000-4000-8000-000000000002';
  hb uuid := 'b0950000-0000-4000-8000-000000000003';
  hx uuid := 'b0950000-0000-4000-8000-000000000004';
  hr uuid := 'b0950000-0000-4000-8000-000000000005';
  sup uuid := 'b0950000-0000-4000-8000-000000000006';
  d uuid; ev uuid;
  j jsonb; r record; inv uuid; person jsonb;
begin
  d := pg_temp.day('b0953000-0000-4000-8000-000000000001', 'People fair', 'open');
  ev := pg_temp.event_of(d);

  -- A helper whose time runs out is refused everywhere at once, with no other change; extending brings them back.
  perform pg_temp.act(hb);
  select * into r from public.record_event_sale(pg_temp.sale('devH', 1, d, '{"hp-a": 1}', 10000, -30));
  update public.profiles set access_expires_at = now() - interval '1 second' where id = hb;
  perform pg_temp.expect('expired: read', format('select public.get_bazaar_day(%L)', d), '42501');
  perform pg_temp.expect('expired: sell', format('select * from public.record_event_sale(%L)', pg_temp.sale('devH', 2, d, '{"hp-a": 1}', 10000)), '42501');
  perform pg_temp.expect('expired: void', format('select * from public.void_event_sale(%L)', pg_temp.void('devH:S1')), '42501');
  perform pg_temp.expect('expired: expense', format('select * from public.add_event_expense(%L)', pg_temp.expense('px-1', d, 100)), '42501');
  perform pg_temp.expect('expired: close', format('select public.close_bazaar_day(%L)', pg_temp.closing(d, 1, 1)), '42501');
  perform pg_temp.act(owner);
  perform public.set_helper_expiry(hb, now() + interval '2 hours');
  perform pg_temp.act(hb);
  perform pg_temp.expect('extended: sell', format('select * from public.record_event_sale(%L)', pg_temp.sale('devH', 2, d, '{"hp-a": 1}', 10000)), null);
  perform pg_temp.act(owner);
  perform public.revoke_helper(hb);
  perform pg_temp.act(hb);
  perform pg_temp.expect('removed: read', format('select public.get_bazaar_day(%L)', d), '42501');
  perform pg_temp.expect('removed: sell', format('select * from public.record_event_sale(%L)', pg_temp.sale('devH', 3, d, '{"hp-a": 1}', 10000)), '42501');
  perform pg_temp.expect('removed: close', format('select public.close_bazaar_day(%L)', pg_temp.closing(d, 1, 1)), '42501');
  -- The owner is unaffected.
  perform pg_temp.act(owner);
  perform pg_temp.expect('owner: still reads', format('select public.get_bazaar_day(%L)', d), null);

  -- list_people: the owner first, each helper with their state and expiry, an invite as waiting.
  perform pg_temp.expect('invite: bad email', 'select public.add_helper(''not an email'', null)', '22023');
  perform pg_temp.expect('invite: past expiry', 'select public.add_helper(''new@example.test'', now() - interval ''1 hour'')', '22023');
  perform pg_temp.expect('invite: far expiry', 'select public.add_helper(''new@example.test'', now() + interval ''6 years'')', '22023');
  perform pg_temp.expect('invite: the owner email', 'select public.add_helper(''Owner@Example.Test'', null)', '23505');
  perform pg_temp.expect('invite: support email', 'select public.add_helper(''support@example.test'', null)', '23505');
  j := public.add_helper('  New.Helper@Example.Test ', now() + interval '3 days');
  inv := (j ->> 'id')::uuid;
  if j ->> 'kind' <> 'invite' or (select email from public.helper_invites where id = inv) <> 'new.helper@example.test' then
    raise exception 'HELPERS the invite was not recorded in lower case: %', j;
  end if;
  j := public.add_helper('new.helper@example.test', null);
  if (j ->> 'id')::uuid <> inv or (select count(*) from public.helper_invites) <> 1 or (select access_expires_at from public.helper_invites where id = inv) is not null then
    raise exception 'HELPERS adding the same email again made a second invite or kept the old expiry';
  end if;
  -- A removed or expired helper registered again is given access again, with the same account.
  j := public.add_helper('HELPER.REMOVED@example.test', now() + interval '1 day');
  if j ->> 'kind' <> 'profile' or (j ->> 'id')::uuid <> hr
     or (select (active, access_expires_at is not null) from public.profiles where id = hr) is distinct from (true, true) then
    raise exception 'HELPERS a removed helper was not given access again: %', j;
  end if;
  j := public.list_people();
  if jsonb_typeof(j) <> 'array' or j -> 0 ->> 'role' <> 'owner' then raise exception 'HELPERS the owner is not first: %', j; end if;
  select x into person from jsonb_array_elements(j) x where x ->> 'id' = hx::text;
  if person ->> 'state' <> 'expired' or person ->> 'email' <> 'helper.expired@example.test' or person -> 'expires_at' = 'null'::jsonb then
    raise exception 'HELPERS an expired helper lists wrong: %', person;
  end if;
  select x into person from jsonb_array_elements(j) x where x ->> 'id' = ha::text;
  if person ->> 'state' <> 'active' or person -> 'expires_at' <> 'null'::jsonb then raise exception 'HELPERS a permanent helper lists wrong: %', person; end if;
  select x into person from jsonb_array_elements(j) x where x ->> 'id' = hb::text;
  if person ->> 'state' <> 'removed' then raise exception 'HELPERS a removed helper lists wrong: %', person; end if;
  select x into person from jsonb_array_elements(j) x where x ->> 'id' = inv::text;
  if person ->> 'state' <> 'waiting' or person ->> 'kind' <> 'invite' or person ->> 'email' <> 'new.helper@example.test' then
    raise exception 'HELPERS a waiting invite lists wrong: %', person;
  end if;

  -- set_helper_expiry and revoke_helper: helpers and invites only, and never the owner or support.
  perform public.set_helper_expiry(inv, now() + interval '5 days');
  if (select access_expires_at from public.helper_invites where id = inv) is null then raise exception 'HELPERS the invite expiry did not change'; end if;
  perform public.set_helper_expiry(ha, null);
  perform pg_temp.expect('expiry: past', format('select public.set_helper_expiry(%L, now() - interval ''1 minute'')', ha), '22023');
  perform pg_temp.expect('expiry: the owner', format('select public.set_helper_expiry(%L, now() + interval ''1 day'')', owner), '42501');
  perform pg_temp.expect('expiry: support', format('select public.set_helper_expiry(%L, now() + interval ''1 day'')', sup), '42501');
  perform pg_temp.expect('expiry: nobody', format('select public.set_helper_expiry(%L, null)', gen_random_uuid()), 'P0002');
  perform pg_temp.expect('expiry: null id', 'select public.set_helper_expiry(null, null)', '22023');
  perform pg_temp.expect('revoke: the owner', format('select public.revoke_helper(%L)', owner), '42501');
  perform pg_temp.expect('revoke: support', format('select public.revoke_helper(%L)', sup), '42501');
  perform pg_temp.expect('revoke: nobody', format('select public.revoke_helper(%L)', gen_random_uuid()), 'P0002');
  if (select active from public.profiles where id = owner) is not true then raise exception 'HELPERS the owner was removed'; end if;
  perform public.revoke_helper(inv);
  if exists (select 1 from public.helper_invites where id = inv) then raise exception 'HELPERS a waiting invite was not removed'; end if;
  if (select count(*) from public.audit_log where actor = owner and action in ('helper.added', 'helper.readded', 'helper.expiry_set', 'helper.revoked')) < 6 then
    raise exception 'HELPERS the owner commands are not audited';
  end if;

  -- Nobody else may run the four commands (helpers were refused above).
  foreach inv in array array[sup, hx]::uuid[] loop
    perform pg_temp.act(inv);
    perform pg_temp.expect('others: list', 'select public.list_people()', '42501');
    perform pg_temp.expect('others: add', 'select public.add_helper(''y@example.test'', null)', '42501');
    perform pg_temp.expect('others: expiry', format('select public.set_helper_expiry(%L, null)', ha), '42501');
    perform pg_temp.expect('others: revoke', format('select public.revoke_helper(%L)', ha), '42501');
  end loop;
  perform pg_temp.act(null);
  perform pg_temp.expect('anonymous: list', 'select public.list_people()', '42501');
  perform pg_temp.expect('anonymous: add', 'select public.add_helper(''y@example.test'', null)', '42501');
end $$;
select 'HELPERS_PEOPLE|passed';
rollback;
