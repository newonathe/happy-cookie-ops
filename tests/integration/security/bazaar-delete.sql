-- End event, first part (migration 20260101008300): delete_bazaar_booking removes an event that never sold anything and refuses,
-- writing nothing, anything that touched Money or Stock. Real SQL roles; all data rolls back.
begin;
insert into auth.users(id) values
 ('b0830000-0000-4000-8000-000000000001'),('b0830000-0000-4000-8000-000000000002'),
 ('b0830000-0000-4000-8000-000000000003'),('b0830000-0000-4000-8000-000000000004');
insert into public.profiles(id,role,display_name,active) values
 ('b0830000-0000-4000-8000-000000000001','owner','Delete owner',true),
 ('b0830000-0000-4000-8000-000000000002','helper','Delete helper',true),
 ('b0830000-0000-4000-8000-000000000003','support','Delete support',true),
 ('b0830000-0000-4000-8000-000000000004','owner','Inactive delete owner',false);
insert into public.products(id,name,short_name,price_cents,kind) values
 ('del-a','Delete flavour A','A',14000,'Permanent'),('del-b','Delete flavour B','B',13000,'Permanent');

create function pg_temp.act(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$f$;
-- Runs a call and requires exactly this SQLSTATE (or success when wanted is null). Nothing it wrote survives a refusal.
create function pg_temp.expect(label text, q text, wanted text) returns void language plpgsql as $f$
declare got text;
begin
  begin
    execute q;
    got := null;
  exception when others then
    got := sqlstate;
  end;
  if got is distinct from wanted then
    raise exception 'DELETE_EXPECTED % : wanted %, got %', label, coalesce(wanted, 'success'), coalesce(got, 'success');
  end if;
end;
$f$;
-- A booking with two planned days; the first day was opened as a selling day (open when p_closed is false).
create function pg_temp.booking(p uuid, p_name text, p_closed boolean) returns uuid language plpgsql as $f$
declare d0 uuid := md5(p::text || ':d0')::uuid; d1 uuid := md5(p::text || ':d1')::uuid; e uuid := md5(p::text || ':e0')::uuid;
begin
  insert into public.scheduled_events(id, name, starts_on, ends_on, rent_cents) values (p, p_name, current_date, current_date + 1, 120000);
  insert into public.events(id, name, starts_at, closed_at) values (e, p_name || ' day 1', now() - interval '1 hour',
    case when p_closed then now() else null end);
  insert into public.bazaar_days(id, scheduled_id, day, float_cents, event_id, plan_hash)
    values (d0, p, current_date, 50000, e, repeat('a', 64)), (d1, p, current_date + 1, 0, null, repeat('b', 64));
  insert into public.bazaar_day_lines(day_id, product_id, made_qty, carried_qty, price_cents)
    values (d0, 'del-a', 20, 0, 14000), (d0, 'del-b', 10, 0, 13000), (d1, 'del-a', 12, 0, 14000);
  insert into public.bazaar_costs(scheduled_id, product_id, typed_cents) values (p, 'del-a', 3500), (p, 'del-b', 3000);
  insert into public.bazaar_fees(client_id, scheduled_id, day_id, label, category, amount_cents, paid_on, payload_hash)
    values (p::text || ':permit', p, null, 'Permit', 'Fees', 25000, current_date, repeat('c', 64));
  insert into public.bazaar_losses(client_id, day_id, product_id, qty, reason, at, payload_hash)
    values (p::text || ':drop', d0, 'del-a', 1, 'Dropped', now(), repeat('d', 64));
  insert into public.bazaar_stock_adds(client_id, day_id, product_id, qty, kind) values (md5(p::text || ':add')::uuid, d0, 'del-a', 2, 'made');
  return e;
end;
$f$;

do $$
declare
  owner uuid := 'b0830000-0000-4000-8000-000000000001';
  x uuid := 'b0831000-0000-4000-8000-000000000001';  -- unsold, closed first day: deleted
  y uuid := 'b0831000-0000-4000-8000-000000000002';  -- unsold, first day still open: refused until the day is closed
  keep uuid := 'b0831000-0000-4000-8000-000000000003'; -- untouched bystander
  bad uuid;
  ev uuid;
  ledger_before bigint; stock_before bigint; onhand_before numeric; audit_before bigint;
  out1 jsonb; out2 jsonb;
  c record;
begin
  perform pg_temp.booking(x, 'Unsold fair', true);
  perform pg_temp.booking(y, 'Open unsold fair', false);
  perform pg_temp.booking(keep, 'Bystander fair', true);
  select count(*) into ledger_before from public.ledger_entries;
  select count(*) into stock_before from public.stock_movements;
  select coalesce(sum(on_hand), 0) into onhand_before from public.inventory_items;

  -- Who may call it.
  if has_function_privilege('anon', 'public.delete_bazaar_booking(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.delete_bazaar_booking(uuid,text)', 'EXECUTE') then
    raise exception 'DELETE_GRANTS changed';
  end if;
  foreach bad in array array['b0830000-0000-4000-8000-000000000002', 'b0830000-0000-4000-8000-000000000003',
                             'b0830000-0000-4000-8000-000000000004']::uuid[] loop
    perform pg_temp.act(bad);
    perform pg_temp.expect('not owner', format('select public.delete_bazaar_booking(%L, %L)', x, 'Unsold fair'), '42501');
  end loop;
  perform pg_temp.act(owner);
  perform pg_temp.expect('no booking', $q$select public.delete_bazaar_booking(null, 'Unsold fair')$q$, '22023');
  perform pg_temp.expect('no name', format('select public.delete_bazaar_booking(%L, null)', x), '22023');
  perform pg_temp.expect('wrong name', format('select public.delete_bazaar_booking(%L, %L)', x, 'unsold fair'), '22023');
  perform pg_temp.expect('missing', $q$select public.delete_bazaar_booking('b0831000-0000-4000-8000-0000000000ff', 'Unsold fair')$q$, 'P0002');

  -- Each thing that touched Money or Stock is refused, and the booking stays whole.
  for c in select * from (values
      ('sale', 'insert into public.event_sales(client_id, event_id, gross_cents, total_cents, pay_method, sold_at) values (''del-dev:S1:1'', %L, 14000, 14000, ''Cash'', now())'),
      ('voided sale', 'insert into public.event_sales(client_id, event_id, gross_cents, total_cents, pay_method, sold_at, voided_at) values (''del-dev:S2:1'', %L, 14000, 14000, ''Cash'', now(), now())'),
      ('expense', 'insert into public.event_expenses(client_id, event_id, label, category, amount_cents, spent_at, payload_hash) values (''del-exp'', %L, ''Ice'', ''Supplies'', 5000, now(), repeat(''e'', 64))'),
      ('drawer', 'update public.events set variance_cents = -500 where id = %L')
    ) as t(label, sql) loop
    bad := md5('bad:' || c.label)::uuid;
    ev := pg_temp.booking(bad, 'Refused ' || c.label, true);
    execute format(c.sql, ev);
    perform pg_temp.expect(c.label, format('select public.delete_bazaar_booking(%L, %L)', bad, 'Refused ' || c.label), '55000');
    if not exists (select 1 from public.scheduled_events s where s.id = bad)
       or (select count(*) from public.bazaar_days d where d.scheduled_id = bad) <> 2
       or (select count(*) from public.bazaar_costs k where k.scheduled_id = bad) <> 2
       or not exists (select 1 from public.events e where e.id = ev) then
      raise exception 'DELETE_REFUSAL_WROTE % : a refused delete removed something', c.label;
    end if;
  end loop;
  bad := md5('bad:fee')::uuid;
  perform pg_temp.booking(bad, 'Refused fee', true);
  insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at)
    values (md5('fee-ledger')::uuid, 'cost', 'Fees', 'Permit', -25000, now());
  update public.bazaar_fees set ledger_id = md5('fee-ledger')::uuid where scheduled_id = bad;
  perform pg_temp.expect('fee in books', format('select public.delete_bazaar_booking(%L, %L)', bad, 'Refused fee'), '55000');
  bad := md5('bad:kitchen')::uuid;
  perform pg_temp.booking(bad, 'Refused kitchen', true);
  insert into public.bazaar_kitchen_sources(scheduled_id, product_id, source_drop) values (bad, 'del-b', 0);
  perform pg_temp.expect('kitchen', format('select public.delete_bazaar_booking(%L, %L)', bad, 'Refused kitchen'), '55000');
  bad := md5('bad:final')::uuid;
  perform pg_temp.booking(bad, 'Refused final', true);
  update public.scheduled_events set finalised_at = now() where id = bad;
  perform pg_temp.expect('finalised', format('select public.delete_bazaar_booking(%L, %L)', bad, 'Refused final'), '55000');
  bad := md5('bad:legacy')::uuid;
  ev := pg_temp.booking(bad, 'Refused legacy', true);
  update public.scheduled_events set event_id = ev where id = bad;
  perform pg_temp.expect('legacy link', format('select public.delete_bazaar_booking(%L, %L)', bad, 'Refused legacy'), '55000');

  -- The unsold bookings go, whole; the bystander, the books and the stock do not change.
  select count(*) into audit_before from public.audit_log where action = 'bazaar.deleted';
  out1 := public.delete_bazaar_booking(x, 'Unsold fair');
  if out1 - 'deleted_at' <> '{"days": 2, "events": 1, "day_lines": 3, "costs": 2, "fees": 1, "losses": 1, "stock_adds": 1}'::jsonb then
    raise exception 'DELETE_COUNTS wrong: %', out1;
  end if;
  out2 := public.delete_bazaar_booking(x, 'Unsold fair');
  if out2 is distinct from out1 then
    raise exception 'DELETE_REPLAY must answer the first result: % vs %', out2, out1;
  end if;
  perform pg_temp.expect('replay wrong name', format('select public.delete_bazaar_booking(%L, %L)', x, 'Other fair'), 'P0002');
  perform pg_temp.expect('open day', format('select public.delete_bazaar_booking(%L, %L)', y, 'Open unsold fair'), '55000');
  if (select count(*) from public.bazaar_days d where d.scheduled_id = y) <> 2
     or not exists (select 1 from public.events e where e.id = md5(y::text || ':e0')::uuid) then
    raise exception 'DELETE_OPEN_DAY_WROTE: a refused delete of an open day removed something';
  end if;
  update public.events set closed_at = now() where id = md5(y::text || ':e0')::uuid;
  perform public.delete_bazaar_booking(y, 'Open unsold fair');
  if exists (select 1 from public.scheduled_events s where s.id in (x, y))
     or exists (select 1 from public.bazaar_days d where d.scheduled_id in (x, y))
     or exists (select 1 from public.bazaar_costs k where k.scheduled_id in (x, y))
     or exists (select 1 from public.bazaar_fees f where f.scheduled_id in (x, y))
     or exists (select 1 from public.events e where e.id in (md5(x::text || ':e0')::uuid, md5(y::text || ':e0')::uuid)) then
    raise exception 'DELETE_LEFT rows of a deleted booking behind';
  end if;
  if (select count(*) from public.bazaar_days d where d.scheduled_id = keep) <> 2
     or (select count(*) from public.bazaar_day_lines l join public.bazaar_days d on d.id = l.day_id where d.scheduled_id = keep) <> 3
     or not exists (select 1 from public.events e where e.id = md5(keep::text || ':e0')::uuid) then
    raise exception 'DELETE_BYSTANDER was changed';
  end if;
  if (select count(*) from public.ledger_entries) <> ledger_before + 1  -- the fee line this test wrote itself
     or (select count(*) from public.stock_movements) <> stock_before
     or (select coalesce(sum(on_hand), 0) from public.inventory_items) <> onhand_before then
    raise exception 'DELETE_TOUCHED Money or Stock';
  end if;
  if (select count(*) from public.audit_log where action = 'bazaar.deleted') <> audit_before + 2
     or not exists (select 1 from public.audit_log where action = 'bazaar.deleted' and entity_id = x::text
                      and detail ->> 'name' = 'Unsold fair' and actor = owner) then
    raise exception 'DELETE_AUDIT missing';
  end if;
end $$;
select 'BAZAAR_DELETE|passed';
rollback;
