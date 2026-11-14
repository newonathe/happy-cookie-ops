-- Change a price on a started bazaar day (migration 20260101008500): set_bazaar_day_price, get_event_prices and the price check of
-- record_event_sale. Real SQL roles; all data rolls back. Synthetic prices only.
--
-- Concurrency: one psql session cannot run two transactions at once, so the locks are proven by what this transaction holds after
-- a change (the booking and `event:` advisory locks, and the event row), the order close_bazaar_day takes them in. The race the
-- migration describes (a sale reading the event before a change commits) needs no lock: every list the day has had is tried.
begin;
insert into auth.users(id) values
 ('b0850000-0000-4000-8000-000000000001'),('b0850000-0000-4000-8000-000000000002'),
 ('b0850000-0000-4000-8000-000000000003'),('b0850000-0000-4000-8000-000000000004');
insert into public.profiles(id,role,display_name,active) values
 ('b0850000-0000-4000-8000-000000000001','owner','Price owner',true),
 ('b0850000-0000-4000-8000-000000000002','helper','Price helper',true),
 ('b0850000-0000-4000-8000-000000000003','support','Price support',true),
 ('b0850000-0000-4000-8000-000000000004','owner','Inactive price owner',false);
insert into public.products(id,name,short_name,price_cents,kind) values
 ('dp-a','Price flavour A','A',12000,'Permanent'),('dp-b','Price flavour B','B',10000,'Permanent');

create function pg_temp.act(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$f$;
-- Runs a call and requires exactly this SQLSTATE (or success when wanted is null), and this text in the message when given.
create function pg_temp.expect(label text, q text, wanted text, words text default null) returns void language plpgsql as $f$
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
    raise exception 'PRICE_EXPECTED % : wanted %, got % (%)', label, coalesce(wanted, 'success'), coalesce(got, 'success'), msg;
  end if;
  if words is not null and position(words in coalesce(msg, '')) = 0 then
    raise exception 'PRICE_EXPECTED % : wanted the words "%", got "%"', label, words, msg;
  end if;
end;
$f$;
-- A booking with one started day sold on devP, at A 120.00 and B 100.00 (centavos). Returns the event id.
create function pg_temp.day(p uuid, p_name text) returns uuid language plpgsql as $f$
declare d uuid := md5(p::text || ':d')::uuid; e uuid := md5(p::text || ':e')::uuid;
begin
  insert into public.scheduled_events(id, name, starts_on, ends_on, rent_cents) values (p, p_name, current_date, current_date, 0);
  insert into public.events(id, name, starts_at, selling_device, price_snapshot, opened_at, loaded)
    values (e, p_name || ' day', now() - interval '1 hour', 'devP', '{"dp-a": 12000, "dp-b": 10000}', now() - interval '1 hour',
            '{"dp-a": 40, "dp-b": 40}');
  insert into public.bazaar_days(id, scheduled_id, day, float_cents, event_id, plan_hash)
    values (d, p, current_date, 0, e, repeat('a', 64));
  insert into public.bazaar_day_lines(day_id, product_id, made_qty, carried_qty, price_cents)
    values (d, 'dp-a', 40, 0, 12000), (d, 'dp-b', 40, 0, 10000);
  return e;
end;
$f$;
create function pg_temp.change(req text, ev uuid, pid text, cents bigint) returns jsonb language sql immutable as $f$
  select jsonb_build_object('requestId', req, 'eventId', ev, 'productId', pid, 'priceCents', cents)
$f$;
-- A sale on devP, minutes after the transaction's start (negative: before it). The change's effective time is now().
create function pg_temp.sale(client text, ev uuid, items jsonb, discount bigint, total bigint, minutes integer) returns jsonb
language sql stable as $f$
  select jsonb_build_object('clientId', 'devP:' || client, 'deviceId', 'devP', 'eventId', ev, 'items', items,
    'discountCents', discount, 'totalCents', total, 'pay', 'Cash', 'ref', '', 'clerk', 'Owner',
    'at', (extract(epoch from now() + make_interval(mins => minutes)) * 1000)::bigint, 'tenderedCents', total, 'changeCents', 0)
$f$;
create function pg_temp.units(client text) returns jsonb language sql stable as $f$
  select coalesce(jsonb_object_agg(i.product_id, i.unit_price_cents), '{}'::jsonb)
    from public.event_sales s join public.event_sale_items i on i.sale_id = s.id where s.client_id = 'devP:' || client
$f$;
create function pg_temp.holds(k text) returns boolean language sql stable as $f$
  select exists (select 1 from pg_locks l where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted
                   and ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended(k, 0))
$f$;

do $$
declare
  owner uuid := 'b0850000-0000-4000-8000-000000000001';
  b uuid := 'b0851000-0000-4000-8000-000000000001';      -- the day whose prices change
  plain uuid := 'b0851000-0000-4000-8000-000000000002';  -- a day that never changes: sales as before
  gone uuid := 'b0851000-0000-4000-8000-000000000003';   -- a day changed, closed unsold, then deleted
  ev uuid; ev_plain uuid; ev_gone uuid; ev_old uuid := 'b0852000-0000-4000-8000-000000000001';
  r1 uuid := 'b0853000-0000-4000-8000-000000000001';
  r2 uuid := 'b0853000-0000-4000-8000-000000000002';
  r3 uuid := 'b0853000-0000-4000-8000-000000000003';
  bad uuid;
  out1 jsonb; out2 jsonb; got jsonb;
  n bigint;
begin
  ev := pg_temp.day(b, 'Price fair');
  ev_plain := pg_temp.day(plain, 'Plain fair');
  ev_gone := pg_temp.day(gone, 'Gone fair');
  -- An event that is not a bazaar day (the till from before bazaar days).
  insert into public.events(id, name, starts_at, selling_device, price_snapshot) values
    (ev_old, 'Old till event', now() - interval '1 hour', 'devP', '{"dp-a": 12000}');

  -- Who may call it.
  if has_function_privilege('anon', 'public.set_bazaar_day_price(jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_bazaar_day_price(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_event_prices(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_event_prices(uuid)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.event_price_versions', 'SELECT')
     or has_table_privilege('anon', 'public.event_price_versions', 'SELECT') then
    raise exception 'PRICE_GRANTS changed';
  end if;
  foreach bad in array array['b0850000-0000-4000-8000-000000000002', 'b0850000-0000-4000-8000-000000000003',
                             'b0850000-0000-4000-8000-000000000004']::uuid[] loop
    perform pg_temp.act(bad);
    perform pg_temp.expect('not owner', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r1::text, ev, 'dp-a', 13000)), '42501');
    perform pg_temp.expect('not owner read', format('select public.get_event_prices(%L)', ev), '42501');
  end loop;
  perform pg_temp.act(owner);

  -- The shape, the list and the range; nothing is written by a refusal.
  perform pg_temp.expect('no body', 'select public.set_bazaar_day_price(null)', '22023');
  perform pg_temp.expect('extra key', format('select public.set_bazaar_day_price(%L)',
    pg_temp.change(r1::text, ev, 'dp-a', 13000) || '{"note": "x"}'), '22023');
  perform pg_temp.expect('missing key', format('select public.set_bazaar_day_price(%L)',
    pg_temp.change(r1::text, ev, 'dp-a', 13000) - 'productId'), '22023');
  perform pg_temp.expect('bad request id', format('select public.set_bazaar_day_price(%L)', pg_temp.change('r1', ev, 'dp-a', 13000)), '22023');
  perform pg_temp.expect('price zero', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r1::text, ev, 'dp-a', 0)), '22023');
  perform pg_temp.expect('price too high', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r1::text, ev, 'dp-a', 100000001)), '22023');
  perform pg_temp.expect('price decimal', format('select public.set_bazaar_day_price(%L)',
    jsonb_set(pg_temp.change(r1::text, ev, 'dp-a', 13000), '{priceCents}', '130.5')), '22023');
  perform pg_temp.expect('price text', format('select public.set_bazaar_day_price(%L)',
    jsonb_set(pg_temp.change(r1::text, ev, 'dp-a', 13000), '{priceCents}', '"13000"')), '22023');
  perform pg_temp.expect('off list', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r1::text, ev, 'dp-zz', 13000)), '22023');
  perform pg_temp.expect('same price', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r1::text, ev, 'dp-a', 12000)), '22023');
  perform pg_temp.expect('no event', format('select public.set_bazaar_day_price(%L)',
    pg_temp.change(r1::text, 'b0852000-0000-4000-8000-0000000000ff', 'dp-a', 13000)), 'P0002');
  perform pg_temp.expect('not a bazaar day', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r1::text, ev_old, 'dp-a', 13000)), '55000');
  if exists (select 1 from public.event_price_versions)
     or (select price_snapshot from public.events where id = ev) <> '{"dp-a": 12000, "dp-b": 10000}'::jsonb then
    raise exception 'PRICE_REFUSAL_WROTE: a refused change wrote something';
  end if;
  got := public.get_event_prices(ev);
  if got <> '{"version": 0, "prices": {"dp-a": 12000, "dp-b": 10000}}'::jsonb then
    raise exception 'PRICE_READ before any change: %', got;
  end if;

  -- The change: version 0 is the start list, version 1 the new one; the event, the day's line and the audit follow.
  out1 := public.set_bazaar_day_price(pg_temp.change(r1::text, ev, 'dp-a', 13000));
  if out1 <> '{"version": 1, "latest": 1, "prices": {"dp-a": 13000, "dp-b": 10000}, "duplicate": false}'::jsonb then
    raise exception 'PRICE_ANSWER wrong: %', out1;
  end if;
  if not pg_temp.holds('scheduled_event:' || b::text) or not pg_temp.holds('event:' || ev::text) then
    raise exception 'PRICE_LOCK: the change did not take the booking and event locks';
  end if;
  if (select count(*) from public.event_price_versions where event_id = ev) <> 2
     or (select prices from public.event_price_versions where event_id = ev and version = 0) <> '{"dp-a": 12000, "dp-b": 10000}'::jsonb
     or (select effective_at from public.event_price_versions where event_id = ev and version = 0)
          <> (select starts_at from public.events where id = ev)
     or (select created_by from public.event_price_versions where event_id = ev and version = 1) is distinct from owner then
    raise exception 'PRICE_VERSIONS wrong';
  end if;
  if (select price_snapshot from public.events where id = ev) <> '{"dp-a": 13000, "dp-b": 10000}'::jsonb then
    raise exception 'PRICE_SNAPSHOT not moved to the new list';
  end if;
  if (select price_cents from public.bazaar_day_lines where day_id = md5(b::text || ':d')::uuid and product_id = 'dp-a') <> 13000
     or (select price_cents from public.bazaar_day_lines where day_id = md5(b::text || ':d')::uuid and product_id = 'dp-b') <> 10000 then
    raise exception 'PRICE_LINE: the day''s line does not show the new price';
  end if;
  if not exists (select 1 from public.audit_log where action = 'bazaar_day.price_changed' and entity_id = ev::text and actor = owner
                   and detail ->> 'from_cents' = '12000' and detail ->> 'to_cents' = '13000' and detail ->> 'product_id' = 'dp-a') then
    raise exception 'PRICE_AUDIT missing';
  end if;

  -- A repeat is answered without a second change; another body under the same id is refused.
  out2 := public.set_bazaar_day_price(pg_temp.change(r1::text, ev, 'dp-a', 13000));
  if out2 <> '{"version": 1, "latest": 1, "prices": {"dp-a": 13000, "dp-b": 10000}, "duplicate": true}'::jsonb
     or (select count(*) from public.event_price_versions where event_id = ev) <> 2
     or (select count(*) from public.audit_log where action = 'bazaar_day.price_changed' and entity_id = ev::text) <> 1 then
    raise exception 'PRICE_REPLAY wrong: %', out2;
  end if;
  perform pg_temp.expect('other body', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r1::text, ev, 'dp-a', 14000)), '23505');

  -- A sale rung before the change and sent after it is accepted at the price it was rung at.
  perform public.record_event_sale(pg_temp.sale('S1:1', ev, '{"dp-a": 2}', 0, 24000, -10));
  if pg_temp.units('S1:1') <> '{"dp-a": 12000}'::jsonb
     or (select gross_cents from public.event_sales where client_id = 'devP:S1:1') <> 24000 then
    raise exception 'PRICE_OLD_SALE stored wrong: %', pg_temp.units('S1:1');
  end if;
  -- A sale after the change, at the new price; and with a discount.
  perform public.record_event_sale(pg_temp.sale('S2:1', ev, '{"dp-a": 2}', 0, 26000, 1));
  perform public.record_event_sale(pg_temp.sale('S3:1', ev, '{"dp-a": 2, "dp-b": 1}', 1000, 35000, 1));
  if pg_temp.units('S2:1') <> '{"dp-a": 13000}'::jsonb or pg_temp.units('S3:1') <> '{"dp-a": 13000, "dp-b": 10000}'::jsonb
     or (select gross_cents from public.event_sales where client_id = 'devP:S3:1') <> 36000 then
    raise exception 'PRICE_NEW_SALE stored wrong';
  end if;
  -- Rung on the old list but dated after the change (a phone that had not heard of it): still the old list.
  perform public.record_event_sale(pg_temp.sale('S4:1', ev, '{"dp-a": 1}', 0, 12000, 2));
  if pg_temp.units('S4:1') <> '{"dp-a": 12000}'::jsonb then
    raise exception 'PRICE_OLD_SALE late stored wrong';
  end if;
  -- A total no list makes is refused with the same words as before.
  perform pg_temp.expect('wrong total', format('select public.record_event_sale(%L)', pg_temp.sale('S5:1', ev, '{"dp-a": 2}', 0, 25000, 1)),
    '22023', 'sale total does not match the event prices');
  perform pg_temp.expect('discount over gross', format('select public.record_event_sale(%L)', pg_temp.sale('S6:1', ev, '{"dp-a": 1}', 20000, 0, 1)),
    '22023', 'sale total does not match the event prices');
  perform pg_temp.expect('flavour off list', format('select public.record_event_sale(%L)', pg_temp.sale('S7:1', ev, '{"dp-zz": 1}', 0, 100, 1)),
    '22023', 'not in the event price snapshot');

  -- Two lists that make the same total: the one in effect at the sale's time prices it. B is a kitchen-transferred flavour
  -- whose line no longer matches its transfers (40 made, none transferred): the guard of migration 76 refuses its line, and
  -- the change still lands.
  insert into public.bazaar_kitchen_sources(scheduled_id, product_id, source_drop) values (b, 'dp-b', 0);
  out1 := public.set_bazaar_day_price(pg_temp.change(r2::text, ev, 'dp-b', 9000));  -- A 130, B 90: A+B is 220, as at the start
  if (select price_cents from public.bazaar_day_lines where day_id = md5(b::text || ':d')::uuid and product_id = 'dp-b') <> 10000
     or (select price_snapshot ->> 'dp-b' from public.events where id = ev) <> '9000' then
    raise exception 'PRICE_KITCHEN: the guarded line or the new list is wrong';
  end if;
  if out1 ->> 'version' <> '2' then
    raise exception 'PRICE_ANSWER second change wrong: %', out1;
  end if;
  perform public.record_event_sale(pg_temp.sale('S8:1', ev, '{"dp-a": 1, "dp-b": 1}', 0, 22000, -5));
  perform public.record_event_sale(pg_temp.sale('S9:1', ev, '{"dp-a": 1, "dp-b": 1}', 0, 22000, 3));
  if pg_temp.units('S8:1') <> '{"dp-a": 12000, "dp-b": 10000}'::jsonb then
    raise exception 'PRICE_ORDER: a sale before the changes was priced at %', pg_temp.units('S8:1');
  end if;
  if pg_temp.units('S9:1') <> '{"dp-a": 13000, "dp-b": 9000}'::jsonb then
    raise exception 'PRICE_ORDER: a sale after the changes was priced at %', pg_temp.units('S9:1');
  end if;
  got := public.get_event_prices(ev);
  if got <> '{"version": 2, "prices": {"dp-a": 13000, "dp-b": 9000}}'::jsonb then
    raise exception 'PRICE_READ after the changes: %', got;
  end if;

  -- A day that never changed sells exactly as before.
  perform public.record_event_sale(pg_temp.sale('P1:1', ev_plain, '{"dp-a": 2}', 0, 24000, 1));
  if pg_temp.units('P1:1') <> '{"dp-a": 12000}'::jsonb then
    raise exception 'PRICE_PLAIN sale stored wrong';
  end if;
  perform pg_temp.expect('plain wrong total', format('select public.record_event_sale(%L)', pg_temp.sale('P2:1', ev_plain, '{"dp-a": 2}', 0, 26000, 1)),
    '22023', 'sale total does not match the event prices');

  -- A closed day's prices cannot change; a repeat of a change made before the close is still answered.
  update public.events set closed_at = now() + interval '10 minutes' where id = ev;
  perform pg_temp.expect('closed day', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r3::text, ev, 'dp-a', 15000)), '55000');
  perform pg_temp.expect('closed replay', format('select public.set_bazaar_day_price(%L)', pg_temp.change(r2::text, ev, 'dp-b', 9000)), null);
  if (select count(*) from public.event_price_versions where event_id = ev) <> 3 then
    raise exception 'PRICE_CLOSED wrote a version';
  end if;

  -- A changed day that sold nothing can still be deleted with its booking; its lists go with it.
  perform public.set_bazaar_day_price(pg_temp.change(r3::text, ev_gone, 'dp-a', 15000));
  update public.events set closed_at = now() where id = ev_gone;
  perform pg_temp.expect('delete changed day', format('select public.delete_bazaar_booking(%L, %L)', gone, 'Gone fair'), null);
  if exists (select 1 from public.event_price_versions where event_id = ev_gone) then
    raise exception 'PRICE_DELETE left the day''s lists behind';
  end if;
end $$;
select 'BAZAAR_DAY_PRICES|passed';
rollback;
