-- B2 lookup and pickup rules with real SQL roles; all data rolls back.
--
-- get_shop_order_rules(): anon may read exactly the eight customer-facing rule values.
-- find_order(): order number + phone in, status token or null out; every miss is the same null and
-- the tries on one order are limited. The harness neutralises each rule line in turn
-- (scripts/test-db-security.py, LOOKUP_MUTATIONS) and requires the matching case to fail.
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;
create temporary table captured (key text primary key, order_no text, token text);
grant select, insert on captured to anon, authenticated, service_role;

insert into public.products(id, name, short_name, price_cents, kind, published, active, sort_order)
values ('b2-cookie', 'B2 cookie', 'B2', 12000, 'Permanent', true, true, 1);
insert into public.payment_methods(id, label, account_number, account_name, active, sort_order)
values ('b2-gcash', 'B2 GCash', '000', 'Holder', true, 1);
insert into public.settings(key, int_value)
select k, v from (values ('openDow', extract(dow from now() at time zone 'Asia/Manila')::integer), ('openH', 0), ('openM', 0),
  ('closeDow', extract(dow from now() at time zone 'Asia/Manila')::integer), ('closeH', 23), ('closeM', 59), ('extendH', 24)) s(k, v);

create function pg_temp.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date $$;
create function pg_temp.monday() returns date language sql stable as $$
  select pg_temp.today() + s from generate_series(1, 7) s where extract(isodow from pg_temp.today() + s) = 1 $$;

create function pg_temp.place(n integer) returns void language plpgsql security invoker as $$
begin
  insert into pg_temp.captured
  select 'order' || n, r.order_no, r.status_token
    from public.place_order(jsonb_build_object(
      'client_id', 'b2000000-0000-4000-8000-' || lpad(n::text, 12, '0'),
      'name', 'Lookup Buyer', 'ig', '', 'mobile', '0917' || lpad(n::text, 7, '0'),
      'pickup_date', to_char(pg_temp.monday(), 'YYYY-MM-DD'), 'pickup_window', '10:00', 'pay_method', 'B2 GCash',
      'items', jsonb_build_array(jsonb_build_object('product_id', 'b2-cookie', 'qty', 1)))) r;
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
  if state <> wanted then
    raise exception 'lookup outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'lookup check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

create function pg_temp.token(n integer) returns text language sql stable as $$
  select token from pg_temp.captured where key = 'order' || n $$;
create function pg_temp.no(n integer) returns text language sql stable as $$
  select order_no from pg_temp.captured where key = 'order' || n $$;
create function pg_temp.phone(n integer) returns text language sql immutable as $$
  select '0917' || lpad(n::text, 7, '0') $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
begin
  if not has_function_privilege('anon', 'public.get_shop_order_rules()', 'EXECUTE')
     or not has_function_privilege('anon', 'public.find_order(text,text)', 'EXECUTE') then
    raise exception 'public lookup call missing: anon';
  end if;
  insert into pg_temp.authority_results values ('acl', 'anon', 'lookup_rpcs_public');
end $$;

create function pg_temp.phase_rules(a text) returns void language plpgsql security invoker as $$
declare r jsonb := public.get_shop_order_rules();
begin
  perform pg_temp.assert_ok(a, 'rules_keys_are_the_customer_ones',
    (select array_agg(k order by k) from jsonb_object_keys(r) k)
      = array['campus_from', 'campus_to', 'lead_max_days', 'lead_min_days', 'pickup_cutoff_hour',
              'pickup_days', 'pickup_from_hour', 'unpaid_hold_hours']);
  perform pg_temp.assert_ok(a, 'rules_values_are_the_defaults',
    r -> 'pickup_days' = '[1, 4]'::jsonb and (r ->> 'lead_min_days')::integer = 1 and (r ->> 'lead_max_days')::integer = 14
    and (r ->> 'pickup_from_hour')::integer = 9 and (r ->> 'pickup_cutoff_hour')::integer = 17
    and r ->> 'campus_from' = '14:00' and r ->> 'campus_to' = '15:30' and (r ->> 'unpaid_hold_hours')::integer = 24);
  perform pg_temp.assert_ok(a, 'rules_leak_no_abuse_limits', r::text not like '%max_unpaid%');
end $$;

create function pg_temp.phase_find(a text) returns void language plpgsql security invoker as $$
declare
  t text := pg_temp.token(1);
  n text := pg_temp.no(1);
begin
  perform pg_temp.assert_ok(a, 'find_ok', public.find_order(n, pg_temp.phone(1)) = t);
  perform pg_temp.assert_ok(a, 'find_lowercase_number', public.find_order(lower(n), pg_temp.phone(1)) = t);
  perform pg_temp.assert_ok(a, 'find_plus63', public.find_order(n, '+63 917 000 0001') = t);
  perform pg_temp.assert_ok(a, 'find_ten_digit', public.find_order(n, '917 000 0001') = t);
  perform pg_temp.assert_ok(a, 'find_token_opens_status', public.order_status(public.find_order(n, pg_temp.phone(1))) ->> 'order_no' = n);
  perform pg_temp.assert_ok(a, 'find_wrong_phone', public.find_order(n, pg_temp.phone(2)) is null);
  perform pg_temp.assert_ok(a, 'find_unknown_number', public.find_order('HC-9999999', pg_temp.phone(1)) is null);
  perform pg_temp.assert_ok(a, 'find_malformed_number', public.find_order('1001; drop table orders', pg_temp.phone(1)) is null);
  perform pg_temp.assert_ok(a, 'find_null_number', public.find_order(null, pg_temp.phone(1)) is null);
  perform pg_temp.assert_ok(a, 'find_malformed_phone', public.find_order(n, '12345') is null);
  perform pg_temp.assert_ok(a, 'find_null_phone', public.find_order(n, null) is null);
  perform pg_temp.assert_ok(a, 'find_empty_phone', public.find_order(n, '') is null);
  perform pg_temp.assert_ok(a, 'find_other_order_own_phone', public.find_order(pg_temp.no(3), pg_temp.phone(3)) = pg_temp.token(3));
  perform pg_temp.assert_ok(a, 'find_other_order_wrong_phone', public.find_order(pg_temp.no(3), pg_temp.phone(1)) is null);
end $$;

create function pg_temp.phase_throttle(a text) returns void language plpgsql security invoker as $$
declare i integer;
begin
  -- Ten wrong guesses at one order use up its tries; the right phone is then refused too.
  for i in 1..10 loop
    perform public.find_order(pg_temp.no(2), '0918' || lpad(i::text, 7, '0'));
  end loop;
  perform pg_temp.assert_ok(a, 'find_locked_after_ten', public.find_order(pg_temp.no(2), pg_temp.phone(2)) is null);
  -- ...and only that order: another one is still found.
  perform pg_temp.assert_ok(a, 'find_lock_is_per_order', public.find_order(pg_temp.no(4), pg_temp.phone(4)) = pg_temp.token(4));
end $$;

grant execute on function
  pg_temp.today(), pg_temp.monday(), pg_temp.place(integer), pg_temp.expect(text, text, text, text),
  pg_temp.assert_ok(text, text, boolean), pg_temp.token(integer), pg_temp.no(integer), pg_temp.phone(integer),
  pg_temp.assert_acl(), pg_temp.phase_rules(text), pg_temp.phase_find(text), pg_temp.phase_throttle(text)
  to anon, authenticated, service_role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert_acl();
select pg_temp.phase_rules('anon');
select pg_temp.place(1);
select pg_temp.place(2);
select pg_temp.place(3);
select pg_temp.place(4);
select pg_temp.phase_find('anon');
select pg_temp.phase_throttle('anon');
reset role;

-- A signed-in caller gets the same answers, and the throttle counters are not readable by the API roles.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000000"}', true);
select pg_temp.assert_ok('signed_in', 'rules_readable', public.get_shop_order_rules() is not null);
select pg_temp.expect('signed_in', 'rate_limits_table_select', 'select * from public.rate_limits', '42501');
select pg_temp.expect('signed_in', 'rate_limit_consume_direct', 'select * from public.consume_rate_limit(''x'', 1, 1)', '42501');
reset role;

-- An erased order (no token) is not found, even with the right phone.
update public.orders set status_token = null where id = pg_temp.no(3);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert_ok('anon', 'find_erased_order_is_null', public.find_order(pg_temp.no(3), pg_temp.phone(3)) is null);
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
