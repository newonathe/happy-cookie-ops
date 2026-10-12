-- B4a-3 her-data imports, with real SQL roles; all data rolls back.
--
-- Five imports, each a pair: preview_import_X(rows) writes nothing and says what WOULD be written (will_write), what is already there
-- (unchanged) and what could not be matched (unmatched, each with a why), with counts and a hash of the will_write list; apply_import_X(rows,
-- expected) takes exactly {hash, counts}, works the preview out again under the catalogue lock, is refused (P0002) when either differs, and
-- writes only will_write, in one transaction, with one audit row. The five are items, prices, recipes, flavour prices and bookings. Names are
-- DATA in the call; a name must be exactly one record (case and surrounding spaces ignored) and a unit must be the item's own, otherwise the row
-- is listed and not written. Every row goes through the same internal writer as the owner's save (write_stock_item, write_item_price,
-- write_recipe, write_flavour, write_scheduled_event), so no rule is copied. None of the ten functions, nor the internal ones under them, holds
-- EXECUTE for any API role, service_role included: the operator runs them as postgres, so anon, a helper, support, an inactive owner and the
-- ACTIVE owner are all refused (42501). A recipe import first takes the item of a packaging line off any packaging rule that takes it per
-- cookie (or loose), the container's other lines kept, then saves the recipe; a held recipe removes nothing. The harness neutralises each
-- `-- rule:` line of supabase/migrations/20260101006300_her_data_imports.sql in turn (scripts/test-db-security.py, IMPORT_MUTATIONS) and requires
-- the named case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
-- Review fixes (still migration 63, which is applied nowhere): a name with an invisible space (no-break, zero-width, ideographic, a byte-order
-- mark and the like) or not written in composed (NFC) form is listed as unmatched, because btrim strips only the ASCII space and the row would
-- otherwise make a second item, flavour or booking that looks like the first; two prices for one item on one day are refused (the usual price
-- would fall to an arbitrary id), also within one call; the same flavour twice in one recipes call lists the second (a removal made for the
-- first cannot be left behind by the second); an unchanged entry shows the fields it hides; the audit row carries the will_write list.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b4a30000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b4a30000-0000-4000-8000-000000000001', 'owner', 'Import owner', true),
  ('b4a30000-0000-4000-8000-000000000002', 'helper', 'Import helper', true),
  ('b4a30000-0000-4000-8000-000000000003', 'support', 'Import support', true),
  ('b4a30000-0000-4000-8000-000000000004', 'owner', 'Import inactive owner', false);

-- Made-up names on purpose: the imports are data, so nothing here depends on what her flavours or stock are called.
insert into public.products(id, name, short_name, price_cents, kind, allergens) values
  ('imp-a', 'IM Cookie A', 'IM-A', 10000, 'Permanent', 'Wheat'),
  ('imp-b', 'IM Cookie B', 'IM-B', 10000, 'Permanent', 'Wheat, Milk'),
  ('imp-c', 'IM Cookie C', 'IM-C', 8000, 'Rotating', 'Wheat'),
  ('imp-d', 'IM Cookie D', 'IM-D', 9000, 'Permanent', 'Wheat'),
  ('imp-e', 'IM Cookie E', 'IM-E', 9000, 'Permanent', 'Wheat'),
  ('imp-t1', 'IM Twin cookie', 'IM-T1', 7000, 'Permanent', 'Wheat'),
  ('imp-t2', 'im twin cookie ', 'IM-T2', 7000, 'Permanent', 'Wheat');
-- This one has no allergens text, which the owner's flavour save refuses: a price import cannot rewrite it either.
insert into public.products(id, name, short_name, price_cents, kind) values ('imp-x', 'IM No allergens', 'IM-X', 6000, 'Permanent');
insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('im-flour', 'IM Flour', 'g', 'Ingredients', true, 0),
  ('im-sugar', 'IM Sugar', 'g', 'Ingredients', true, 0),
  ('im-butter', 'IM Butter', 'g', 'Ingredients', true, 0),
  ('im-twin1', 'IM Twin', 'g', 'Ingredients', true, 0),
  ('im-twin2', 'im twin ', 'g', 'Ingredients', true, 0),
  ('im-pouch', 'IM Pouch', 'pcs', 'Packaging', true, 0),
  ('im-sticker', 'IM Sticker', 'pcs', 'Packaging', true, 0),
  ('im-card', 'IM Card', 'pcs', 'Packaging', true, 0),
  ('im-box', 'IM Box', 'pcs', 'Packaging', true, 0),
  ('im-wrap', 'IM Wrap', 'pcs', 'Packaging', true, 0);
insert into public.item_prices(id, item_id, price_cents, pack_size, as_of, payload_hash) values
  (gen_random_uuid(), 'im-butter', 5000, 1000, date '2025-01-10', repeat('a', 64)),
  (gen_random_uuid(), 'im-flour', 1000, 1000, date '2025-01-01', repeat('a', 64));
-- Two recipes already exist: B (flour 90 g) and C (flour 100 g, sugar 50 g).
insert into public.recipes(product_id, yield_count) values ('imp-b', 6), ('imp-c', 4);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position, kind) values
  ('imp-b', 'IM Flour', 90, 'g', 0, 'ingredient'),
  ('imp-c', 'IM Flour', 100, 'g', 0, 'ingredient'), ('imp-c', 'IM Sugar', 50, 'g', 1, 'ingredient');
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
-- The packaging rules: the pouch is taken per cookie by the loose rule and the bazaar-sale rule, and per box by the box of 6 (which must stay).
insert into public.packaging_rules(container, box_size, item_id, qty, per, position) values
  ('loose', null, 'im-pouch', 1, 'cookie', 1), ('loose', null, 'im-sticker', 1, 'cookie', 2),
  ('bazaar_sale', null, 'im-pouch', 1, 'cookie', 1), ('bazaar_sale', null, 'im-card', 1, 'container', 2),
  ('box', 6, 'im-box', 1, 'container', 1), ('box', 6, 'im-pouch', 1, 'container', 2),
  ('order', null, 'im-card', 1, 'container', 1);
insert into public.scheduled_events(id, name, starts_on, ends_on, place, rent_cents, active) values
  ('b4a3e000-0000-4000-8000-000000000001', 'IM Bazaar', date '2026-11-01', date '2026-11-03', 'Hall', 500000, true),
  ('b4a3e000-0000-4000-8000-000000000002', 'IM Twin fair', date '2026-10-10', date '2026-10-11', '', 0, true),
  ('b4a3e000-0000-4000-8000-000000000003', 'im twin fair', date '2026-10-10', date '2026-10-11', '', 0, true);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b4a30000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'import outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'import check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- ---- reads (as the fixture owner; an API role cannot read these tables)
create function pg_temp.n_items() returns bigint language sql stable security definer as $$ select count(*) from public.inventory_items $$;
create function pg_temp.n_prices() returns bigint language sql stable security definer as $$ select count(*) from public.item_prices $$;
create function pg_temp.n_recipes() returns bigint language sql stable security definer as $$ select count(*) from public.recipes $$;
create function pg_temp.n_versions() returns bigint language sql stable security definer as $$ select count(*) from public.recipe_versions $$;
create function pg_temp.n_events() returns bigint language sql stable security definer as $$ select count(*) from public.scheduled_events $$;
create function pg_temp.n_audit(a text) returns bigint language sql stable security definer as $$ select count(*) from public.audit_log where action = a $$;
create function pg_temp.n_audit_all() returns bigint language sql stable security definer as $$ select count(*) from public.audit_log $$;
create function pg_temp.item_row(id text) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('name', i.name, 'unit', i.unit, 'category', i.category, 'active', i.active, 'on_hand', i.on_hand,
    'par_level', i.par_level, 'pack_size', i.pack_size, 'pack_label', i.pack_label, 'supplier_id', i.supplier_id,
    'use_by_days', i.use_by_days, 'last_counted', i.last_counted)
    from public.inventory_items i where i.id = $1 $$;
create function pg_temp.item_by_name(n text) returns text language sql stable security definer as $$
  select string_agg(i.id, ',' order by i.id) from public.inventory_items i where i.name = n $$;
create function pg_temp.price_rows(item text) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('price_cents', p.price_cents, 'pack_size', p.pack_size::numeric, 'as_of', p.as_of, 'created_by', p.created_by,
    'id', p.id) order by p.as_of, p.price_cents), '[]'::jsonb) from public.item_prices p where p.item_id = item $$;
create function pg_temp.rule_lines(c text, s integer) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', r.item_id, 'qty', r.qty::text, 'per', r.per, 'pos', r.position) order by r.position), '[]'::jsonb)
    from public.packaging_rules r where r.container = c and r.box_size is not distinct from s $$;
create function pg_temp.recipe_line_kinds(pid text) returns text language sql stable security definer as $$
  select string_agg(i.item_name || ':' || i.kind || ':' || coalesce(i.item_id, 'none'), ',' order by i.position) from public.recipe_ingredients i where i.product_id = pid $$;
create function pg_temp.recipe_head(pid text) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('yield', r.yield_count, 'version', r.version, 'stamp', r.updated_at) from public.recipes r where r.product_id = pid $$;
create function pg_temp.versions_of(pid text) returns text language sql stable security definer as $$
  select string_agg(v.version::text || '=' || v.yield_count::text, ',' order by v.version) from public.recipe_versions v where v.product_id = pid $$;
create function pg_temp.flavour_row(pid text) returns jsonb language sql stable security definer as $$
  select to_jsonb(p) - 'price_cents' - 'updated_at' from public.products p where p.id = pid $$;
create function pg_temp.flavour_price(pid text) returns bigint language sql stable security definer as $$
  select price_cents from public.products where id = pid $$;
create function pg_temp.flavour_stamp(pid text) returns timestamptz language sql stable security definer as $$
  select updated_at from public.products where id = pid $$;
create function pg_temp.event_row(n text, s date) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('id', e.id, 'ends_on', e.ends_on, 'place', e.place, 'rent_cents', e.rent_cents, 'active', e.active, 'event_id', e.event_id)
    from public.scheduled_events e where e.name = n and e.starts_on = s $$;

-- ---- the calls
create function pg_temp.approve(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('hash', p ->> 'hash', 'counts', p -> 'counts') $$;
create function pg_temp.why(p jsonb, n integer) returns text language sql immutable as $$
  select u ->> 'why' from jsonb_array_elements(p -> 'unmatched') u where (u ->> 'n')::integer = n $$;
create function pg_temp.field_of(p jsonb, bucket text, field text) returns text[] language sql immutable as $$
  select coalesce(array_agg(x ->> field order by x ->> field), '{}') from jsonb_array_elements(p -> bucket) x $$;
create function pg_temp.sha(j jsonb) returns text language sql immutable as $$
  select encode(sha256(convert_to(j::text, 'UTF8')), 'hex') $$;
create function pg_temp.pv(kind text, rows jsonb) returns jsonb language plpgsql security invoker as $$
declare r jsonb;
begin
  execute format('select public.preview_import_%s(%L::jsonb)', kind, rows::text) into r;
  return r;
end $$;
create function pg_temp.ap(kind text, rows jsonb, expected jsonb) returns jsonb language plpgsql security invoker as $$
declare r jsonb;
begin
  execute format('select public.apply_import_%s(%L::jsonb, %L::jsonb)', kind, rows::text, expected::text) into r;
  return r;
end $$;
create function pg_temp.pv_expect(actor text, op text, kind text, rows jsonb, wanted text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select public.preview_import_%s(%L::jsonb)', kind, rows::text), wanted);
end $$;
create function pg_temp.ap_expect(actor text, op text, kind text, rows jsonb, expected jsonb, wanted text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select public.apply_import_%s(%L::jsonb, %L::jsonb)', kind, rows::text, expected::text), wanted);
end $$;
-- The refusals every import shares: the rows must be a list, the expected object exactly {hash, counts} of the preview, and a stale one is P0002.
create function pg_temp.shared(a text, kind text, rows jsonb, keys text[]) returns void language plpgsql security invoker as $$
declare p jsonb := pg_temp.pv(kind, rows); ok jsonb := pg_temp.approve(p);
begin
  perform pg_temp.expect(a, 'imp_' || kind || '_rows_empty_list', format('select public.preview_import_%s(%L::jsonb)', kind, '[]'), '22023');
  perform pg_temp.expect(a, 'imp_' || kind || '_rows_null', format('select public.preview_import_%s(null::jsonb)', kind), '22023');
  perform pg_temp.expect(a, 'imp_' || kind || '_rows_not_a_list', format('select public.preview_import_%s(%L::jsonb)', kind, '{"name": "x"}'), '22023');
  perform pg_temp.expect(a, 'imp_' || kind || '_apply_rows_empty_list', format('select public.apply_import_%s(%L::jsonb, %L::jsonb)', kind, '[]', ok::text), '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_null', kind, rows, null, '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_empty', kind, rows, '{}'::jsonb, '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_extra_key', kind, rows, ok || '{"note": 1}'::jsonb, '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_short_hash', kind, rows, jsonb_set(ok, '{hash}', to_jsonb('abc'::text)), '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_upper_hash', kind, rows, jsonb_set(ok, '{hash}', to_jsonb(upper(p ->> 'hash'))), '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_counts_fraction', kind, rows, jsonb_set(ok, '{counts,will_write}', '1.5'::jsonb), '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_counts_missing', kind, rows, jsonb_set(ok, '{counts}', (ok -> 'counts') - 'unchanged'), '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_counts_negative', kind, rows, jsonb_set(ok, '{counts,unmatched}', '-1'::jsonb), '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_expected_counts_text', kind, rows, jsonb_set(ok, '{counts,unmatched}', '"1"'::jsonb), '22023');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_stale_hash', kind, rows, jsonb_set(ok, '{hash}', to_jsonb(repeat('0', 64))), 'P0002');
  perform pg_temp.ap_expect(a, 'imp_' || kind || '_stale_counts', kind, rows, jsonb_set(ok, '{counts,will_write}', to_jsonb((p -> 'counts' ->> 'will_write')::integer + 1)), 'P0002');
  perform pg_temp.assert_ok(a, 'imp_' || kind || '_counts_are_exactly', (select array_agg(k order by k) from jsonb_object_keys(p -> 'counts') k) = keys
    and (select array_agg(k order by k) from jsonb_object_keys(p) k) = case when kind = 'recipes' then array['counts', 'hash', 'rule_removals', 'unchanged', 'unmatched', 'will_write']
                                                                           else array['counts', 'hash', 'unchanged', 'unmatched', 'will_write'] end);
  perform pg_temp.assert_ok(a, 'imp_' || kind || '_hash_is_of_will_write', p ->> 'hash' = pg_temp.sha(p -> 'will_write') and p ->> 'hash' ~ '^[0-9a-f]{64}$');
  perform pg_temp.assert_ok(a, 'imp_' || kind || '_preview_is_repeatable', pg_temp.pv(kind, rows) = p);
end $$;

create function pg_temp.items_rows() returns jsonb language sql immutable as $$ select '[
  {"name": "IM Brown sugar", "unit": "g"},
  {"name": "IM Mailer", "unit": "pcs", "category": "Packaging"},
  {"name": "  im flour ", "unit": "g"},
  {"name": "IM Twin", "unit": "g"},
  {"name": "IM Sugar", "unit": "ml"},
  {"name": "IM Odd unit", "unit": "kg"},
  {"name": "IM Odd category", "unit": "g", "category": "Gadgets"},
  {"name": "   ", "unit": "g"},
  {"name": "IM Extra key", "unit": "g", "note": "x"}
]'::jsonb $$;
create function pg_temp.prices_rows() returns jsonb language sql immutable as $$ select '[
  {"item": "IM Flour", "unit": "g", "price_cents": 1200, "pack_size": 1000, "as_of": "2025-02-01"},
  {"item": " im sugar ", "unit": "g", "price_cents": 500, "pack_size": 1000.0, "as_of": "2025-02-01"},
  {"item": "IM Butter", "unit": "g", "price_cents": 5000, "pack_size": 1000, "as_of": "2025-03-01"},
  {"item": "IM Nothing", "unit": "g", "price_cents": 100, "pack_size": 10, "as_of": "2025-02-01"},
  {"item": "IM Twin", "unit": "g", "price_cents": 100, "pack_size": 10, "as_of": "2025-02-01"},
  {"item": "IM Pouch", "unit": "g", "price_cents": 100, "pack_size": 10, "as_of": "2025-02-01"},
  {"item": "IM Flour", "unit": "g", "price_cents": 0, "pack_size": 1000, "as_of": "2025-02-01"},
  {"item": "IM Wrap", "unit": "pcs", "price_cents": 100, "pack_size": 0, "as_of": "2025-02-01"},
  {"item": "IM Wrap", "unit": "pcs", "price_cents": 100, "pack_size": 10, "as_of": "2999-01-01"},
  {"item": "IM Wrap", "unit": "pcs", "price_cents": 100, "pack_size": 10, "as_of": "next week"},
  {"item": "IM Wrap", "unit": "pcs", "price_cents": 100, "pack_size": 10}
]'::jsonb $$;
create function pg_temp.recipes_rows() returns jsonb language sql immutable as $$ select '[
  {"flavour": "IM Cookie A", "yield": 12, "lines": [
    {"item": "IM Flour", "qty": 300, "unit": "g", "kind": "ingredient"},
    {"item": "IM Sugar", "qty": 120, "unit": "g", "kind": "ingredient"},
    {"item": "IM Pouch", "qty": 1, "unit": "pcs", "kind": "packaging"}]},
  {"flavour": "IM Cookie B", "yield": 6, "lines": [{"item": "IM Flour", "qty": 100, "unit": "g", "kind": "ingredient"}]},
  {"flavour": " im cookie c ", "yield": 4, "lines": [
    {"item": "IM Flour", "qty": 100, "unit": "g", "kind": "ingredient"}, {"item": "im sugar", "qty": 50, "unit": "g", "kind": "ingredient"}]},
  {"flavour": "IM Cookie D", "yield": 5, "lines": [
    {"item": "IM Flour", "qty": 10, "unit": "g", "kind": "ingredient"}, {"item": "IM Ghost", "qty": 1, "unit": "g", "kind": "ingredient"},
    {"item": "IM Sticker", "qty": 1, "unit": "pcs", "kind": "packaging"}]},
  {"flavour": "IM Nothing", "yield": 5, "lines": [{"item": "IM Flour", "qty": 10, "unit": "g", "kind": "ingredient"}]},
  {"flavour": "IM Twin cookie", "yield": 5, "lines": [{"item": "IM Flour", "qty": 10, "unit": "g", "kind": "ingredient"}]},
  {"flavour": "IM Cookie D", "yield": 5, "lines": [{"item": "IM Flour", "qty": 10, "unit": "ml", "kind": "ingredient"}]},
  {"flavour": "IM Cookie D", "yield": 5, "lines": [{"item": "IM Twin", "qty": 1, "unit": "g", "kind": "ingredient"}]},
  {"flavour": "IM Cookie D", "yield": 5, "lines": [{"item": "IM Card", "qty": 1, "unit": "pcs", "kind": "ingredient"}]},
  {"flavour": "IM Cookie E", "yield": 0, "lines": [
    {"item": "IM Flour", "qty": 10, "unit": "g", "kind": "ingredient"}, {"item": "IM Sticker", "qty": 1, "unit": "pcs", "kind": "packaging"}]},
  {"flavour": "IM Cookie E", "yield": 5, "lines": [{"item": "IM Flour", "qty": 10, "unit": "g", "kind": "topping"}]},
  {"flavour": "IM Cookie E", "yield": 5, "lines": [
    {"item": "IM Flour", "qty": 10, "unit": "g", "kind": "ingredient"}, {"item": "IM Flour", "qty": 20, "unit": "g", "kind": "ingredient"}]},
  {"flavour": "IM Cookie E", "yield": 5}
]'::jsonb $$;
create function pg_temp.flavours_rows() returns jsonb language sql immutable as $$ select '[
  {"product": "IM Cookie A", "price_cents": 12000},
  {"product": " im cookie b", "price_cents": 10000},
  {"product": "IM Nothing", "price_cents": 100},
  {"product": "IM Twin cookie", "price_cents": 100},
  {"product": "IM Cookie C", "price_cents": -5},
  {"product": "IM Cookie C", "price_cents": 99.5},
  {"product": "IM Cookie C", "price_cents": 2000000},
  {"product": "IM No allergens", "price_cents": 5000},
  {"product": "IM Cookie C"}
]'::jsonb $$;
create function pg_temp.bookings_rows() returns jsonb language sql immutable as $$ select '[
  {"name": "IM Mall fair", "starts_on": "2026-12-05", "ends_on": "2026-12-07", "place": "Mall", "rent_cents": 300000, "active": true},
  {"name": " im bazaar ", "starts_on": "2026-11-01", "ends_on": "2026-11-03", "place": "Elsewhere", "rent_cents": 1, "active": false},
  {"name": "IM Twin fair", "starts_on": "2026-10-10", "ends_on": "2026-10-11", "place": "", "rent_cents": 0, "active": true},
  {"name": "IM Long fair", "starts_on": "2026-12-01", "ends_on": "2026-12-20", "place": "", "rent_cents": 0, "active": true},
  {"name": "IM Backwards", "starts_on": "2026-12-05", "ends_on": "2026-12-01", "place": "", "rent_cents": 0, "active": true},
  {"name": "IM Free", "starts_on": "2026-12-05", "ends_on": "2026-12-06", "place": "", "rent_cents": -1, "active": true},
  {"name": "   ", "starts_on": "2026-12-05", "ends_on": "2026-12-06", "place": "", "rent_cents": 0, "active": true},
  {"name": "IM Feb", "starts_on": "2026-02-30", "ends_on": "2026-03-01", "place": "", "rent_cents": 0, "active": true},
  {"name": "IM Keys", "starts_on": "2026-12-05"}
]'::jsonb $$;

-- The operator's step, run as postgres before any API role is set.
create function pg_temp.phase_items(a text) returns void language plpgsql security invoker as $$
declare p jsonb; ok jsonb; r jsonb; n0 bigint; au0 bigint; late text;
begin
  n0 := pg_temp.n_items(); au0 := pg_temp.n_audit_all();
  p := pg_temp.pv('items', pg_temp.items_rows());
  perform pg_temp.assert_ok(a, 'imp_items_preview_counts', p -> 'counts' = '{"will_write": 2, "unchanged": 1, "unmatched": 6}'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_items_preview_writes_nothing', pg_temp.n_items() = n0 and pg_temp.n_audit_all() = au0
    and pg_temp.item_by_name('IM Brown sugar') is null and pg_temp.item_by_name('IM Mailer') is null);
  perform pg_temp.assert_ok(a, 'imp_items_will_write_names', pg_temp.field_of(p, 'will_write', 'name') = array['IM Brown sugar', 'IM Mailer']
    and pg_temp.field_of(p, 'will_write', 'category') = array['Ingredients', 'Packaging']);
  perform pg_temp.assert_ok(a, 'imp_items_unchanged_is_the_existing_item', pg_temp.field_of(p, 'unchanged', 'id') = array['im-flour']);
  perform pg_temp.assert_ok(a, 'imp_items_why_several', pg_temp.why(p, 4) = 'several items have that name');
  perform pg_temp.assert_ok(a, 'imp_items_why_unit_differs', pg_temp.why(p, 5) = 'that item is stocked in another unit');
  perform pg_temp.assert_ok(a, 'imp_items_why_unit', pg_temp.why(p, 6) = 'the unit is g, ml or pcs');
  perform pg_temp.assert_ok(a, 'imp_items_why_category', pg_temp.why(p, 7) = 'the category is Ingredients or Packaging');
  perform pg_temp.assert_ok(a, 'imp_items_why_blank_name', pg_temp.why(p, 8) like 'an item name is 1 to 80 characters%');
  perform pg_temp.assert_ok(a, 'imp_items_why_row_keys', pg_temp.why(p, 9) = 'the row carries exactly name, unit and optionally category');
  perform pg_temp.assert_ok(a, 'imp_items_row_not_an_object', pg_temp.why(pg_temp.pv('items', '[1]'::jsonb), 1) = 'the row carries exactly name, unit and optionally category');
  perform pg_temp.assert_ok(a, 'imp_items_row_field_types', pg_temp.why(pg_temp.pv('items', '[{"name": 5, "unit": "g"}]'::jsonb), 1) = 'the row carries exactly name, unit and optionally category');
  perform pg_temp.shared(a, 'items', pg_temp.items_rows(), array['unchanged', 'unmatched', 'will_write']);

  -- the catalogue moved after the preview: the old approval is refused and nothing is written
  ok := pg_temp.approve(p);
  insert into public.inventory_items(id, name, unit, category, active) values ('im-late', 'IM Brown sugar', 'g', 'Ingredients', true);
  perform pg_temp.ap_expect(a, 'imp_items_moved_after_preview', 'items', pg_temp.items_rows(), ok, 'P0002');
  perform pg_temp.assert_ok(a, 'imp_items_moved_wrote_nothing', pg_temp.n_items() = n0 + 1 and pg_temp.item_by_name('IM Mailer') is null and pg_temp.n_audit_all() = au0);
  delete from public.inventory_items where id = 'im-late';
  p := pg_temp.pv('items', pg_temp.items_rows());
  perform pg_temp.assert_ok(a, 'imp_items_preview_after_cleanup_matches', pg_temp.approve(p) = ok);

  -- approved as it stands: the two are written, the six that could not be matched are not, and the call is one audit row
  r := pg_temp.ap('items', pg_temp.items_rows(), ok);
  perform pg_temp.assert_ok(a, 'imp_items_apply_writes_exactly_will_write', pg_temp.n_items() = n0 + 2 and r -> 'will_write' = p -> 'will_write'
    and pg_temp.field_of(r, 'will_write', 'id') = (select array_agg(i.id order by i.id) from public.inventory_items i where i.name in ('IM Brown sugar', 'IM Mailer'))
    and pg_temp.item_by_name('IM Odd unit') is null and pg_temp.item_by_name('IM Odd category') is null and pg_temp.item_by_name('IM Extra key') is null);
  perform pg_temp.assert_ok(a, 'imp_items_made_as_the_owner_would',
    pg_temp.item_row((select i.id from public.inventory_items i where i.name = 'IM Brown sugar')) =
      '{"name": "IM Brown sugar", "unit": "g", "category": "Ingredients", "active": true, "on_hand": 0.000, "par_level": 0.000, "pack_size": null, "pack_label": "", "supplier_id": null, "use_by_days": null, "last_counted": null}'::jsonb
    and pg_temp.item_row((select i.id from public.inventory_items i where i.name = 'IM Mailer')) ->> 'category' = 'Packaging');
  perform pg_temp.assert_ok(a, 'imp_items_nothing_is_priced', not exists (select 1 from public.item_prices where item_id in (select i.id from public.inventory_items i where i.name in ('IM Brown sugar', 'IM Mailer'))));
  perform pg_temp.assert_ok(a, 'imp_items_one_audit_row', pg_temp.n_audit('import.items') = 1 and pg_temp.n_audit_all() = au0 + 1
    and exists (select 1 from public.audit_log l where l.action = 'import.items'
      and l.detail = jsonb_build_object('counts', p -> 'counts', 'hash', p ->> 'hash', 'will_write', p -> 'will_write')));
  -- the same call again writes nothing
  p := pg_temp.pv('items', pg_temp.items_rows());
  perform pg_temp.assert_ok(a, 'imp_items_reapply_preview', p -> 'counts' = '{"will_write": 0, "unchanged": 3, "unmatched": 6}'::jsonb);
  r := pg_temp.ap('items', pg_temp.items_rows(), pg_temp.approve(p));
  perform pg_temp.assert_ok(a, 'imp_items_reapply_writes_nothing', pg_temp.n_items() = n0 + 2 and pg_temp.n_audit('import.items') = 1 and pg_temp.n_audit_all() = au0 + 1
    and r -> 'counts' = p -> 'counts');
  -- the unchanged entry shows its category too, so a workbook that says otherwise is visible
  perform pg_temp.assert_ok(a, 'imp_items_unchanged_shows_category',
    pg_temp.pv('items', '[{"name": "IM Flour", "unit": "g", "category": "Packaging"}]'::jsonb) -> 'unchanged'
      = '[{"id": "im-flour", "name": "IM Flour", "unit": "g", "category": "Ingredients"}]'::jsonb);
  -- a name with an invisible space is not the name it looks like: btrim strips only the ASCII space, so each of these would have made a second
  -- item beside the first. A no-break space after an existing name, a zero-width space, an ideographic space, a byte-order mark, a name that is
  -- not composed (e + a combining accent) are all listed; the composed one (a real e with an accent) is written.
  p := pg_temp.pv('items', '[{"name": "IM Flour\u00a0", "unit": "g"}, {"name": "IM Zero\u200bwidth", "unit": "g"}, {"name": "IM Ideo\u3000space", "unit": "g"},
    {"name": "IM Bom\ufeff", "unit": "g"}, {"name": "IM Cafe\u0301", "unit": "g"}, {"name": "IM Caf\u00e9", "unit": "g"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_items_invisible_names_are_listed', p -> 'counts' = '{"will_write": 1, "unchanged": 0, "unmatched": 5}'::jsonb
    and pg_temp.field_of(p, 'will_write', 'name') = array[E'IM Caf\u00e9']
    and (select bool_and(pg_temp.why(p, n) = 'a name has an invisible space or is not in composed form') from generate_series(1, 5) n));
  -- the same item twice in one call is made once
  p := pg_temp.pv('items', '[{"name": "IM Dupe", "unit": "g"}, {"name": "im dupe", "unit": "g"}, {"name": "IM Dupe", "unit": "ml"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_items_same_name_twice', p -> 'counts' = '{"will_write": 1, "unchanged": 1, "unmatched": 1}'::jsonb
    and pg_temp.why(p, 3) = 'that item is stocked in another unit' and pg_temp.item_by_name('IM Dupe') is null);
end $$;

create function pg_temp.phase_prices(a text) returns void language plpgsql security invoker as $$
declare p jsonb; ok jsonb; r jsonb; n0 bigint; au0 bigint; flour_id uuid;
begin
  n0 := pg_temp.n_prices(); au0 := pg_temp.n_audit_all();
  p := pg_temp.pv('prices', pg_temp.prices_rows());
  perform pg_temp.assert_ok(a, 'imp_prices_preview_counts', p -> 'counts' = '{"will_write": 2, "unchanged": 1, "unmatched": 8}'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_prices_preview_writes_nothing', pg_temp.n_prices() = n0 and pg_temp.n_audit_all() = au0);
  perform pg_temp.assert_ok(a, 'imp_prices_will_write_items', pg_temp.field_of(p, 'will_write', 'item_id') = array['im-flour', 'im-sugar']
    and pg_temp.field_of(p, 'unchanged', 'item_id') = array['im-butter']);
  perform pg_temp.assert_ok(a, 'imp_prices_why_none', pg_temp.why(p, 4) = 'no stock item has that name');
  perform pg_temp.assert_ok(a, 'imp_prices_why_several', pg_temp.why(p, 5) = 'several stock items have that name');
  perform pg_temp.assert_ok(a, 'imp_prices_why_unit', pg_temp.why(p, 6) = 'that item is stocked in another unit');
  perform pg_temp.assert_ok(a, 'imp_prices_why_cents', pg_temp.why(p, 7) = 'a price is whole centavos from 1 to 1,000,000 pesos');
  perform pg_temp.assert_ok(a, 'imp_prices_why_pack', pg_temp.why(p, 8) like 'a pack size is above 0%');
  perform pg_temp.assert_ok(a, 'imp_prices_why_future', pg_temp.why(p, 9) = 'the date is in the future');
  perform pg_temp.assert_ok(a, 'imp_prices_why_date', pg_temp.why(p, 10) = 'the date is a real day written YYYY-MM-DD');
  perform pg_temp.assert_ok(a, 'imp_prices_why_row_keys', pg_temp.why(p, 11) = 'the row carries exactly item, unit, price_cents, pack_size and as_of');
  perform pg_temp.assert_ok(a, 'imp_prices_row_field_types', pg_temp.why(pg_temp.pv('prices', '[{"item": "IM Flour", "unit": "g", "price_cents": "5", "pack_size": 1, "as_of": "2025-02-01"}]'::jsonb), 1)
    = 'the row carries exactly item, unit, price_cents, pack_size and as_of');
  perform pg_temp.shared(a, 'prices', pg_temp.prices_rows(), array['unchanged', 'unmatched', 'will_write']);

  ok := pg_temp.approve(p);
  r := pg_temp.ap('prices', pg_temp.prices_rows(), ok);
  flour_id := md5('import:price:im-flour|2025-02-01|1200|1000')::uuid;
  perform pg_temp.assert_ok(a, 'imp_prices_apply_writes_exactly_will_write', pg_temp.n_prices() = n0 + 2 and r -> 'will_write' = p -> 'will_write'
    and exists (select 1 from public.item_prices x where x.id = flour_id and x.item_id = 'im-flour' and x.price_cents = 1200 and x.pack_size = 1000 and x.as_of = date '2025-02-01')
    and exists (select 1 from public.item_prices x where x.id = md5('import:price:im-sugar|2025-02-01|500|1000')::uuid and x.item_id = 'im-sugar' and x.pack_size = 1000));
  perform pg_temp.assert_ok(a, 'imp_prices_no_creator', not exists (select 1 from public.item_prices x where x.id in (flour_id, md5('import:price:im-sugar|2025-02-01|500|1000')::uuid) and x.created_by is not null));
  perform pg_temp.assert_ok(a, 'imp_prices_history_is_kept', jsonb_array_length(pg_temp.price_rows('im-flour')) = 2 and pg_temp.price_rows('im-butter') -> 0 ->> 'price_cents' = '5000'
    and jsonb_array_length(pg_temp.price_rows('im-butter')) = 1);
  perform pg_temp.assert_ok(a, 'imp_prices_one_audit_row', pg_temp.n_audit('import.prices') = 1
    and exists (select 1 from public.audit_log l where l.action = 'import.prices'
      and l.detail = jsonb_build_object('counts', p -> 'counts', 'hash', p ->> 'hash', 'will_write', p -> 'will_write')));
  p := pg_temp.pv('prices', pg_temp.prices_rows());
  perform pg_temp.assert_ok(a, 'imp_prices_reapply_preview', p -> 'counts' = '{"will_write": 0, "unchanged": 3, "unmatched": 8}'::jsonb);
  r := pg_temp.ap('prices', pg_temp.prices_rows(), pg_temp.approve(p));
  perform pg_temp.assert_ok(a, 'imp_prices_reapply_writes_nothing', pg_temp.n_prices() = n0 + 2 and pg_temp.n_audit('import.prices') = 1);
  -- the same price and pack as the latest row, on another date, is unchanged; a changed price is a new dated row and the old one stays
  p := pg_temp.pv('prices', '[{"item": "IM Flour", "unit": "g", "price_cents": 1200, "pack_size": 1000, "as_of": "2025-06-01"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_prices_same_price_later_date_is_unchanged', p -> 'counts' = '{"will_write": 0, "unchanged": 1, "unmatched": 0}'::jsonb);
  p := pg_temp.pv('prices', '[{"item": "IM Flour", "unit": "g", "price_cents": 1200, "pack_size": 500, "as_of": "2025-06-01"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_prices_other_pack_is_a_change', p -> 'counts' = '{"will_write": 1, "unchanged": 0, "unmatched": 0}'::jsonb);
  p := pg_temp.pv('prices', '[{"item": "IM Flour", "unit": "g", "price_cents": 1300, "pack_size": 1000, "as_of": "2025-06-01"}, {"item": "IM Flour", "unit": "g", "price_cents": 1300, "pack_size": 1000, "as_of": "2025-06-02"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_prices_same_price_twice_in_one_call', p -> 'counts' = '{"will_write": 1, "unchanged": 1, "unmatched": 0}'::jsonb);
  r := pg_temp.ap('prices', '[{"item": "IM Flour", "unit": "g", "price_cents": 1300, "pack_size": 1000, "as_of": "2025-06-01"}, {"item": "IM Flour", "unit": "g", "price_cents": 1300, "pack_size": 1000, "as_of": "2025-06-02"}]'::jsonb, pg_temp.approve(p));
  perform pg_temp.assert_ok(a, 'imp_prices_changed_price_is_a_new_row', jsonb_array_length(pg_temp.price_rows('im-flour')) = 3);
  -- an item name with an invisible space is listed, not matched (and not read as another item)
  p := pg_temp.pv('prices', '[{"item": "IM Flour\u00a0", "unit": "g", "price_cents": 1500, "pack_size": 1000, "as_of": "2025-07-01"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_prices_invisible_name_is_listed', p -> 'counts' = '{"will_write": 0, "unchanged": 0, "unmatched": 1}'::jsonb
    and pg_temp.why(p, 1) = 'a name has an invisible space or is not in composed form');
  -- one item, one day, one price: another price on a day that already has one is listed (the usual price would fall to an arbitrary id), and so
  -- is the second of two prices for one new day inside one call; the same price again is still the same row
  p := pg_temp.pv('prices', '[{"item": "IM Butter", "unit": "g", "price_cents": 5100, "pack_size": 1000, "as_of": "2025-01-10"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_prices_same_day_other_price', p -> 'counts' = '{"will_write": 0, "unchanged": 0, "unmatched": 1}'::jsonb
    and pg_temp.why(p, 1) = 'that item already has a price dated that day');
  p := pg_temp.pv('prices', '[{"item": "IM Wrap", "unit": "pcs", "price_cents": 100, "pack_size": 10, "as_of": "2025-04-01"},
    {"item": "im wrap", "unit": "pcs", "price_cents": 200, "pack_size": 10, "as_of": "2025-04-01"},
    {"item": "IM Wrap", "unit": "pcs", "price_cents": 100, "pack_size": 10, "as_of": "2025-04-01"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_prices_same_day_twice_in_one_call', p -> 'counts' = '{"will_write": 1, "unchanged": 1, "unmatched": 1}'::jsonb
    and pg_temp.why(p, 2) = 'that item already has a price dated that day' and pg_temp.field_of(p, 'will_write', 'price_cents') = array['100']);
end $$;

create function pg_temp.phase_recipes(a text) returns void language plpgsql security invoker as $$
declare p jsonb; ok jsonb; r jsonb; nr bigint; nv bigint; au0 bigint; head_c jsonb; w jsonb;
begin
  nr := pg_temp.n_recipes(); nv := pg_temp.n_versions(); au0 := pg_temp.n_audit_all(); head_c := pg_temp.recipe_head('imp-c');
  p := pg_temp.pv('recipes', pg_temp.recipes_rows());
  perform pg_temp.assert_ok(a, 'imp_recipes_preview_counts', p -> 'counts' = '{"will_write": 2, "unchanged": 1, "unmatched": 10, "rule_removals": 2}'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_recipes_preview_writes_nothing', pg_temp.n_recipes() = nr and pg_temp.n_versions() = nv and pg_temp.n_audit_all() = au0
    and pg_temp.rule_lines('loose', null) = '[{"item": "im-pouch", "qty": "1.000", "per": "cookie", "pos": 1}, {"item": "im-sticker", "qty": "1.000", "per": "cookie", "pos": 2}]'::jsonb
    and pg_temp.rule_lines('bazaar_sale', null) -> 0 ->> 'item' = 'im-pouch' and pg_temp.recipe_head('imp-b') ->> 'version' = '1');
  perform pg_temp.assert_ok(a, 'imp_recipes_will_write_flavours', pg_temp.field_of(p, 'will_write', 'product_id') = array['imp-a', 'imp-b']
    and pg_temp.field_of(p, 'unchanged', 'product_id') = array['imp-c']);
  select x into w from jsonb_array_elements(p -> 'will_write') x where x ->> 'product_id' = 'imp-b';
  perform pg_temp.assert_ok(a, 'imp_recipes_replaces_vn', w ->> 'action' = 'replaces v1');
  select x into w from jsonb_array_elements(p -> 'will_write') x where x ->> 'product_id' = 'imp-a';
  perform pg_temp.assert_ok(a, 'imp_recipes_new_recipe_action', w ->> 'action' = 'new');
  perform pg_temp.assert_ok(a, 'imp_recipes_names_each_removal',
    (select array_agg((x ->> 'container') || ':' || (x ->> 'item_id') order by x ->> 'container') from jsonb_array_elements(p -> 'rule_removals') x) = array['bazaar_sale:im-pouch', 'loose:im-pouch']
    and w -> 'rule_removals' = p -> 'rule_removals');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_product_none', pg_temp.why(p, 5) = 'no flavour has that name');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_product_several', pg_temp.why(p, 6) = 'several flavours have that name');
  perform pg_temp.assert_ok(a, 'imp_recipes_one_bad_line_holds_the_recipe', pg_temp.why(p, 4) = 'the recipe is held whole: line 2: no stock item has that name');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_line_unit', pg_temp.why(p, 7) = 'the recipe is held whole: line 1: the item is stocked in another unit');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_line_several', pg_temp.why(p, 8) = 'the recipe is held whole: line 1: several stock items have that name');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_ingredient_on_a_rule', pg_temp.why(p, 9) like 'that item is taken by a packaging rule%');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_yield', pg_temp.why(p, 10) like 'the yield is a whole number%');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_kind', pg_temp.why(p, 11) = 'the kind of a line is ingredient or packaging');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_duplicate', pg_temp.why(p, 12) = 'an ingredient is listed twice');
  perform pg_temp.assert_ok(a, 'imp_recipes_why_row_keys', pg_temp.why(p, 13) = 'the row carries exactly flavour, yield and lines of item, qty, unit and kind');
  perform pg_temp.assert_ok(a, 'imp_recipes_line_keys', pg_temp.why(pg_temp.pv('recipes', '[{"flavour": "IM Cookie E", "yield": 5, "lines": [{"item": "IM Flour", "qty": 1, "unit": "g"}]}]'::jsonb), 1)
    = 'the row carries exactly flavour, yield and lines of item, qty, unit and kind');
  perform pg_temp.shared(a, 'recipes', pg_temp.recipes_rows(), array['rule_removals', 'unchanged', 'unmatched', 'will_write']);

  -- a recipe changed after the preview: the approval is refused and nothing is written, no rule is touched
  ok := pg_temp.approve(p);
  update public.recipes set yield_count = 7 where product_id = 'imp-c';
  update public.recipe_ingredients set qty = 91 where product_id = 'imp-b';
  perform pg_temp.ap_expect(a, 'imp_recipes_moved_after_preview', 'recipes', pg_temp.recipes_rows(), ok, 'P0002');
  perform pg_temp.assert_ok(a, 'imp_recipes_moved_wrote_nothing', pg_temp.n_recipes() = nr and pg_temp.n_versions() = nv and pg_temp.n_audit_all() = au0
    and jsonb_array_length(pg_temp.rule_lines('loose', null)) = 2);
  update public.recipes set yield_count = 4 where product_id = 'imp-c';
  update public.recipe_ingredients set qty = 90 where product_id = 'imp-b';
  perform pg_temp.assert_ok(a, 'imp_recipes_preview_after_cleanup_matches', pg_temp.approve(pg_temp.pv('recipes', pg_temp.recipes_rows())) = ok);

  r := pg_temp.ap('recipes', pg_temp.recipes_rows(), ok);
  perform pg_temp.assert_ok(a, 'imp_recipes_apply_writes_exactly_will_write', r -> 'will_write' = p -> 'will_write' and pg_temp.n_recipes() = nr + 1
    and not exists (select 1 from public.recipes where product_id in ('imp-d', 'imp-e')));
  perform pg_temp.assert_ok(a, 'imp_recipes_new_recipe_lines', pg_temp.recipe_head('imp-a') ->> 'yield' = '12' and pg_temp.recipe_head('imp-a') ->> 'version' = '1'
    and pg_temp.recipe_line_kinds('imp-a') = 'IM Flour:ingredient:im-flour,IM Sugar:ingredient:im-sugar,IM Pouch:packaging:im-pouch');
  perform pg_temp.assert_ok(a, 'imp_recipes_replacing_keeps_the_old_version', pg_temp.recipe_head('imp-b') ->> 'version' = '2' and pg_temp.versions_of('imp-b') = '1=6,2=6'
    and pg_temp.recipe_line_kinds('imp-b') = 'IM Flour:ingredient:im-flour'
    and (select v.lines from public.recipe_versions v where v.product_id = 'imp-b' and v.version = 1) = '[{"qty": 90.000, "name": "IM Flour", "unit": "g"}]'::jsonb
    and (select v.lines from public.recipe_versions v where v.product_id = 'imp-b' and v.version = 2) = '[{"qty": 100, "name": "IM Flour", "unit": "g"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_recipes_unchanged_is_not_touched', pg_temp.recipe_head('imp-c') = head_c and pg_temp.versions_of('imp-c') = '1=4');
  perform pg_temp.assert_ok(a, 'imp_recipes_pouch_leaves_loose_and_bazaar_sale',
    pg_temp.rule_lines('loose', null) = '[{"item": "im-sticker", "qty": "1.000", "per": "cookie", "pos": 1}]'::jsonb
    and pg_temp.rule_lines('bazaar_sale', null) = '[{"item": "im-card", "qty": "1.000", "per": "container", "pos": 1}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_recipes_the_boxes_pouch_stays',
    pg_temp.rule_lines('box', 6) = '[{"item": "im-box", "qty": "1.000", "per": "container", "pos": 1}, {"item": "im-pouch", "qty": "1.000", "per": "container", "pos": 2}]'::jsonb
    and pg_temp.rule_lines('order', null) = '[{"item": "im-card", "qty": "1.000", "per": "container", "pos": 1}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_recipes_a_held_recipe_removes_nothing', pg_temp.rule_lines('loose', null) -> 0 ->> 'item' = 'im-sticker');
  perform pg_temp.assert_ok(a, 'imp_recipes_audit_rows', pg_temp.n_audit('import.recipes') = 1 and pg_temp.n_audit('packaging.rule_saved') = 2
    and exists (select 1 from public.audit_log l where l.action = 'import.recipes'
      and l.detail = jsonb_build_object('counts', p -> 'counts', 'hash', p ->> 'hash', 'will_write', p -> 'will_write')));
  p := pg_temp.pv('recipes', pg_temp.recipes_rows());
  perform pg_temp.assert_ok(a, 'imp_recipes_reapply_preview', p -> 'counts' = '{"will_write": 0, "unchanged": 3, "unmatched": 10, "rule_removals": 0}'::jsonb);
  r := pg_temp.ap('recipes', pg_temp.recipes_rows(), pg_temp.approve(p));
  perform pg_temp.assert_ok(a, 'imp_recipes_reapply_writes_nothing', pg_temp.n_versions() = nv + 2 and pg_temp.n_audit('import.recipes') = 1 and pg_temp.n_audit('packaging.rule_saved') = 2
    and pg_temp.recipe_head('imp-b') ->> 'version' = '2');
  -- an import cannot get past the double-take guards the owner meets: the sticker (loose, per cookie) is taken off its rule only for a recipe that is written
  p := pg_temp.pv('recipes', '[{"flavour": "IM Cookie D", "yield": 5, "lines": [{"item": "IM Sticker", "qty": 1, "unit": "pcs", "kind": "packaging"}, {"item": "IM Flour", "qty": 5, "unit": "g", "kind": "ingredient"}]}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_recipes_sticker_removal_is_named', p -> 'counts' = '{"will_write": 1, "unchanged": 0, "unmatched": 0, "rule_removals": 1}'::jsonb
    and p -> 'rule_removals' -> 0 ->> 'container' = 'loose' and p -> 'rule_removals' -> 0 ->> 'item_id' = 'im-sticker');
  perform pg_temp.assert_ok(a, 'imp_recipes_preview_again_removed_nothing', jsonb_array_length(pg_temp.rule_lines('loose', null)) = 1);
  -- the same flavour twice in one call: the second is listed, so the sticker taken off its rule for the first cannot be left behind by a second
  -- recipe that does not use it (the flavour is the same however it is written)
  p := pg_temp.pv('recipes', '[{"flavour": "IM Cookie D", "yield": 5, "lines": [{"item": "IM Sticker", "qty": 1, "unit": "pcs", "kind": "packaging"}, {"item": "IM Flour", "qty": 5, "unit": "g", "kind": "ingredient"}]},
    {"flavour": " im cookie d ", "yield": 5, "lines": [{"item": "IM Flour", "qty": 6, "unit": "g", "kind": "ingredient"}]}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_recipes_flavour_twice', p -> 'counts' = '{"will_write": 1, "unchanged": 0, "unmatched": 1, "rule_removals": 1}'::jsonb
    and pg_temp.why(p, 2) = 'that flavour is already in this call' and pg_temp.field_of(p, 'will_write', 'product_id') = array['imp-d']);
  -- a flavour or a line item with an invisible space is listed, and the line is named
  p := pg_temp.pv('recipes', '[{"flavour": "IM Cookie A\u00a0", "yield": 5, "lines": [{"item": "IM Flour", "qty": 5, "unit": "g", "kind": "ingredient"}]},
    {"flavour": "IM Cookie D", "yield": 5, "lines": [{"item": "IM Flour", "qty": 5, "unit": "g", "kind": "ingredient"}, {"item": "IM Sugar\u200b", "qty": 1, "unit": "g", "kind": "ingredient"}]}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_recipes_invisible_flavour_is_listed', p -> 'counts' = '{"will_write": 0, "unchanged": 0, "unmatched": 2, "rule_removals": 0}'::jsonb
    and pg_temp.why(p, 1) = 'a name has an invisible space or is not in composed form');
  perform pg_temp.assert_ok(a, 'imp_recipes_invisible_line_item_holds_the_recipe',
    pg_temp.why(p, 2) = 'the recipe is held whole: line 2: a name has an invisible space or is not in composed form');
end $$;

create function pg_temp.phase_flavours(a text) returns void language plpgsql security invoker as $$
declare p jsonb; ok jsonb; r jsonb; au0 bigint; row_a jsonb; stamp_b timestamptz; row_x jsonb;
begin
  au0 := pg_temp.n_audit_all(); row_a := pg_temp.flavour_row('imp-a'); stamp_b := pg_temp.flavour_stamp('imp-b'); row_x := pg_temp.flavour_row('imp-x');
  p := pg_temp.pv('flavours', pg_temp.flavours_rows());
  perform pg_temp.assert_ok(a, 'imp_flavours_preview_counts', p -> 'counts' = '{"will_write": 1, "unchanged": 1, "unmatched": 7}'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_flavours_preview_writes_nothing', pg_temp.flavour_price('imp-a') = 10000 and pg_temp.n_audit_all() = au0);
  perform pg_temp.assert_ok(a, 'imp_flavours_will_write', pg_temp.field_of(p, 'will_write', 'product_id') = array['imp-a'] and (p -> 'will_write' -> 0 ->> 'price_cents') = '12000'
    and (p -> 'will_write' -> 0 ->> 'from_cents') = '10000' and pg_temp.field_of(p, 'unchanged', 'product_id') = array['imp-b']);
  perform pg_temp.assert_ok(a, 'imp_flavours_why_none', pg_temp.why(p, 3) = 'no flavour has that name');
  perform pg_temp.assert_ok(a, 'imp_flavours_why_several', pg_temp.why(p, 4) = 'several flavours have that name');
  perform pg_temp.assert_ok(a, 'imp_flavours_why_range', pg_temp.why(p, 5) = 'flavour number out of range' and pg_temp.why(p, 6) = 'flavour number out of range'
    and pg_temp.why(p, 7) = 'flavour number out of range');
  perform pg_temp.assert_ok(a, 'imp_flavours_why_owner_save_refuses_the_row', pg_temp.why(p, 8) = 'flavour text out of bounds');
  perform pg_temp.assert_ok(a, 'imp_flavours_why_row_keys', pg_temp.why(p, 9) = 'the row carries exactly product and price_cents');
  perform pg_temp.shared(a, 'flavours', pg_temp.flavours_rows(), array['unchanged', 'unmatched', 'will_write']);
  ok := pg_temp.approve(p);
  update public.products set price_cents = 11000 where id = 'imp-b';
  perform pg_temp.ap_expect(a, 'imp_flavours_moved_after_preview', 'flavours', pg_temp.flavours_rows(), ok, 'P0002');
  perform pg_temp.assert_ok(a, 'imp_flavours_moved_wrote_nothing', pg_temp.flavour_price('imp-a') = 10000 and pg_temp.n_audit_all() = au0);
  update public.products set price_cents = 10000 where id = 'imp-b';
  stamp_b := pg_temp.flavour_stamp('imp-b');
  r := pg_temp.ap('flavours', pg_temp.flavours_rows(), ok);
  perform pg_temp.assert_ok(a, 'imp_flavours_apply_writes_exactly_will_write', r -> 'will_write' = p -> 'will_write' and pg_temp.flavour_price('imp-a') = 12000
    and pg_temp.flavour_price('imp-b') = 10000 and pg_temp.flavour_price('imp-c') = 8000 and pg_temp.flavour_price('imp-x') = 6000);
  perform pg_temp.assert_ok(a, 'imp_flavours_only_the_price_changes', pg_temp.flavour_row('imp-a') = row_a and pg_temp.flavour_stamp('imp-b') = stamp_b and pg_temp.flavour_row('imp-x') = row_x);
  perform pg_temp.assert_ok(a, 'imp_flavours_one_audit_row', pg_temp.n_audit('import.flavour_prices') = 1 and pg_temp.n_audit_all() = au0 + 1
    and exists (select 1 from public.audit_log l where l.action = 'import.flavour_prices'
      and l.detail = jsonb_build_object('counts', p -> 'counts', 'hash', p ->> 'hash', 'will_write', p -> 'will_write')));
  p := pg_temp.pv('flavours', pg_temp.flavours_rows());
  perform pg_temp.assert_ok(a, 'imp_flavours_reapply_preview', p -> 'counts' = '{"will_write": 0, "unchanged": 2, "unmatched": 7}'::jsonb);
  r := pg_temp.ap('flavours', pg_temp.flavours_rows(), pg_temp.approve(p));
  perform pg_temp.assert_ok(a, 'imp_flavours_reapply_writes_nothing', pg_temp.n_audit('import.flavour_prices') = 1 and pg_temp.flavour_price('imp-a') = 12000);
  -- a price of zero is a price the owner can set, so the import can too
  p := pg_temp.pv('flavours', '[{"product": "IM Cookie E", "price_cents": 0}, {"product": "im cookie e", "price_cents": 150}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_flavours_same_product_twice_in_one_call', p -> 'counts' = '{"will_write": 2, "unchanged": 0, "unmatched": 0}'::jsonb);
  p := pg_temp.pv('flavours', '[{"product": "IM Cookie A\u00a0", "price_cents": 100}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_flavours_invisible_name_is_listed', p -> 'counts' = '{"will_write": 0, "unchanged": 0, "unmatched": 1}'::jsonb
    and pg_temp.why(p, 1) = 'a name has an invisible space or is not in composed form');
end $$;

create function pg_temp.phase_bookings(a text) returns void language plpgsql security invoker as $$
declare p jsonb; ok jsonb; r jsonb; n0 bigint; au0 bigint; kept jsonb;
begin
  n0 := pg_temp.n_events(); au0 := pg_temp.n_audit_all(); kept := pg_temp.event_row('IM Bazaar', date '2026-11-01');
  p := pg_temp.pv('bookings', pg_temp.bookings_rows());
  perform pg_temp.assert_ok(a, 'imp_bookings_preview_counts', p -> 'counts' = '{"will_write": 1, "unchanged": 1, "unmatched": 7}'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_bookings_preview_writes_nothing', pg_temp.n_events() = n0 and pg_temp.n_audit_all() = au0);
  perform pg_temp.assert_ok(a, 'imp_bookings_will_write', pg_temp.field_of(p, 'will_write', 'name') = array['IM Mall fair']
    and pg_temp.field_of(p, 'will_write', 'id') = array[md5('import:booking:im mall fair|2026-12-05|2026-12-07')::uuid::text]
    and pg_temp.field_of(p, 'unchanged', 'id') = array['b4a3e000-0000-4000-8000-000000000001']);
  perform pg_temp.assert_ok(a, 'imp_bookings_why_several', pg_temp.why(p, 3) = 'several bookings have that name and dates');
  perform pg_temp.assert_ok(a, 'imp_bookings_why_span', pg_temp.why(p, 4) = 'a booking ends on or after it starts, and lasts at most 15 days'
    and pg_temp.why(p, 5) = 'a booking ends on or after it starts, and lasts at most 15 days');
  perform pg_temp.assert_ok(a, 'imp_bookings_why_rent', pg_temp.why(p, 6) = 'rent is whole centavos from 0 to 1,000,000 pesos');
  perform pg_temp.assert_ok(a, 'imp_bookings_why_name', pg_temp.why(p, 7) like 'the name is 1 to 80 characters%');
  perform pg_temp.assert_ok(a, 'imp_bookings_why_date', pg_temp.why(p, 8) = 'a date is not a real date');
  perform pg_temp.assert_ok(a, 'imp_bookings_why_row_keys', pg_temp.why(p, 9) = 'the row carries exactly name, starts_on, ends_on, place, rent_cents and active');
  perform pg_temp.shared(a, 'bookings', pg_temp.bookings_rows(), array['unchanged', 'unmatched', 'will_write']);
  ok := pg_temp.approve(p);
  insert into public.scheduled_events(id, name, starts_on, ends_on, place, rent_cents, active)
    values ('b4a3e000-0000-4000-8000-000000000009', 'IM Mall fair', date '2026-12-05', date '2026-12-07', 'Mall', 1, true);
  perform pg_temp.ap_expect(a, 'imp_bookings_moved_after_preview', 'bookings', pg_temp.bookings_rows(), ok, 'P0002');
  perform pg_temp.assert_ok(a, 'imp_bookings_moved_wrote_nothing', pg_temp.n_events() = n0 + 1 and pg_temp.n_audit_all() = au0);
  delete from public.scheduled_events where id = 'b4a3e000-0000-4000-8000-000000000009';
  r := pg_temp.ap('bookings', pg_temp.bookings_rows(), ok);
  perform pg_temp.assert_ok(a, 'imp_bookings_apply_writes_exactly_will_write', r -> 'will_write' = p -> 'will_write' and pg_temp.n_events() = n0 + 1
    and pg_temp.event_row('IM Mall fair', date '2026-12-05') = jsonb_build_object('id', md5('import:booking:im mall fair|2026-12-05|2026-12-07')::uuid, 'ends_on', '2026-12-07',
      'place', 'Mall', 'rent_cents', 300000, 'active', true, 'event_id', null));
  perform pg_temp.assert_ok(a, 'imp_bookings_the_existing_one_is_kept', pg_temp.event_row('IM Bazaar', date '2026-11-01') = kept
    and kept ->> 'place' = 'Hall' and kept ->> 'rent_cents' = '500000');
  perform pg_temp.assert_ok(a, 'imp_bookings_one_audit_row', pg_temp.n_audit('import.bookings') = 1 and pg_temp.n_audit_all() = au0 + 1
    and exists (select 1 from public.audit_log l where l.action = 'import.bookings'
      and l.detail = jsonb_build_object('counts', p -> 'counts', 'hash', p ->> 'hash', 'will_write', p -> 'will_write')));
  p := pg_temp.pv('bookings', pg_temp.bookings_rows());
  perform pg_temp.assert_ok(a, 'imp_bookings_reapply_preview', p -> 'counts' = '{"will_write": 0, "unchanged": 2, "unmatched": 7}'::jsonb);
  r := pg_temp.ap('bookings', pg_temp.bookings_rows(), pg_temp.approve(p));
  perform pg_temp.assert_ok(a, 'imp_bookings_reapply_writes_nothing', pg_temp.n_events() = n0 + 1 and pg_temp.n_audit('import.bookings') = 1);
  -- an unchanged booking shows the place, the rent and the switch it keeps, so a workbook that says otherwise is visible
  p := pg_temp.pv('bookings', '[{"name": "IM Bazaar", "starts_on": "2026-11-01", "ends_on": "2026-11-03", "place": "Elsewhere", "rent_cents": 1, "active": false}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_bookings_unchanged_shows_what_it_keeps', p -> 'unchanged'
    = '[{"id": "b4a3e000-0000-4000-8000-000000000001", "name": "IM Bazaar", "starts_on": "2026-11-01", "ends_on": "2026-11-03", "place": "Hall", "rent_cents": 500000, "active": true}]'::jsonb);
  p := pg_temp.pv('bookings', '[{"name": "IM Bazaar\u00a0", "starts_on": "2026-11-01", "ends_on": "2026-11-03", "place": "", "rent_cents": 0, "active": true}]'::jsonb);
  perform pg_temp.assert_ok(a, 'imp_bookings_invisible_name_is_listed', p -> 'counts' = '{"will_write": 0, "unchanged": 0, "unmatched": 1}'::jsonb
    and pg_temp.why(p, 1) = 'a name has an invisible space or is not in composed form');
end $$;

-- None of these holds EXECUTE for an API role, service_role included.
create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array[
    'preview_import_items(jsonb)', 'apply_import_items(jsonb,jsonb)', 'preview_import_prices(jsonb)', 'apply_import_prices(jsonb,jsonb)',
    'preview_import_recipes(jsonb)', 'apply_import_recipes(jsonb,jsonb)', 'preview_import_flavours(jsonb)', 'apply_import_flavours(jsonb,jsonb)',
    'preview_import_bookings(jsonb)', 'apply_import_bookings(jsonb,jsonb)',
    'run_import_items(jsonb)', 'run_import_prices(jsonb)', 'run_import_recipes(jsonb)', 'run_import_flavours(jsonb)', 'run_import_bookings(jsonb)',
    'write_stock_item(jsonb,timestamptz)', 'write_item_price(jsonb)', 'write_recipe(jsonb,timestamptz)', 'write_flavour(text,jsonb,timestamptz)',
    'write_scheduled_event(jsonb,timestamptz)', 'import_result(jsonb,jsonb,jsonb,jsonb)', 'import_expected_ok(jsonb,text[])', 'import_keys_ok(jsonb,text[],text[])', 'import_name_ok(text)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden import call succeeded: anon / %', split_part(f, '(', 1);
    end if;
    if has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') or has_function_privilege('service_role', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden import call succeeded: an API role / %', split_part(f, '(', 1);
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'import_functions_operator_only');
end $$;

-- Every role, the active owner too, is refused each of the ten.
create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
declare k text;
begin
  foreach k in array array['items', 'prices', 'recipes', 'flavours', 'bookings'] loop
    perform pg_temp.expect(actor, 'imp_denied_preview_' || k, format('select public.preview_import_%s(%L::jsonb)', k, '[]'), '42501');
    perform pg_temp.expect(actor, 'imp_denied_apply_' || k, format('select public.apply_import_%s(%L::jsonb, %L::jsonb)', k, '[]', '{}'), '42501');
  end loop;
end $$;

grant execute on function
  pg_temp.n_items(), pg_temp.n_prices(), pg_temp.n_recipes(), pg_temp.n_versions(), pg_temp.n_events(), pg_temp.n_audit(text), pg_temp.n_audit_all(),
  pg_temp.item_row(text), pg_temp.item_by_name(text), pg_temp.price_rows(text), pg_temp.rule_lines(text, integer), pg_temp.recipe_line_kinds(text),
  pg_temp.recipe_head(text), pg_temp.versions_of(text), pg_temp.flavour_row(text), pg_temp.flavour_price(text), pg_temp.flavour_stamp(text),
  pg_temp.event_row(text, date), pg_temp.approve(jsonb), pg_temp.why(jsonb, integer), pg_temp.field_of(jsonb, text, text), pg_temp.sha(jsonb),
  pg_temp.pv(text, jsonb), pg_temp.ap(text, jsonb, jsonb), pg_temp.pv_expect(text, text, text, jsonb, text), pg_temp.ap_expect(text, text, text, jsonb, jsonb, text),
  pg_temp.shared(text, text, jsonb, text[]), pg_temp.items_rows(), pg_temp.prices_rows(), pg_temp.recipes_rows(), pg_temp.flavours_rows(), pg_temp.bookings_rows(),
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.phase_items(text), pg_temp.phase_prices(text), pg_temp.phase_recipes(text), pg_temp.phase_flavours(text), pg_temp.phase_bookings(text),
  pg_temp.assert_acl(), pg_temp.assert_refused(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

select pg_temp.phase_items('operator');
select pg_temp.phase_prices('operator');
select pg_temp.phase_recipes('operator');
select pg_temp.phase_flavours('operator');
select pg_temp.phase_bookings('operator');

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_refused('anon');
reset role;

set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_refused('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_refused('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_refused('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_refused('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
