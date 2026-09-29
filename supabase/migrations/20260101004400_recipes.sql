-- A4 (docs/state/finish-plan.md slice A4): Cine's recipes with versions, owner-managed.
--
-- `recipes` (yield per flavour) and `recipe_ingredients` (its lines) already exist, but nothing reads or writes them and no API
-- role can write them (architecture A routes every write through an RPC). This migration adds a version and a stamp to a recipe,
-- an order to its lines, a history of the versions it replaced, and two owner-only RPCs:
--
--   get_recipes()   every recipe with its version, stamp, lines and the earlier versions (owner only)
--   save_recipe()   create a recipe (no stamp) or change one (the stamp the read returned); a change to the yield or the
--                   lines becomes a new version and the old one is kept; saving nothing new answers without a new version
--
-- A line is an item name, an exact quantity (never rounded: half a kilo of butter is a real quantity) and a unit. Like the
-- prototype, a line may name something that is not in stock yet (the screen warns); when the name IS a stock item the unit
-- must be that item's unit, or the cost per cookie would divide grams by kilos. Each refusal is one `if ... then -- rule:name`
-- line so the SQL role suite can neutralise it (as in B1, D4 and A3).

alter table public.recipes
  add column version integer not null default 1 check (version >= 1),
  add column updated_at timestamptz not null default now();
alter table public.recipe_ingredients
  add column position integer not null default 0;

create trigger recipes_touch before update on public.recipes
for each row execute function public.touch_updated_at();

create table public.recipe_versions (
  product_id text not null references public.recipes (product_id) on delete cascade,
  version integer not null check (version >= 1),
  yield_count integer not null check (yield_count > 0),
  lines jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (product_id, version)
);
alter table public.recipe_versions enable row level security;
revoke all on table public.recipe_versions from public, anon, authenticated;

-- Every change now goes through save_recipe (bounds, unit rule, versions): the legacy direct-write grants are revoked.
revoke insert, update, delete on table public.recipes, public.recipe_ingredients from public, anon, authenticated;

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
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'yield', r.yield_count, 'version', r.version, 'updated_at', r.updated_at,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', i.qty, 'unit', i.unit)
                                          order by i.position, i.id)
                           from public.recipe_ingredients i where i.product_id = r.product_id), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(jsonb_build_object('version', h.version, 'yield', h.yield_count, 'lines', h.lines)
                                            order by h.version)
                             from public.recipe_versions h where h.product_id = r.product_id), '[]'::jsonb)
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
 * lines (each exactly name, qty, unit). Returns the recipe's version and stamp after the save.
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
  -- The same ingredient twice would be costed and deducted twice; the names are compared as typed, trimmed.
  select jsonb_agg(jsonb_build_object('name', btrim(l ->> 'name'), 'qty', round((l ->> 'qty')::numeric, 3), 'unit', l ->> 'unit')
                   order by ord)
    into v_norm from jsonb_array_elements(v_lines) with ordinality t(l, ord);
  v_norm := coalesce(v_norm, '[]'::jsonb);
  v_bad := (select count(*) <> count(distinct n) from (select x ->> 'name' as n from jsonb_array_elements(v_norm) x) q);
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
  if v_row.product_id is null then
    if p_expected_updated_at is not null then -- rule:recipe-create-stamp
      raise exception 'that recipe does not exist' using errcode = 'P0002';
    end if;
    insert into public.recipes (product_id, yield_count) values (v_product, v_yield::integer)
      returning public.recipes.updated_at into v_at;
    insert into public.recipe_ingredients (product_id, item_name, qty, unit, position)
      select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer
        from jsonb_array_elements(v_norm) with ordinality x(value, ord);
    return query select v_product, 1, v_at;
    return;
  end if;
  -- Nothing new (a lost reply's retry, or a save with no change): answered, and no version is made.
  if v_row.yield_count = v_yield::integer and v_cur = v_norm then -- rule:recipe-noop
    return query select v_row.product_id, v_row.version, v_row.updated_at;
    return;
  end if;
  if p_expected_updated_at is null then
    raise exception 'that recipe already exists with other values' using errcode = 'P0002';
  end if;
  if date_trunc('milliseconds', v_row.updated_at) is distinct from date_trunc('milliseconds', p_expected_updated_at) then -- rule:recipe-stale
    raise exception 'the recipe changed since it was read' using errcode = 'P0002';
  end if;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    values (v_product, v_row.version, v_row.yield_count, v_cur); -- the version being replaced is kept
  delete from public.recipe_ingredients i where i.product_id = v_product;
  insert into public.recipe_ingredients (product_id, item_name, qty, unit, position)
    select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer
      from jsonb_array_elements(v_norm) with ordinality x(value, ord);
  update public.recipes as r set yield_count = v_yield::integer, version = r.version + 1
    where r.product_id = v_product
    returning r.updated_at into v_at;
  return query select v_product, v_row.version + 1, v_at;
end;
$$;
revoke execute on function public.save_recipe(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_recipe(jsonb, timestamptz) to authenticated;
