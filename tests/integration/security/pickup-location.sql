-- Disposable local fixture only; no data persists.
begin;
insert into auth.users(id) values ('88000000-0000-4000-8000-000000000001'), ('88000000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
('88000000-0000-4000-8000-000000000001', 'owner', 'Synthetic owner', true),
('88000000-0000-4000-8000-000000000002', 'helper', 'Synthetic helper', true);
create function pg_temp.check_it(ok boolean) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'pickup assertion failed'; end if; end $$;
create function pg_temp.expect_error(statement text, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin execute statement; exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'pickup expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
create function pg_temp.rules() returns jsonb language sql as $$
  select to_jsonb(r)-'updated_at' from public.get_order_rules() r $$;
create function pg_temp.save_location(label jsonb, legacy boolean default false) returns void language plpgsql as $$
declare r jsonb; stamp timestamptz;
begin
  select pg_temp.rules(), x.updated_at into r, stamp from public.get_order_rules() x;
  perform public.save_order_rules(case when legacy then r-'campus_label' else r || jsonb_build_object('campus_label', label) end, stamp);
end $$;
grant execute on function pg_temp.check_it(boolean), pg_temp.expect_error(text,text), pg_temp.rules(), pg_temp.save_location(jsonb,boolean) to anon, authenticated;
set local role anon;
select pg_temp.check_it(public.get_shop_order_rules()->>'campus_label' = 'JSEC Ateneo');
select pg_temp.check_it(not (public.get_shop_order_rules() ? 'max_unpaid_per_phone'));
select pg_temp.expect_error('select public.get_order_rules()', '42501');
select pg_temp.expect_error('select public.save_order_rules(null,null)', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"88000000-0000-4000-8000-000000000002"}', true);
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select public.get_order_rules()', '42501');
select pg_temp.expect_error('select public.save_order_rules(null,null)', '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"88000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000001', true);
select pg_temp.save_location('"First location"');
select pg_temp.check_it((select campus_label = 'First location' from public.get_order_rules()));
select pg_temp.save_location('null', true);
select pg_temp.check_it((select campus_label = 'First location' from public.get_order_rules()));
select pg_temp.expect_error('select pg_temp.save_location(''null'')', '22023');
select pg_temp.expect_error('select pg_temp.save_location(''42'')', '22023');
select pg_temp.expect_error('select pg_temp.save_location(''"  "'')', '22023');
select pg_temp.expect_error('select pg_temp.save_location(to_jsonb(repeat(''x'',81)))', '22023');
select pg_temp.expect_error('select pg_temp.save_location(to_jsonb(E''bad\nlabel''::text))', '22023');
select pg_temp.expect_error('select public.save_order_rules(pg_temp.rules(), ''2000-01-01''::timestamptz)', 'P0002');
select pg_temp.expect_error('select public.save_order_rules(pg_temp.rules() || ''{"unexpected":true}'', now())', '22023');
reset role;
insert into public.orders(id, customer_name, phone, state, pay_state, pay_method, total_cents, paid_cents, pickup_date, pickup_window, status_token, pickup_label)
values ('HC-PICKUP88','Synthetic buyer','09170000000','Confirmed','confirmed','Cash',10000,10000,current_date+7,'campus',repeat('a',64),'FORGED');
select pg_temp.check_it((select pickup_label = 'First location · 2:00 PM – 3:30 PM' from public.orders where id='HC-PICKUP88'));
set local role authenticated;
select pg_temp.save_location('"Second location"');
select pg_temp.check_it(public.get_staff_orders()->0->>'pickup_label' = 'First location · 2:00 PM – 3:30 PM');
reset role;
update public.orders set notes='Synthetic note' where id='HC-PICKUP88';
set local role anon;
select pg_temp.check_it(public.order_status(repeat('a',64))->>'pickup_label' = 'First location · 2:00 PM – 3:30 PM');
select pg_temp.check_it(public.order_status(repeat('b',64)) is null);
select pg_temp.expect_error('select public.snapshot_order_pickup()', '42501');
reset role;
update public.orders set pickup_date=pickup_date+1 where id='HC-PICKUP88';
select pg_temp.check_it((select pickup_label = 'Second location · 2:00 PM – 3:30 PM' from public.orders where id='HC-PICKUP88'));
rollback;
