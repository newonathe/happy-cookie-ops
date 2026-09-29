-- A4 review fix (docs/state/finish-plan.md slice A4): an item that a recipe uses keeps its unit.
--
-- `save_recipe` requires a recipe line for a stock item to be in that item's unit. Changing the unit afterwards (grams to kilos)
-- would refuse every later save of those recipes, could never be repaired from the recipe screen (kg is not a recipe unit) and
-- would put the cost per cookie out by 1000. The rename guard already stops a rename under a price or recipe; this is the same
-- rule for the unit. The function is redefined whole (the SQL role suite finds each rule in the last migration that defines it).

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one stock item. Exactly these keys: id, name,
 * category ('Ingredients' or 'Packaging'), unit, par_level, pack_size (or null), pack_label, supplier_id (or null),
 * use_by_days (or null), active. The quantity on hand is never written here.
 */
create or replace function public.save_stock_item(
  p_item jsonb,
  p_expected_updated_at timestamptz
)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bad    boolean;
  v_keys   text[];
  v_id     text;
  v_name   text;
  v_cat    text;
  v_unit   text;
  v_par    numeric;
  v_pack   numeric;
  v_label  text;
  v_sup    text;
  v_useby  numeric;
  v_active boolean;
  v_row    public.inventory_items%rowtype;
  v_at     timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the stock items' using errcode = '42501';
  end if;
  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'a stock item must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_item) k;
  v_bad := v_keys is distinct from array['active', 'category', 'id', 'name', 'pack_label', 'pack_size', 'par_level',
                                   'supplier_id', 'unit', 'use_by_days'];
  if v_bad then -- rule:item-keys
    raise exception 'a stock item carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_item -> 'id') <> 'string' or jsonb_typeof(p_item -> 'name') <> 'string'
     or jsonb_typeof(p_item -> 'category') <> 'string' or jsonb_typeof(p_item -> 'unit') <> 'string'
     or jsonb_typeof(p_item -> 'pack_label') <> 'string' or jsonb_typeof(p_item -> 'active') <> 'boolean'
     or jsonb_typeof(p_item -> 'par_level') <> 'number'
     or jsonb_typeof(p_item -> 'pack_size') not in ('number', 'null')
     or jsonb_typeof(p_item -> 'supplier_id') not in ('string', 'null')
     or jsonb_typeof(p_item -> 'use_by_days') not in ('number', 'null') then
    raise exception 'a stock item field has the wrong type' using errcode = '22023';
  end if;
  v_id := p_item ->> 'id';
  if v_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then -- rule:item-id
    raise exception 'the id is a lowercase slug or uuid' using errcode = '22023';
  end if;
  v_name := btrim(p_item ->> 'name');
  v_unit := btrim(p_item ->> 'unit');
  v_label := btrim(p_item ->> 'pack_label');
  v_cat := p_item ->> 'category';
  v_bad := length(v_name) not between 1 and 80 or length(v_unit) not between 1 and 12 or length(v_label) > 40
     or (v_name || v_unit || v_label) ~ '[[:cntrl:]]';
  if v_bad then -- rule:item-text
    raise exception 'an item name is 1 to 80 characters, its unit 1 to 12 and its pack label at most 40' using errcode = '22023';
  end if;
  if v_cat not in ('Ingredients', 'Packaging') then -- rule:item-category
    raise exception 'the category is Ingredients or Packaging' using errcode = '22023';
  end if;
  v_par := (p_item ->> 'par_level')::numeric;
  v_pack := (p_item ->> 'pack_size')::numeric;
  v_bad := v_par <> round(v_par, 3) or v_par not between 0 and 999999999
     or (v_pack is not null and (v_pack <> round(v_pack, 3) or v_pack not between 0.001 and 999999999));
  if v_bad then -- rule:item-numbers
    raise exception 'quantities are from 0 to 999,999,999 with at most 3 decimals; a pack size is above 0' using errcode = '22023';
  end if;
  v_useby := (p_item ->> 'use_by_days')::numeric;
  if v_useby is not null and (v_useby <> trunc(v_useby) or v_useby not between 1 and 3650) then -- rule:item-useby
    raise exception 'use-by days are a whole number from 1 to 3650' using errcode = '22023';
  end if;
  v_sup := p_item ->> 'supplier_id';
  v_active := (p_item ->> 'active')::boolean;

  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  if v_sup is not null and not exists (select 1 from public.suppliers s where s.id = v_sup) then -- rule:item-supplier
    raise exception 'that supplier does not exist' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_items i where lower(i.name) = lower(v_name) and i.id <> v_id) then -- rule:item-name-taken
    raise exception 'another item already has that name' using errcode = '22023';
  end if;
  select * into v_row from public.inventory_items i where i.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:item-create-stamp
      raise exception 'that item does not exist' using errcode = 'P0002';
    end if;
    insert into public.inventory_items (id, name, category, unit, par_level, pack_size, pack_label, supplier_id, use_by_days, active)
    values (v_id, v_name, v_cat, v_unit, v_par, v_pack, v_label, v_sup, v_useby::integer, v_active)
    returning updated_at into v_at;
    return query select v_id, v_at;
    return;
  end if;
  if p_expected_updated_at is null then
    v_bad := v_row.name = v_name and v_row.category = v_cat and v_row.unit = v_unit and v_row.par_level = v_par
       and v_row.pack_size is not distinct from v_pack and v_row.pack_label = v_label
       and v_row.supplier_id is not distinct from v_sup and v_row.use_by_days is not distinct from v_useby::integer
       and v_row.active = v_active;
    if v_bad then -- rule:item-replay
      return query select v_row.id, v_row.updated_at;
      return;
    end if;
    raise exception 'that item already exists with other values' using errcode = 'P0002';
  end if;
  v_bad := v_row.name <> v_name and (exists (select 1 from public.supplier_prices p where p.item_name = v_row.name)
      or exists (select 1 from public.recipe_ingredients r where r.item_name = v_row.name));
  if v_bad then -- rule:item-rename-referenced
    raise exception 'an item with prices or recipes cannot be renamed: switch it off and add the new one' using errcode = '22023';
  end if;
  -- A recipe measures this item in its stock unit (save_recipe checks it): changing the unit under a recipe would lock the
  -- recipe and put the cost per cookie out by the ratio of the units.
  v_bad := v_row.unit <> v_unit and exists (select 1 from public.recipe_ingredients r where r.item_name = v_row.name);
  if v_bad then -- rule:item-unit-referenced
    raise exception 'an item used in a recipe keeps its unit: switch it off and add the new one' using errcode = '22023';
  end if;
  update public.inventory_items as i set name = v_name, category = v_cat, unit = v_unit, par_level = v_par,
      pack_size = v_pack, pack_label = v_label, supplier_id = v_sup, use_by_days = v_useby::integer, active = v_active
    where i.id = v_id and date_trunc('milliseconds', i.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning i.updated_at into v_at;
  if v_at is null then -- rule:item-stale
    raise exception 'the item changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_stock_item(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_stock_item(jsonb, timestamptz) to authenticated;
