-- B3a links by identity with real SQL roles; all data rolls back.
--
-- recipe lines and supplier prices point at their stock item by id (item_id), found for rows that predate the id by an exact name
-- match that is previewed and counted before it is applied:
--
--   preview_identity_links()   what would be linked, what could not be (no match, or several), what differs; writes nothing
--   apply_identity_links(c)    links exactly the single matches the operator previewed (c is the preview's counts, refused when
--                              the rows moved since), adds the missing version snapshots, validates the production foreign key
--
-- Both are run by hand by the operator as postgres: NO API role holds EXECUTE (an owner, a helper, support, anon and service_role
-- are all refused).
-- The harness neutralises each `-- rule:` line of apply_identity_links in
-- supabase/migrations/20260101005500_identity_links.sql in turn (scripts/test-db-security.py, LINK_MUTATIONS) and requires the
-- named case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b3c00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b3c00000-0000-4000-8000-000000000001', 'owner', 'Link owner', true),
  ('b3c00000-0000-4000-8000-000000000002', 'helper', 'Link helper', true),
  ('b3c00000-0000-4000-8000-000000000003', 'support', 'Link support', true),
  ('b3c00000-0000-4000-8000-000000000004', 'owner', 'Link inactive owner', false);

insert into public.products(id, name, short_name, price_cents, kind) values
  ('ilp1', 'IL cookie one', 'IL-1', 100, 'cookie'),
  ('ilp2', 'IL cookie two', 'IL-2', 100, 'cookie'),
  ('ilp3', 'IL cookie three', 'IL-3', 100, 'cookie');
insert into public.suppliers(id, name) values ('ils1', 'IL supplier one'), ('ils2', 'IL supplier two');
insert into public.inventory_items(id, name, unit, active) values
  ('il-flour', 'IL Flour', 'g', true),
  ('il-milk', 'IL Milk', 'ml', true),
  ('il-twin-a', 'IL Twin', 'g', true),
  ('il-twin-b', '  il twin ', 'g', true),
  ('il-off', 'IL Off', 'g', false),
  ('il-egg', 'IL Egg', 'pcs', true);
insert into public.recipes(product_id, yield_count) values ('ilp1', 10), ('ilp2', 6), ('ilp3', 4);
-- Written as the fixture owner, never through an API role, and with no item id: what a recipe looked like before this.
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('ilp1', 'IL Flour', 300, 'g', 0), ('ilp1', 'IL Ghost', 5, 'g', 1), ('ilp1', 'IL Twin', 2, 'g', 2), ('ilp1', 'IL Milk', 100, 'g', 3),
  ('ilp2', '  IL FLOUR ', 150, 'g', 0), ('ilp2', 'IL Off', 10, 'g', 1);
-- ilp3 is already linked and already has its version row.
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position, item_id) values ('ilp3', 'IL Egg', 2, 'pcs', 0, 'il-egg');
insert into public.recipe_versions(product_id, version, yield_count, lines)
values ('ilp3', 1, 4, '[{"name": "IL Egg", "qty": 2, "unit": "pcs"}]'::jsonb);
insert into public.supplier_prices(id, supplier_id, item_name, pack_label, price_cents, pack_size) values
  ('b3a00000-0000-4000-8000-000000000001', 'ils1', 'IL Flour', '1 kg', 12000, null),
  ('b3a00000-0000-4000-8000-000000000002', 'ils1', 'IL Milk', '1 L', 9000, 1000),
  ('b3a00000-0000-4000-8000-000000000003', 'ils1', 'IL Nothing', '1 pack', 100, null),
  ('b3a00000-0000-4000-8000-000000000004', 'ils1', 'IL Twin', '2 kg', 500, null);
insert into public.supplier_prices(id, supplier_id, item_name, pack_label, price_cents, pack_size, item_id)
values ('b3a00000-0000-4000-8000-000000000005', 'ils2', 'IL Egg', '30 pcs', 7000, null, 'il-egg');
-- Production: one record on a version that has its row, one on an old version that never had one (data from before the key). The
-- key refuses such a row at once, so the fixture drops it, writes the row, and puts it back the way the migration made it.
insert into public.production_records(id, kind, product_id, qty, recipe_version, at, payload_hash)
values ('b3d00000-0000-4000-8000-000000000001', 'dough', 'ilp3', 4, 1, now(), repeat('a', 64));
alter table public.production_records drop constraint production_records_recipe_version_fk;
insert into public.production_records(id, kind, product_id, qty, recipe_version, at, payload_hash)
values ('b3d00000-0000-4000-8000-000000000002', 'batch', 'ilp1', 6, 7, now(), repeat('b', 64));
alter table public.production_records add constraint production_records_recipe_version_fk
  foreign key (product_id, recipe_version) references public.recipe_versions (product_id, version) not valid;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b3c00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
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
    raise exception 'link outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'link check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- Everything the links touch, as one hash: equal before and after means nothing was written.
create function pg_temp.state_hash() returns text language sql stable security definer as $$
  select md5(coalesce((select string_agg(x.t, '|' order by x.t) from (
    select ri::text as t from public.recipe_ingredients ri
    union all select sp::text from public.supplier_prices sp
    union all select rv::text from public.recipe_versions rv
    union all select al::text from public.audit_log al
    union all select pr::text from public.production_records pr
    union all select c.convalidated::text from pg_constraint c where c.conname = 'production_records_recipe_version_fk') x), '')) $$;
create function pg_temp.line_links() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('p', i.product_id, 'name', i.item_name, 'item', i.item_id) order by i.product_id, i.position), '[]'::jsonb)
    from public.recipe_ingredients i $$;
create function pg_temp.price_links() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', p.item_name, 'supplier', p.supplier_id, 'item', p.item_id) order by p.supplier_id, p.item_name), '[]'::jsonb)
    from public.supplier_prices p $$;
create function pg_temp.version_keys() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(v.product_id || ':' || v.version order by v.product_id, v.version), '[]'::jsonb) from public.recipe_versions v $$;
create function pg_temp.snapshot(p text, n integer) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('yield', v.yield_count, 'lines', v.lines) from public.recipe_versions v where v.product_id = p and v.version = n $$;
create function pg_temp.audit_applied() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(a.detail order by a.id), '[]'::jsonb) from public.audit_log a where a.action = 'links.applied' $$;
create function pg_temp.volatility(f text) returns text language sql stable security definer as $$
  select p.provolatile::text from pg_proc p where p.oid = f::regprocedure $$;
create function pg_temp.run(statement text) returns void language plpgsql security definer as $$
begin execute statement; end $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['preview_identity_links()', 'apply_identity_links(jsonb)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden link call succeeded: anon / %', f;
    end if;
    if has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden link call succeeded: authenticated / %', f;
    end if;
    if has_function_privilege('service_role', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden link call succeeded: service_role / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('link_acl', 'anon', 'link_rpcs_have_no_api_execute');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'link_preview', 'select public.preview_identity_links()', '42501');
  perform pg_temp.expect(actor, 'link_apply', 'select public.apply_identity_links(''{}''::jsonb)', '42501');
end $$;

-- Runs as the operator (postgres): the only role that may call them.
create function pg_temp.phase_operator(a text) returns void language plpgsql security invoker as $$
declare h text; pre jsonb; post jsonb; counts jsonb;
begin
  h := pg_temp.state_hash();
  pre := public.preview_identity_links();
  counts := pre -> 'counts';
  perform pg_temp.assert_ok(a, 'link_preview_counts', counts = '{"recipe_lines": 4, "supplier_prices": 2, "recipe_versions": 2}'::jsonb);
  perform pg_temp.assert_ok(a, 'link_preview_recipe_lines', pre -> 'recipe_lines' = '{
    "linked": 1,
    "unmatched": [{"product_id": "ilp1", "name": "IL Ghost"}],
    "ambiguous": [{"product_id": "ilp1", "name": "IL Twin"}],
    "unit_differs": [{"product_id": "ilp1", "name": "IL Milk", "line_unit": "g", "item_unit": "ml"}]}'::jsonb);
  perform pg_temp.assert_ok(a, 'link_preview_supplier_prices', pre -> 'supplier_prices' = '{
    "linked": 1,
    "unmatched": [{"id": "b3a00000-0000-4000-8000-000000000003", "supplier_id": "ils1", "name": "IL Nothing"}],
    "ambiguous": [{"id": "b3a00000-0000-4000-8000-000000000004", "supplier_id": "ils1", "name": "IL Twin"}],
    "no_pack_size": [{"id": "b3a00000-0000-4000-8000-000000000005", "supplier_id": "ils2", "name": "IL Egg", "pack_label": "30 pcs"},
                     {"id": "b3a00000-0000-4000-8000-000000000001", "supplier_id": "ils1", "name": "IL Flour", "pack_label": "1 kg"}]}'::jsonb);
  perform pg_temp.assert_ok(a, 'link_preview_production', pre -> 'production' = '{
    "records": 2, "fk_valid": false,
    "missing_version": [{"id": "b3d00000-0000-4000-8000-000000000002", "product_id": "ilp1", "recipe_version": 7}]}'::jsonb);
  perform pg_temp.assert_ok(a, 'link_preview_has_exactly_its_keys',
    (select array_agg(k order by k) from jsonb_object_keys(pre) k) = array['counts', 'production', 'recipe_lines', 'supplier_prices']);
  perform pg_temp.assert_ok(a, 'link_preview_writes_nothing', pg_temp.state_hash() = h and pg_temp.price_links() @> '[{"item": null}]'::jsonb);
  perform pg_temp.assert_ok(a, 'link_preview_repeats', public.preview_identity_links() = pre);
  perform pg_temp.assert_ok(a, 'link_preview_is_stable', pg_temp.volatility('public.preview_identity_links()') = 's'
    and pg_temp.volatility('public.apply_identity_links(jsonb)') = 'v');

  -- the key already checks a new dough or batch row: a version with no row is refused, and a row with no version is not asked
  perform pg_temp.expect(a, 'link_fk_refuses_unknown_version',
    'insert into public.production_records(id, kind, product_id, qty, recipe_version, at, payload_hash) values (''b3d00000-0000-4000-8000-000000000003'', ''batch'', ''ilp1'', 1, 8, now(), repeat(''c'', 64))', '23503');
  perform pg_temp.expect(a, 'link_fk_leaves_null_version_alone',
    'insert into public.production_records(id, kind, qty, at, payload_hash) values (''b3d00000-0000-4000-8000-000000000004'', ''pack'', 1, now(), repeat(''d'', 64))', '00000');

  -- apply: a preview that is out of date is refused and nothing moves
  h := pg_temp.state_hash();
  perform pg_temp.expect(a, 'link_apply_stale',
    'select public.apply_identity_links(''{"recipe_lines": 3, "supplier_prices": 2, "recipe_versions": 2}''::jsonb)', 'P0002');
  perform pg_temp.expect(a, 'link_apply_stale_versions',
    'select public.apply_identity_links(''{"recipe_lines": 4, "supplier_prices": 2, "recipe_versions": 0}''::jsonb)', 'P0002');
  perform pg_temp.assert_ok(a, 'link_apply_stale_linked_nothing', pg_temp.state_hash() = h);
  -- and the counts it is given must be exactly the three whole numbers
  perform pg_temp.expect(a, 'link_expected_null', 'select public.apply_identity_links(null)', '22023');
  perform pg_temp.expect(a, 'link_expected_array', 'select public.apply_identity_links(''[4, 2, 2]''::jsonb)', '22023');
  perform pg_temp.expect(a, 'link_expected_empty', 'select public.apply_identity_links(''{}''::jsonb)', '22023');
  perform pg_temp.expect(a, 'link_expected_missing_key', 'select public.apply_identity_links(''{"recipe_lines": 4, "supplier_prices": 2}''::jsonb)', '22023');
  perform pg_temp.expect(a, 'link_expected_extra_key',
    'select public.apply_identity_links(''{"recipe_lines": 4, "supplier_prices": 2, "recipe_versions": 2, "other": 1}''::jsonb)', '22023');
  perform pg_temp.expect(a, 'link_expected_string',
    'select public.apply_identity_links(''{"recipe_lines": "4", "supplier_prices": 2, "recipe_versions": 2}''::jsonb)', '22023');
  perform pg_temp.expect(a, 'link_expected_fraction',
    'select public.apply_identity_links(''{"recipe_lines": 4.5, "supplier_prices": 2, "recipe_versions": 2}''::jsonb)', '22023');
  perform pg_temp.expect(a, 'link_expected_negative',
    'select public.apply_identity_links(''{"recipe_lines": 4, "supplier_prices": -2, "recipe_versions": 2}''::jsonb)', '22023');
  perform pg_temp.assert_ok(a, 'link_refusals_changed_nothing', pg_temp.state_hash() = h);

  -- the right counts: exactly the single matches are linked, nothing else
  post := public.apply_identity_links(counts);
  perform pg_temp.assert_ok(a, 'link_apply_links_single_matches', pg_temp.line_links() = '[
    {"p": "ilp1", "name": "IL Flour", "item": "il-flour"},
    {"p": "ilp1", "name": "IL Ghost", "item": null},
    {"p": "ilp1", "name": "IL Twin", "item": null},
    {"p": "ilp1", "name": "IL Milk", "item": "il-milk"},
    {"p": "ilp2", "name": "  IL FLOUR ", "item": "il-flour"},
    {"p": "ilp2", "name": "IL Off", "item": "il-off"},
    {"p": "ilp3", "name": "IL Egg", "item": "il-egg"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'link_apply_links_prices', pg_temp.price_links() = '[
    {"name": "IL Flour", "supplier": "ils1", "item": "il-flour"},
    {"name": "IL Milk", "supplier": "ils1", "item": "il-milk"},
    {"name": "IL Nothing", "supplier": "ils1", "item": null},
    {"name": "IL Twin", "supplier": "ils1", "item": null},
    {"name": "IL Egg", "supplier": "ils2", "item": "il-egg"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'link_apply_never_copies_a_pack_size',
    (select count(*) from public.supplier_prices p where p.pack_size is not null) = 1
    and (select p.pack_size from public.supplier_prices p where p.id = 'b3a00000-0000-4000-8000-000000000002') = 1000);
  perform pg_temp.assert_ok(a, 'link_apply_adds_the_current_versions', pg_temp.version_keys() = '["ilp1:1", "ilp2:1", "ilp3:1"]'::jsonb);
  perform pg_temp.assert_ok(a, 'link_apply_snapshot_is_the_recipe', pg_temp.snapshot('ilp1', 1) = '{"yield": 10, "lines": [
    {"name": "IL Flour", "qty": 300, "unit": "g"}, {"name": "IL Ghost", "qty": 5, "unit": "g"},
    {"name": "IL Twin", "qty": 2, "unit": "g"}, {"name": "IL Milk", "qty": 100, "unit": "g"}]}'::jsonb
    and pg_temp.snapshot('ilp2', 1) = '{"yield": 6, "lines": [{"name": "  IL FLOUR ", "qty": 150, "unit": "g"}, {"name": "IL Off", "qty": 10, "unit": "g"}]}'::jsonb);
  perform pg_temp.assert_ok(a, 'link_apply_returns_the_preview_after',
    post -> 'counts' = '{"recipe_lines": 0, "supplier_prices": 0, "recipe_versions": 0}'::jsonb
    and post = public.preview_identity_links()
    and post -> 'recipe_lines' -> 'linked' = '5'::jsonb and post -> 'supplier_prices' -> 'linked' = '3'::jsonb
    and jsonb_array_length(post -> 'recipe_lines' -> 'unmatched') = 1 and jsonb_array_length(post -> 'recipe_lines' -> 'ambiguous') = 1);
  perform pg_temp.assert_ok(a, 'link_apply_writes_one_audit_row',
    pg_temp.audit_applied() = jsonb_build_array(counts || '{"fk_validated": false}'::jsonb));
  -- the old version no record can name is still missing, so the key is left unvalidated
  perform pg_temp.assert_ok(a, 'link_apply_leaves_the_key_unvalidated_while_a_version_is_missing',
    post -> 'production' -> 'fk_valid' = 'false'::jsonb
    and post -> 'production' -> 'missing_version' = '[{"id": "b3d00000-0000-4000-8000-000000000002", "product_id": "ilp1", "recipe_version": 7}]'::jsonb);

  -- a second apply with the new counts changes nothing (not even an audit row)
  h := pg_temp.state_hash();
  perform pg_temp.expect(a, 'link_apply_again', 'select public.apply_identity_links(''{"recipe_lines": 0, "supplier_prices": 0, "recipe_versions": 0}''::jsonb)', '00000');
  perform pg_temp.assert_ok(a, 'link_apply_again_changes_nothing', pg_temp.state_hash() = h);
  perform pg_temp.expect(a, 'link_apply_again_old_counts', 'select public.apply_identity_links(' || quote_literal(counts::text) || '::jsonb)', 'P0002');

  -- once no record lacks its version the key is validated, in the same call, and the call says so
  perform pg_temp.run('delete from public.production_records where id = ''b3d00000-0000-4000-8000-000000000002''');
  perform pg_temp.assert_ok(a, 'link_preview_sees_the_clean_records',
    public.preview_identity_links() -> 'production' = '{"records": 1, "missing_version": [], "fk_valid": false}'::jsonb);
  post := public.apply_identity_links('{"recipe_lines": 0, "supplier_prices": 0, "recipe_versions": 0}'::jsonb);
  perform pg_temp.assert_ok(a, 'link_apply_validates_the_key',
    post -> 'production' -> 'fk_valid' = 'true'::jsonb and public.preview_identity_links() -> 'production' -> 'fk_valid' = 'true'::jsonb);
  perform pg_temp.assert_ok(a, 'link_apply_audits_the_validation',
    pg_temp.audit_applied() = jsonb_build_array(counts || '{"fk_validated": false}'::jsonb,
      '{"recipe_lines": 0, "supplier_prices": 0, "recipe_versions": 0, "fk_validated": true}'::jsonb));
  perform pg_temp.expect(a, 'link_fk_still_refuses_unknown_version',
    'insert into public.production_records(id, kind, product_id, qty, recipe_version, at, payload_hash) values (''b3d00000-0000-4000-8000-000000000005'', ''dough'', ''ilp1'', 1, 9, now(), repeat(''e'', 64))', '23503');
  perform pg_temp.expect(a, 'link_fk_accepts_a_snapshotted_version',
    'insert into public.production_records(id, kind, product_id, qty, recipe_version, at, payload_hash) values (''b3d00000-0000-4000-8000-000000000006'', ''dough'', ''ilp1'', 1, 1, now(), repeat(''f'', 64))', '00000');
  h := pg_temp.state_hash();
  perform pg_temp.expect(a, 'link_apply_after_validation', 'select public.apply_identity_links(''{"recipe_lines": 0, "supplier_prices": 0, "recipe_versions": 0}''::jsonb)', '00000');
  perform pg_temp.assert_ok(a, 'link_apply_after_validation_changes_nothing', pg_temp.state_hash() = h);
end $$;

grant execute on function
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.state_hash(), pg_temp.line_links(), pg_temp.price_links(), pg_temp.version_keys(), pg_temp.snapshot(text, integer),
  pg_temp.audit_applied(), pg_temp.volatility(text), pg_temp.run(text),
  pg_temp.assert_acl(), pg_temp.assert_refused(text), pg_temp.phase_operator(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

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

-- the database role service_role itself (not a claim under authenticated): no EXECUTE either
set local role service_role;
select pg_temp.assert_refused('service_role');
reset role;

select pg_temp.phase_operator('operator');

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
