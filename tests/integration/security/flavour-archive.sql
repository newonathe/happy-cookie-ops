-- Disposable local fixture only; every row rolls back.
begin;
insert into auth.users(id) values
  ('89000000-0000-4000-8000-000000000001'), ('89000000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
  ('89000000-0000-4000-8000-000000000001', 'owner', 'Synthetic owner', true),
  ('89000000-0000-4000-8000-000000000002', 'helper', 'Synthetic helper', true);
insert into public.products(id, name, short_name, price_cents, kind, active, published, sort_order, type_id)
values ('arc-cookie', 'Archive cookie', 'Archive', 12000, 'Permanent', true, true, 90, 'cookie'),
       ('arc-set', 'Archive set', 'Set', 24000, 'Permanent', true, true, 91, 'set'),
       ('arc-publish', 'Publishable cookie', 'Publish', 13000, 'Permanent', true, false, 92, 'cookie');
insert into public.recipes(product_id, yield_count) values ('arc-cookie', 12);
insert into public.recipe_versions(product_id, version, yield_count, lines)
values ('arc-cookie', 1, 12, '[]'::jsonb);
insert into public.production_records(id, kind, product_id, qty, at, payload_hash)
values ('89000000-0000-4000-8000-000000000003', 'batch', 'arc-cookie', 1, now(), repeat('a',64));
insert into public.orders(id, customer_name, phone, total_cents)
values ('HC-ARCHIVE-89', 'Synthetic buyer', '09170000000', 12000);
insert into public.order_items(order_id, product_id, qty, unit_price_cents)
values ('HC-ARCHIVE-89', 'arc-cookie', 1, 12000);

create function pg_temp.check_it(ok boolean) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'flavour archive assertion failed'; end if; end $$;
create function pg_temp.expect_error(statement text, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin execute statement; exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'flavour archive expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
create function pg_temp.owner_stamp(product_id text) returns timestamptz language sql as $$
  select f.updated_at from public.get_flavours() f where f.id = product_id $$;
create function pg_temp.archive_product(product_id text) returns void language sql as $$
  select public.archive_flavour(product_id, pg_temp.owner_stamp(product_id)) $$;
create function pg_temp.restore_product(product_id text) returns void language sql as $$
  select public.restore_flavour(product_id, pg_temp.owner_stamp(product_id)) $$;
create function pg_temp.save_extras_sampler(product_id text) returns void language plpgsql as $$
declare x jsonb := public.get_order_extras();
begin
  perform public.save_order_extras((x - 'updated_at' - 'choice_images') || jsonb_build_object('sampler_product_id', product_id),
    (x->>'updated_at')::timestamptz);
end $$;
create function pg_temp.legacy_reactivate(product_id text) returns void language plpgsql as $$
declare stamp timestamptz;
begin
  select f.updated_at into stamp from public.get_flavours() f where f.id = product_id;
  perform public.save_flavour(product_id, jsonb_build_object(
    'active', true, 'allergens', 'milk, eggs', 'capacity_weight', 1, 'description', 'Synthetic',
    'image_path', '', 'item_type', 'cookie', 'kind', 'Permanent', 'name', 'Archive cookie',
    'price_cents', 12000, 'short_name', 'Archive', 'sort_order', 90, 'tag', '', 'type_id', 'cookie'), stamp);
end $$;
grant execute on function pg_temp.check_it(boolean), pg_temp.expect_error(text,text),
  pg_temp.owner_stamp(text), pg_temp.archive_product(text), pg_temp.restore_product(text),
  pg_temp.save_extras_sampler(text), pg_temp.legacy_reactivate(text) to anon, authenticated;

select pg_temp.check_it(not has_function_privilege('anon', 'public.archive_flavour(text,timestamp with time zone)', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.restore_flavour(text,timestamp with time zone)', 'EXECUTE'));
set local role anon;
select pg_temp.expect_error('select public.archive_flavour(''arc-cookie'', now())', '42501');
select pg_temp.expect_error('select public.restore_flavour(''arc-cookie'', now())', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error('select public.archive_flavour(''arc-cookie'', now())', '42501');
select pg_temp.expect_error('select public.restore_flavour(''arc-cookie'', now())', '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"89000000-0000-4000-8000-000000000002"}', true);
select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select public.archive_flavour(''arc-cookie'', now())', '42501');
select pg_temp.expect_error('select public.restore_flavour(''arc-cookie'', now())', '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"89000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '89000000-0000-4000-8000-000000000001', true);

select pg_temp.save_extras_sampler('arc-set');
select pg_temp.expect_error('select pg_temp.archive_product(''arc-set'')', '23514');
select pg_temp.save_extras_sampler(null);
select pg_temp.archive_product('arc-set');
select pg_temp.expect_error('select pg_temp.save_extras_sampler(''arc-set'')', '23514');
select pg_temp.restore_product('arc-set');
select pg_temp.check_it((select archived_at is null and not active and not published from public.products where id='arc-set'));

select pg_temp.archive_product('arc-cookie');
select pg_temp.check_it((select archived_at is not null and not active and not published from public.products where id='arc-cookie'));
select pg_temp.check_it((select archived_at is not null from public.get_flavours() where id='arc-cookie'));
select pg_temp.check_it((select not exists(select 1 from public.shop_products where id='arc-cookie')));
select pg_temp.check_it((select array_agg(a.attname::text order by a.attnum) =
  array['id','name','short_name','price_cents','kind','tag','description','image_path','sort_order','allergens','sold_by_piece']
  from pg_attribute a where a.attrelid='public.shop_products'::regclass and a.attnum > 0 and not a.attisdropped));
select pg_temp.expect_error('select count(*) from public.recipe_versions', '42501');
reset role;
select pg_temp.check_it((select count(*)=1 from public.order_items where order_id='HC-ARCHIVE-89' and product_id='arc-cookie'));
select pg_temp.check_it((select count(*)=1 from public.recipes where product_id='arc-cookie'));
select pg_temp.check_it((select count(*)=1 from public.recipe_versions where product_id='arc-cookie'));
select pg_temp.check_it((select count(*)=1 from public.production_records where product_id='arc-cookie'));
set local role authenticated;
select pg_temp.expect_error('select public.restore_flavour(''arc-cookie'', ''2020-01-01''::timestamptz)', 'P0002');
select pg_temp.expect_error('select pg_temp.legacy_reactivate(''arc-cookie'')', '23514');
select pg_temp.check_it((select archived_at is not null and not active and not published from public.products where id='arc-cookie'));
select pg_temp.expect_error('select public.publish_flavours(array[''arc-cookie''])', '23514');
select pg_temp.check_it((select count(*)=1 from public.publish_flavours(
  (select array_agg(p.id order by p.id) from public.products p where p.archived_at is null))
  where id='arc-publish' and published));
select pg_temp.check_it((select archived_at is not null and not active and not published from public.products where id='arc-cookie'));
select pg_temp.check_it((select exists(select 1 from public.shop_products where id='arc-publish' and sold_by_piece=false)));
select pg_temp.restore_product('arc-cookie');
select pg_temp.check_it((select archived_at is null and not active and not published from public.products where id='arc-cookie'));
rollback;
