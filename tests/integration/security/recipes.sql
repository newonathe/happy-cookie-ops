-- A4 recipes with versions with real SQL roles; all data rolls back.
--
-- get_recipes / save_recipe: the active owner only (a helper, support, an inactive owner and anon are all refused; anon does not
-- even hold EXECUTE; the recipe tables take no direct write from any API role, the version history no read).
-- The harness neutralises each `-- rule:` line of supabase/migrations/20260101004400_recipes.sql in turn
-- (scripts/test-db-security.py, RECIPE_MUTATIONS) and requires the named case here to fail.
-- Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a4c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('a4c00000-0000-4000-8000-000000000001', 'owner', 'Recipe owner', true),
  ('a4c00000-0000-4000-8000-000000000002', 'helper', 'Recipe helper', true),
  ('a4c00000-0000-4000-8000-000000000003', 'support', 'Recipe support', true),
  ('a4c00000-0000-4000-8000-000000000004', 'owner', 'Recipe inactive owner', false);
insert into public.products(id, name, short_name, price_cents, kind) values
  ('a4p1', 'A4 cookie one', 'A4-1', 100, 'cookie'),
  ('a4p2', 'A4 cookie two', 'A4-2', 100, 'cookie'),
  ('a4p3', 'A4 cookie three', 'A4-3', 100, 'cookie');
insert into public.inventory_items(id, name, unit) values ('a4i-flour', 'A4 Flour', 'g'), ('a4i-milk', 'A4 Milk', 'ml');
-- B3a: a recipe line must now name a stock item, so every name the cases below save has one (81 lines: the case over the size limit must be refused by the size rule alone).
insert into public.inventory_items(id, name, unit) values ('a4i-eggs', 'Eggs', 'pcs'), ('a4i-x', 'x', 'g'), ('a4i-y', 'y', 'pcs');
-- Names the line rules must be the ONLY thing to refuse (so neutralising a rule is seen): a blank, an over-long and a control-character
-- name, and an item stocked in kilos, written as the fixture owner (the stock RPC would refuse the first three).
insert into public.inventory_items(id, name, unit) values ('a4i-blank', '', 'g'), ('a4i-long', repeat('n', 81), 'g'),
  ('a4i-control', 'a' || chr(7), 'g'), ('a4i-kilo', 'A4 Kilo', 'kg');
-- Two stock items whose names differ only by case and spaces (the stock RPC refuses that; a line naming one is ambiguous).
insert into public.inventory_items(id, name, unit) values ('a4i-twin-a', 'A4 Twin', 'g'), ('a4i-twin-b', ' a4 twin ', 'g');
-- A recipe saved before lines had to be stock items, written as the fixture owner: its one line names no stock item.
insert into public.recipes(product_id, yield_count) values ('a4p3', 10);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values ('a4p3', 'A4 Legacy', 5, 'g', 0);
insert into public.inventory_items(id, name, unit) select 'a4i-line-' || i, 'A4 line ' || i, 'g' from generate_series(1, 81) i;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a4c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'recipe outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'recipe check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- A valid body for flavour p; `over` replaces keys, `dropkeys` removes them.
create function pg_temp.rec(p text, over jsonb default '{}'::jsonb, dropkeys text[] default '{}')
returns jsonb language sql stable as $$
  select (jsonb_build_object('product_id', p, 'yield', 24, 'lines', jsonb_build_array(
    jsonb_build_object('name', 'A4 Flour', 'qty', 480, 'unit', 'g'),
    jsonb_build_object('name', 'Eggs', 'qty', 2, 'unit', 'pcs'),
    jsonb_build_object('name', 'A4 Milk', 'qty', 120.5, 'unit', 'ml'))) || over) - dropkeys $$;
create function pg_temp.line(n text, q numeric, u text) returns jsonb language sql immutable as $$
  select jsonb_build_object('name', n, 'qty', q, 'unit', u) $$;
create function pg_temp.row_of(p text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_recipes()) x where x ->> 'product_id' = p $$;
-- The version rows of one flavour (the recipe_versions table has no API grant, so these read it as the fixture owner).
create function pg_temp.version_numbers(p text) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(v.version order by v.version), '[]'::jsonb) from public.recipe_versions v where v.product_id = p $$;
create function pg_temp.snapshot(p text, n integer) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('yield', v.yield_count, 'lines', v.lines) from public.recipe_versions v where v.product_id = p and v.version = n $$;
-- What a read shows of the current version, in the shape a snapshot is kept in (no item id; the kind only on a packaging line, B3b).
create function pg_temp.current_shape(p text) returns jsonb language sql stable as $$
  select jsonb_build_object('yield', (pg_temp.row_of(p) ->> 'yield')::int,
    'lines', coalesce((select jsonb_agg((l - 'item_id') - case when l ->> 'kind' = 'ingredient' then 'kind' else '' end order by ord) from jsonb_array_elements(pg_temp.row_of(p) -> 'lines') with ordinality t(l, ord)), '[]'::jsonb)) $$;
create function pg_temp.stamp(p text) returns timestamptz language sql stable as $$
  select (pg_temp.row_of(p) ->> 'updated_at')::timestamptz $$;
create function pg_temp.save(actor text, op text, body jsonb, stamp timestamptz, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_recipe(%L::jsonb, %L::timestamptz)', body::text, stamp), wanted);
end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['get_recipes()', 'save_recipe(jsonb,timestamptz)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden recipe call succeeded: anon / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'recipe_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  -- Reads of the two recipe tables stay owner-only through RLS; every write goes through save_recipe; the history has no grant.
  perform pg_temp.expect(actor, 'recipes_insert', 'insert into public.recipes(product_id, yield_count) values (''a4p2'', 1)', '42501');
  perform pg_temp.expect(actor, 'recipes_update', 'update public.recipes set yield_count = 5', '42501');
  perform pg_temp.expect(actor, 'recipes_delete', 'delete from public.recipes', '42501');
  perform pg_temp.expect(actor, 'recipe_lines_insert',
    'insert into public.recipe_ingredients(product_id, item_name, qty, unit) values (''a4p2'', ''x'', 1, ''g'')', '42501');
  perform pg_temp.expect(actor, 'recipe_lines_update', 'update public.recipe_ingredients set qty = 9', '42501');
  perform pg_temp.expect(actor, 'recipe_lines_delete', 'delete from public.recipe_ingredients', '42501');
  perform pg_temp.expect(actor, 'recipe_versions_select', 'select * from public.recipe_versions', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_recipes', 'select public.get_recipes()', '42501');
  perform pg_temp.expect(actor, 'save_recipe', 'select * from public.save_recipe(''{}''::jsonb, null)', '42501');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare s1 timestamptz; r jsonb;
begin
  perform pg_temp.save(a, 'recipe_create_ok', pg_temp.rec('a4p1', jsonb_build_object('lines', jsonb_build_array(
    pg_temp.line('  A4 Flour  ', 480, 'g'), pg_temp.line('Eggs', 2, 'pcs'), pg_temp.line('A4 Milk', 120.5, 'ml')))), null, '00000');
  r := pg_temp.row_of('a4p1');
  perform pg_temp.assert_ok(a, 'recipe_stored_normalised',
    (r ->> 'yield')::int = 24 and (r ->> 'version')::int = 1 and r -> 'history' = '[]'::jsonb
    and jsonb_array_length(r -> 'lines') = 3 and r -> 'lines' -> 0 ->> 'name' = 'A4 Flour'
    and (r -> 'lines' -> 2 ->> 'qty')::numeric = 120.5 and r -> 'lines' -> 1 ->> 'name' = 'Eggs');
  perform pg_temp.assert_ok(a, 'recipe_lines_carry_item_id',
    (select array_agg(l ->> 'item_id' order by ord) from jsonb_array_elements(r -> 'lines') with ordinality t(l, ord)) = array['a4i-flour', 'a4i-eggs', 'a4i-milk']);
  -- every version is kept from the first, the current one included
  perform pg_temp.assert_ok(a, 'recipe_first_version_snapshot',
    pg_temp.version_numbers('a4p1') = '[1]'::jsonb and pg_temp.snapshot('a4p1', 1) = pg_temp.current_shape('a4p1'));
  s1 := pg_temp.stamp('a4p1');
  perform pg_temp.save(a, 'recipe_create_replay', pg_temp.rec('a4p1'), null, '00000');
  perform pg_temp.assert_ok(a, 'recipe_replay_no_new_version',
    (pg_temp.row_of('a4p1') ->> 'version')::int = 1 and pg_temp.version_numbers('a4p1') = '[1]'::jsonb);
  perform pg_temp.save(a, 'recipe_replay_other_body', pg_temp.rec('a4p1', '{"yield": 12}'), null, 'P0002');
  perform pg_temp.save(a, 'recipe_create_with_stamp_unknown', pg_temp.rec('a4p2'), s1, 'P0002');

  perform pg_temp.save(a, 'recipe_not_object', '[]'::jsonb, null, '22023');
  perform pg_temp.save(a, 'recipe_keys_missing', pg_temp.rec('a4p2', '{}', array['yield']), null, '22023');
  perform pg_temp.save(a, 'recipe_keys_extra', pg_temp.rec('a4p2', '{"version": 3}'), null, '22023');
  perform pg_temp.save(a, 'recipe_type_yield', pg_temp.rec('a4p2', '{"yield": "24"}'), null, '22023');
  perform pg_temp.save(a, 'recipe_type_lines', pg_temp.rec('a4p2', '{"lines": {}}'), null, '22023');
  perform pg_temp.save(a, 'recipe_product_unknown', pg_temp.rec('no-such'), null, '22023');
  perform pg_temp.save(a, 'recipe_yield_zero', pg_temp.rec('a4p2', '{"yield": 0}'), null, '22023');
  perform pg_temp.save(a, 'recipe_yield_fraction', pg_temp.rec('a4p2', '{"yield": 1.5}'), null, '22023');
  perform pg_temp.save(a, 'recipe_yield_huge', pg_temp.rec('a4p2', '{"yield": 10001}'), null, '22023');
  perform pg_temp.save(a, 'recipe_too_many_lines', pg_temp.rec('a4p2', jsonb_build_object('lines',
    (select jsonb_agg(pg_temp.line('A4 line ' || i, 1, 'g')) from generate_series(1, 81) i))), null, '22023');
  perform pg_temp.save(a, 'recipe_eighty_lines_ok', pg_temp.rec('a4p2', jsonb_build_object('lines',
    (select jsonb_agg(pg_temp.line('A4 line ' || i, 1, 'g')) from generate_series(1, 80) i))), null, '00000');
  perform pg_temp.save(a, 'recipe_no_lines_ok', pg_temp.rec('a4p2', '{"lines": []}'), pg_temp.stamp('a4p2'), '00000');

  perform pg_temp.save(a, 'line_keys_missing', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array('{"name": "x", "qty": 1}'::jsonb))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_keys_extra', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array('{"name": "x", "qty": 1, "unit": "g", "cost": 1}'::jsonb))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_not_object', pg_temp.rec('a4p2', '{"lines": ["x"]}'), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_type_qty', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array('{"name": "x", "qty": "1", "unit": "g"}'::jsonb))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_name_blank', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('  ', 1, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_name_long', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line(repeat('n', 81), 1, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_name_control', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('a' || chr(7), 1, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_qty_zero', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('x', 0, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_qty_negative', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('x', -1, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_qty_decimals', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('x', 1.2345, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_qty_huge', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('x', 1000000, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_unit_kg', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('A4 Kilo', 1, 'kg')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_duplicate', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('x', 1, 'g'), pg_temp.line(' x ', 2, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_duplicate_ignores_case', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('A4 Flour', 1, 'g'), pg_temp.line(' a4 FLOUR ', 2, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_unit_mismatch', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('A4 Flour', 1, 'ml')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_unit_mismatch_ignores_case', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('a4 flour', 1, 'ml')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_item_unknown', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('A4 Nothing', 1, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_item_unknown_among_known', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(
    pg_temp.line('A4 Flour', 1, 'g'), pg_temp.line('A4 Nothing', 1, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.save(a, 'line_item_several_match', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('A4 Twin', 1, 'g')))), pg_temp.stamp('a4p2'), '22023');
  perform pg_temp.assert_ok(a, 'line_item_unknown_changed_nothing',
    pg_temp.version_numbers('a4p2') = '[1, 2]'::jsonb and jsonb_array_length(pg_temp.row_of('a4p2') -> 'lines') = 0);
  perform pg_temp.save(a, 'line_item_name_case_and_space_ok', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('  a4 FLOUR ', 1, 'g')))), pg_temp.stamp('a4p2'), '00000');
  perform pg_temp.assert_ok(a, 'line_item_name_resolved_to_one_item',
    pg_temp.row_of('a4p2') -> 'lines' -> 0 ->> 'item_id' = 'a4i-flour' and pg_temp.row_of('a4p2') -> 'lines' -> 0 ->> 'name' = 'a4 FLOUR');
  perform pg_temp.save(a, 'line_smallest_and_largest_ok', pg_temp.rec('a4p2', jsonb_build_object('lines', jsonb_build_array(pg_temp.line('x', 0.001, 'g'), pg_temp.line('y', 999999, 'pcs')))), pg_temp.stamp('a4p2'), '00000');

  -- a change with the stamp it read is a new version, and the old one is kept
  perform pg_temp.save(a, 'recipe_change_ok', pg_temp.rec('a4p1', jsonb_build_object('yield', 12, 'lines', jsonb_build_array(
    pg_temp.line('A4 Flour', 500, 'g'), pg_temp.line('Eggs', 3, 'pcs')))), s1, '00000');
  r := pg_temp.row_of('a4p1');
  perform pg_temp.assert_ok(a, 'recipe_version_two_history_kept',
    (r ->> 'version')::int = 2 and (r ->> 'yield')::int = 12 and jsonb_array_length(r -> 'lines') = 2
    and jsonb_array_length(r -> 'history') = 1 and (r -> 'history' -> 0 ->> 'version')::int = 1
    and (r -> 'history' -> 0 ->> 'yield')::int = 24 and jsonb_array_length(r -> 'history' -> 0 -> 'lines') = 3
    and (r -> 'history' -> 0 -> 'lines' -> 2 ->> 'qty')::numeric = 120.5);
  -- the history is what it was: the replaced versions only, never the current one, each line exactly name, qty and unit
  perform pg_temp.assert_ok(a, 'recipe_history_leaves_out_the_current_version',
    not exists (select 1 from jsonb_array_elements(r -> 'history') h where (h ->> 'version')::int = (r ->> 'version')::int)
    and not exists (select 1 from jsonb_array_elements(r -> 'history' -> 0 -> 'lines') l where (select count(*) from jsonb_object_keys(l)) <> 3));
  perform pg_temp.assert_ok(a, 'recipe_both_versions_have_a_snapshot',
    pg_temp.version_numbers('a4p1') = '[1, 2]'::jsonb and pg_temp.snapshot('a4p1', 2) = pg_temp.current_shape('a4p1')
    and pg_temp.snapshot('a4p1', 1) -> 'yield' = '24'::jsonb);
  perform pg_temp.save(a, 'recipe_change_stale', pg_temp.rec('a4p1', '{"yield": 1}'), s1 - interval '1 minute', 'P0002');
  perform pg_temp.save(a, 'recipe_noop_same_version', pg_temp.rec('a4p1', jsonb_build_object('yield', 12, 'lines', jsonb_build_array(
    pg_temp.line('A4 Flour', 500.000, 'g'), pg_temp.line('Eggs', 3, 'pcs')))), pg_temp.stamp('a4p1'), '00000');
  perform pg_temp.assert_ok(a, 'recipe_noop_made_no_version',
    (pg_temp.row_of('a4p1') ->> 'version')::int = 2 and pg_temp.version_numbers('a4p1') = '[1, 2]'::jsonb);
  perform pg_temp.save(a, 'recipe_yield_only_change', pg_temp.rec('a4p1', jsonb_build_object('yield', 13, 'lines', jsonb_build_array(
    pg_temp.line('A4 Flour', 500, 'g'), pg_temp.line('Eggs', 3, 'pcs')))), pg_temp.stamp('a4p1'), '00000');
  perform pg_temp.assert_ok(a, 'recipe_version_three_two_kept',
    (pg_temp.row_of('a4p1') ->> 'version')::int = 3
    and (select array_agg((h ->> 'version')::int order by (h ->> 'version')::int) from jsonb_array_elements(pg_temp.row_of('a4p1') -> 'history') h) = array[1, 2]
    and pg_temp.version_numbers('a4p1') = '[1, 2, 3]'::jsonb and pg_temp.snapshot('a4p1', 3) = pg_temp.current_shape('a4p1'));
  perform pg_temp.save(a, 'recipe_order_kept', pg_temp.rec('a4p1', jsonb_build_object('yield', 13, 'lines', jsonb_build_array(
    pg_temp.line('Eggs', 3, 'pcs'), pg_temp.line('A4 Flour', 500, 'g')))), pg_temp.stamp('a4p1'), '00000');
  perform pg_temp.assert_ok(a, 'recipe_reordered_lines_stored_in_order',
    pg_temp.row_of('a4p1') -> 'lines' -> 0 ->> 'name' = 'Eggs' and pg_temp.row_of('a4p1') -> 'lines' -> 1 ->> 'name' = 'A4 Flour');

  -- a recipe saved before lines had to be stock items: the same save again is still answered (no new version), but changing it
  -- is held to the rule
  perform pg_temp.save(a, 'legacy_retry_answered', pg_temp.rec('a4p3', jsonb_build_object('yield', 10, 'lines', jsonb_build_array(pg_temp.line('A4 Legacy', 5, 'g')))), null, '00000');
  perform pg_temp.save(a, 'legacy_retry_with_stamp_answered', pg_temp.rec('a4p3', jsonb_build_object('yield', 10, 'lines', jsonb_build_array(pg_temp.line('A4 Legacy', 5, 'g')))), pg_temp.stamp('a4p3'), '00000');
  perform pg_temp.assert_ok(a, 'legacy_retry_made_no_version',
    (pg_temp.row_of('a4p3') ->> 'version')::int = 1 and pg_temp.version_numbers('a4p3') = '[]'::jsonb
    and pg_temp.row_of('a4p3') -> 'lines' -> 0 -> 'item_id' = 'null'::jsonb);
  perform pg_temp.save(a, 'legacy_yield_change_refused', pg_temp.rec('a4p3', jsonb_build_object('yield', 12, 'lines', jsonb_build_array(pg_temp.line('A4 Legacy', 5, 'g')))), pg_temp.stamp('a4p3'), '22023');
  perform pg_temp.assert_ok(a, 'legacy_refusal_changed_nothing',
    (pg_temp.row_of('a4p3') ->> 'version')::int = 1 and (pg_temp.row_of('a4p3') ->> 'yield')::int = 10 and pg_temp.version_numbers('a4p3') = '[]'::jsonb);
end $$;

grant execute on function
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.rec(text, jsonb, text[]), pg_temp.line(text, numeric, text), pg_temp.row_of(text), pg_temp.stamp(text),
  pg_temp.version_numbers(text), pg_temp.snapshot(text, integer), pg_temp.current_shape(text),
  pg_temp.save(text, text, jsonb, timestamptz, text),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text), pg_temp.phase_owner(text)
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
select pg_temp.phase_owner('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
