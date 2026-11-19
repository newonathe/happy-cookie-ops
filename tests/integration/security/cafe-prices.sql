-- Disposable local fixture only; every row rolls back. Café prices (migration 20260101009100).
begin;
insert into auth.users(id) values
  ('91000000-0000-4000-8000-000000000001'), ('91000000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
  ('91000000-0000-4000-8000-000000000001', 'owner', 'Synthetic owner', true),
  ('91000000-0000-4000-8000-000000000002', 'helper', 'Synthetic helper', true);
insert into public.products(id, name, short_name, price_cents, kind, active, published, sort_order, type_id)
values ('cafe-130', 'Cafe one thirty', 'C130', 13000, 'Permanent', true, true, 90, 'cookie'),
       ('cafe-120', 'Cafe one twenty', 'C120', 12000, 'Permanent', true, true, 91, 'cookie'),
       ('cafe-low', 'Cafe seven', 'C7', 700, 'Permanent', true, false, 92, 'cookie'),
       ('cafe-gone', 'Cafe removed', 'CG', 15000, 'Permanent', false, false, 93, 'cookie'),
       ('cafe-zero', 'Cafe free', 'CZ', 0, 'Permanent', false, false, 94, 'cookie');
update public.products set archived_at = now() where id = 'cafe-gone';

create function pg_temp.check_it(ok boolean) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'cafe prices assertion failed'; end if; end $$;
create function pg_temp.expect_error(statement text, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin execute statement; exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'cafe prices expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
grant execute on function pg_temp.check_it(boolean), pg_temp.expect_error(text,text) to anon, authenticated;

-- The default rule: 70 %, rounded DOWN to a multiple of 500 centavos, never zero.
select pg_temp.check_it(public.default_cafe_price_cents(13000) = 9000);   -- her example: 130 -> 90
select pg_temp.check_it(public.default_cafe_price_cents(12000) = 8000);   -- 84 -> 80
select pg_temp.check_it(public.default_cafe_price_cents(14300) = 10000);  -- 100.10 -> 100
select pg_temp.check_it(public.default_cafe_price_cents(12999) = 9000);   -- 90.99 -> 90
select pg_temp.check_it(public.default_cafe_price_cents(715) = 500);      -- 5.005 -> 5
select pg_temp.check_it(public.default_cafe_price_cents(700) = 700);      -- under 5: the retail price, not 0
select pg_temp.check_it(public.default_cafe_price_cents(1) = 1);
select pg_temp.check_it(public.default_cafe_price_cents(0) is null and public.default_cafe_price_cents(null) is null);
select pg_temp.check_it(not has_function_privilege('anon', 'public.default_cafe_price_cents(bigint)', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('authenticated', 'public.default_cafe_price_cents(bigint)', 'EXECUTE'));

-- Authority: nobody signed out, no helper, can read or set; the table is closed to every API role.
select pg_temp.check_it(not has_function_privilege('anon', 'public.get_cafe_prices()', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.set_cafe_price(text,bigint)', 'EXECUTE'));
select pg_temp.check_it(not has_table_privilege('authenticated', 'public.product_cafe_prices', 'SELECT'));
set local role anon;
select pg_temp.expect_error('select * from public.get_cafe_prices()', '42501');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-130'', 8000)', '42501');
select pg_temp.expect_error('select * from public.product_cafe_prices', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error('select * from public.get_cafe_prices()', '42501');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-130'', 8000)', '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000002"}', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select * from public.get_cafe_prices()', '42501');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-130'', 8000)', '42501');
select pg_temp.expect_error('select * from public.product_cafe_prices', '42501');
select pg_temp.expect_error('insert into public.product_cafe_prices(product_id, price_cents) values (''cafe-130'', 1)', '42501');

-- The owner.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
-- Nothing set: every row shows the default and no value of hers; a removed product is not listed.
select pg_temp.check_it((select count(*) = 3 from public.get_cafe_prices() where product_id like 'cafe-%'));
select pg_temp.check_it((select not exists(select 1 from public.get_cafe_prices() where product_id = 'cafe-gone')));
-- A product priced at 0 has no café price: not listed, and the list still reads for every other product.
select pg_temp.check_it((select not exists(select 1 from public.get_cafe_prices() where product_id = 'cafe-zero')));
select pg_temp.check_it((select price_cents = 13000 and default_cents = 9000 and cafe_price_cents is null and effective_cents = 9000
  and updated_at is null from public.get_cafe_prices() where product_id = 'cafe-130'));
select pg_temp.check_it((select default_cents = 700 and effective_cents = 700 from public.get_cafe_prices() where product_id = 'cafe-low'));
-- Set her own price: the answer carries it, the read agrees, the retail price and the order form are untouched.
select pg_temp.check_it((select price_cents = 13000 and default_cents = 9000 and cafe_price_cents = 8500 and effective_cents = 8500
  and updated_at is not null from public.set_cafe_price('cafe-130', 8500)));
select pg_temp.check_it((select cafe_price_cents = 8500 and effective_cents = 8500 from public.get_cafe_prices() where product_id = 'cafe-130'));
-- The same value twice is the same change; a new value replaces it.
select pg_temp.check_it((select cafe_price_cents = 8500 from public.set_cafe_price('cafe-130', 8500)));
select pg_temp.check_it((select cafe_price_cents = 8000 from public.set_cafe_price('cafe-130', 8000)));
select pg_temp.check_it((select count(*) = 1 from public.get_cafe_prices() where product_id = 'cafe-130' and cafe_price_cents = 8000));
reset role;
select pg_temp.check_it((select count(*) = 1 and bool_and(set_by = '91000000-0000-4000-8000-000000000001')
  from public.product_cafe_prices where product_id = 'cafe-130'));
select pg_temp.check_it((select price_cents = 13000 from public.products where id = 'cafe-130'));
select pg_temp.check_it((select price_cents = 13000 from public.shop_products where id = 'cafe-130'));
select pg_temp.check_it((select array_agg(a.attname::text order by a.attnum) =
  array['id','name','short_name','price_cents','kind','tag','description','image_path','sort_order','allergens','sold_by_piece']
  from pg_attribute a where a.attrelid='public.shop_products'::regclass and a.attnum > 0 and not a.attisdropped));
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
-- Her value stays when the retail price moves; the default follows the retail price.
reset role;
update public.products set price_cents = 14300 where id in ('cafe-130', 'cafe-120');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select pg_temp.check_it((select effective_cents = 8000 and default_cents = 10000 from public.get_cafe_prices() where product_id = 'cafe-130'));
select pg_temp.check_it((select effective_cents = 10000 and cafe_price_cents is null from public.get_cafe_prices() where product_id = 'cafe-120'));
-- Clearing goes back to the default, and clearing twice is fine.
select pg_temp.check_it((select cafe_price_cents is null and effective_cents = 10000 and updated_at is null
  from public.set_cafe_price('cafe-130', null)));
select pg_temp.check_it((select cafe_price_cents is null from public.set_cafe_price('cafe-130', null)));
-- Refusals write nothing.
select pg_temp.expect_error('select * from public.set_cafe_price(null, 8000)', '22023');
select pg_temp.expect_error('select * from public.set_cafe_price(''Cafe 130'', 8000)', '22023');
select pg_temp.expect_error('select * from public.set_cafe_price(repeat(''a'', 33), 8000)', '22023');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-130'', 0)', '22023');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-130'', -500)', '22023');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-130'', 100000001)', '22023');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-missing'', 8000)', 'P0002');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-gone'', 8000)', 'P0002');
select pg_temp.expect_error('select * from public.set_cafe_price(''cafe-zero'', 8000)', 'P0002');
select pg_temp.check_it((select count(*) = 1 from public.set_cafe_price('cafe-130', 100000000) where cafe_price_cents = 100000000));
select pg_temp.check_it((select count(*) = 1 from public.set_cafe_price('cafe-130', 1) where cafe_price_cents = 1));
select pg_temp.check_it((select cafe_price_cents is null from public.set_cafe_price('cafe-130', null)));
reset role;
select pg_temp.check_it((select count(*) = 0 from public.product_cafe_prices));
-- A deleted product takes its café price with it.
select pg_temp.check_it((select count(*) = 1 from (select 1 from public.products where id = 'cafe-low') x));
insert into public.product_cafe_prices(product_id, price_cents) values ('cafe-low', 500);
delete from public.products where id = 'cafe-low';
select pg_temp.check_it((select count(*) = 0 from public.product_cafe_prices));
select 'CAFE_PRICES|passed';
rollback;
