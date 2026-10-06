-- B3a (final-plan.md version 2), database half: links by identity.
--
-- A recipe line and a supplier price name their stock item by TEXT (`item_name`), and the text has to match by luck: a rename or
-- a typo breaks the link without a sound. This migration gives both a stable pointer, `item_id`, and keeps every recipe version
-- so a record of production can point at the exact version it was made on.
--
--   recipe_ingredients.item_id   the stock item of the line (nullable: lines saved before this carry none until applied)
--   supplier_prices.item_id      the stock item of the price (same)
--   supplier_prices.pack_size    the size of THIS supplier's pack, in the item's unit (nullable). It is never copied from the
--                                item: a different supplier sells a different pack
--   recipe_versions              holds EVERY version from now on, the current one included (it held only replaced versions).
--                                The migration backfills one snapshot for each recipe's current version: a plain copy of its
--                                lines, in the shape save_recipe already keeps, not a match
--   production_records           (product_id, recipe_version) must name a snapshot. Added NOT VALID: a new row is checked now,
--                                the rows already there are checked when apply_identity_links validates the constraint
--
-- This migration does NOT fill any item_id. Rows that predate the id are matched to a stock item by name in a step the operator
-- runs by hand, previews and counts first:
--
--   preview_identity_links()   what would be linked, what could not be (no match, or several), what differs. Writes nothing.
--   apply_identity_links(c)    links exactly the single matches the operator previewed (c is the preview's `counts`; refused when
--                              the rows moved since), adds any missing current-version snapshot, validates the production key
--                              once no record lacks its version. Re-runnable: with the new counts (all zero) it changes nothing.
--
-- Neither function has a grant to any API role: the operator runs them as postgres. A row matches when EXACTLY ONE stock item,
-- active or not, has the same name ignoring case and surrounding spaces; no match and several matches are listed, never linked.
--
-- save_recipe, get_recipes, save_supplier_price and get_stock_catalogue are redefined whole (each change is marked B3a):
--   save_recipe             a line must name exactly one stock item (new rule line-item-unknown), stores its item_id, and keeps
--                           recipe_versions complete
--   get_recipes             each current line carries its item_id; the history still lists only the replaced versions
--   save_supplier_price     an optional pack_size key (a number above 0 or null); stores the item_id of the item it names
--   get_stock_catalogue     each price carries item_id and pack_size
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it (as in A3, A4 and B2).

alter table public.recipe_ingredients
  add column item_id text references public.inventory_items (id);
create index recipe_ingredients_item_id_idx on public.recipe_ingredients (item_id);

alter table public.supplier_prices
  add column item_id text references public.inventory_items (id),
  add column pack_size numeric(12, 3) check (pack_size is null or pack_size > 0);
create index supplier_prices_item_id_idx on public.supplier_prices (item_id);

-- Every recipe's current version gets its snapshot: the same {name, qty, unit} lines, in the same order, that save_recipe keeps.
insert into public.recipe_versions (product_id, version, yield_count, lines)
select r.product_id, r.version, r.yield_count,
       coalesce((select jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                                  order by i.position, i.id)
                   from public.recipe_ingredients i where i.product_id = r.product_id), '[]'::jsonb)
  from public.recipes r
 on conflict (product_id, version) do nothing;

-- Checked for every new dough or batch record at once; the rows already there are checked by apply_identity_links. A record with
-- no recipe version (a pack, a sale, a discard) is not asked: the key is the default MATCH SIMPLE.
alter table public.production_records
  add constraint production_records_recipe_version_fk
  foreign key (product_id, recipe_version) references public.recipe_versions (product_id, version) not valid;

/**
 * What apply_identity_links would do now, and what it could not. Writes nothing. A row matches when exactly one stock item has
 * the same name ignoring case and surrounding spaces. `counts` is what the operator hands back to apply_identity_links.
 */
create or replace function public.preview_identity_links()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lines    jsonb;
  v_prices   jsonb;
  v_prod     jsonb;
  v_n_lines  bigint;
  v_n_prices bigint;
  v_n_ver    bigint;
begin
  select jsonb_build_object(
           'linked', count(*) filter (where l.item_id is not null),
           'unmatched', coalesce(jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.item_name)
                                           order by l.product_id, l.position, l.item_name, l.id)
                                 filter (where l.item_id is null and l.matches = 0), '[]'::jsonb),
           'ambiguous', coalesce(jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.item_name)
                                           order by l.product_id, l.position, l.item_name, l.id)
                                 filter (where l.item_id is null and l.matches > 1), '[]'::jsonb),
           'unit_differs', coalesce(jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.item_name,
                                                                 'line_unit', l.unit, 'item_unit', l.item_unit)
                                              order by l.product_id, l.position, l.item_name, l.id)
                                    filter (where l.item_unit is not null and l.unit <> l.item_unit), '[]'::jsonb)),
         count(*) filter (where l.item_id is null and l.single_item is not null)
    into v_lines, v_n_lines
    from (select i.id, i.product_id, i.item_name, i.unit, i.position, i.item_id, m.matches, m.single_item, u.unit as item_unit
            from public.recipe_ingredients i
            cross join lateral (select count(*) as matches, case when count(*) = 1 then min(t.id) end as single_item
                                  from public.inventory_items t
                                 where lower(btrim(t.name)) = lower(btrim(i.item_name))) m
            left join public.inventory_items u on u.id = coalesce(i.item_id, m.single_item)) l;

  select jsonb_build_object(
           'linked', count(*) filter (where p.item_id is not null),
           'unmatched', coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'supplier_id', p.supplier_id, 'name', p.item_name)
                                           order by p.item_name, p.supplier_id, p.id)
                                 filter (where p.item_id is null and p.matches = 0), '[]'::jsonb),
           'ambiguous', coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'supplier_id', p.supplier_id, 'name', p.item_name)
                                           order by p.item_name, p.supplier_id, p.id)
                                 filter (where p.item_id is null and p.matches > 1), '[]'::jsonb),
           'no_pack_size', coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'supplier_id', p.supplier_id, 'name', p.item_name,
                                                                 'pack_label', p.pack_label)
                                              order by p.item_name, p.supplier_id, p.id)
                                    filter (where p.pack_size is null and coalesce(p.item_id, p.single_item) is not null), '[]'::jsonb)),
         count(*) filter (where p.item_id is null and p.single_item is not null)
    into v_prices, v_n_prices
    from (select s.id, s.supplier_id, s.item_name, s.pack_label, s.pack_size, s.item_id, m.matches, m.single_item
            from public.supplier_prices s
            cross join lateral (select count(*) as matches, case when count(*) = 1 then min(t.id) end as single_item
                                  from public.inventory_items t
                                 where lower(btrim(t.name)) = lower(btrim(s.item_name))) m) p;

  select count(*) into v_n_ver
    from public.recipes r
   where not exists (select 1 from public.recipe_versions v where v.product_id = r.product_id and v.version = r.version);

  select jsonb_build_object(
           'records', count(*),
           'missing_version', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'product_id', x.product_id, 'recipe_version', x.recipe_version)
                                                 order by x.product_id, x.recipe_version, x.id) filter (where x.missing), '[]'::jsonb),
           'fk_valid', coalesce((select c.convalidated from pg_catalog.pg_constraint c
                                  where c.conrelid = 'public.production_records'::regclass
                                    and c.conname = 'production_records_recipe_version_fk'), false))
    into v_prod
    from (select r.id, r.product_id, r.recipe_version,
                 r.recipe_version is not null and not exists (select 1 from public.recipe_versions v
                                                               where v.product_id = r.product_id and v.version = r.recipe_version) as missing
            from public.production_records r where r.kind in ('dough', 'batch')) x;

  return jsonb_build_object(
    'counts', jsonb_build_object('recipe_lines', v_n_lines, 'supplier_prices', v_n_prices, 'recipe_versions', v_n_ver),
    'recipe_lines', v_lines,
    'supplier_prices', v_prices,
    'production', v_prod);
end;
$$;
-- No API role holds EXECUTE, service_role included: the operator runs it as postgres.
revoke execute on function public.preview_identity_links() from public, anon, authenticated, service_role;

/**
 * Links exactly the single matches the operator previewed. p_expected is the `counts` object of that preview: exactly
 * recipe_lines, supplier_prices and recipe_versions, each a whole number of 0 or more. The counts are worked out again under the
 * catalogue's lock and the call is refused if they differ. It then sets item_id on the single-match rows that have none, adds any
 * missing current-version snapshot, validates the production key once no dough or batch record lacks its version row, and writes
 * one audit row when it changed or validated anything. Returns the preview as it stands afterwards.
 */
create or replace function public.apply_identity_links(p_expected jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad       boolean;
  v_pre       jsonb;
  v_post      jsonb;
  v_changed   numeric;
  v_validated boolean := false;
begin
  v_bad := case
    when p_expected is null or jsonb_typeof(p_expected) <> 'object' then true
    else (select array_agg(k order by k) from jsonb_object_keys(p_expected) k)
           is distinct from array['recipe_lines', 'recipe_versions', 'supplier_prices']
         or exists (select 1 from jsonb_each(p_expected) e
                     where case when jsonb_typeof(e.value) <> 'number' then true
                                else (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric) or (e.value #>> '{}')::numeric < 0 end)
    end;
  if v_bad then -- rule:link-expected
    raise exception 'the expected counts are exactly recipe_lines, supplier_prices and recipe_versions, each a whole number' using errcode = '22023';
  end if;

  -- The catalogue's lock (save_recipe, record_production and the stock saves take it first), so nothing moves between the count
  -- and the change.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_pre := public.preview_identity_links();
  v_bad := p_expected is distinct from (v_pre -> 'counts');
  if v_bad then -- rule:link-count-changed
    raise exception 'the rows changed since the preview: preview again' using errcode = 'P0002';
  end if;

  update public.recipe_ingredients as i set item_id = m.single_item
    from (select r.id, x.single_item
            from public.recipe_ingredients r
            cross join lateral (select case when count(*) = 1 then min(t.id) end as single_item
                                  from public.inventory_items t
                                 where lower(btrim(t.name)) = lower(btrim(r.item_name))) x
           where r.item_id is null) m
   where i.id = m.id and m.single_item is not null;
  update public.supplier_prices as p set item_id = m.single_item
    from (select s.id, x.single_item
            from public.supplier_prices s
            cross join lateral (select case when count(*) = 1 then min(t.id) end as single_item
                                  from public.inventory_items t
                                 where lower(btrim(t.name)) = lower(btrim(s.item_name))) x
           where s.item_id is null) m
   where p.id = m.id and m.single_item is not null;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
  select r.product_id, r.version, r.yield_count,
         coalesce((select jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                                    order by i.position, i.id)
                     from public.recipe_ingredients i where i.product_id = r.product_id), '[]'::jsonb)
    from public.recipes r
   where not exists (select 1 from public.recipe_versions v where v.product_id = r.product_id and v.version = r.version);

  v_post := public.preview_identity_links();
  if v_post -> 'production' -> 'fk_valid' = 'false'::jsonb and jsonb_array_length(v_post -> 'production' -> 'missing_version') = 0 then
    alter table public.production_records validate constraint production_records_recipe_version_fk;
    v_validated := true;
  end if;

  select sum(e.value::numeric) into v_changed from jsonb_each_text(p_expected) e;
  if v_validated or v_changed > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'links.applied', 'identity_links', 'all', p_expected || jsonb_build_object('fk_validated', v_validated));
  end if;
  return public.preview_identity_links();
end;
$$;
revoke execute on function public.apply_identity_links(jsonb) from public, anon, authenticated, service_role;

create or replace function public.get_recipes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the recipes' using errcode = '42501';
  end if;
  -- B3a: each current line carries its item_id; recipe_versions now holds the current version too, so the history leaves it out.
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'yield', r.yield_count, 'version', r.version, 'updated_at', r.updated_at,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', i.qty, 'unit', i.unit, 'item_id', i.item_id)
                                          order by i.position, i.id)
                           from public.recipe_ingredients i where i.product_id = r.product_id), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(jsonb_build_object('version', h.version, 'yield', h.yield_count, 'lines', h.lines)
                                            order by h.version)
                             from public.recipe_versions h where h.product_id = r.product_id and h.version <> r.version), '[]'::jsonb)
    ) order by r.product_id), '[]'::jsonb)
    into v_out
    from public.recipes r;
  return v_out;
end;
$$;
revoke execute on function public.get_recipes() from public, anon, authenticated;
grant execute on function public.get_recipes() to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one recipe. The body is exactly: product_id, yield,
 * lines (each exactly name, qty, unit). Returns the recipe's version and stamp after the save. B3a: every line names exactly one
 * stock item, whose id is stored with it, and every version, the current one included, has its row in recipe_versions.
 */
create or replace function public.save_recipe(
  p_recipe jsonb,
  p_expected_updated_at timestamptz
)
returns table (product_id text, version integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_product text;
  v_yield   numeric;
  v_lines   jsonb;
  v_line    jsonb;
  v_norm    jsonb;
  v_cur     jsonb;
  v_row     public.recipes%rowtype;
  v_at      timestamptz;
  v_bad     boolean;
  v_qty     numeric;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the recipes' using errcode = '42501';
  end if;
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    raise exception 'a recipe must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_recipe) k;
  if v_keys is distinct from array['lines', 'product_id', 'yield'] then -- rule:recipe-keys
    raise exception 'a recipe carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_recipe -> 'product_id') <> 'string' or jsonb_typeof(p_recipe -> 'yield') <> 'number'
     or jsonb_typeof(p_recipe -> 'lines') <> 'array' then
    raise exception 'a recipe field has the wrong type' using errcode = '22023';
  end if;
  v_product := p_recipe ->> 'product_id';
  v_yield := (p_recipe ->> 'yield')::numeric;
  v_lines := p_recipe -> 'lines';
  if v_yield <> trunc(v_yield) or v_yield not between 1 and 10000 then -- rule:recipe-yield
    raise exception 'the yield is a whole number of cookies from 1 to 10000' using errcode = '22023';
  end if;
  if jsonb_array_length(v_lines) > 80 then -- rule:recipe-size
    raise exception 'a recipe has at most 80 lines' using errcode = '22023';
  end if;
  for v_line in select l from jsonb_array_elements(v_lines) l loop
    v_bad := jsonb_typeof(v_line) <> 'object'
             or (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['name', 'qty', 'unit'];
    if v_bad then -- rule:line-keys
      raise exception 'a line carries exactly name, qty and unit' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'name') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or jsonb_typeof(v_line -> 'unit') <> 'string' then
      raise exception 'a line field has the wrong type' using errcode = '22023';
    end if;
    v_bad := length(btrim(v_line ->> 'name')) not between 1 and 80 or (v_line ->> 'name') ~ '[[:cntrl:]]';
    if v_bad then -- rule:line-name
      raise exception 'an ingredient name is 1 to 80 characters' using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'qty')::numeric;
    v_bad := v_qty <> round(v_qty, 3) or v_qty not between 0.001 and 999999;
    if v_bad then -- rule:line-qty
      raise exception 'a quantity is above 0 and at most 999,999 with at most 3 decimals' using errcode = '22023';
    end if;
    if (v_line ->> 'unit') not in ('g', 'ml', 'pcs') then -- rule:line-unit
      raise exception 'the unit is g, ml or pcs' using errcode = '22023';
    end if;
  end loop;
  -- The same ingredient twice would be costed and deducted twice; the names are compared trimmed, case ignored (B3a: the item
  -- is found that way too, so Flour and flour would be one item).
  select jsonb_agg(jsonb_build_object('name', btrim(l ->> 'name'), 'qty', round((l ->> 'qty')::numeric, 3), 'unit', l ->> 'unit')
                   order by ord)
    into v_norm from jsonb_array_elements(v_lines) with ordinality t(l, ord);
  v_norm := coalesce(v_norm, '[]'::jsonb);
  v_bad := (select count(*) <> count(distinct lower(n)) from (select x ->> 'name' as n from jsonb_array_elements(v_norm) x) q);
  if v_bad then -- rule:line-duplicate
    raise exception 'an ingredient is listed twice' using errcode = '22023';
  end if;
  -- The catalogue's lock, so an item's unit cannot change between this check and the save.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    join public.inventory_items i on lower(i.name) = lower(x ->> 'name') and i.unit <> x ->> 'unit');
  if v_bad then -- rule:line-unit-match
    raise exception 'an ingredient in stock is measured in the unit it is stocked in' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_product, 0));
  if not exists (select 1 from public.products p where p.id = v_product) then -- rule:recipe-product
    raise exception 'no such flavour' using errcode = '22023';
  end if;
  select * into v_row from public.recipes r where r.product_id = v_product;
  select coalesce(jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                            order by i.position, i.id), '[]'::jsonb)
    into v_cur from public.recipe_ingredients i where i.product_id = v_product;
  -- Nothing new (a lost reply's retry, or a save with no change): answered, and no version is made. This comes before the item
  -- rule so a retry is still answered for a recipe saved before lines had to be stock items.
  if v_row.product_id is not null and v_row.yield_count = v_yield::integer and v_cur = v_norm then -- rule:recipe-noop
    return query select v_row.product_id, v_row.version, v_row.updated_at;
    return;
  end if;
  -- B3a: every line is a stock item, found by name (surrounding spaces and case ignored, as the preview does) and kept by id.
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    where (select count(*) from public.inventory_items i where lower(btrim(i.name)) = lower(x ->> 'name')) <> 1);
  if v_bad then -- rule:line-item-unknown
    raise exception 'an ingredient must be a stock item: add it to stock first' using errcode = '22023';
  end if;
  if v_row.product_id is null then
    if p_expected_updated_at is not null then -- rule:recipe-create-stamp
      raise exception 'that recipe does not exist' using errcode = 'P0002';
    end if;
    insert into public.recipes (product_id, yield_count) values (v_product, v_yield::integer)
      returning public.recipes.updated_at into v_at;
    insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id)
      select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer,
             (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x.value ->> 'name'))
        from jsonb_array_elements(v_norm) with ordinality x(value, ord);
    insert into public.recipe_versions (product_id, version, yield_count, lines)
      values (v_product, 1, v_yield::integer, v_norm); -- the first version has its row from the start
    return query select v_product, 1, v_at;
    return;
  end if;
  if p_expected_updated_at is null then
    raise exception 'that recipe already exists with other values' using errcode = 'P0002';
  end if;
  if date_trunc('milliseconds', v_row.updated_at) is distinct from date_trunc('milliseconds', p_expected_updated_at) then -- rule:recipe-stale
    raise exception 'the recipe changed since it was read' using errcode = 'P0002';
  end if;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    values (v_product, v_row.version, v_row.yield_count, v_cur)
    on conflict (product_id, version) do nothing; -- the version being replaced is kept (it normally has its row already)
  delete from public.recipe_ingredients i where i.product_id = v_product;
  insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id)
    select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer,
           (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x.value ->> 'name'))
      from jsonb_array_elements(v_norm) with ordinality x(value, ord);
  update public.recipes as r set yield_count = v_yield::integer, version = r.version + 1
    where r.product_id = v_product
    returning r.updated_at into v_at;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    values (v_product, v_row.version + 1, v_yield::integer, v_norm); -- and the new one has its row
  return query select v_product, v_row.version + 1, v_at;
end;
$$;
revoke execute on function public.save_recipe(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_recipe(jsonb, timestamptz) to authenticated;

create or replace function public.get_stock_catalogue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_suppliers jsonb;
  v_items jsonb;
  v_prices jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the stock catalogue' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'phone', s.phone, 'notes', s.notes, 'place', s.place,
           'active', s.active, 'updated_at', s.updated_at) order by lower(s.name), s.id), '[]'::jsonb)
    into v_suppliers from public.suppliers s;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'name', i.name, 'category', i.category, 'unit', i.unit, 'on_hand', i.on_hand,
           'par_level', i.par_level, 'pack_size', i.pack_size, 'pack_label', i.pack_label,
           'supplier_id', i.supplier_id, 'use_by_days', i.use_by_days, 'last_counted', i.last_counted,
           'active', i.active, 'updated_at', i.updated_at) order by i.category, lower(i.name), i.id), '[]'::jsonb)
    into v_items from public.inventory_items i;
  -- B3a: each price also carries the id of its stock item and the size of this supplier's pack.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'supplier_id', p.supplier_id, 'item_name', p.item_name, 'item_id', p.item_id,
           'pack_label', p.pack_label, 'pack_size', p.pack_size,
           'price_cents', p.price_cents, 'previous_cents', to_jsonb(p.previous_cents),
           'last_bought', p.last_bought, 'preferred', p.preferred, 'active', p.active,
           'updated_at', p.updated_at) order by lower(p.item_name), p.price_cents, p.id), '[]'::jsonb)
    into v_prices from public.supplier_prices p;
  return jsonb_build_object('suppliers', v_suppliers, 'items', v_items, 'prices', v_prices);
end;
$$;
revoke execute on function public.get_stock_catalogue() from public, anon, authenticated;
grant execute on function public.get_stock_catalogue() to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one supplier's price for one item. Exactly these
 * keys: id (uuid), supplier_id, item_name, pack_label, price_cents, last_bought (text as she reads it), preferred,
 * active, and optionally pack_size (the size of this supplier's pack in the item's unit: a number above 0, or null). A changed
 * price pushes the old one onto `previous_cents` (the last three are kept). B3a: the item's id is stored with the price; an
 * update that does not send pack_size leaves the stored size as it is, unless it points the price at another item (a size in one
 * item's unit is not a size in another's: it is cleared).
 */
create or replace function public.save_supplier_price(
  p_price jsonb,
  p_expected_updated_at timestamptz
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bad    boolean;
  v_keys   text[];
  v_id     uuid;
  v_sup    text;
  v_item   text;
  v_item_id text;
  v_label  text;
  v_cents  numeric;
  v_has_pack boolean;
  v_pack   numeric;
  v_bought text;
  v_pref   boolean;
  v_active boolean;
  v_row    public.supplier_prices%rowtype;
  v_prev   bigint[];
  v_at     timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the supplier prices' using errcode = '42501';
  end if;
  if p_price is null or jsonb_typeof(p_price) <> 'object' then
    raise exception 'a supplier price must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_price) k;
  v_bad := v_keys is distinct from array['active', 'id', 'item_name', 'last_bought', 'pack_label', 'preferred',
                                   'price_cents', 'supplier_id']
       and v_keys is distinct from array['active', 'id', 'item_name', 'last_bought', 'pack_label', 'pack_size', 'preferred',
                                   'price_cents', 'supplier_id'];
  if v_bad then -- rule:price-keys
    raise exception 'a supplier price carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_price -> 'id') <> 'string' or jsonb_typeof(p_price -> 'supplier_id') <> 'string'
     or jsonb_typeof(p_price -> 'item_name') <> 'string' or jsonb_typeof(p_price -> 'pack_label') <> 'string'
     or jsonb_typeof(p_price -> 'last_bought') <> 'string' or jsonb_typeof(p_price -> 'price_cents') <> 'number'
     or jsonb_typeof(p_price -> 'preferred') <> 'boolean' or jsonb_typeof(p_price -> 'active') <> 'boolean' then
    raise exception 'a supplier price field has the wrong type' using errcode = '22023';
  end if;
  if (p_price ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_price ->> 'id')::uuid;
  v_sup := p_price ->> 'supplier_id';
  v_item := btrim(p_price ->> 'item_name');
  v_label := btrim(p_price ->> 'pack_label');
  v_bought := btrim(p_price ->> 'last_bought');
  if length(v_label) not between 1 and 40 or length(v_bought) > 20 or (v_label || v_bought) ~ '[[:cntrl:]]' then -- rule:price-text
    raise exception 'a pack label is 1 to 40 characters and the last-bought text at most 20' using errcode = '22023';
  end if;
  v_cents := (p_price ->> 'price_cents')::numeric;
  if v_cents <> trunc(v_cents) or v_cents not between 0 and 100000000 then -- rule:price-cents
    raise exception 'a price is whole centavos from 0 to 1,000,000 pesos' using errcode = '22023';
  end if;
  v_has_pack := p_price ? 'pack_size';
  if v_has_pack then
    v_bad := jsonb_typeof(p_price -> 'pack_size') not in ('number', 'null');
    if not v_bad then
      v_pack := (p_price ->> 'pack_size')::numeric;
      v_bad := v_pack is not null and (v_pack <> round(v_pack, 3) or v_pack not between 0.001 and 999999999);
    end if;
    if v_bad then -- rule:price-pack-size
      raise exception 'a pack size is above 0 and at most 999,999,999 with at most 3 decimals, or null' using errcode = '22023';
    end if;
  end if;
  v_pref := (p_price ->> 'preferred')::boolean;
  v_active := (p_price ->> 'active')::boolean;

  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:prices', 0));
  if not exists (select 1 from public.suppliers s where s.id = v_sup) then -- rule:price-supplier
    raise exception 'that supplier does not exist' using errcode = '22023';
  end if;
  select i.id into v_item_id from public.inventory_items i where i.name = v_item order by i.id limit 1;
  if v_item_id is null then -- rule:price-item
    raise exception 'no stock item has that exact name' using errcode = '22023';
  end if;
  if exists (select 1 from public.supplier_prices p where p.supplier_id = v_sup and p.item_name = v_item and p.id <> v_id) then -- rule:price-duplicate
    raise exception 'that supplier already has a price for that item' using errcode = '22023';
  end if;
  select * into v_row from public.supplier_prices p where p.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:price-create-stamp
      raise exception 'that price does not exist' using errcode = 'P0002';
    end if;
    insert into public.supplier_prices (id, supplier_id, item_name, item_id, pack_label, pack_size, price_cents, last_bought, preferred, active)
    values (v_id, v_sup, v_item, v_item_id, v_label, v_pack, v_cents::bigint, v_bought, v_pref, v_active)
    returning updated_at into v_at;
    return query select v_id, v_at;
    return;
  end if;
  if p_expected_updated_at is null then
    v_bad := v_row.supplier_id = v_sup and v_row.item_name = v_item and v_row.pack_label = v_label
       and v_row.price_cents = v_cents::bigint and v_row.last_bought = v_bought and v_row.preferred = v_pref
       and v_row.active = v_active and (not v_has_pack or v_row.pack_size is not distinct from v_pack);
    if v_bad then -- rule:price-replay
      return query select v_row.id, v_row.updated_at;
      return;
    end if;
    raise exception 'that price already exists with other values' using errcode = 'P0002';
  end if;
  v_prev := v_row.previous_cents;
  if v_row.price_cents <> v_cents::bigint then -- rule:price-history
    v_prev := (array[v_row.price_cents] || v_row.previous_cents)[1:3];
  end if;
  update public.supplier_prices as p set supplier_id = v_sup, item_name = v_item, item_id = v_item_id, pack_label = v_label,
      pack_size = case when v_has_pack then v_pack when v_item_id is distinct from p.item_id then null else p.pack_size end,
      price_cents = v_cents::bigint, previous_cents = v_prev, last_bought = v_bought, preferred = v_pref, active = v_active
    where p.id = v_id and date_trunc('milliseconds', p.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning p.updated_at into v_at;
  if v_at is null then -- rule:price-stale
    raise exception 'the price changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_supplier_price(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_supplier_price(jsonb, timestamptz) to authenticated;
