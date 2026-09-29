-- D2 bazaar close-out authority and idempotency with real SQL roles; all data rolls back.
--
-- load_event_stock / add_event_expense / close_event / event_summary: the active owner only
-- (anon holds no EXECUTE at all). Each command is safe to repeat: the same stock load, the same
-- expense id and body, the same close are acknowledged once and change nothing; the same key with a
-- different body is refused (23505). Only flavours on the event's price snapshot can be loaded.
-- The summary is computed from rows: voided sales never count.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;
create temporary table ctx (k text primary key, v text);
grant select, insert on ctx to anon, authenticated, service_role;

insert into auth.users(id)
select ('d2e00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('d2e00000-0000-4000-8000-000000000001', 'owner', 'Closeout owner', true),
  ('d2e00000-0000-4000-8000-000000000002', 'helper', 'Closeout helper', true),
  ('d2e00000-0000-4000-8000-000000000003', 'support', 'Closeout support', true),
  ('d2e00000-0000-4000-8000-000000000004', 'owner', 'Closeout inactive owner', false);
insert into public.products(id, name, short_name, price_cents, kind, tag, description, image_path,
  active, published, sort_order, allergens)
values ('mp0e-a', 'Fixture A', 'A', 13000, 'Permanent', '', '', '/a.png', true, true, 1, 'milk'),
       ('mp0e-b', 'Fixture B', 'B', 15000, 'Rotating', '', '', '/b.png', true, true, 2, 'milk'),
       ('mp0e-off', 'Fixture Off', 'O', 9000, 'Rotating', '', '', '/o.png', false, false, 3, 'milk');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'd2e00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
  if state = '00000' and wanted <> '00000' then
    raise exception 'forbidden closeout call succeeded: % / %', actor, operation;
  elsif state <> wanted then
    raise exception 'closeout outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

create function pg_temp.confirm(ok boolean, actor text, operation text, outcome text) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'closeout outcome differs: % / % / %', actor, operation, outcome;
  end if;
  insert into pg_temp.authority_results values (operation, actor, outcome);
end $$;

create function pg_temp.ev(k text default 'ev') returns uuid language sql stable security invoker as $$
  select v::uuid from pg_temp.ctx where ctx.k = ev.k
$$;

create function pg_temp.now_ms() returns bigint language sql stable security invoker as $$
  select (extract(epoch from now()) * 1000)::bigint
$$;

create function pg_temp.sale(client text, items jsonb, total bigint, pay text default 'Cash', k text default 'ev') returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'deviceId', 'devA', 'eventId', pg_temp.ev(k)::text,
    'items', items, 'discountCents', 0, 'totalCents', total, 'pay', pay,
    'ref', '', 'clerk', 'Owner', 'at', pg_temp.now_ms(), 'tenderedCents', total, 'changeCents', 0)
$$;

create function pg_temp.expense(client text, label text, amount bigint, category text default 'Bazaar rent', k text default 'ev') returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'eventId', pg_temp.ev(k)::text, 'label', label,
    'category', category, 'amountCents', amount, 'at', pg_temp.now_ms())
$$;

create function pg_temp.closing(counted jsonb, returned jsonb, k text default 'ev',
  float_c bigint default 50000, cash_c bigint default 13000) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('eventId', pg_temp.ev(k)::text, 'at', pg_temp.now_ms() + 60000,
    'countedCents', counted, 'returned', returned, 'floatCents', float_c, 'cashCents', cash_c)
$$;

create function pg_temp.assert_anon_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.event_summary(uuid)', 'EXECUTE') then
    raise exception 'forbidden closeout call succeeded: anon / event_summary';
  end if;
  if has_function_privilege('anon', 'public.load_event_stock(uuid,jsonb,bigint)', 'EXECUTE') then
    raise exception 'forbidden closeout call succeeded: anon / load_event_stock';
  end if;
  if has_function_privilege('anon', 'public.add_event_expense(jsonb)', 'EXECUTE') then
    raise exception 'forbidden closeout call succeeded: anon / add_event_expense';
  end if;
  if has_function_privilege('anon', 'public.close_event(jsonb)', 'EXECUTE') then
    raise exception 'forbidden closeout call succeeded: anon / close_event';
  end if;
  insert into pg_temp.authority_results values ('closeout_acl', 'anon', 'no_execute');
end $$;

create function pg_temp.assert_denied(actor text) returns void language plpgsql security invoker as $$
declare
  fake text := '''d2e0c105-0000-4000-8000-000000000001''';
begin
  perform pg_temp.expect(actor, 'event_summary', 'select * from public.event_summary(' || fake || ')', '42501');
  perform pg_temp.expect(actor, 'load_event_stock', 'select * from public.load_event_stock(' || fake || ', ''{}''::jsonb, 0)', '42501');
  perform pg_temp.expect(actor, 'add_event_expense', 'select * from public.add_event_expense(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'close_event', 'select * from public.close_event(''{}''::jsonb)', '42501');
end $$;

create function pg_temp.assert_owner() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  ev uuid;
  ev2 uuid;
  r record;
  audits integer;
  ledger_before integer;
begin
  select e.event_id into ev from public.start_event('Closeout fair', 'devA', 0) e;
  insert into pg_temp.ctx values ('ev', ev::text);

  -- ---- load_event_stock
  perform pg_temp.expect(a, 'stock_null_object', 'select * from public.load_event_stock(pg_temp.ev(), null, 0)', '22023');
  perform pg_temp.expect(a, 'stock_array', 'select * from public.load_event_stock(pg_temp.ev(), ''[]''::jsonb, 0)', '22023');
  perform pg_temp.expect(a, 'stock_off_menu',
    'select * from public.load_event_stock(pg_temp.ev(), ''{"mp0e-off": 3}''::jsonb, 0)', '22023');
  perform pg_temp.expect(a, 'stock_unknown_flavour',
    'select * from public.load_event_stock(pg_temp.ev(), ''{"mp0e-zzz": 3}''::jsonb, 0)', '22023');
  perform pg_temp.expect(a, 'stock_fraction',
    'select * from public.load_event_stock(pg_temp.ev(), ''{"mp0e-a": 2.5}''::jsonb, 0)', '22023');
  perform pg_temp.expect(a, 'stock_negative',
    'select * from public.load_event_stock(pg_temp.ev(), ''{"mp0e-a": -1}''::jsonb, 0)', '22023');
  perform pg_temp.expect(a, 'stock_negative_float',
    'select * from public.load_event_stock(pg_temp.ev(), ''{"mp0e-a": 5}''::jsonb, -1)', '22023');
  perform pg_temp.expect(a, 'stock_unknown_event',
    'select * from public.load_event_stock(''d2e0c105-0000-4000-8000-0000000000ff'', ''{"mp0e-a": 5}''::jsonb, 0)', 'P0002');
  perform pg_temp.confirm((select opened_at is null and loaded = '{}' from public.events where id = ev),
    a, 'stock_refusals_leave_nothing', 'event_untouched');
  select * into r from public.load_event_stock(ev, '{"mp0e-a": 5, "mp0e-b": 4}'::jsonb, 50000);
  perform pg_temp.confirm(r.opened_at is not null and r.float_cents = 50000
    and (select loaded = '{"mp0e-a": 5, "mp0e-b": 4}' and drawer_float_cents = 50000 and float_cents = 0 from public.events where id = ev),
    a, 'stock_first', 'loaded_and_float_set');
  select count(*) into audits from public.audit_log where action = 'event.stock_loaded' and entity_id = ev::text;
  select * into r from public.load_event_stock(ev, '{"mp0e-b": 4, "mp0e-a": 5}'::jsonb, 50000);
  perform pg_temp.confirm(audits = 1
    and (select count(*) = 1 from public.audit_log where action = 'event.stock_loaded' and entity_id = ev::text),
    a, 'stock_repeat', 'acknowledged_no_second_audit');
  perform pg_temp.expect(a, 'stock_reload_different',
    'select * from public.load_event_stock(pg_temp.ev(), ''{"mp0e-a": 6}''::jsonb, 50000)', '23505');
  perform pg_temp.expect(a, 'stock_reload_other_float',
    'select * from public.load_event_stock(pg_temp.ev(), ''{"mp0e-a": 5, "mp0e-b": 4}''::jsonb, 60000)', '23505');

  -- ---- sales for the summary: cash, digital, freebie, and a voided cash sale
  perform public.record_event_sale(pg_temp.sale('devA:S1:1', '{"mp0e-a": 1}', 13000));
  perform public.record_event_sale(pg_temp.sale('devA:S2:1', '{"mp0e-b": 1}', 15000, 'GCash'));
  perform public.record_event_sale(pg_temp.sale('devA:S3:1', '{"mp0e-a": 1}', 0, 'Freebie') || '{"discountCents": 13000}');
  perform public.record_event_sale(pg_temp.sale('devA:S4:1', '{"mp0e-a": 2}', 26000));
  perform public.void_event_sale(jsonb_build_object('clientId', 'devA:S4:1', 'deviceId', 'devA', 'at', pg_temp.now_ms()));

  -- ---- add_event_expense
  perform pg_temp.expect(a, 'expense_extra_key',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 150000) || ''{"role": "owner"}'')', '22023');
  perform pg_temp.expect(a, 'expense_blank_label',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''   '', 150000))', '22023');
  perform pg_temp.expect(a, 'expense_blank_category',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 150000, ''  ''))', '22023');
  perform pg_temp.expect(a, 'expense_zero',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 0))', '22023');
  perform pg_temp.expect(a, 'expense_negative',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 1) || ''{"amountCents": -5}'')', '22023');
  perform pg_temp.expect(a, 'expense_fraction',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 1) || ''{"amountCents": 10.5}'')', '22023');
  perform pg_temp.expect(a, 'expense_event_not_uuid',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 100) || ''{"eventId": "nope"}'')', '22023');
  perform pg_temp.expect(a, 'expense_unknown_event',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 100) || ''{"eventId": "d2e0c105-0000-4000-8000-0000000000ff"}'')', 'P0002');
  perform pg_temp.confirm((select count(*) = 0 from public.ledger_entries where category in ('Bazaar rent', 'Transport')),
    a, 'expense_refusals_leave_nothing', 'no_ledger_rows');
  select * into r from public.add_event_expense(pg_temp.expense('devA:E1', 'Table rent', 150000));
  perform pg_temp.confirm(r.duplicate = false
    and (select count(*) = 1 from public.ledger_entries where category = 'Bazaar rent' and amount_cents = -150000 and kind = 'cost'),
    a, 'expense_first', 'cost_booked_negative');
  select * into r from public.add_event_expense(pg_temp.expense('devA:E1', 'Table rent', 150000));
  perform pg_temp.confirm(r.duplicate = true
    and (select count(*) = 1 from public.ledger_entries where category = 'Bazaar rent')
    and (select count(*) = 1 from public.audit_log where action = 'event.expense_added' and entity_id = 'devA:E1'),
    a, 'expense_repeat', 'acknowledged_no_second_cost');
  perform pg_temp.expect(a, 'expense_same_id_other_body',
    'select * from public.add_event_expense(pg_temp.expense(''devA:E1'', ''Table rent'', 160000))', '23505');
  perform public.add_event_expense(pg_temp.expense('devA:E2', 'Grab', 32000, 'Transport'));

  -- ---- event_summary before the close: voided sale ignored, profit = takings - expenses
  select * into r from public.event_summary(ev);
  perform pg_temp.confirm(r.closed = false and r.sales_count = 3 and r.voided_count = 1 and r.freebie_count = 1
    and r.cookies_sold = 3 and r.revenue_cents = 28000 and r.expenses_cents = 182000
    and r.variance_cents = 0 and r.profit_cents = 28000 - 182000
    and r.float_cents = 50000 and r.cash_expected_cents = 50000 + 13000 and r.counted_cents is null,
    a, 'summary_open', 'voided_ignored_profit_net');
  perform pg_temp.expect(a, 'summary_unknown_event',
    'select * from public.event_summary(''d2e0c105-0000-4000-8000-0000000000ff'')', 'P0002');
  perform pg_temp.expect(a, 'summary_null', 'select * from public.event_summary(null)', '22023');

  -- ---- close_event validation
  perform pg_temp.expect(a, 'close_extra_key',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{}''::jsonb) || ''{"x": 1}'')', '22023');
  perform pg_temp.expect(a, 'close_negative_count',
    'select * from public.close_event(pg_temp.closing(''-1''::jsonb, ''{}''::jsonb))', '22023');
  perform pg_temp.expect(a, 'close_fractional_count',
    'select * from public.close_event(pg_temp.closing(''10.5''::jsonb, ''{}''::jsonb))', '22023');
  perform pg_temp.expect(a, 'close_string_count',
    'select * from public.close_event(pg_temp.closing(''"63000"''::jsonb, ''{}''::jsonb))', '22023');
  perform pg_temp.expect(a, 'close_returned_array',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''[]''::jsonb))', '22023');
  perform pg_temp.expect(a, 'close_returned_off_menu',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{"mp0e-off": 1}''::jsonb))', '22023');
  perform pg_temp.expect(a, 'close_returned_more_than_loaded',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{"mp0e-a": 6}''::jsonb))', '22023');
  perform pg_temp.expect(a, 'close_future',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{}''::jsonb) || ''{"at": 99999999999999}'')', '22023');
  perform pg_temp.expect(a, 'close_before_event_started',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{}''::jsonb) || ''{"at": 1767268800000}'')', '22023');
  perform pg_temp.expect(a, 'close_unknown_event',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{}''::jsonb) || ''{"eventId": "d2e0c105-0000-4000-8000-0000000000ff"}'')', 'P0002');
  perform pg_temp.expect(a, 'close_missing_float',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{}''::jsonb) - ''floatCents'')', '22023');
  perform pg_temp.expect(a, 'close_missing_cash',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{}''::jsonb) - ''cashCents'')', '22023');
  perform pg_temp.expect(a, 'close_fractional_cash',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{}''::jsonb) || ''{"cashCents": 10.5}'')', '22023');
  -- The phone counted a sale or the float the server does not hold yet: try again later (40001),
  -- never book the difference as a drawer variance.
  perform pg_temp.expect(a, 'close_server_missing_a_sale',
    'select * from public.close_event(pg_temp.closing(''62500''::jsonb, ''{}''::jsonb, ''ev'', 50000, 26000))', '40001');
  perform pg_temp.expect(a, 'close_server_missing_the_stock_load',
    'select * from public.close_event(pg_temp.closing(''62500''::jsonb, ''{}''::jsonb, ''ev'', 0, 13000))', '40001');
  perform pg_temp.expect(a, 'close_server_has_more_than_the_phone',
    'select * from public.close_event(pg_temp.closing(''62500''::jsonb, ''{}''::jsonb, ''ev'', 50000, 0))', '40001');
  perform pg_temp.confirm((select closed_at is null and counted_cents is null from public.events where id = ev)
    and (select count(*) = 0 from public.ledger_entries where category = 'Cash variance'),
    a, 'close_refusals_leave_nothing', 'event_still_open');
  -- A start whose reply was lost, retried after the stock load, is the same event, not a refusal.
  select * into r from public.start_event('Closeout fair', 'devA', 0, ev);
  perform pg_temp.confirm(r.event_id = ev, a, 'start_retry_after_load', 'same_event');

  -- ---- a short drawer: expected 63000, counted 62500
  select * into r from public.close_event(pg_temp.closing('62500'::jsonb, '{"mp0e-a": 2, "mp0e-b": 3}'::jsonb));
  perform pg_temp.confirm(r.closed = true and r.variance_cents = -500 and r.counted_cents = 62500
    and r.cash_expected_cents = 63000 and r.revenue_cents = 28000 and r.expenses_cents = 182000
    and r.profit_cents = 28000 - 182000 - 500 and r.returned = '{"mp0e-a": 2, "mp0e-b": 3}'
    and (select closed_at is not null from public.events where id = ev),
    a, 'close_short', 'closed_variance_minus_500');
  perform pg_temp.confirm(
    (select count(*) = 1 from public.ledger_entries where category = 'Cash variance' and amount_cents = -500 and kind = 'cost'),
    a, 'close_short_ledger', 'variance_booked_as_cost');
  select * into r from public.close_event(pg_temp.closing('62500'::jsonb, '{"mp0e-a": 2, "mp0e-b": 3}'::jsonb));
  perform pg_temp.confirm(r.closed = true and r.variance_cents = -500
    and (select count(*) = 1 from public.ledger_entries where category = 'Cash variance')
    and (select count(*) = 1 from public.audit_log where action = 'event.closed' and entity_id = ev::text),
    a, 'close_repeat', 'same_summary_no_second_variance');
  perform pg_temp.expect(a, 'close_repeat_other_count',
    'select * from public.close_event(pg_temp.closing(''63000''::jsonb, ''{"mp0e-a": 2, "mp0e-b": 3}''::jsonb))', '23505');
  perform pg_temp.expect(a, 'close_repeat_other_time',
    'select * from public.close_event(pg_temp.closing(''62500''::jsonb, ''{"mp0e-a": 2, "mp0e-b": 3}''::jsonb) || jsonb_build_object(''at'', pg_temp.now_ms() + 90000))', '23505');
  perform pg_temp.expect(a, 'close_repeat_other_returned',
    'select * from public.close_event(pg_temp.closing(''62500''::jsonb, ''{}''::jsonb))', '23505');
  -- The stock load is still acknowledged after the close, and a different one is not.
  select * into r from public.load_event_stock(ev, '{"mp0e-a": 5, "mp0e-b": 4}'::jsonb, 50000);
  perform pg_temp.confirm(r.event_id = ev, a, 'stock_repeat_after_close', 'acknowledged');
  -- A late expense (rent paid after the day) is allowed and moves profit.
  perform public.add_event_expense(pg_temp.expense('devA:E3', 'Table rent top-up', 10000));
  select * into r from public.event_summary(ev);
  perform pg_temp.confirm(r.expenses_cents = 192000 and r.profit_cents = 28000 - 192000 - 500,
    a, 'expense_after_close', 'profit_follows_rows');

  -- ---- an over drawer, and no count at all
  select e.event_id into ev2 from public.start_event('Second fair', 'devA', 0) e;
  insert into pg_temp.ctx values ('ev2', ev2::text);
  perform public.load_event_stock(ev2, '{"mp0e-a": 3}'::jsonb, 20000);
  perform public.record_event_sale(pg_temp.sale('devA:T1:1', '{"mp0e-a": 1}', 13000, 'Cash', 'ev2'));
  select * into r from public.close_event(pg_temp.closing('34000'::jsonb, '{"mp0e-a": 2}'::jsonb, 'ev2', 20000, 13000));
  perform pg_temp.confirm(r.variance_cents = 1000 and r.cash_expected_cents = 33000 and r.profit_cents = 13000 + 1000
    and (select count(*) = 1 from public.ledger_entries where category = 'Bazaar' and amount_cents = 1000 and kind = 'sale'
           and memo like 'Second fair%'),
    a, 'close_over', 'variance_plus_1000_booked_as_takings');
  select e.event_id into ev2 from public.start_event('Uncounted fair', 'devA', 0) e;
  insert into pg_temp.ctx values ('ev3', ev2::text);
  select count(*) into ledger_before from public.ledger_entries;
  select * into r from public.close_event(pg_temp.closing('null'::jsonb, '{}'::jsonb, 'ev3', 0, 0));
  perform pg_temp.confirm(r.variance_cents = 0 and r.counted_cents is null
    and (select variance_cents is null from public.events where id = ev2)
    and (select count(*) = ledger_before from public.ledger_entries),
    a, 'close_uncounted', 'no_variance_no_ledger');

  -- ---- an event that was never loaded may return stock (there is no loaded figure to hold it to)
  select e.event_id into ev2 from public.start_event('Unloaded fair', 'devA', 0) e;
  insert into pg_temp.ctx values ('ev4', ev2::text);
  select * into r from public.close_event(pg_temp.closing('0'::jsonb, '{"mp0e-a": 2}'::jsonb, 'ev4', 0, 0));
  perform pg_temp.confirm(r.closed = true and r.returned = '{"mp0e-a": 2}', a, 'close_unloaded_event', 'returned_accepted');

  -- ---- a sale made after the close time cannot be closed over
  select e.event_id into ev2 from public.start_event('Backdated fair', 'devA', 0) e;
  insert into pg_temp.ctx values ('ev5', ev2::text);
  perform public.record_event_sale(pg_temp.sale('devA:U1:1', '{"mp0e-a": 1}', 13000, 'GCash', 'ev5') || jsonb_build_object('at', pg_temp.now_ms() + 120000));
  perform pg_temp.expect(a, 'close_before_a_recorded_sale',
    'select * from public.close_event(pg_temp.closing(''0''::jsonb, ''{}''::jsonb, ''ev5'', 0, 0))', '22023');

  -- ---- the raw tables stay closed
  perform pg_temp.expect(a, 'expenses_select', 'select * from public.event_expenses', '42501');
end $$;

grant execute on function pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text),
  pg_temp.confirm(boolean, text, text, text), pg_temp.ev(text), pg_temp.now_ms(),
  pg_temp.sale(text, jsonb, bigint, text, text), pg_temp.expense(text, text, bigint, text, text),
  pg_temp.closing(jsonb, jsonb, text, bigint, bigint), pg_temp.assert_anon_acl(), pg_temp.assert_denied(text),
  pg_temp.assert_owner() to anon, authenticated, service_role;

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
select pg_temp.set_subject(4);
select pg_temp.assert_denied('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_owner();
reset role;
set local role service_role;
select pg_temp.set_subject(9, 'service_role');
select pg_temp.assert_denied('service_role');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
