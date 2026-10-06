-- A3 stock catalogue with real SQL roles; all data rolls back.
--
-- get_stock_catalogue / save_supplier / save_stock_item / save_supplier_price: the active owner only (a helper, support,
-- an inactive owner and anon are all refused; anon does not even hold EXECUTE, and the three tables have no API grant).
-- The harness neutralises each `-- rule:` line of supabase/migrations/20260101004300_stock_catalogue.sql in turn
-- (scripts/test-db-security.py, STOCK_MUTATIONS) and requires the named case here to fail.
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a3c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('a3c00000-0000-4000-8000-000000000001', 'owner', 'Stock owner', true),
  ('a3c00000-0000-4000-8000-000000000002', 'helper', 'Stock helper', true),
  ('a3c00000-0000-4000-8000-000000000003', 'support', 'Stock support', true),
  ('a3c00000-0000-4000-8000-000000000004', 'owner', 'Stock inactive owner', false);

-- A recipe (written as the fixture owner, never through an API role) that uses the item the unit-change cases name.
insert into public.products(id, name, short_name, price_cents, kind) values ('a3p1', 'A3 cookie', 'A3', 100, 'cookie');
insert into public.recipes(product_id, yield_count) values ('a3p1', 1);
insert into public.recipe_ingredients(product_id, item_name, qty, unit) values ('a3p1', 'A3 item 6', 1, 'g');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a3c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

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
    raise exception 'stock outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'stock check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- Valid bodies for number n; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.sid(n integer) returns text language sql immutable as $$ select 'a3s-' || n $$;
create function pg_temp.iid(n integer) returns text language sql immutable as $$ select 'a3i-' || n $$;
create function pg_temp.pid(n integer) returns text language sql immutable as $$
  select 'a3a00000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.sup(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', pg_temp.sid(n), 'name', 'A3 supplier ' || n, 'phone', '0917 000 0000',
    'notes', 'line one', 'place', 'Quezon City', 'active', true) || over) - dropkeys $$;
create function pg_temp.itm(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', pg_temp.iid(n), 'name', 'A3 item ' || n, 'category', 'Ingredients', 'unit', 'g',
    'par_level', 500, 'pack_size', 1000, 'pack_label', '1 kg bag', 'supplier_id', pg_temp.sid(1), 'use_by_days', 180,
    'active', true) || over) - dropkeys $$;
create function pg_temp.prc(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('id', pg_temp.pid(n), 'supplier_id', pg_temp.sid(1), 'item_name', 'A3 item 1',
    'pack_label', '1 kg bag', 'price_cents', 12000, 'last_bought', '2 Aug', 'preferred', true, 'active', true)
    || over) - dropkeys $$;

-- The same, on a supplier and item pair no other price uses, so a refused body could otherwise be stored.
create function pg_temp.prn(n integer, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select pg_temp.prc(n, jsonb_build_object('supplier_id', pg_temp.sid(3)) || over, dropkeys) $$;

create function pg_temp.stamp(part text, id text) returns timestamptz language sql stable as $$
  select (x ->> 'updated_at')::timestamptz from jsonb_array_elements(public.get_stock_catalogue() -> part) x
   where x ->> 'id' = id $$;
create function pg_temp.row_of(part text, id text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_stock_catalogue() -> part) x where x ->> 'id' = id $$;
create function pg_temp.save(actor text, op text, fn text, body jsonb, stamp timestamptz, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.%s(%L::jsonb, %L::timestamptz)', fn, body::text, stamp), wanted);
end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['get_stock_catalogue()', 'save_supplier(jsonb,timestamptz)',
                           'save_stock_item(jsonb,timestamptz)', 'save_supplier_price(jsonb,timestamptz)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden stock call succeeded: anon / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'stock_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  -- Reads stay owner-only through RLS (no error, no rows for anyone else); every write goes through the RPCs.
  perform pg_temp.expect(actor, 'stock_suppliers_insert',
    'insert into public.suppliers(id, name) values (''zz'', ''x'')', '42501');
  perform pg_temp.expect(actor, 'stock_suppliers_update', 'update public.suppliers set name = ''y''', '42501');
  perform pg_temp.expect(actor, 'stock_suppliers_delete', 'delete from public.suppliers', '42501');
  perform pg_temp.expect(actor, 'stock_items_insert',
    'insert into public.inventory_items(id, name, unit) values (''zz'', ''x'', ''g'')', '42501');
  perform pg_temp.expect(actor, 'stock_items_update', 'update public.inventory_items set on_hand = 5', '42501');
  perform pg_temp.expect(actor, 'stock_items_delete', 'delete from public.inventory_items', '42501');
  perform pg_temp.expect(actor, 'stock_prices_insert',
    'insert into public.supplier_prices(supplier_id, item_name, pack_label, price_cents) values (''zz'', ''x'', ''y'', 1)', '42501');
  perform pg_temp.expect(actor, 'stock_prices_update', 'update public.supplier_prices set price_cents = 5', '42501');
  perform pg_temp.expect(actor, 'stock_prices_delete', 'delete from public.supplier_prices', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_stock_catalogue', 'select public.get_stock_catalogue()', '42501');
  perform pg_temp.expect(actor, 'save_supplier', 'select * from public.save_supplier(''{}''::jsonb, null)', '42501');
  perform pg_temp.expect(actor, 'save_stock_item', 'select * from public.save_stock_item(''{}''::jsonb, null)', '42501');
  perform pg_temp.expect(actor, 'save_supplier_price', 'select * from public.save_supplier_price(''{}''::jsonb, null)', '42501');
end $$;

create function pg_temp.phase_suppliers(a text) returns void language plpgsql security invoker as $$
declare s1 timestamptz; r jsonb;
begin
  perform pg_temp.save(a, 'sup_create_ok', 'save_supplier', pg_temp.sup(1, '{"name": "  A3 supplier 1  "}'), null, '00000');
  r := pg_temp.row_of('suppliers', pg_temp.sid(1));
  perform pg_temp.assert_ok(a, 'sup_stored_normalised',
    r ->> 'name' = 'A3 supplier 1' and r ->> 'phone' = '0917 000 0000' and r ->> 'notes' = 'line one'
    and r ->> 'place' = 'Quezon City' and (r ->> 'active')::boolean);
  s1 := pg_temp.stamp('suppliers', pg_temp.sid(1));
  perform pg_temp.save(a, 'sup_create_replay', 'save_supplier', pg_temp.sup(1), null, '00000');
  perform pg_temp.assert_ok(a, 'sup_replay_same_stamp', pg_temp.stamp('suppliers', pg_temp.sid(1)) = s1);
  perform pg_temp.save(a, 'sup_replay_other_body', 'save_supplier', pg_temp.sup(1, '{"place": "Makati"}'), null, 'P0002');
  perform pg_temp.save(a, 'sup_create_with_stamp_unknown', 'save_supplier', pg_temp.sup(9), s1, 'P0002');

  perform pg_temp.save(a, 'sup_not_object', 'save_supplier', '[]'::jsonb, null, '22023');
  perform pg_temp.save(a, 'sup_keys_missing', 'save_supplier', pg_temp.sup(2, '{}', array['notes']), null, '22023');
  perform pg_temp.save(a, 'sup_keys_extra', 'save_supplier', pg_temp.sup(2, '{"price": 1}'), null, '22023');
  perform pg_temp.save(a, 'sup_type_active', 'save_supplier', pg_temp.sup(2, '{"active": "yes"}'), null, '22023');
  perform pg_temp.save(a, 'sup_id_bad', 'save_supplier', pg_temp.sup(2, '{"id": "Bad Id"}'), null, '22023');
  perform pg_temp.save(a, 'sup_name_blank', 'save_supplier', pg_temp.sup(2, '{"name": "   "}'), null, '22023');
  perform pg_temp.save(a, 'sup_name_long', 'save_supplier', pg_temp.sup(2, jsonb_build_object('name', repeat('n', 81))), null, '22023');
  perform pg_temp.save(a, 'sup_phone_long', 'save_supplier', pg_temp.sup(2, jsonb_build_object('phone', repeat('9', 41))), null, '22023');
  perform pg_temp.save(a, 'sup_notes_long', 'save_supplier', pg_temp.sup(2, jsonb_build_object('notes', repeat('n', 301))), null, '22023');
  perform pg_temp.save(a, 'sup_name_control', 'save_supplier', pg_temp.sup(2, jsonb_build_object('name', 'a' || chr(7))), null, '22023');
  perform pg_temp.save(a, 'sup_notes_newline_ok', 'save_supplier', pg_temp.sup(3, jsonb_build_object('notes', E'a\nb')), null, '00000');
  perform pg_temp.save(a, 'sup_name_taken', 'save_supplier', pg_temp.sup(2, '{"name": "a3 SUPPLIER 1"}'), null, '22023');

  perform pg_temp.save(a, 'sup_change_ok', 'save_supplier', pg_temp.sup(1, '{"place": "Makati", "active": false}'), s1, '00000');
  perform pg_temp.assert_ok(a, 'sup_change_persisted',
    (pg_temp.row_of('suppliers', pg_temp.sid(1)) ->> 'place') = 'Makati' and not (pg_temp.row_of('suppliers', pg_temp.sid(1)) ->> 'active')::boolean);
  perform pg_temp.save(a, 'sup_change_stale', 'save_supplier', pg_temp.sup(1, '{"place": "Pasig"}'), s1 - interval '1 minute', 'P0002');
  perform pg_temp.save(a, 'sup_reactivate', 'save_supplier', pg_temp.sup(1), pg_temp.stamp('suppliers', pg_temp.sid(1)), '00000');
end $$;

create function pg_temp.phase_items(a text) returns void language plpgsql security invoker as $$
declare s1 timestamptz; r jsonb;
begin
  perform pg_temp.save(a, 'item_create_ok', 'save_stock_item', pg_temp.itm(1, '{"name": "  A3 item 1  "}'), null, '00000');
  r := pg_temp.row_of('items', pg_temp.iid(1));
  perform pg_temp.assert_ok(a, 'item_stored_normalised',
    r ->> 'name' = 'A3 item 1' and r ->> 'category' = 'Ingredients' and r ->> 'unit' = 'g'
    and (r ->> 'par_level')::numeric = 500 and (r ->> 'pack_size')::numeric = 1000 and r ->> 'supplier_id' = pg_temp.sid(1)
    and (r ->> 'use_by_days')::int = 180 and (r ->> 'on_hand')::numeric = 0 and (r ->> 'active')::boolean);
  s1 := pg_temp.stamp('items', pg_temp.iid(1));
  perform pg_temp.save(a, 'item_create_replay', 'save_stock_item', pg_temp.itm(1), null, '00000');
  perform pg_temp.assert_ok(a, 'item_replay_same_stamp', pg_temp.stamp('items', pg_temp.iid(1)) = s1);
  perform pg_temp.save(a, 'item_replay_other_body', 'save_stock_item', pg_temp.itm(1, '{"unit": "kg"}'), null, 'P0002');
  perform pg_temp.save(a, 'item_create_with_stamp_unknown', 'save_stock_item', pg_temp.itm(9), s1, 'P0002');

  perform pg_temp.save(a, 'item_not_object', 'save_stock_item', '[]'::jsonb, null, '22023');
  perform pg_temp.save(a, 'item_keys_missing', 'save_stock_item', pg_temp.itm(2, '{}', array['unit']), null, '22023');
  perform pg_temp.save(a, 'item_keys_extra', 'save_stock_item', pg_temp.itm(2, '{"on_hand": 5}'), null, '22023');
  perform pg_temp.save(a, 'item_type_par', 'save_stock_item', pg_temp.itm(2, '{"par_level": "5"}'), null, '22023');
  perform pg_temp.save(a, 'item_id_bad', 'save_stock_item', pg_temp.itm(2, '{"id": "Bad Id"}'), null, '22023');
  perform pg_temp.save(a, 'item_name_blank', 'save_stock_item', pg_temp.itm(2, '{"name": " "}'), null, '22023');
  perform pg_temp.save(a, 'item_unit_long', 'save_stock_item', pg_temp.itm(2, jsonb_build_object('unit', repeat('u', 13))), null, '22023');
  perform pg_temp.save(a, 'item_label_long', 'save_stock_item', pg_temp.itm(2, jsonb_build_object('pack_label', repeat('p', 41))), null, '22023');
  perform pg_temp.save(a, 'item_name_control', 'save_stock_item', pg_temp.itm(2, jsonb_build_object('name', 'a' || chr(7))), null, '22023');
  perform pg_temp.save(a, 'item_category_bad', 'save_stock_item', pg_temp.itm(2, '{"category": "Snacks"}'), null, '22023');
  perform pg_temp.save(a, 'item_packaging_ok', 'save_stock_item', pg_temp.itm(3, '{"category": "Packaging", "unit": "pcs", "pack_size": null, "supplier_id": null, "use_by_days": null}'), null, '00000');
  perform pg_temp.save(a, 'item_par_negative', 'save_stock_item', pg_temp.itm(2, '{"par_level": -1}'), null, '22023');
  perform pg_temp.save(a, 'item_par_decimals', 'save_stock_item', pg_temp.itm(2, '{"par_level": 1.2345}'), null, '22023');
  perform pg_temp.save(a, 'item_par_huge', 'save_stock_item', pg_temp.itm(2, '{"par_level": 1000000000}'), null, '22023');
  perform pg_temp.save(a, 'item_pack_zero', 'save_stock_item', pg_temp.itm(2, '{"pack_size": 0}'), null, '22023');
  perform pg_temp.save(a, 'item_useby_zero', 'save_stock_item', pg_temp.itm(2, '{"use_by_days": 0}'), null, '22023');
  perform pg_temp.save(a, 'item_useby_fraction', 'save_stock_item', pg_temp.itm(2, '{"use_by_days": 1.5}'), null, '22023');
  perform pg_temp.save(a, 'item_useby_huge', 'save_stock_item', pg_temp.itm(2, '{"use_by_days": 3651}'), null, '22023');
  perform pg_temp.save(a, 'item_supplier_unknown', 'save_stock_item', pg_temp.itm(2, '{"supplier_id": "no-such"}'), null, '22023');
  perform pg_temp.save(a, 'item_name_taken', 'save_stock_item', pg_temp.itm(2, '{"name": "a3 ITEM 1"}'), null, '22023');

  perform pg_temp.save(a, 'item_change_ok', 'save_stock_item', pg_temp.itm(1, '{"par_level": 750, "unit": "g"}'), s1, '00000');
  perform pg_temp.assert_ok(a, 'item_change_persisted_on_hand_untouched',
    (pg_temp.row_of('items', pg_temp.iid(1)) ->> 'par_level')::numeric = 750
    and (pg_temp.row_of('items', pg_temp.iid(1)) ->> 'on_hand')::numeric = 0);
  perform pg_temp.save(a, 'item_change_stale', 'save_stock_item', pg_temp.itm(1, '{"par_level": 1}'), s1 - interval '1 minute', 'P0002');
  -- an item a recipe uses keeps its unit; one no recipe uses may change it
  perform pg_temp.save(a, 'item_six_create_ok', 'save_stock_item', pg_temp.itm(6), null, '00000');
  perform pg_temp.save(a, 'item_unit_change_referenced', 'save_stock_item', pg_temp.itm(6, '{"unit": "kg"}'), pg_temp.stamp('items', pg_temp.iid(6)), '22023');
  perform pg_temp.save(a, 'item_unit_change_unreferenced_ok', 'save_stock_item',
    pg_temp.itm(3, '{"category": "Packaging", "unit": "box", "pack_size": null, "supplier_id": null, "use_by_days": null}'),
    pg_temp.stamp('items', pg_temp.iid(3)), '00000');
end $$;

create function pg_temp.phase_prices(a text) returns void language plpgsql security invoker as $$
declare s1 timestamptz; r jsonb; i integer;
begin
  perform pg_temp.save(a, 'price_create_ok', 'save_supplier_price', pg_temp.prc(1), null, '00000');
  r := pg_temp.row_of('prices', pg_temp.pid(1));
  perform pg_temp.assert_ok(a, 'price_stored',
    r ->> 'supplier_id' = pg_temp.sid(1) and r ->> 'item_name' = 'A3 item 1' and (r ->> 'price_cents')::bigint = 12000
    and r -> 'previous_cents' = '[]'::jsonb and (r ->> 'preferred')::boolean and (r ->> 'active')::boolean);
  s1 := pg_temp.stamp('prices', pg_temp.pid(1));
  perform pg_temp.save(a, 'price_create_replay', 'save_supplier_price', pg_temp.prc(1), null, '00000');
  perform pg_temp.assert_ok(a, 'price_replay_same_stamp', pg_temp.stamp('prices', pg_temp.pid(1)) = s1);
  perform pg_temp.save(a, 'price_replay_other_body', 'save_supplier_price', pg_temp.prc(1, '{"price_cents": 1}'), null, 'P0002');
  perform pg_temp.save(a, 'price_create_with_stamp_unknown', 'save_supplier_price', pg_temp.prc(9, jsonb_build_object('supplier_id', pg_temp.sid(3))), s1, 'P0002');

  perform pg_temp.save(a, 'price_not_object', 'save_supplier_price', '[]'::jsonb, null, '22023');
  perform pg_temp.save(a, 'price_keys_missing', 'save_supplier_price', pg_temp.prn(2, '{}', array['preferred']), null, '22023');
  perform pg_temp.save(a, 'price_keys_extra', 'save_supplier_price', pg_temp.prn(2, '{"qty": 1}'), null, '22023');
  perform pg_temp.save(a, 'price_type_cents', 'save_supplier_price', pg_temp.prn(2, '{"price_cents": "5"}'), null, '22023');
  perform pg_temp.save(a, 'price_id_bad', 'save_supplier_price', pg_temp.prn(2, '{"id": "nope"}'), null, '22023');
  perform pg_temp.save(a, 'price_label_blank', 'save_supplier_price', pg_temp.prn(2, '{"pack_label": " "}'), null, '22023');
  perform pg_temp.save(a, 'price_label_long', 'save_supplier_price', pg_temp.prn(2, jsonb_build_object('pack_label', repeat('p', 41))), null, '22023');
  perform pg_temp.save(a, 'price_bought_long', 'save_supplier_price', pg_temp.prn(2, jsonb_build_object('last_bought', repeat('b', 21))), null, '22023');
  perform pg_temp.save(a, 'price_cents_negative', 'save_supplier_price', pg_temp.prn(2, '{"price_cents": -1}'), null, '22023');
  perform pg_temp.save(a, 'price_cents_fraction', 'save_supplier_price', pg_temp.prn(2, '{"price_cents": 12.5}'), null, '22023');
  perform pg_temp.save(a, 'price_cents_huge', 'save_supplier_price', pg_temp.prn(2, '{"price_cents": 100000001}'), null, '22023');
  perform pg_temp.save(a, 'price_supplier_unknown', 'save_supplier_price', pg_temp.prn(2, '{"supplier_id": "no-such"}'), null, '22023');
  perform pg_temp.save(a, 'price_item_unknown', 'save_supplier_price', pg_temp.prn(2, '{"item_name": "A3 no such item"}'), null, '22023');
  perform pg_temp.save(a, 'price_duplicate', 'save_supplier_price', pg_temp.prc(2), null, '22023');
  perform pg_temp.save(a, 'price_same_item_other_supplier_ok', 'save_supplier_price', pg_temp.prc(3, jsonb_build_object('supplier_id', pg_temp.sid(3))), null, '00000');

  -- a changed price pushes the old one onto the history; three are kept; an unchanged price leaves it alone
  perform pg_temp.save(a, 'price_change_ok', 'save_supplier_price', pg_temp.prc(1, '{"price_cents": 13000}'), s1, '00000');
  perform pg_temp.assert_ok(a, 'price_history_pushed',
    pg_temp.row_of('prices', pg_temp.pid(1)) -> 'previous_cents' = '[12000]'::jsonb
    and (pg_temp.row_of('prices', pg_temp.pid(1)) ->> 'price_cents')::bigint = 13000);
  perform pg_temp.save(a, 'price_change_same_price', 'save_supplier_price',
    pg_temp.prc(1, '{"price_cents": 13000, "preferred": false}'), pg_temp.stamp('prices', pg_temp.pid(1)), '00000');
  perform pg_temp.assert_ok(a, 'price_history_kept_when_price_same',
    pg_temp.row_of('prices', pg_temp.pid(1)) -> 'previous_cents' = '[12000]'::jsonb);
  for i in 1..4 loop
    perform pg_temp.save(a, 'price_change_more_' || i, 'save_supplier_price',
      pg_temp.prc(1, jsonb_build_object('price_cents', 13000 + i * 100)), pg_temp.stamp('prices', pg_temp.pid(1)), '00000');
  end loop;
  perform pg_temp.assert_ok(a, 'price_history_three_kept',
    pg_temp.row_of('prices', pg_temp.pid(1)) -> 'previous_cents' = '[13300, 13200, 13100]'::jsonb);
  perform pg_temp.save(a, 'price_change_stale', 'save_supplier_price', pg_temp.prc(1, '{"price_cents": 1}'), s1 - interval '1 minute', 'P0002');
  perform pg_temp.save(a, 'price_deactivate', 'save_supplier_price',
    pg_temp.prc(3, jsonb_build_object('supplier_id', pg_temp.sid(3), 'active', false)), pg_temp.stamp('prices', pg_temp.pid(3)), '00000');
  -- an item with a price cannot be renamed (the grocery list and recipes find it by name)
  perform pg_temp.save(a, 'item_rename_referenced', 'save_stock_item',
    pg_temp.itm(1, '{"name": "A3 renamed", "par_level": 750}'), pg_temp.stamp('items', pg_temp.iid(1)), '22023');
  perform pg_temp.save(a, 'item_rename_unreferenced_ok', 'save_stock_item',
    pg_temp.itm(3, '{"name": "A3 packaging renamed", "category": "Packaging", "unit": "pcs", "pack_size": null, "supplier_id": null, "use_by_days": null}'),
    pg_temp.stamp('items', pg_temp.iid(3)), '00000');

  -- B3a: a price links to its stock item by id and may state the size of this supplier's pack (in the item's unit).
  -- The key is optional: the eight keys of before still save; pack_size, when sent, is a number or null, above 0 and bounded.
  perform pg_temp.save(a, 'price_pack_size_zero', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": 0}'), null, '22023');
  perform pg_temp.save(a, 'price_pack_size_negative', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": -5}'), null, '22023');
  perform pg_temp.save(a, 'price_pack_size_huge', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": 1000000000}'), null, '22023');
  perform pg_temp.save(a, 'price_pack_size_decimals', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": 1.2345}'), null, '22023');
  perform pg_temp.save(a, 'price_pack_size_type', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": "5"}'), null, '22023');
  perform pg_temp.save(a, 'price_pack_size_just_over', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": 999999999.001}'), null, '22023');
  perform pg_temp.save(a, 'price_with_pack_size_ok', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": 500.5}'), null, '00000');
  r := pg_temp.row_of('prices', pg_temp.pid(10));
  perform pg_temp.assert_ok(a, 'price_pack_size_stored', (r ->> 'pack_size')::numeric = 500.5 and jsonb_typeof(r -> 'pack_size') = 'number');
  perform pg_temp.assert_ok(a, 'price_item_id_stored', r ->> 'item_id' = pg_temp.iid(6));
  -- a pack size of null, and no key at all, both store no size; a price made before this still reads item_id and a null size
  perform pg_temp.save(a, 'price_pack_size_null_ok', 'save_supplier_price', pg_temp.prc(11, '{"item_name": "A3 item 6", "pack_size": null}'), null, '00000');
  perform pg_temp.save(a, 'price_without_pack_size_key_ok', 'save_supplier_price', pg_temp.prc(12, '{"item_name": "A3 packaging renamed"}'), null, '00000');
  perform pg_temp.assert_ok(a, 'price_no_size_is_null',
    pg_temp.row_of('prices', pg_temp.pid(11)) -> 'pack_size' = 'null'::jsonb and pg_temp.row_of('prices', pg_temp.pid(12)) -> 'pack_size' = 'null'::jsonb
    and pg_temp.row_of('prices', pg_temp.pid(12)) ->> 'item_id' = pg_temp.iid(3)
    and pg_temp.row_of('prices', pg_temp.pid(1)) ->> 'item_id' = pg_temp.iid(1) and pg_temp.row_of('prices', pg_temp.pid(1)) -> 'pack_size' = 'null'::jsonb);
  perform pg_temp.save(a, 'price_pack_size_largest_ok', 'save_supplier_price', pg_temp.prc(11, '{"item_name": "A3 item 6", "pack_size": 999999999}'),
    pg_temp.stamp('prices', pg_temp.pid(11)), '00000');
  -- a lost reply on a create: the same body is answered; the key counts only when it was sent
  perform pg_temp.save(a, 'price_replay_with_pack_size', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": 500.5}'), null, '00000');
  perform pg_temp.save(a, 'price_replay_other_pack_size', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "pack_size": 400}'), null, 'P0002');
  perform pg_temp.save(a, 'price_replay_without_key_ok', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6"}'), null, '00000');
  perform pg_temp.assert_ok(a, 'price_replay_changed_nothing', (pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'pack_size')::numeric = 500.5);
  -- an update without the key leaves the stored size; with a number it changes; with null it clears
  perform pg_temp.save(a, 'price_update_without_key', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "price_cents": 12500}'),
    pg_temp.stamp('prices', pg_temp.pid(10)), '00000');
  perform pg_temp.assert_ok(a, 'price_update_without_key_keeps_size',
    (pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'pack_size')::numeric = 500.5 and (pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'price_cents')::bigint = 12500);
  perform pg_temp.save(a, 'price_update_pack_size', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "price_cents": 12500, "pack_size": 750}'),
    pg_temp.stamp('prices', pg_temp.pid(10)), '00000');
  perform pg_temp.assert_ok(a, 'price_update_pack_size_changed', (pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'pack_size')::numeric = 750);
  perform pg_temp.save(a, 'price_update_pack_size_null', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "price_cents": 12500, "pack_size": null}'),
    pg_temp.stamp('prices', pg_temp.pid(10)), '00000');
  perform pg_temp.assert_ok(a, 'price_update_pack_size_cleared', pg_temp.row_of('prices', pg_temp.pid(10)) -> 'pack_size' = 'null'::jsonb);
  -- the item id follows the item the price now names
  perform pg_temp.save(a, 'price_update_item_name', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 packaging renamed", "price_cents": 12500}'),
    pg_temp.stamp('prices', pg_temp.pid(10)), '00000');
  perform pg_temp.assert_ok(a, 'price_item_id_follows_item', pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'item_id' = pg_temp.iid(3));
  -- a size belongs to one item's unit: an edit that keeps the item keeps the size, one that points the price at another item clears it
  perform pg_temp.save(a, 'price_hold_size', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 packaging renamed", "price_cents": 12500, "pack_size": 40}'),
    pg_temp.stamp('prices', pg_temp.pid(10)), '00000');
  perform pg_temp.save(a, 'price_edit_same_item_without_key', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 packaging renamed", "price_cents": 12600}'),
    pg_temp.stamp('prices', pg_temp.pid(10)), '00000');
  perform pg_temp.assert_ok(a, 'price_edit_same_item_keeps_size',
    (pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'pack_size')::numeric = 40 and (pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'price_cents')::bigint = 12600);
  perform pg_temp.save(a, 'price_repoint_without_key', 'save_supplier_price', pg_temp.prn(10, '{"item_name": "A3 item 6", "price_cents": 12600}'),
    pg_temp.stamp('prices', pg_temp.pid(10)), '00000');
  perform pg_temp.assert_ok(a, 'price_repoint_clears_size',
    pg_temp.row_of('prices', pg_temp.pid(10)) -> 'pack_size' = 'null'::jsonb and pg_temp.row_of('prices', pg_temp.pid(10)) ->> 'item_id' = pg_temp.iid(6));
  perform pg_temp.assert_ok(a, 'catalogue_prices_carry_item_id_and_pack_size',
    not exists (select 1 from jsonb_array_elements(public.get_stock_catalogue() -> 'prices') p where not (p ? 'item_id') or not (p ? 'pack_size'))
    and jsonb_array_length(public.get_stock_catalogue() -> 'prices') = 5);
end $$;

grant execute on function
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.sid(integer), pg_temp.iid(integer), pg_temp.pid(integer),
  pg_temp.sup(integer, jsonb, text[]), pg_temp.itm(integer, jsonb, text[]), pg_temp.prc(integer, jsonb, text[]), pg_temp.prn(integer, jsonb, text[]),
  pg_temp.stamp(text, text), pg_temp.row_of(text, text),
  pg_temp.save(text, text, text, jsonb, timestamptz, text),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text),
  pg_temp.phase_suppliers(text), pg_temp.phase_items(text), pg_temp.phase_prices(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_table('anon');
select pg_temp.assert_refused('anon');
reset role;

set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_table('active_helper');
select pg_temp.assert_refused('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_table('active_support');
select pg_temp.assert_refused('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_refused('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_table('active_owner');
select pg_temp.phase_suppliers('active_owner');
select pg_temp.phase_items('active_owner');
select pg_temp.phase_prices('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
