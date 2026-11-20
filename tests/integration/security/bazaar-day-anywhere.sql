-- A bazaar selling day belongs to the account, not the device (migration 20260101009300): get_bazaar_day, and record_event_sale
-- without the selling-device refusal. Real SQL roles; all data rolls back. Synthetic prices only.
begin;
insert into auth.users(id) values
 ('b0930000-0000-4000-8000-000000000001'),('b0930000-0000-4000-8000-000000000002'),
 ('b0930000-0000-4000-8000-000000000003'),('b0930000-0000-4000-8000-000000000004');
insert into public.profiles(id,role,display_name,active) values
 ('b0930000-0000-4000-8000-000000000001','owner','Day owner',true),
 ('b0930000-0000-4000-8000-000000000002','helper','Day helper',true),
 ('b0930000-0000-4000-8000-000000000003','support','Day support',true),
 ('b0930000-0000-4000-8000-000000000004','owner','Inactive day owner',false);
insert into public.products(id,name,short_name,price_cents,kind) values
 ('da-a','Anywhere flavour A','A',10000,'Permanent'),('da-b','Anywhere flavour B','B',5000,'Permanent');

create function pg_temp.act(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$f$;
-- Runs a call and requires exactly this SQLSTATE (or success when wanted is null).
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
    raise exception 'DAY_ANYWHERE % : wanted %, got % (%)', label, coalesce(wanted, 'success'), coalesce(got, 'success'), msg;
  end if;
end;
$f$;
-- A booking with one started day sold on devP, at A 100.00 and B 50.00 (centavos), 40 of A and 30 of B on the table.
create function pg_temp.day(p uuid, p_name text, started boolean default true) returns uuid language plpgsql as $f$
declare d uuid := md5(p::text || ':d')::uuid; e uuid := md5(p::text || ':e')::uuid;
begin
  insert into public.scheduled_events(id, name, starts_on, ends_on, rent_cents) values (p, p_name, current_date, current_date, 0);
  if started then
    insert into public.events(id, name, starts_at, selling_device, price_snapshot, opened_at, loaded)
      values (e, p_name || ' day', now() - interval '1 hour', 'devP', '{"da-a": 10000, "da-b": 5000}', now() - interval '1 hour',
              '{"da-a": 40, "da-b": 30}');
  end if;
  insert into public.bazaar_days(id, scheduled_id, day, float_cents, event_id, plan_hash)
    values (d, p, current_date, 25000, case when started then e end, repeat('a', 64));
  insert into public.bazaar_day_lines(day_id, product_id, made_qty, carried_qty, price_cents)
    values (d, 'da-a', 40, 0, 10000), (d, 'da-b', 30, 0, 5000);
  return d;
end;
$f$;
create function pg_temp.event_of(d uuid) returns uuid language sql stable as $f$ select event_id from public.bazaar_days where id = d $f$;
-- One sale, rung on `dev` at `secs` seconds from now. The client id is the device, the device's own number, and nothing else.
create function pg_temp.sale(dev text, n integer, d uuid, items jsonb, total bigint, secs integer default 0, pay text default 'Cash')
returns jsonb language sql stable as $f$
  select jsonb_build_object('clientId', dev || ':S' || n, 'deviceId', dev, 'eventId', pg_temp.event_of(d), 'items', items,
    'discountCents', case when pay = 'Freebie' then 10000 else 0 end, 'totalCents', total, 'pay', pay, 'ref', '', 'clerk', 'Owner',
    'at', (extract(epoch from now() + make_interval(secs => secs)) * 1000)::bigint, 'tenderedCents', total, 'changeCents', 0)
$f$;
create function pg_temp.void(client text, secs integer default 0) returns jsonb language sql stable as $f$
  select jsonb_build_object('clientId', client, 'deviceId', split_part(client, ':', 1),
    'at', (extract(epoch from now() + make_interval(secs => secs)) * 1000)::bigint)
$f$;
create function pg_temp.got(d uuid) returns jsonb language sql stable as $f$ select public.get_bazaar_day(d) $f$;
create function pg_temp.line(j jsonb, client text) returns jsonb language sql stable as $f$
  select s from jsonb_array_elements(j -> 'sales') s where s ->> 'client_id' = client
$f$;

do $$
declare
  owner uuid := 'b0930000-0000-4000-8000-000000000001';
  bad uuid;
  one uuid := 'b0931000-0000-4000-8000-000000000001';    -- the day two devices sell
  other uuid := 'b0931000-0000-4000-8000-000000000002';  -- a second day of its own: its sales must never appear on the first
  plan uuid := 'b0931000-0000-4000-8000-000000000003';   -- a day that has not started
  d_one uuid; d_other uuid; d_plan uuid; ev uuid;
  r record;
  j jsonb;
  ids text[];
begin
  d_one := pg_temp.day(one, 'Anywhere fair');
  d_other := pg_temp.day(other, 'Second fair');
  d_plan := pg_temp.day(plan, 'Planned fair', false);
  ev := pg_temp.event_of(d_one);

  -- Who may call it: authenticated reads a day, anon does not, and the access helper is nobody's to call.
  if has_function_privilege('anon', 'public.get_bazaar_day(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_bazaar_day(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.bazaar_day_access(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.bazaar_day_access(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.bazaar_day_access(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_event_sale(jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_event_sale(jsonb)', 'EXECUTE') then
    raise exception 'DAY_GRANTS changed';
  end if;
  -- S3 (migration 20260101009500): the helper reads and sells the day that is open now, so it is no longer in this list of the refused.
  -- helpers.sql proves what a helper may and may not do; a support profile and an inactive owner are refused as before.
  foreach bad in array array['b0930000-0000-4000-8000-000000000003',
                             'b0930000-0000-4000-8000-000000000004']::uuid[] loop
    perform pg_temp.act(bad);
    perform pg_temp.expect('not owner read', format('select public.get_bazaar_day(%L)', d_one), '42501');
    perform pg_temp.expect('not owner read, no such day', format('select public.get_bazaar_day(%L)', gen_random_uuid()), '42501');
    perform pg_temp.expect('not owner sale', format('select * from public.record_event_sale(%L)',
      pg_temp.sale('devA', 1, d_one, '{"da-a": 1}', 10000)), '42501');
  end loop;
  perform pg_temp.act(owner);
  perform pg_temp.expect('no day', 'select public.get_bazaar_day(null)', '22023');
  perform pg_temp.expect('unknown day', format('select public.get_bazaar_day(%L)', gen_random_uuid()), 'P0002');

  -- A day that has not started reads as a plan: its stock is the plan, and there is nothing sold.
  j := pg_temp.got(d_plan);
  if j ->> 'status' <> 'planned' or j -> 'event_id' <> 'null'::jsonb or j -> 'sales' <> '[]'::jsonb
     or j -> 'table_stock' <> '{"da-a": 40, "da-b": 30}'::jsonb or j -> 'prices' <> '{"da-a": 10000, "da-b": 5000}'::jsonb
     or (j ->> 'float_cents')::integer <> 25000 or (j ->> 'price_version')::integer <> 0 then
    raise exception 'DAY_ANYWHERE a planned day reads wrong: %', j;
  end if;

  -- A started day with no sale: open, the planned stock on the table.
  j := pg_temp.got(d_one);
  if j ->> 'status' <> 'open' or j ->> 'event_id' <> ev::text or j -> 'closed_at' <> 'null'::jsonb or j -> 'sales' <> '[]'::jsonb
     or j -> 'table_stock' <> '{"da-a": 40, "da-b": 30}'::jsonb or j -> 'loaded' <> '{"da-a": 40, "da-b": 30}'::jsonb
     or j ->> 'booking_id' <> one::text or j ->> 'day' <> to_char(current_date, 'YYYY-MM-DD') then
    raise exception 'DAY_ANYWHERE an open day reads wrong: %', j;
  end if;

  -- Two devices that are NOT the selling device (devP) sell the same day: both are accepted, each once.
  select * into r from public.record_event_sale(pg_temp.sale('devA', 1, d_one, '{"da-a": 2}', 20000, -120));
  if r.duplicate or r.voided or r.sale_id is null then raise exception 'DAY_ANYWHERE devA sale not accepted'; end if;
  select * into r from public.record_event_sale(pg_temp.sale('devB', 1, d_one, '{"da-b": 1, "da-a": 1}', 15000, -60));
  if r.duplicate or r.voided or r.sale_id is null then raise exception 'DAY_ANYWHERE devB sale not accepted'; end if;
  -- The selling device itself still sells, and so does a former device of the old rule (no list is kept any more).
  select * into r from public.record_event_sale(pg_temp.sale('devP', 1, d_one, '{"da-b": 2}', 10000, -30));
  if r.duplicate then raise exception 'DAY_ANYWHERE devP sale not accepted'; end if;
  -- The same sale again, from a phone that never heard the answer: acknowledged once, written once.
  select * into r from public.record_event_sale(pg_temp.sale('devA', 1, d_one, '{"da-a": 2}', 20000, -120));
  if not r.duplicate then raise exception 'DAY_ANYWHERE a repeat was written again'; end if;
  if (select count(*) from public.event_sales where event_id = ev) <> 3
     or (select count(*) from public.event_sales where client_id = 'devA:S1') <> 1
     or (select count(*) from public.ledger_entries where memo = 'Stall sale devA:S1' and amount_cents = 20000) <> 1 then
    raise exception 'DAY_ANYWHERE the sales were not written once each';
  end if;

  -- Both are on the read, oldest first, with their items, and the table stock is the server's.
  j := pg_temp.got(d_one);
  select array_agg(s ->> 'client_id' order by ord) into ids from jsonb_array_elements(j -> 'sales') with ordinality as t(s, ord);
  if ids <> array['devA:S1', 'devB:S1', 'devP:S1'] then raise exception 'DAY_ANYWHERE sales out of order or missing: %', ids; end if;
  if pg_temp.line(j, 'devA:S1') -> 'items' <> '{"da-a": 2}'::jsonb or (pg_temp.line(j, 'devA:S1') ->> 'total_cents')::integer <> 20000
     or pg_temp.line(j, 'devB:S1') -> 'items' <> '{"da-a": 1, "da-b": 1}'::jsonb or (pg_temp.line(j, 'devB:S1') ->> 'gross_cents')::integer <> 15000
     or pg_temp.line(j, 'devA:S1') ->> 'pay' <> 'Cash' or pg_temp.line(j, 'devA:S1') ->> 'clerk' <> 'Owner'
     or (pg_temp.line(j, 'devA:S1') -> 'voided') <> 'false'::jsonb or pg_temp.line(j, 'devA:S1') -> 'voided_at' <> 'null'::jsonb
     or (pg_temp.line(j, 'devA:S1') ->> 'at') <> (pg_temp.sale('devA', 1, d_one, '{}', 0, -120) ->> 'at') then
    raise exception 'DAY_ANYWHERE a sale reads wrong: %', j -> 'sales';
  end if;
  -- 40 - 2 - 1 = 37 of A, 30 - 1 - 2 = 27 of B.
  if j -> 'table_stock' <> '{"da-a": 37, "da-b": 27}'::jsonb or j -> 'loaded' <> '{"da-a": 40, "da-b": 30}'::jsonb then
    raise exception 'DAY_ANYWHERE table stock wrong: %', j -> 'table_stock';
  end if;
  -- The second day sees none of it.
  if pg_temp.got(d_other) -> 'sales' <> '[]'::jsonb or pg_temp.got(d_other) -> 'table_stock' <> '{"da-a": 40, "da-b": 30}'::jsonb then
    raise exception 'DAY_ANYWHERE another day leaked sales';
  end if;

  -- The same client id from another device is not another sale: the client id must start with the sending device ...
  perform pg_temp.expect('client id of another device', format('select * from public.record_event_sale(%L)',
    pg_temp.sale('devA', 1, d_one, '{"da-a": 2}', 20000, -120) || '{"deviceId": "devB"}'), '22023');
  -- ... and a changed body under a used client id is refused, from any device, and never replaces the sale.
  perform pg_temp.expect('same id other body', format('select * from public.record_event_sale(%L)',
    pg_temp.sale('devA', 1, d_one, '{"da-a": 3}', 30000, -120)), '23505');
  perform pg_temp.expect('same id other pay', format('select * from public.record_event_sale(%L)',
    pg_temp.sale('devA', 1, d_one, '{"da-a": 2}', 20000, -120) || '{"ref": "x"}'), '23505');
  if pg_temp.line(pg_temp.got(d_one), 'devA:S1') -> 'items' <> '{"da-a": 2}'::jsonb then
    raise exception 'DAY_ANYWHERE a refused body changed the sale';
  end if;

  -- A void from the other device takes devA's sale back: the sale stays on the read, flagged, and the stock returns.
  select * into r from public.void_event_sale(pg_temp.void('devA:S1'));
  if not r.sale_known or r.duplicate then raise exception 'DAY_ANYWHERE void not applied'; end if;
  j := pg_temp.got(d_one);
  if (pg_temp.line(j, 'devA:S1') -> 'voided') <> 'true'::jsonb or pg_temp.line(j, 'devA:S1') -> 'voided_at' = 'null'::jsonb
     or j -> 'table_stock' <> '{"da-a": 39, "da-b": 27}'::jsonb then
    raise exception 'DAY_ANYWHERE a void reads wrong: % %', pg_temp.line(j, 'devA:S1'), j -> 'table_stock';
  end if;
  -- A repeat of the sale after its void stays voided; the void again is answered.
  select * into r from public.record_event_sale(pg_temp.sale('devA', 1, d_one, '{"da-a": 2}', 20000, -120));
  if not r.duplicate or not r.voided then raise exception 'DAY_ANYWHERE a stale retry un-voided the sale'; end if;
  select * into r from public.void_event_sale(pg_temp.void('devA:S1'));
  if not r.duplicate then raise exception 'DAY_ANYWHERE the void was applied twice'; end if;

  -- A void that arrives before its sale: the sale lands voided and takes nothing off the table.
  select * into r from public.void_event_sale(pg_temp.void('devB:S2'));
  if r.sale_known then raise exception 'DAY_ANYWHERE a void for no sale knew a sale'; end if;
  select * into r from public.record_event_sale(pg_temp.sale('devB', 2, d_one, '{"da-a": 5}', 50000, -10));
  if r.duplicate or not r.voided then raise exception 'DAY_ANYWHERE a sale after its void did not land voided'; end if;
  j := pg_temp.got(d_one);
  if (pg_temp.line(j, 'devB:S2') -> 'voided') <> 'true'::jsonb or j -> 'table_stock' <> '{"da-a": 39, "da-b": 27}'::jsonb then
    raise exception 'DAY_ANYWHERE a sale voided on arrival reads wrong: %', j -> 'table_stock';
  end if;

  -- A freebie takes cookies off the table and no money; losses take cookies off, and a loss that was taken back does not.
  select * into r from public.record_event_sale(pg_temp.sale('devB', 3, d_one, '{"da-b": 4}', 0, -5, 'Freebie')
    || jsonb_build_object('discountCents', 20000));
  if r.duplicate then raise exception 'DAY_ANYWHERE a freebie was not accepted'; end if;
  insert into public.bazaar_losses(client_id, day_id, product_id, qty, reason, at, payload_hash, voided_at) values
    ('loss-1', d_one, 'da-a', 3, 'dropped', now(), repeat('b', 64), null),
    ('loss-2', d_one, 'da-a', 2, 'taken back', now(), repeat('c', 64), now());
  j := pg_temp.got(d_one);
  -- A: 40 - 1 (devB S1) - 3 lost = 36; B: 30 - 1 - 2 - 4 = 23.
  if j -> 'table_stock' <> '{"da-a": 36, "da-b": 23}'::jsonb then
    raise exception 'DAY_ANYWHERE stock with a freebie and losses wrong: %', j -> 'table_stock';
  end if;
  if (pg_temp.line(j, 'devB:S3') ->> 'total_cents')::integer <> 0 or pg_temp.line(j, 'devB:S3') ->> 'pay' <> 'Freebie' then
    raise exception 'DAY_ANYWHERE a freebie reads wrong';
  end if;

  -- A price change is on the read: the version and the latest list.
  perform public.set_bazaar_day_price(jsonb_build_object('requestId', 'b0933000-0000-4000-8000-000000000001', 'eventId', ev,
    'productId', 'da-a', 'priceCents', 12000));
  j := pg_temp.got(d_one);
  if (j ->> 'price_version')::integer <> 1 or j -> 'prices' <> '{"da-a": 12000, "da-b": 5000}'::jsonb then
    raise exception 'DAY_ANYWHERE the price change is not on the read: % %', j -> 'price_version', j -> 'prices';
  end if;

  -- set_event_device is still there and still the owner's; moving selling changes nobody's right to sell.
  perform pg_temp.expect('move the device', format('select public.set_event_device(%L, %L)', ev, 'devB'), null);
  select * into r from public.record_event_sale(pg_temp.sale('devC', 1, d_one, '{"da-b": 1}', 5000, 0));
  if r.duplicate then raise exception 'DAY_ANYWHERE a third device was not accepted'; end if;

  -- A closed day reads closed with the time, keeps every sale, and still refuses a sale rung after the close.
  update public.events set closed_at = now() - interval '1 minute' where id = ev;
  j := pg_temp.got(d_one);
  if j ->> 'status' <> 'closed' or j -> 'closed_at' = 'null'::jsonb or jsonb_array_length(j -> 'sales') <> 6 then
    raise exception 'DAY_ANYWHERE a closed day reads wrong: % %', j ->> 'status', jsonb_array_length(j -> 'sales');
  end if;
  perform pg_temp.expect('sale after the close', format('select * from public.record_event_sale(%L)',
    pg_temp.sale('devA', 9, d_one, '{"da-a": 1}', 10000, 0)), '55000');
  select * into r from public.record_event_sale(pg_temp.sale('devB', 1, d_one, '{"da-b": 1, "da-a": 1}', 15000, -60));
  if not r.duplicate then raise exception 'DAY_ANYWHERE a repeat after the close was not acknowledged'; end if;
end $$;
select 'BAZAAR_DAY_ANYWHERE|passed';
rollback;
