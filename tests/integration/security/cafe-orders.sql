-- Disposable local fixture only; every row rolls back. Café orders (migration 20260101009400).
begin;
insert into auth.users(id) values
  ('94000000-0000-4000-8000-000000000001'), ('94000000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
  ('94000000-0000-4000-8000-000000000001', 'owner', 'Synthetic owner', true),
  ('94000000-0000-4000-8000-000000000002', 'helper', 'Synthetic helper', true);
insert into public.products(id, name, short_name, price_cents, kind, active, published, sort_order, type_id, capacity_weight)
values ('co-choc', 'Order choc', 'Choc', 13000, 'Permanent', true, true, 90, 'cookie', 1),
       ('co-box', 'Order box', 'Box', 52000, 'Permanent', true, true, 91, 'set', 4),
       ('co-gone', 'Order removed', 'Gone', 13000, 'Permanent', false, false, 92, 'cookie', 1);
update public.products set archived_at = now() where id = 'co-gone';

create function pg_temp.check_it(ok boolean) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'cafe orders assertion failed'; end if; end $$;
create function pg_temp.expect_error(statement text, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin execute statement; exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'cafe orders expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
create function pg_temp.body(cid text, nm text, dt text, notes text, lines jsonb) returns jsonb language sql as $$
  select jsonb_build_object('clientId', cid, 'name', nm, 'pickupDate', dt, 'notes', notes, 'lines', lines) $$;
create function pg_temp.line(pid text, qty numeric, cents numeric) returns jsonb language sql as $$
  select jsonb_build_object('productId', pid, 'qty', qty, 'unitCents', cents) $$;
create function pg_temp.refused(b jsonb, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin perform * from public.create_cafe_order(b); exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'cafe orders expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
create function pg_temp.pickup(days integer) returns text language sql security definer as $$
  select ((select c.today from public.business_clock() c) + days)::text $$;
create function pg_temp.confirm(order_no text) returns void language plpgsql security definer as $$
declare stamp timestamptz;
begin
  select o.updated_at into stamp from public.orders o where o.id = order_no;
  perform * from public.staff_confirm_payment(order_no, stamp, false);
end $$;
grant execute on function pg_temp.check_it(boolean), pg_temp.expect_error(text,text), pg_temp.body(text,text,text,text,jsonb),
  pg_temp.line(text,numeric,numeric), pg_temp.refused(jsonb,text), pg_temp.pickup(integer), pg_temp.confirm(text)
  to anon, authenticated;

-- Authority: nobody signed out, no helper; the table is closed to every API role.
select pg_temp.check_it(not has_function_privilege('anon', 'public.create_cafe_order(jsonb)', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.get_cafe_order_settings()', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.save_cafe_order_settings(boolean)', 'EXECUTE'));
select pg_temp.check_it(not has_table_privilege('authenticated', 'public.cafe_order_settings', 'SELECT'));
set local role anon;
select pg_temp.expect_error('select * from public.get_cafe_order_settings()', '42501');
select pg_temp.expect_error('select * from public.save_cafe_order_settings(false)', '42501');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error('select * from public.get_cafe_order_settings()', '42501');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select * from public.get_cafe_order_settings()', '42501');
select pg_temp.expect_error('select * from public.save_cafe_order_settings(false)', '42501');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '42501');
select pg_temp.expect_error('select * from public.cafe_order_settings', '42501');
reset role;
select pg_temp.check_it((select count(*) = 0 from public.orders where channel = 'cafe'));

-- The owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
-- The setting starts ON; null is refused.
select pg_temp.check_it((select count_toward_limit from public.get_cafe_order_settings()));
select pg_temp.expect_error('select * from public.save_cafe_order_settings(null)', '22023');

-- Refusals write nothing.
select pg_temp.refused(null, '22023');
select pg_temp.refused('[]'::jsonb, '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))) || '{"total": 1}'::jsonb, '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))) - 'notes', '22023');
select pg_temp.refused(pg_temp.body('not-a-uuid', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', '  ', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', repeat('x', 81), pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), repeat('n', 301), jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', E'Ca
fe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), E'a	b', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(-1), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(366), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', '2026-13-45', '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', '[]'::jsonb), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', (select jsonb_agg(pg_temp.line('co-choc', 1, 9000)) from generate_series(1, 41))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000), pg_temp.line('co-choc', 2, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 0, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 501, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1.5, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 0))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, -500))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 100000001))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000.5))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 500, 300000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-gone', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-nope', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('Bad Id', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000) || '{"role":"owner"}'::jsonb)), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(14), '', jsonb_build_array(jsonb_build_object('productId', 'co-choc', 'qty', '1', 'unitCents', 9000))), '22023');
reset role;
select pg_temp.check_it((select count(*) = 0 from public.orders where channel = 'cafe'));

create temp table placed(no text);
grant all on placed to authenticated;
-- A café order with the setting ON: prices are the ones sent, the total is the server's, it takes slots and shows up for the owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
insert into placed select order_no from public.create_cafe_order(
  pg_temp.body('94000000-0000-4000-8000-0000000000b1', ' Bean Cafe ', pg_temp.pickup(14), 'Rear door',
    jsonb_build_array(pg_temp.line('co-choc', 10, 9000), pg_temp.line('co-box', 2, 41000))));
select pg_temp.check_it((select count(*) = 1 from placed));
reset role;
select pg_temp.check_it((select count(*) = 1 from public.orders where channel = 'cafe'));
select pg_temp.check_it((select o.customer_name = 'Bean Cafe' and o.phone = '' and o.ig = '' and o.status_token is null
  and o.state = 'Payment review' and o.pay_state = 'unpaid' and o.total_cents = 172000 and o.notes = 'Rear door'
  and o.paid_cents is null and o.paid_at is null from public.orders o where o.channel = 'cafe'));
select pg_temp.check_it((select count(*) = 2 and sum(oi.qty * oi.unit_price_cents) = 172000
  and sum(oi.qty * oi.capacity_weight) = 10 * 1 + 2 * 4 from public.order_items oi join public.orders o on o.id = oi.order_id where o.channel = 'cafe'));
select pg_temp.check_it((select unit_price_cents = 9000 from public.order_items where product_id = 'co-choc'));
-- The retail price and the order form are untouched.
select pg_temp.check_it((select price_cents = 13000 from public.shop_products where id = 'co-choc'));
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
-- It is in Sell > Orders.
select pg_temp.check_it((select count(*) = 1 from jsonb_array_elements(public.get_staff_orders()) e
  where e ->> 'id' = (select no from placed) and (e ->> 'total_cents')::bigint = 172000 and (e ->> 'holds')::boolean));
-- Replay: the same body is the same order; another body under that id is refused.
select pg_temp.check_it((select r.replayed and r.order_no = (select no from placed) and r.total_cents = 172000 and r.takes_slots
  from public.create_cafe_order(pg_temp.body('94000000-0000-4000-8000-0000000000b1', ' Bean Cafe ', pg_temp.pickup(14), 'Rear door',
    jsonb_build_array(pg_temp.line('co-choc', 10, 9000), pg_temp.line('co-box', 2, 41000)))) r));
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000b1', ' Bean Cafe ', pg_temp.pickup(14), 'Rear door',
  jsonb_build_array(pg_temp.line('co-choc', 10, 9100), pg_temp.line('co-box', 2, 41000))), '23505');
reset role;
select pg_temp.check_it((select count(*) = 1 from public.orders where channel = 'cafe'));

-- Capacity, setting ON: a week that is full refuses (ZC002); the room left is the detail; nothing is written.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
-- 18 slots are held; the week's limit is 200 (settings default).
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000c1', 'Big Cafe', pg_temp.pickup(14), '',
  jsonb_build_array(pg_temp.line('co-choc', 190, 9000))), 'ZC002');
select pg_temp.check_it((select count(*) = 1 from public.create_cafe_order(pg_temp.body('94000000-0000-4000-8000-0000000000c2', 'Fits Cafe', pg_temp.pickup(14), '',
  jsonb_build_array(pg_temp.line('co-choc', 182, 9000))))));
reset role;
select pg_temp.check_it((select coalesce(sum(oi.qty * oi.capacity_weight), 0) = 200 from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.pickup_date >= date_trunc('week', (pg_temp.pickup(14))::timestamp)::date and o.pickup_date < date_trunc('week', (pg_temp.pickup(14))::timestamp)::date + 7));
select pg_temp.check_it((select count(*) = 0 from public.orders where client_id = '94000000-0000-4000-8000-0000000000c1'));

-- Setting OFF: stored with zero slots; never takes room from the week; never blocks "confirm payment".
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select not count_toward_limit from public.save_cafe_order_settings(false)));
select pg_temp.check_it((select not count_toward_limit from public.get_cafe_order_settings()));
select pg_temp.check_it((select not r.takes_slots and r.total_cents = 400 * 8000 from public.create_cafe_order(
  pg_temp.body('94000000-0000-4000-8000-0000000000d1', 'Free Cafe', pg_temp.pickup(14), '',
    jsonb_build_array(pg_temp.line('co-choc', 400, 8000)))) r));
reset role;
select pg_temp.check_it((select sum(oi.qty * oi.capacity_weight) = 0 and count(*) = 1 from public.order_items oi
  join public.orders o on o.id = oi.order_id where o.client_id = '94000000-0000-4000-8000-0000000000d1'));
select pg_temp.check_it((select coalesce(sum(oi.qty * oi.capacity_weight), 0) = 200 from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.pickup_date >= date_trunc('week', (pg_temp.pickup(14))::timestamp)::date and o.pickup_date < date_trunc('week', (pg_temp.pickup(14))::timestamp)::date + 7));
-- A replay after the setting changed is still the order that was entered (and still says what it took).
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select r.replayed and not r.takes_slots from public.create_cafe_order(
  pg_temp.body('94000000-0000-4000-8000-0000000000d1', 'Free Cafe', pg_temp.pickup(14), '',
    jsonb_build_array(pg_temp.line('co-choc', 400, 8000)))) r));
select pg_temp.check_it((select r.replayed and r.takes_slots from public.create_cafe_order(
  pg_temp.body('94000000-0000-4000-8000-0000000000c2', 'Fits Cafe', pg_temp.pickup(14), '',
    jsonb_build_array(pg_temp.line('co-choc', 182, 9000)))) r));
reset role;
-- Even with the week full and the unpaid hold lapsed, the zero-slot order can be marked paid, and the books see it.
update public.orders set placed_at = now() - interval '100 hours' where client_id = '94000000-0000-4000-8000-0000000000d1';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.confirm((select id from public.orders where client_id = '94000000-0000-4000-8000-0000000000d1'));
reset role;
select pg_temp.check_it((select state = 'Confirmed' and pay_state = 'confirmed' and paid_cents = total_cents and total_cents = 3200000
  from public.orders where client_id = '94000000-0000-4000-8000-0000000000d1'));
-- The same for a counted order whose hold lapsed while the week filled up: paying it takes its slots again, and is refused when none are left.
update public.orders set placed_at = now() - interval '100 hours' where client_id = '94000000-0000-4000-8000-0000000000b1';
update public.orders set placed_at = now() where client_id = '94000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select count_toward_limit from public.save_cafe_order_settings(true)));
select pg_temp.check_it((select r.takes_slots from public.create_cafe_order(pg_temp.body('94000000-0000-4000-8000-0000000000e1', 'Back Cafe', pg_temp.pickup(14), '',
  jsonb_build_array(pg_temp.line('co-choc', 18, 9000)))) r));
select pg_temp.expect_error('select pg_temp.confirm((select id from public.orders where client_id = ''94000000-0000-4000-8000-0000000000b1''))', 'ZC002');
reset role;
select pg_temp.check_it((select state = 'Payment review' and pay_state = 'unpaid' from public.orders where client_id = '94000000-0000-4000-8000-0000000000b1'));
-- A retry of an order that exists is answered even when its pickup day has passed since (the date is checked after the replay lookup).
insert into public.orders (id, customer_name, phone, channel, total_cents, pickup_date, client_id, payload_hash)
select 'HC-REPLAY-94', 'Old Cafe', '', 'cafe', 1000, pg_temp.pickup(-1)::date, '94000000-0000-4000-8000-0000000000f1',
       encode(extensions.digest(b::text, 'sha256'), 'hex')
  from (select pg_temp.body('94000000-0000-4000-8000-0000000000f1', 'Old Cafe', pg_temp.pickup(-1), '',
          jsonb_build_array(pg_temp.line('co-choc', 1, 1000))) as b) x;
insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight) values ('HC-REPLAY-94', 'co-choc', 1, 1000, 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select r.replayed and r.order_no = 'HC-REPLAY-94' from public.create_cafe_order(
  pg_temp.body('94000000-0000-4000-8000-0000000000f1', 'Old Cafe', pg_temp.pickup(-1), '',
    jsonb_build_array(pg_temp.line('co-choc', 1, 1000)))) r));
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000f2', 'Old Cafe', pg_temp.pickup(-1), '',
  jsonb_build_array(pg_temp.line('co-choc', 1, 1000))), '22023');
reset role;
select 'CAFE_ORDERS|passed';
rollback;
