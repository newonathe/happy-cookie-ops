-- D1 bazaar authority and idempotency with real SQL roles; all data rolls back.
--
-- start_event / set_event_device / record_event_sale / void_event_sale: the active owner only
-- (anon holds no EXECUTE at all). record_event_sale and void_event_sale are safe to repeat and
-- to deliver out of order: a repeat is acknowledged once, a void that arrives first still
-- voids the later sale, a stale retry never un-voids, and prices come from the event snapshot
-- taken at start (a later price change never reaches a running event).
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;
create temporary table ctx (k text primary key, v text);
grant select, insert on ctx to anon, authenticated, service_role;

insert into auth.users(id)
select ('d1e00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('d1e00000-0000-4000-8000-000000000001', 'owner', 'Bazaar owner', true),
  ('d1e00000-0000-4000-8000-000000000002', 'helper', 'Bazaar helper', true),
  ('d1e00000-0000-4000-8000-000000000003', 'support', 'Bazaar support', true),
  ('d1e00000-0000-4000-8000-000000000004', 'owner', 'Bazaar inactive owner', false);
insert into public.products(id, name, short_name, price_cents, kind, tag, description, image_path,
  active, published, sort_order, allergens)
values ('mp0d-a', 'Fixture A', 'A', 13000, 'Permanent', '', '', '/a.png', true, true, 1, 'milk'),
       ('mp0d-b', 'Fixture B', 'B', 15000, 'Rotating', '', '', '/b.png', true, true, 2, 'milk'),
       ('mp0d-off', 'Fixture Off', 'O', 9000, 'Rotating', '', '', '/o.png', false, false, 3, 'milk');
-- An event closed on 2026-01-02, holding a snapshot of its own.
insert into public.events(id, name, starts_at, closed_at, selling_device, price_snapshot)
values ('d1e0c105-0000-4000-8000-000000000001', 'Closed fixture', '2026-01-01 00:00+00', '2026-01-02 00:00+00',
  'devC', '{"mp0d-a": 13000}');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'd1e00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

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
  if state = '00000' and wanted <> '00000' then
    raise exception 'forbidden bazaar call succeeded: % / %', actor, operation;
  elsif state <> wanted then
    raise exception 'bazaar outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

create function pg_temp.confirm(ok boolean, actor text, operation text, outcome text) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'bazaar outcome differs: % / % / %', actor, operation, outcome;
  end if;
  insert into pg_temp.authority_results values (operation, actor, outcome);
end $$;

create function pg_temp.ev() returns uuid language sql stable security invoker as $$
  select v::uuid from pg_temp.ctx where k = 'ev'
$$;

-- A valid sale for the running event: one A at the snapshot price, paid in cash.
create function pg_temp.sale(client text, device text default 'devA') returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'deviceId', device, 'eventId', pg_temp.ev()::text,
    'items', '{"mp0d-a": 1}'::jsonb, 'discountCents', 0, 'totalCents', 13000, 'pay', 'Cash',
    'ref', '', 'clerk', 'Owner', 'at', (extract(epoch from now()) * 1000)::bigint, 'tenderedCents', 20000, 'changeCents', 7000)
$$;

create function pg_temp.void(client text, device text default 'devA') returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'deviceId', device, 'at', (extract(epoch from now()) * 1000)::bigint)
$$;

create function pg_temp.valid_a() returns jsonb language sql immutable as $$
  select jsonb_build_object('name', 'Fixture A', 'short_name', 'A', 'price_cents', 20000,
    'kind', 'Permanent', 'item_type', 'set', 'capacity_weight', 4, 'tag', '',
    'description', '', 'image_path', 'assets/a.png', 'allergens', 'milk',
    'active', true, 'sort_order', 1)
$$;

-- anon must not even hold EXECUTE: the in-function role check alone is not enough.
create function pg_temp.assert_anon_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.start_event(text,text,bigint,uuid)', 'EXECUTE') then
    raise exception 'forbidden bazaar call succeeded: anon / start_event';
  end if;
  if has_function_privilege('anon', 'public.set_event_device(uuid,text)', 'EXECUTE') then
    raise exception 'forbidden bazaar call succeeded: anon / set_event_device';
  end if;
  if has_function_privilege('anon', 'public.record_event_sale(jsonb)', 'EXECUTE') then
    raise exception 'forbidden bazaar call succeeded: anon / record_event_sale';
  end if;
  if has_function_privilege('anon', 'public.void_event_sale(jsonb)', 'EXECUTE') then
    raise exception 'forbidden bazaar call succeeded: anon / void_event_sale';
  end if;
  insert into pg_temp.authority_results values ('bazaar_acl', 'anon', 'no_execute');
end $$;

-- Every caller but the active owner is refused all four commands and cannot write the tables.
create function pg_temp.assert_denied(actor text) returns void language plpgsql security invoker as $$
declare
  sale text := 'jsonb_build_object(''clientId'', ''devA:S1:1'', ''deviceId'', ''devA'')';
begin
  perform pg_temp.expect(actor, 'start_event', 'select * from public.start_event(''Denied'', ''devA'', 0)', '42501');
  perform pg_temp.expect(actor, 'set_event_device',
    'select public.set_event_device(''d1e0c105-0000-4000-8000-000000000001'', ''devZ'')', '42501');
  perform pg_temp.expect(actor, 'record_event_sale', 'select * from public.record_event_sale(' || sale || ')', '42501');
  perform pg_temp.expect(actor, 'void_event_sale', 'select * from public.void_event_sale(' || sale || ')', '42501');
end $$;

create function pg_temp.assert_owner() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  ev uuid;
  r record;
  n integer;
  snap jsonb;
begin
  -- ---- start_event
  perform pg_temp.expect(a, 'start_blank_name', 'select * from public.start_event(''   '', ''devA'', 0)', '22023');
  perform pg_temp.expect(a, 'start_bad_device', 'select * from public.start_event(''Fair'', ''dev A!'', 0)', '22023');
  perform pg_temp.expect(a, 'start_negative_float', 'select * from public.start_event(''Fair'', ''devA'', -1)', '22023');
  perform pg_temp.expect(a, 'start_huge_float', 'select * from public.start_event(''Fair'', ''devA'', 100000001)', '22023');
  select e.event_id, e.prices into ev, snap from public.start_event('Test bazaar', 'devA', 50000) e;
  insert into pg_temp.ctx values ('ev', ev::text);
  perform pg_temp.confirm(snap = '{"mp0d-a": 13000, "mp0d-b": 15000}'::jsonb
    and (select selling_device = 'devA' and price_snapshot = snap and closed_at is null
           from public.events where id = ev), a, 'start_event', 'active_snapshot_and_device');

  -- ---- the void markers have no policy at all: not even the owner writes them directly
  perform pg_temp.expect(a, 'voids_insert',
    'insert into public.event_sale_voids(client_id, device_id, voided_at) values (''devA:x'', ''devA'', now())', '42501');
  perform pg_temp.expect(a, 'voids_select', 'select * from public.event_sale_voids', '42501');

  -- ---- a later online price change never reaches the running event (DP-20)
  perform public.save_flavour('mp0d-a', pg_temp.valid_a(), (select updated_at from public.products where id = 'mp0d-a'));
  perform pg_temp.confirm((select price_cents = 20000 from public.products where id = 'mp0d-a'),
    a, 'menu_price_changed', 'live_price_20000');

  -- ---- validation; every refusal leaves nothing behind
  perform pg_temp.expect(a, 'sale_not_object', 'select * from public.record_event_sale(''[]''::jsonb)', '22023');
  perform pg_temp.expect(a, 'sale_extra_key',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"role": "owner"}'')', '22023');
  perform pg_temp.expect(a, 'sale_missing_key',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') - ''clerk'')', '22023');
  perform pg_temp.expect(a, 'sale_client_not_device_prefixed',
    'select * from public.record_event_sale(pg_temp.sale(''devB:S1:1'', ''devA''))', '22023');
  perform pg_temp.expect(a, 'sale_event_not_uuid',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"eventId": "g0-synthetic-event"}'')', '22023');
  perform pg_temp.expect(a, 'sale_event_unknown',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"eventId": "d1e0c105-0000-4000-8000-0000000000ff"}'')', 'P0002');
  perform pg_temp.expect(a, 'sale_wrong_device',
    'select * from public.record_event_sale(pg_temp.sale(''devB:S1:1'', ''devB''))', '42501');
  perform pg_temp.expect(a, 'sale_total_off',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"totalCents": 12999}'')', '22023');
  perform pg_temp.expect(a, 'sale_live_price_not_snapshot',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"totalCents": 20000}'')', '22023');
  perform pg_temp.expect(a, 'sale_negative_money',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"tenderedCents": -1}'')', '22023');
  perform pg_temp.expect(a, 'sale_fractional_money',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"tenderedCents": 100.5}'')', '22023');
  perform pg_temp.expect(a, 'sale_discount_over_gross',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"discountCents": 13001, "totalCents": 0}'')', '22023');
  perform pg_temp.expect(a, 'sale_unknown_flavour',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"items": {"mp0d-zzz": 1}}'')', '22023');
  perform pg_temp.expect(a, 'sale_flavour_off_the_form',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"items": {"mp0d-off": 1}, "totalCents": 9000}'')', '22023');
  perform pg_temp.expect(a, 'sale_zero_quantity',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"items": {"mp0d-a": 0}}'')', '22023');
  perform pg_temp.expect(a, 'sale_no_items',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"items": {}}'')', '22023');
  perform pg_temp.expect(a, 'sale_bad_payment',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"pay": "Barter"}'')', '22023');
  perform pg_temp.expect(a, 'sale_future',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"at": 99999999999999}'')', '22023');
  perform pg_temp.expect(a, 'sale_before_event_started',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"at": 1767268800000}'')', '22023');
  perform pg_temp.expect(a, 'sale_freebie_with_charge',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1'') || ''{"pay": "Freebie"}'')', '22023');
  perform pg_temp.confirm((select count(*) = 0 from public.event_sales where client_id like 'dev%')
    and (select count(*) = 0 from public.ledger_entries where memo like '%devA:%'),
    a, 'refusals_leave_nothing', 'no_rows_written');

  -- ---- a normal sale, repeated: acknowledged twice, written once
  select * into r from public.record_event_sale(pg_temp.sale('devA:S1:1767268800000'));
  perform pg_temp.confirm(r.duplicate = false and r.voided = false and r.sale_id is not null,
    a, 'sale_first', 'recorded');
  select * into r from public.record_event_sale(pg_temp.sale('devA:S1:1767268800000'));
  perform pg_temp.confirm(r.duplicate = true and r.voided = false, a, 'sale_repeat', 'acknowledged_again');
  perform pg_temp.confirm(
    (select count(*) = 1 from public.event_sales where client_id = 'devA:S1:1767268800000')
    and (select count(*) = 1 from public.ledger_entries where memo = 'Stall sale devA:S1:1767268800000' and amount_cents = 13000)
    and (select count(*) = 1 from public.event_sale_items i join public.event_sales s on s.id = i.sale_id
           where s.client_id = 'devA:S1:1767268800000' and i.unit_price_cents = 13000)
    and (select count(*) = 1 from public.audit_log where action = 'event_sale.recorded'
           and detail ->> 'client_id' = 'devA:S1:1767268800000'),
    a, 'sale_repeat_rows', 'one_sale_one_ledger_one_item_one_audit');
  -- The same id delivered again after the event moved on is still just acknowledged.
  perform pg_temp.expect(a, 'sale_repeat_altered_body',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S1:1767268800000'') || ''{"ref": "changed"}'')', '23505');
  perform pg_temp.confirm((select payload_hash ~ '^[0-9a-f]{64}$' and pay_ref = ''
      from public.event_sales where client_id = 'devA:S1:1767268800000'),
    a, 'sale_hash_kept', 'first_body_hash_stored');

  -- ---- two flavours and a discount, priced from the snapshot
  select * into r from public.record_event_sale(
    pg_temp.sale('devA:S2:1767268800000') || jsonb_build_object('items', '{"mp0d-a": 2, "mp0d-b": 1}'::jsonb,
      'discountCents', 1000, 'totalCents', 40000, 'pay', 'GCash', 'ref', '1234'));
  perform pg_temp.confirm(r.duplicate = false
    and (select gross_cents = 41000 and discount_cents = 1000 and total_cents = 40000
           from public.event_sales where client_id = 'devA:S2:1767268800000'),
    a, 'sale_two_flavours', 'priced_from_snapshot');

  -- ---- freebie: recorded, no ledger entry, repeat safe
  select * into r from public.record_event_sale(
    pg_temp.sale('devA:S3:1767268800000') || '{"pay": "Freebie", "discountCents": 13000, "totalCents": 0, "tenderedCents": 0, "changeCents": 0}');
  perform pg_temp.confirm(r.duplicate = false and r.voided = false, a, 'freebie_first', 'recorded');
  select * into r from public.record_event_sale(
    pg_temp.sale('devA:S3:1767268800000') || '{"pay": "Freebie", "discountCents": 13000, "totalCents": 0, "tenderedCents": 0, "changeCents": 0}');
  perform pg_temp.confirm(r.duplicate = true
    and (select count(*) = 1 from public.event_sales where client_id = 'devA:S3:1767268800000' and total_cents = 0 and pay_method = 'Freebie')
    and (select count(*) = 0 from public.ledger_entries where memo like '%devA:S3:%'),
    a, 'freebie_repeat', 'one_row_no_ledger');

  -- ---- void after the sale: one reversal, repeat does nothing
  select * into r from public.void_event_sale(pg_temp.void('devA:S2:1767268800000'));
  perform pg_temp.confirm(r.sale_known = true and r.duplicate = false
    and (select voided_at is not null from public.event_sales where client_id = 'devA:S2:1767268800000')
    and (select coalesce(sum(amount_cents), 0) = 0 from public.ledger_entries
           where memo in ('Stall sale devA:S2:1767268800000', 'Void of stall sale devA:S2:1767268800000')),
    a, 'void_after_sale', 'voided_and_ledger_net_zero');
  select * into r from public.void_event_sale(pg_temp.void('devA:S2:1767268800000'));
  perform pg_temp.confirm(r.sale_known = true and r.duplicate = true
    and (select count(*) = 1 from public.ledger_entries where memo = 'Void of stall sale devA:S2:1767268800000')
    and (select count(*) = 1 from public.audit_log where action = 'event_sale.voided'
           and detail ->> 'client_id' = 'devA:S2:1767268800000'),
    a, 'void_repeat', 'no_second_reversal');
  select * into r from public.record_event_sale(
    pg_temp.sale('devA:S2:1767268800000') || jsonb_build_object('items', '{"mp0d-a": 2, "mp0d-b": 1}'::jsonb,
      'discountCents', 1000, 'totalCents', 40000, 'pay', 'GCash', 'ref', '1234'));
  perform pg_temp.confirm(r.duplicate = true and r.voided = true, a, 'stale_retry_after_void', 'stays_voided');

  -- ---- void first, sale later (out of order): the sale lands voided, with no revenue
  select * into r from public.void_event_sale(pg_temp.void('devA:S4:1767268800000'));
  perform pg_temp.confirm(r.sale_known = false and r.duplicate = false
    and (select count(*) = 1 from public.audit_log where action = 'event_sale.voided'
           and detail ->> 'client_id' = 'devA:S4:1767268800000' and detail ->> 'sale_known' = 'false'),
    a, 'void_before_sale', 'marker_kept_and_audited');
  select * into r from public.void_event_sale(pg_temp.void('devA:S4:1767268800000'));
  perform pg_temp.confirm(r.sale_known = false and r.duplicate = true, a, 'void_before_sale_repeat', 'marker_once');
  select * into r from public.record_event_sale(pg_temp.sale('devA:S4:1767268800000'));
  perform pg_temp.confirm(r.duplicate = false and r.voided = true
    and (select voided_at is not null from public.event_sales where client_id = 'devA:S4:1767268800000')
    and (select count(*) = 0 from public.ledger_entries where memo like '%devA:S4:%'),
    a, 'sale_after_void', 'arrives_voided_no_revenue');
  select * into r from public.record_event_sale(pg_temp.sale('devA:S4:1767268800000'));
  perform pg_temp.confirm(r.duplicate = true and r.voided = true, a, 'sale_after_void_repeat', 'stays_voided');

  -- ---- void validation
  perform pg_temp.expect(a, 'void_extra_key',
    'select * from public.void_event_sale(pg_temp.void(''devA:S5:1'') || ''{"total": 1}'')', '22023');
  perform pg_temp.expect(a, 'void_client_not_device_prefixed',
    'select * from public.void_event_sale(pg_temp.void(''devB:S5:1'', ''devA''))', '22023');

  -- ---- moving the selling device: the old phone's queued sales are still accepted
  perform pg_temp.expect(a, 'device_bad', 'select public.set_event_device(pg_temp.ev(), ''dev B!'')', '22023');
  perform pg_temp.expect(a, 'device_unknown_event',
    'select public.set_event_device(''d1e0c105-0000-4000-8000-0000000000ff'', ''devB'')', 'P0002');
  perform pg_temp.expect(a, 'device_closed_event',
    'select public.set_event_device(''d1e0c105-0000-4000-8000-000000000001'', ''devB'')', '55000');
  perform pg_temp.expect(a, 'device_move', 'select public.set_event_device(pg_temp.ev(), ''devB'')', '00000');
  perform pg_temp.confirm((select selling_device = 'devB' and former_devices = array['devA'] from public.events where id = ev),
    a, 'device_move_state', 'devB_selling_devA_former');
  perform pg_temp.expect(a, 'device_move_same', 'select public.set_event_device(pg_temp.ev(), ''devB'')', '00000');
  perform pg_temp.confirm((select former_devices = array['devA'] from public.events where id = ev)
    and (select count(*) = 1 from public.audit_log where action = 'event.device_changed'),
    a, 'device_move_same_state', 'no_second_change');
  select * into r from public.record_event_sale(pg_temp.sale('devA:S6:1767268800000'));
  perform pg_temp.confirm(r.duplicate = false, a, 'sale_from_former_device', 'accepted');
  select * into r from public.record_event_sale(pg_temp.sale('devB:S1:1767268800000', 'devB'));
  perform pg_temp.confirm(r.duplicate = false, a, 'sale_from_new_device', 'accepted');
  perform pg_temp.expect(a, 'sale_third_device',
    'select * from public.record_event_sale(pg_temp.sale(''devC:S1:1767268800000'', ''devC''))', '42501');
  perform pg_temp.expect(a, 'device_move_back', 'select public.set_event_device(pg_temp.ev(), ''devA'')', '00000');
  perform pg_temp.confirm((select selling_device = 'devA' and former_devices = array['devB'] from public.events where id = ev),
    a, 'device_move_back_state', 'devA_selling_devB_former');

  -- ---- closed event: sales made before the close are accepted late, later ones are not
  perform pg_temp.expect(a, 'closed_sale_after_close',
    'select * from public.record_event_sale(pg_temp.sale(''devC:S1:1'', ''devC'') || jsonb_build_object(''eventId'', ''d1e0c105-0000-4000-8000-000000000001'', ''at'', 1767441600000))', '55000');
  select * into r from public.record_event_sale(
    pg_temp.sale('devC:S1:1767268800000', 'devC') || '{"eventId": "d1e0c105-0000-4000-8000-000000000001", "at": 1767268800000}');
  perform pg_temp.confirm(r.duplicate = false, a, 'closed_sale_before_close', 'accepted_late');

  -- ---- a lost reply to start_event: the same event id returns the same event
  select e.event_id, e.prices into ev, snap from public.start_event('Retry fair', 'devA', 0, 'd1e0c105-0000-4000-8000-0000000000aa') e;
  select * into r from public.start_event('Retry fair', 'devA', 0, 'd1e0c105-0000-4000-8000-0000000000aa');
  perform pg_temp.confirm(ev = 'd1e0c105-0000-4000-8000-0000000000aa'::uuid and r.event_id = ev and r.prices = snap
    and (select count(*) = 1 from public.events where name = 'Retry fair')
    and (select count(*) = 1 from public.audit_log where action = 'event.started' and entity_id = ev::text),
    a, 'start_event_retry', 'same_event_no_second');
  perform pg_temp.expect(a, 'start_event_id_reused',
    'select * from public.start_event(''Other fair'', ''devA'', 0, ''d1e0c105-0000-4000-8000-0000000000aa'')', '23505');

  -- ---- a repeat is acknowledged even after the phone stopped being the selling device, or the
  -- event closed: the phone must be able to stop retrying a sale that is already booked
  update public.events set selling_device = 'devZ', former_devices = '{}' where id = pg_temp.ev();
  select * into r from public.record_event_sale(pg_temp.sale('devA:S1:1767268800000'));
  perform pg_temp.confirm(r.duplicate = true, a, 'repeat_after_device_change', 'acknowledged');
  perform pg_temp.expect(a, 'new_sale_after_device_change',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S7:1767268800000''))', '42501');
  update public.events set selling_device = 'devA', closed_at = '2026-01-01 00:00+00' where id = pg_temp.ev();
  select * into r from public.record_event_sale(pg_temp.sale('devA:S1:1767268800000'));
  perform pg_temp.confirm(r.duplicate = true, a, 'repeat_after_close', 'acknowledged');
  perform pg_temp.expect(a, 'new_sale_after_close',
    'select * from public.record_event_sale(pg_temp.sale(''devA:S7:1767268800000''))', '55000');
end $$;

grant execute on function pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text),
  pg_temp.confirm(boolean, text, text, text), pg_temp.ev(), pg_temp.sale(text, text), pg_temp.void(text, text),
  pg_temp.valid_a(), pg_temp.assert_anon_acl(), pg_temp.assert_denied(text), pg_temp.assert_owner()
  to anon, authenticated, service_role;

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
-- A subject with no profile: service_role is not staff, so every command refuses it.
select pg_temp.set_subject(9, 'service_role');
select pg_temp.assert_denied('service_role');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
