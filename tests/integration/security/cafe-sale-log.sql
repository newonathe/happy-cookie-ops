-- Disposable local fixture only; every row rolls back. Café sale log (migration 20260101009600; the settings are migration 20260101009400).
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
insert into public.payment_methods(id, label, active, sort_order) values ('cs-gcash', 'CS Gcash', true, 90), ('cs-old', 'CS Old', false, 91);
-- One packaging item and an order-level rule (a bag per order), so a sale that takes stock has something to take.
insert into public.inventory_items(id, name, unit, category, active, on_hand) values ('cs-bag', 'CS Bag', 'pcs', 'Packaging', true, 10);
insert into public.packaging_rules(container, item_id, qty, per, position) values ('order', 'cs-bag', 1, 'container', 1);
-- A café order of the old kind (migration 94): unpaid, Payment review. And an ordinary shop order, for the Orders list and the books label.
insert into public.orders(id, customer_name, phone, channel, total_cents, pickup_date, client_id, payload_hash, placed_at)
values ('HC-LEGACY-94', 'Legacy Cafe', '', 'cafe', 5000, current_date, '94000000-0000-4000-8000-0000000000a9', repeat('a', 64), now());
insert into public.orders(id, customer_name, phone, channel, state, pay_state, pay_method, total_cents, paid_cents, paid_at, pickup_date, placed_at, status_token)
values ('HC-SHOP-96', 'Shop Customer', '09171234567', 'shop', 'Confirmed', 'confirmed', 'CS Gcash', 7000, 7000, now(), current_date, now(), repeat('b', 64));

create function pg_temp.check_it(ok boolean) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'cafe sales assertion failed'; end if; end $$;
create function pg_temp.expect_error(statement text, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin execute statement; exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'cafe sales expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
create function pg_temp.body(cid text, nm text, dt text, notes text, lines jsonb, method text default 'Cash', take boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('clientId', cid, 'name', nm, 'saleDate', dt, 'payMethod', method, 'takeStock', take, 'notes', notes, 'lines', lines) $$;
create function pg_temp.line(pid text, qty numeric, cents numeric) returns jsonb language sql as $$
  select jsonb_build_object('productId', pid, 'qty', qty, 'unitCents', cents) $$;
create function pg_temp.refused(b jsonb, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin perform * from public.record_cafe_sale(b); exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'cafe sales expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
create function pg_temp.pickup(days integer) returns text language sql security definer as $$
  select ((select c.today from public.business_clock() c) + days)::text $$;
create function pg_temp.bag() returns integer language sql security definer as $$
  select on_hand::integer from public.inventory_items where id = 'cs-bag' $$;
create function pg_temp.books_line(order_no text) returns jsonb language sql security definer as $$
  select l from jsonb_array_elements(public.get_books(now() - interval '120 days', now() + interval '1 day') -> 'lines') l where l ->> 'id' = 'o:' || order_no $$;
grant execute on function pg_temp.check_it(boolean), pg_temp.expect_error(text,text), pg_temp.body(text,text,text,text,jsonb),
  pg_temp.line(text,numeric,numeric), pg_temp.refused(jsonb,text), pg_temp.pickup(integer), pg_temp.bag(), pg_temp.books_line(text)
  to anon, authenticated;

-- The old entry point is gone.
select pg_temp.check_it(to_regprocedure('public.create_cafe_order(jsonb)') is null);
-- Authority: nobody signed out, no helper; the table is closed to every API role.
select pg_temp.check_it(not has_function_privilege('anon', 'public.record_cafe_sale(jsonb)', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.get_cafe_sales()', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.get_cafe_order_settings()', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.save_cafe_order_settings(boolean)', 'EXECUTE'));
select pg_temp.check_it(not has_table_privilege('authenticated', 'public.cafe_order_settings', 'SELECT'));
set local role anon;
select pg_temp.expect_error('select * from public.get_cafe_order_settings()', '42501');
select pg_temp.expect_error('select * from public.save_cafe_order_settings(false)', '42501');
select pg_temp.expect_error('select * from public.get_cafe_sales()', '42501');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error('select * from public.get_cafe_order_settings()', '42501');
select pg_temp.expect_error('select * from public.get_cafe_sales()', '42501');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000002"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select * from public.get_cafe_order_settings()', '42501');
select pg_temp.expect_error('select * from public.save_cafe_order_settings(false)', '42501');
select pg_temp.expect_error('select * from public.get_cafe_sales()', '42501');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '42501');
select pg_temp.expect_error('select * from public.cafe_order_settings', '42501');
reset role;
select pg_temp.check_it((select count(*) = 1 from public.orders where channel = 'cafe'));

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
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))) || '{"total": 1}'::jsonb, '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))) - 'notes', '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))) - 'takeStock', '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))) || '{"takeStock": "yes"}'::jsonb, '22023');
select pg_temp.refused(pg_temp.body('not-a-uuid', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', '  ', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', repeat('x', 81), pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), repeat('n', 301), jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', E'Ca
fe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), E'a	b', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(1), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(-91), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', '2026-13-45', '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000)), 'Barter'), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000)), 'CS Old'), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000)), ''), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', '[]'::jsonb), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', (select jsonb_agg(pg_temp.line('co-choc', 1, 9000)) from generate_series(1, 41))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000), pg_temp.line('co-choc', 2, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 0, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 501, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1.5, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 0))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, -500))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 100000001))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000.5))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 500, 300000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-gone', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-nope', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('Bad Id', 1, 9000))), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(pg_temp.line('co-choc', 1, 9000) || '{"role":"owner"}'::jsonb)), '22023');
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000a1', 'Cafe', pg_temp.pickup(0), '', jsonb_build_array(jsonb_build_object('productId', 'co-choc', 'qty', '1', 'unitCents', 9000))), '22023');
reset role;
select pg_temp.check_it((select count(*) = 1 from public.orders where channel = 'cafe'));
select pg_temp.check_it(pg_temp.bag() = 10);

create temp table placed(no text);
grant all on placed to authenticated;
-- A sale with the setting ON, taking stock: paid in full and completed, prices as sent, the total the server's, slots taken, the bag taken.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
insert into placed select order_no from public.record_cafe_sale(
  pg_temp.body('94000000-0000-4000-8000-0000000000b1', ' Bean Cafe ', pg_temp.pickup(0), 'Rear door',
    jsonb_build_array(pg_temp.line('co-choc', 10, 9000), pg_temp.line('co-box', 2, 41000)), 'CS Gcash', true));
select pg_temp.check_it((select count(*) = 1 from placed));
reset role;
select pg_temp.check_it((select count(*) = 2 from public.orders where channel = 'cafe'));
select pg_temp.check_it((select o.customer_name = 'Bean Cafe' and o.phone = '' and o.ig = '' and o.status_token is null
  and o.state = 'Completed' and o.pay_state = 'confirmed' and o.pay_method = 'CS Gcash' and o.total_cents = 172000 and o.paid_cents = 172000
  and o.notes = 'Rear door' and o.pickup_date = pg_temp.pickup(0)::date and o.collected_at is not null
  and o.paid_at is not null and o.paid_at <= now() and o.paid_at > now() - interval '1 minute'
  from public.orders o where o.id = (select no from placed)));
select pg_temp.check_it((select count(*) = 2 and sum(oi.qty * oi.unit_price_cents) = 172000
  and sum(oi.qty * oi.capacity_weight) = 10 * 1 + 2 * 4 from public.order_items oi where oi.order_id = (select no from placed)));
select pg_temp.check_it((select price_cents = 13000 from public.products where id = 'co-choc'));
-- Stock: the order's packing step ran once (a pack record; one bag off the shelf), and the loose cookies, which have no rule, were said.
select pg_temp.check_it((select count(*) = 1 from public.production_records r where r.kind = 'pack' and r.ref = (select no from placed) and r.qty = 12));
select pg_temp.check_it(pg_temp.bag() = 9);
select pg_temp.check_it((select count(*) = 1 from public.stock_movements m where m.production_id = md5('pack:' || (select no from placed))::uuid and m.kind = 'use'));
-- The books: revenue on the sale day, labelled Café, category Orders; an ordinary order keeps its label.
select pg_temp.check_it((select l ->> 'kind' = 'revenue' and l ->> 'cat' = 'Orders' and (l ->> 'amount_cents')::bigint = 172000
  and l ->> 'label' = 'Café sale ' || (select no from placed) || ' · Bean Cafe' from (select pg_temp.books_line((select no from placed)) l) x));
select pg_temp.check_it((select pg_temp.books_line('HC-SHOP-96') ->> 'label' = 'Order HC-SHOP-96 · Shop Customer'));
-- It is not on a customer's side: no token, no phone, and not in the staff orders read.
select pg_temp.check_it((select count(*) = 0 from public.orders where channel = 'cafe' and (status_token is not null or phone <> '')));
set local role anon;
select pg_temp.check_it((select public.find_order((select no from placed), '09171234567')) is null);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select count(*) = 0 from jsonb_array_elements(public.get_staff_orders()) e where e ->> 'id' = (select no from placed)));
select pg_temp.check_it((select count(*) = 0 from jsonb_array_elements(public.get_staff_orders()) e where e ->> 'id' = 'HC-LEGACY-94'));
select pg_temp.check_it((select count(*) = 1 from jsonb_array_elements(public.get_staff_orders()) e where e ->> 'id' = 'HC-SHOP-96'));
-- The log: the sale (and the old unpaid one, with its state), nothing else.
select pg_temp.check_it((select count(*) = 2 from public.get_cafe_sales()));
select pg_temp.check_it((select s.name = 'Bean Cafe' and s.sale_date = pg_temp.pickup(0)::date and s.total_cents = 172000 and s.pay_method = 'CS Gcash'
  and s.state = 'Completed' and s.pay_state = 'confirmed' and s.cookies = 12 and jsonb_array_length(s.items) = 2 and s.notes = 'Rear door'
  from public.get_cafe_sales() s where s.order_no = (select no from placed)));
select pg_temp.check_it((select s.pay_state = 'unpaid' and s.state = 'Payment review' from public.get_cafe_sales() s where s.order_no = 'HC-LEGACY-94'));
-- Replay: the same body is the same sale and takes nothing more; another body under that id is refused.
select pg_temp.check_it((select r.replayed and r.order_no = (select no from placed) and r.total_cents = 172000 and r.takes_slots and jsonb_array_length(r.short) = 1
  from public.record_cafe_sale(pg_temp.body('94000000-0000-4000-8000-0000000000b1', ' Bean Cafe ', pg_temp.pickup(0), 'Rear door',
    jsonb_build_array(pg_temp.line('co-choc', 10, 9000), pg_temp.line('co-box', 2, 41000)), 'CS Gcash', true)) r));
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000b1', ' Bean Cafe ', pg_temp.pickup(0), 'Rear door',
  jsonb_build_array(pg_temp.line('co-choc', 10, 9100), pg_temp.line('co-box', 2, 41000)), 'CS Gcash', true), '23505');
reset role;
select pg_temp.check_it((select count(*) = 2 from public.orders where channel = 'cafe'));
select pg_temp.check_it(pg_temp.bag() = 9);

-- A backdated sale not taking stock: dated on that day (noon, shop time), the bag untouched, no pack record.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
insert into placed select order_no from public.record_cafe_sale(
  pg_temp.body('94000000-0000-4000-8000-0000000000b2', 'Old Cafe', pg_temp.pickup(-10), '', jsonb_build_array(pg_temp.line('co-choc', 5, 8000)), 'Cash', false));
reset role;
select pg_temp.check_it((select o.pickup_date = pg_temp.pickup(-10)::date
  and (o.paid_at at time zone 'Asia/Manila') = (pg_temp.pickup(-10)::date + time '12:00')
  and (o.collected_at at time zone 'Asia/Manila') = (pg_temp.pickup(-10)::date + time '12:00')
  and o.state = 'Completed' and o.pay_state = 'confirmed' and o.paid_cents = 40000 and o.pay_method = 'Cash'
  from public.orders o where o.client_id = '94000000-0000-4000-8000-0000000000b2'));
select pg_temp.check_it((select count(*) = 0 from public.production_records r where r.ref = (select o.id from public.orders o where o.client_id = '94000000-0000-4000-8000-0000000000b2')));
select pg_temp.check_it(pg_temp.bag() = 9);
-- The books count it on that day, not today: a period of the last two days does not have it, the last 20 days does.
select pg_temp.check_it((select count(*) = 0 from jsonb_array_elements(public.get_books(now() - interval '2 days', now() + interval '1 day') -> 'lines') l
  where l ->> 'id' = 'o:' || (select o.id from public.orders o where o.client_id = '94000000-0000-4000-8000-0000000000b2')));
select pg_temp.check_it((select count(*) = 1 from jsonb_array_elements(public.get_books(now() - interval '20 days', now() + interval '1 day') -> 'lines') l
  where l ->> 'id' = 'o:' || (select o.id from public.orders o where o.client_id = '94000000-0000-4000-8000-0000000000b2')));
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
-- The log is newest sale first.
select pg_temp.check_it((select array_agg(s.sale_date order by s.sale_date desc) = array_agg(s.sale_date) from public.get_cafe_sales() s));
reset role;

-- Capacity, setting ON: a week that is full refuses (ZC002); the room left is the detail; nothing is written.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
-- 18 slots are held this week by the first sale; the week's limit is 200 (settings default).
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000c1', 'Big Cafe', pg_temp.pickup(0), '',
  jsonb_build_array(pg_temp.line('co-choc', 190, 9000))), 'ZC002');
select pg_temp.check_it((select count(*) = 1 from public.record_cafe_sale(pg_temp.body('94000000-0000-4000-8000-0000000000c2', 'Fits Cafe', pg_temp.pickup(0), '',
  jsonb_build_array(pg_temp.line('co-choc', 182, 9000))))));
reset role;
select pg_temp.check_it((select coalesce(sum(oi.qty * oi.capacity_weight), 0) = 200 from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.pickup_date >= date_trunc('week', (pg_temp.pickup(0))::timestamp)::date and o.pickup_date < date_trunc('week', (pg_temp.pickup(0))::timestamp)::date + 7
    and o.channel = 'cafe'));
select pg_temp.check_it((select count(*) = 0 from public.orders where client_id = '94000000-0000-4000-8000-0000000000c1'));

-- Setting OFF: stored with zero slots; never takes room from the week.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select not count_toward_limit from public.save_cafe_order_settings(false)));
select pg_temp.check_it((select not count_toward_limit from public.get_cafe_order_settings()));
select pg_temp.check_it((select not r.takes_slots and r.total_cents = 400 * 8000 from public.record_cafe_sale(
  pg_temp.body('94000000-0000-4000-8000-0000000000d1', 'Free Cafe', pg_temp.pickup(0), '',
    jsonb_build_array(pg_temp.line('co-choc', 400, 8000)))) r));
reset role;
select pg_temp.check_it((select sum(oi.qty * oi.capacity_weight) = 0 and count(*) = 1 from public.order_items oi
  join public.orders o on o.id = oi.order_id where o.client_id = '94000000-0000-4000-8000-0000000000d1'));
select pg_temp.check_it((select coalesce(sum(oi.qty * oi.capacity_weight), 0) = 200 from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.pickup_date >= date_trunc('week', (pg_temp.pickup(0))::timestamp)::date and o.pickup_date < date_trunc('week', (pg_temp.pickup(0))::timestamp)::date + 7
    and o.channel = 'cafe'));
-- The oldest day the log takes (90 back) is accepted.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select count(*) = 1 from public.record_cafe_sale(
  pg_temp.body('94000000-0000-4000-8000-0000000000d2', 'Oldest Cafe', pg_temp.pickup(-90), '', jsonb_build_array(pg_temp.line('co-choc', 1, 8000))))));
-- A replay after the setting changed is still the sale that was entered (and still says what it took).
select pg_temp.check_it((select r.replayed and not r.takes_slots from public.record_cafe_sale(
  pg_temp.body('94000000-0000-4000-8000-0000000000d1', 'Free Cafe', pg_temp.pickup(0), '',
    jsonb_build_array(pg_temp.line('co-choc', 400, 8000)))) r));
select pg_temp.check_it((select r.replayed and r.takes_slots from public.record_cafe_sale(
  pg_temp.body('94000000-0000-4000-8000-0000000000c2', 'Fits Cafe', pg_temp.pickup(0), '',
    jsonb_build_array(pg_temp.line('co-choc', 182, 9000)))) r));
-- A retry of a sale that exists is answered even when its date has since fallen out of the window (the date is checked after the replay lookup).
reset role;
insert into public.orders (id, customer_name, phone, channel, state, pay_state, total_cents, pickup_date, client_id, payload_hash)
select 'HC-REPLAY-96', 'Gone Cafe', '', 'cafe', 'Completed', 'confirmed', 1000, pg_temp.pickup(-120)::date, '94000000-0000-4000-8000-0000000000f1',
       encode(extensions.digest(b::text, 'sha256'), 'hex')
  from (select pg_temp.body('94000000-0000-4000-8000-0000000000f1', 'Gone Cafe', pg_temp.pickup(-120), '',
          jsonb_build_array(pg_temp.line('co-choc', 1, 1000))) as b) x;
insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight) values ('HC-REPLAY-96', 'co-choc', 1, 1000, 1);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select r.replayed and r.order_no = 'HC-REPLAY-96' from public.record_cafe_sale(
  pg_temp.body('94000000-0000-4000-8000-0000000000f1', 'Gone Cafe', pg_temp.pickup(-120), '',
    jsonb_build_array(pg_temp.line('co-choc', 1, 1000)))) r));
select pg_temp.refused(pg_temp.body('94000000-0000-4000-8000-0000000000f2', 'Gone Cafe', pg_temp.pickup(-120), '',
  jsonb_build_array(pg_temp.line('co-choc', 1, 1000))), '22023');
reset role;
select 'CAFE_SALES|passed';
rollback;
