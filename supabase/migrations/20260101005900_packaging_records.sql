-- B3b (final-plan.md version 2), database half: packaging as records, and what a cookie costs with its packaging.
--
-- Until now the packaging an order or a bazaar sale takes off stock was written into two functions (record_pack, record_sale_packaging)
-- by item NAME. It is data now, and the owner's: this migration adds the records and rebuilds the two functions on them. It seeds NO
-- rule and names no packaging item: until the owner enters her rules a pack and a bazaar sale take nothing and say so in the shortfall
-- (`why: no packaging rule`).
--
--   recipe_ingredients.kind   'ingredient' (the default: every line that exists) or 'packaging'. A packaging line's quantity is PER
--                             COOKIE (an ingredient line's stays per batch). A bake never takes a packaging line.
--   packaging_rules           the owner's rules: for a container (box of a size, loose, order, bazaar_sale) an item, a quantity, and
--                             whether the quantity is per container or per cookie, in an order (position, inside the container and,
--                             for a box, the box size).
--   packaging_rules_state     one row: the stamp of the rule set, so a stale write is refused.
--   get_packaging_rules()                              the stamp and the rules, with each item's name and unit. Owner only.
--   save_packaging_rules(rules, expected stamp)        replaces the WHOLE set. At most 80 rules, each exactly box_size, container,
--                                                      item_id, per, qty. The first save expects no stamp. A retry of a set that is
--                                                      already stored is answered with the stamp it made, whatever stamp it carries;
--                                                      any other set must carry the stamp that was read. Owner only.
--   save_recipe_packaging(recipe, expected stamp)      replaces ONLY one recipe's packaging lines: exactly product_id and lines (each
--                                                      exactly item_id and qty). A change is a new recipe version; saving the lines
--                                                      already there answers without one. Owner only.
--
-- Redefined whole (each change is marked B3b):
--   save_recipe         edits only the ingredient lines; the packaging lines are untouched and ride along in each version snapshot
--                       (recipe_versions.lines: the ingredient lines in the shape they always had, then the packaging lines as
--                       {kind: packaging, name, qty, unit})
--   get_recipes         `lines` are the ingredient lines only, as before; each recipe gains `packaging` (name, item_id, qty, unit); a
--                       history entry never lists a packaging line, so the editor cannot show one as an ingredient
--   record_production   a bake or a dough mix takes the ingredient lines only
--   record_pack         what an order takes comes from the order's own boxes (order_boxes) and the rules: cookies are the order's
--                       cookies; the boxes are taken smallest size first until every cookie is in one (a box left part empty is still
--                       a box); the rest are loose, and a loose cookie is its own container. For each box size used: the `box` rules
--                       of that size, per container x the boxes of that size, per cookie x the cookies in them. `loose` rules: per
--                       container or per cookie x the loose cookies. `order` rules: per container x 1, per cookie x the cookies. Then
--                       each flavour's packaging lines x that flavour's cookies. Same record id, same once-per-order answer.
--   record_sale_packaging  each flavour of the sale: its packaging lines x its cookies; then the `bazaar_sale` rules (per container x 1,
--                       per cookie x the cookies). Same movement ids as before for the same lines (record id : place : item).
--   get_recipe_costs    adds the packaging per cookie: per recipe the ingredient cost per cookie, the packaging cost per cookie and
--                       their sum (null only when no line of either kind could be costed), every line with its kind
--
-- The stock taken is by item id (use_stock_item), in the order: the flavours' packaging lines (flavour id, then position), then the
-- rules (box by size, then loose, then order; each in position order). Nothing is taken from an item that is switched off: it is a
-- shortfall. Shortfall entries are {name, by, unit}, plus `why: no packaging rule` for a rule that does not exist (no rule at all, or a
-- box size with none). record_event_sale is NOT redefined: it already calls record_sale_packaging after it has stored the sale's items.
-- preview_identity_links and apply_identity_links are not changed: packaging lines are always saved with their item id, so they are
-- already linked, and they only count and snapshot what they find. Each refusal is one `if ... then -- rule:name` line so the SQL role
-- suite can neutralise it.

alter table public.recipe_ingredients
  add column kind text not null default 'ingredient' check (kind in ('ingredient', 'packaging'));

create table public.packaging_rules (
  id uuid primary key default gen_random_uuid(),
  container text not null check (container in ('box', 'loose', 'order', 'bazaar_sale')),
  box_size integer,
  item_id text not null references public.inventory_items (id),
  qty numeric(12, 3) not null check (qty > 0),
  per text not null check (per in ('container', 'cookie')),
  position integer not null check (position >= 0),
  constraint packaging_rules_box_size_check
    check ((container = 'box' and box_size is not null and box_size between 2 and 48) or (container <> 'box' and box_size is null))
);
create unique index packaging_rules_one_item_uq on public.packaging_rules (container, (coalesce(box_size, 0)), item_id);
create unique index packaging_rules_position_uq on public.packaging_rules (container, (coalesce(box_size, 0)), position);
alter table public.packaging_rules enable row level security;
revoke all on table public.packaging_rules from public, anon, authenticated;

create table public.packaging_rules_state (
  id boolean primary key default true check (id),
  updated_at timestamptz not null
);
alter table public.packaging_rules_state enable row level security;
revoke all on table public.packaging_rules_state from public, anon, authenticated;

/**
 * The rule set the owner saved: `updated_at` (the stamp save_packaging_rules wants back; null until the first save) and `rules`, each
 * with its id, container, box_size (null unless a box), item_id, item_name, unit, qty, per and position, in the order container, box
 * size, position.
 */
create or replace function public.get_packaging_rules()
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
    raise exception 'only the owner may read the packaging rules' using errcode = '42501';
  end if;
  select jsonb_build_object(
      'updated_at', (select s.updated_at from public.packaging_rules_state s),
      'rules', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'container', r.container, 'box_size', r.box_size,
                                                             'item_id', r.item_id, 'item_name', i.name, 'unit', i.unit,
                                                             'qty', r.qty, 'per', r.per, 'position', r.position)
                                          order by r.container, r.box_size nulls first, r.position, r.id)
                           from public.packaging_rules r join public.inventory_items i on i.id = r.item_id), '[]'::jsonb))
    into v_out;
  return v_out;
end;
$$;
revoke execute on function public.get_packaging_rules() from public, anon, authenticated;
grant execute on function public.get_packaging_rules() to authenticated;

/**
 * Replaces the whole rule set. p_rules is an array of at most 80 objects, each exactly box_size (a whole number from 2 to 48 for a box,
 * null for every other container), container (box, loose, order or bazaar_sale), item_id (a stock item), per (container or cookie) and
 * qty (above 0, at most 999,999, at most 3 decimals). The same item twice in one container (and box size) is refused. A rule's place is
 * its place in the array among the rules of its container (and box size). The first save expects no stamp; a later one the stamp the
 * read returned. A set that is already stored is answered with the stamp it made, whatever stamp the retry carries, and changes nothing.
 * The stamp always moves forward, so a save made on a stale read is refused.
 */
create or replace function public.save_packaging_rules(
  p_rules jsonb,
  p_expected_updated_at timestamptz
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_rule  jsonb;
  v_bad   boolean;
  v_qty   numeric;
  v_norm  jsonb;
  v_have  jsonb;
  v_stamp timestamptz;
  v_at    timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the packaging rules' using errcode = '42501';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'the packaging rules are a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rules) > 80 then -- rule:rules-size
    raise exception 'there are at most 80 packaging rules' using errcode = '22023';
  end if;
  for v_rule in select r from jsonb_array_elements(p_rules) r loop
    v_bad := jsonb_typeof(v_rule) <> 'object'
             or (select array_agg(k order by k) from jsonb_object_keys(v_rule) k) is distinct from array['box_size', 'container', 'item_id', 'per', 'qty'];
    if v_bad then -- rule:rule-keys
      raise exception 'a packaging rule carries exactly box_size, container, item_id, per and qty' using errcode = '22023';
    end if;
    v_bad := jsonb_typeof(v_rule -> 'container') <> 'string' or jsonb_typeof(v_rule -> 'item_id') <> 'string'
             or jsonb_typeof(v_rule -> 'per') <> 'string' or jsonb_typeof(v_rule -> 'qty') <> 'number'
             or jsonb_typeof(v_rule -> 'box_size') not in ('number', 'null');
    if v_bad then -- rule:rule-types
      raise exception 'a packaging rule field has the wrong type' using errcode = '22023';
    end if;
    if (v_rule ->> 'container') not in ('box', 'loose', 'order', 'bazaar_sale') then -- rule:rule-container
      raise exception 'a container is box, loose, order or bazaar_sale' using errcode = '22023';
    end if;
    v_bad := case when v_rule ->> 'container' = 'box'
                  then jsonb_typeof(v_rule -> 'box_size') <> 'number'
                       or (v_rule ->> 'box_size')::numeric <> trunc((v_rule ->> 'box_size')::numeric)
                       or (v_rule ->> 'box_size')::numeric not between 2 and 48
                  else jsonb_typeof(v_rule -> 'box_size') <> 'null' end;
    if v_bad then -- rule:rule-box-size
      raise exception 'a box rule names a whole box size from 2 to 48; no other rule has one' using errcode = '22023';
    end if;
    v_qty := (v_rule ->> 'qty')::numeric;
    v_bad := v_qty <> round(v_qty, 3) or v_qty not between 0.001 and 999999;
    if v_bad then -- rule:rule-qty
      raise exception 'a quantity is above 0 and at most 999,999 with at most 3 decimals' using errcode = '22023';
    end if;
    if (v_rule ->> 'per') not in ('container', 'cookie') then -- rule:rule-per
      raise exception 'a rule is per container or per cookie' using errcode = '22023';
    end if;
  end loop;
  -- The rules as they will be stored: the place of a rule is its place among the rules of its container (and box size).
  select coalesce(jsonb_agg(jsonb_build_object('container', t.container, 'box_size', t.box_size, 'item_id', t.item_id,
                                               'qty', t.qty, 'per', t.per, 'position', t.pos)
                            order by t.container, t.box_size nulls first, t.pos), '[]'::jsonb)
    into v_norm
    from (select r.value ->> 'container' as container, (r.value ->> 'box_size')::numeric::integer as box_size,
                 r.value ->> 'item_id' as item_id, round((r.value ->> 'qty')::numeric, 3) as qty, r.value ->> 'per' as per,
                 (row_number() over (partition by r.value ->> 'container', r.value ->> 'box_size' order by r.ord) - 1)::integer as pos
            from jsonb_array_elements(p_rules) with ordinality r(value, ord)) t;
  v_bad := (select count(*) <> count(distinct jsonb_build_array(x -> 'container', x -> 'box_size', x -> 'item_id'))
              from jsonb_array_elements(v_norm) x);
  if v_bad then -- rule:rules-duplicate
    raise exception 'an item is listed twice for the same container' using errcode = '22023';
  end if;

  -- The catalogue's lock (a pack or a sale takes it first), then the rules'.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('packaging_rules', 0));
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    where not exists (select 1 from public.inventory_items i where i.id = x ->> 'item_id'));
  if v_bad then -- rule:rules-item-missing
    raise exception 'a rule names a stock item that does not exist' using errcode = 'P0002';
  end if;
  select s.updated_at into v_stamp from public.packaging_rules_state s;
  select coalesce(jsonb_agg(jsonb_build_object('container', r.container, 'box_size', r.box_size, 'item_id', r.item_id,
                                               'qty', r.qty, 'per', r.per, 'position', r.position)
                            order by r.container, r.box_size nulls first, r.position), '[]'::jsonb)
    into v_have from public.packaging_rules r;
  -- Nothing new (a lost reply's retry, or a save with no change): answered with the stamp it made.
  if v_stamp is not null and v_have = v_norm then -- rule:rules-noop
    return query select v_stamp;
    return;
  end if;
  if date_trunc('milliseconds', v_stamp) is distinct from date_trunc('milliseconds', p_expected_updated_at) then -- rule:rules-stale
    raise exception 'the packaging rules changed since they were read' using errcode = 'P0002';
  end if;
  delete from public.packaging_rules r where r.id is not null;
  insert into public.packaging_rules (container, box_size, item_id, qty, per, position)
    select x ->> 'container', (x ->> 'box_size')::integer, x ->> 'item_id', (x ->> 'qty')::numeric, x ->> 'per', (x ->> 'position')::integer
      from jsonb_array_elements(v_norm) x;
  -- The stamp only moves forward, even for two saves in the same millisecond.
  insert into public.packaging_rules_state as s (id, updated_at)
    values (true, greatest(clock_timestamp(), coalesce(v_stamp, '-infinity'::timestamptz) + interval '1 millisecond'))
    on conflict (id) do update set updated_at = excluded.updated_at
    returning s.updated_at into v_at;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'packaging.rules', 'packaging_rules', 'all',
    jsonb_build_object('count', jsonb_array_length(v_norm), 'rules', v_norm));
  return query select v_at;
end;
$$;
revoke execute on function public.save_packaging_rules(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_packaging_rules(jsonb, timestamptz) to authenticated;

/**
 * Replaces the packaging lines of one recipe and nothing else. p_recipe is exactly product_id and lines (at most 80, each exactly
 * item_id and qty: the quantity taken PER COOKIE, above 0, at most 999,999, at most 3 decimals; the same item twice is refused). The
 * recipe must exist and the stamp must be the one the read returned. A change is a new recipe version (the version it replaces is kept);
 * saving the lines already there answers with the current version and makes none. Returns the recipe's version and stamp after the save.
 */
create or replace function public.save_recipe_packaging(
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
  v_lines   jsonb;
  v_line    jsonb;
  v_bad     boolean;
  v_qty     numeric;
  v_norm    jsonb;
  v_cur     jsonb;
  v_ing     jsonb;
  v_row     public.recipes%rowtype;
  v_at      timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the recipes' using errcode = '42501';
  end if;
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    raise exception 'a recipe must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_recipe) k;
  if v_keys is distinct from array['lines', 'product_id'] then -- rule:pkg-keys
    raise exception 'packaging carries exactly product_id and lines' using errcode = '22023';
  end if;
  if jsonb_typeof(p_recipe -> 'product_id') <> 'string' or jsonb_typeof(p_recipe -> 'lines') <> 'array' then -- rule:pkg-types
    raise exception 'a packaging field has the wrong type' using errcode = '22023';
  end if;
  v_product := p_recipe ->> 'product_id';
  v_lines := p_recipe -> 'lines';
  if jsonb_array_length(v_lines) > 80 then -- rule:pkg-size
    raise exception 'a recipe has at most 80 packaging lines' using errcode = '22023';
  end if;
  for v_line in select l from jsonb_array_elements(v_lines) l loop
    v_bad := jsonb_typeof(v_line) <> 'object'
             or (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['item_id', 'qty'];
    if v_bad then -- rule:pkg-line-keys
      raise exception 'a packaging line carries exactly item_id and qty' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'item_id') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number' then -- rule:pkg-line-types
      raise exception 'a packaging line field has the wrong type' using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'qty')::numeric;
    v_bad := v_qty <> round(v_qty, 3) or v_qty not between 0.001 and 999999;
    if v_bad then -- rule:pkg-qty
      raise exception 'a quantity is above 0 and at most 999,999 with at most 3 decimals' using errcode = '22023';
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', l ->> 'item_id', 'qty', round((l ->> 'qty')::numeric, 3)) order by ord), '[]'::jsonb)
    into v_norm from jsonb_array_elements(v_lines) with ordinality t(l, ord);
  v_bad := (select count(*) <> count(distinct x ->> 'item_id') from jsonb_array_elements(v_norm) x);
  if v_bad then -- rule:pkg-duplicate
    raise exception 'an item is listed twice' using errcode = '22023';
  end if;

  -- The catalogue's lock, then the recipe's (save_recipe and record_production take them in this order).
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_product, 0));
  select * into v_row from public.recipes r where r.product_id = v_product;
  if not found then -- rule:pkg-recipe-missing
    raise exception 'no such recipe' using errcode = 'P0002';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    where not exists (select 1 from public.inventory_items i where i.id = x ->> 'item_id'));
  if v_bad then -- rule:pkg-item-missing
    raise exception 'a packaging line names a stock item that does not exist' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'qty', round(i.qty, 3)) order by i.position, i.id), '[]'::jsonb)
    into v_cur from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'packaging';
  -- Nothing new (a lost reply's retry, or a save with no change): answered, and no version is made.
  if v_cur = v_norm then -- rule:pkg-noop
    return query select v_row.product_id, v_row.version, v_row.updated_at;
    return;
  end if;
  if date_trunc('milliseconds', v_row.updated_at) is distinct from date_trunc('milliseconds', p_expected_updated_at) then -- rule:pkg-stale
    raise exception 'the recipe changed since it was read' using errcode = 'P0002';
  end if;
  -- The version being replaced is kept (it normally has its row already): the ingredient lines, then the packaging lines.
  select coalesce(jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit) order by i.position, i.id), '[]'::jsonb)
    into v_ing from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'ingredient';
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    select v_product, v_row.version, v_row.yield_count,
           v_ing || coalesce((select jsonb_agg(jsonb_build_object('kind', 'packaging', 'name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                                                order by i.position, i.id)
                                from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'packaging'), '[]'::jsonb)
    on conflict (product_id, version) do nothing;
  delete from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'packaging';
  insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id, kind)
    select v_product, it.name, (x.value ->> 'qty')::numeric, it.unit, (x.ord - 1)::integer, it.id, 'packaging'
      from jsonb_array_elements(v_norm) with ordinality x(value, ord)
      join public.inventory_items it on it.id = x.value ->> 'item_id';
  update public.recipes as r set version = r.version + 1
    where r.product_id = v_product
    returning r.updated_at into v_at;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    select v_product, v_row.version + 1, v_row.yield_count,
           v_ing || coalesce((select jsonb_agg(jsonb_build_object('kind', 'packaging', 'name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                                                order by i.position, i.id)
                                from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'packaging'), '[]'::jsonb);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'recipes.packaging', 'recipes', v_product,
    jsonb_build_object('version', v_row.version + 1, 'lines', v_norm));
  return query select v_product, v_row.version + 1, v_at;
end;
$$;
revoke execute on function public.save_recipe_packaging(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_recipe_packaging(jsonb, timestamptz) to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one recipe. The body is exactly: product_id, yield,
 * lines (each exactly name, qty, unit). Returns the recipe's version and stamp after the save. B3a: every line names exactly one
 * stock item, whose id is stored with it, and every version, the current one included, has its row in recipe_versions. B3b: these are
 * the ingredient lines; the recipe's packaging lines (save_recipe_packaging) are left as they are.
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
  v_pkg     jsonb;
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
  -- B3b: only the ingredient lines are compared and replaced here; the packaging lines are the owner's other list (save_recipe_packaging)
  -- and ride along, after the ingredient lines, in each version snapshot.
  select coalesce(jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                            order by i.position, i.id), '[]'::jsonb)
    into v_cur from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'ingredient';
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'packaging', 'name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                            order by i.position, i.id), '[]'::jsonb)
    into v_pkg from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'packaging';
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
    values (v_product, v_row.version, v_row.yield_count, v_cur || v_pkg) -- B3b: the packaging lines are part of the version
    on conflict (product_id, version) do nothing; -- the version being replaced is kept (it normally has its row already)
  delete from public.recipe_ingredients i where i.product_id = v_product and i.kind = 'ingredient'; -- B3b: the ingredient lines only
  insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id)
    select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer,
           (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x.value ->> 'name'))
      from jsonb_array_elements(v_norm) with ordinality x(value, ord);
  update public.recipes as r set yield_count = v_yield::integer, version = r.version + 1
    where r.product_id = v_product
    returning r.updated_at into v_at;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    values (v_product, v_row.version + 1, v_yield::integer, v_norm || v_pkg); -- and the new one has its row (B3b: with the packaging lines)
  return query select v_product, v_row.version + 1, v_at;
end;
$$;
revoke execute on function public.save_recipe(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_recipe(jsonb, timestamptz) to authenticated;

-- get_recipes, as it was (20260101005500) with the ingredient lines and the packaging lines apart.
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
  -- B3b: `lines` are the ingredient lines only (as they always were); `packaging` lists the packaging lines (qty PER COOKIE); a history
  -- entry drops the lines that carry a kind (the packaging a version snapshot holds), so the editor never shows one as an ingredient.
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'yield', r.yield_count, 'version', r.version, 'updated_at', r.updated_at,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', i.qty, 'unit', i.unit, 'item_id', i.item_id)
                                          order by i.position, i.id)
                           from public.recipe_ingredients i where i.product_id = r.product_id and i.kind = 'ingredient'), '[]'::jsonb),
      'packaging', coalesce((select jsonb_agg(jsonb_build_object('name', i.item_name, 'item_id', i.item_id, 'qty', i.qty, 'unit', i.unit)
                                              order by i.position, i.id)
                               from public.recipe_ingredients i where i.product_id = r.product_id and i.kind = 'packaging'), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(jsonb_build_object('version', h.version, 'yield', h.yield_count,
                                              'lines', coalesce((select jsonb_agg(l.value order by l.ord)
                                                                   from jsonb_array_elements(h.lines) with ordinality l(value, ord)
                                                                  where not (l.value ? 'kind')), '[]'::jsonb))
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

-- record_production, as it was (20260101005600) with a bake or a dough mix taking the ingredient lines only (B3b: a packaging line is never taken at the bake).
create or replace function public.record_production(p_rec jsonb)
returns table (record_id uuid, duplicate boolean, used_dough integer, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_id      uuid;
  v_kind    text;
  v_pid     text;
  v_qty     numeric;
  v_target  numeric;
  v_rej     numeric;
  v_adj     jsonb;
  v_ver     numeric;
  v_drop    numeric;
  v_at      timestamptz;
  v_hash    text;
  v_seen    public.production_records%rowtype;
  v_recipe  public.recipes%rowtype;
  v_bal     numeric;
  v_used    integer := 0;
  v_mixed   numeric;
  v_line    record;
  v_base    numeric;
  v_step    numeric;
  v_raw     numeric;
  v_amount  numeric;
  v_left    numeric;
  v_plan    jsonb := '[]'::jsonb;
  v_short   jsonb := '[]'::jsonb;
  v_ids     text[];
  v_flavour text;
  v_reason  text;
  v_n       integer := 0;
  v_bad     boolean;
  v_p       jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record production' using errcode = '42501';
  end if;
  if p_rec is null or jsonb_typeof(p_rec) <> 'object' then
    raise exception 'a production record must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rec) k;
  if v_keys is distinct from array['adj', 'at', 'drop_no', 'id', 'kind', 'product_id', 'qty', 'recipe_version', 'rejects', 'target'] then -- rule:prod-keys
    raise exception 'a production record carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rec -> 'id') <> 'string' or jsonb_typeof(p_rec -> 'kind') <> 'string'
     or jsonb_typeof(p_rec -> 'product_id') <> 'string' or jsonb_typeof(p_rec -> 'qty') <> 'number'
     or jsonb_typeof(p_rec -> 'target') not in ('number', 'null') or jsonb_typeof(p_rec -> 'rejects') <> 'number'
     or jsonb_typeof(p_rec -> 'adj') <> 'object' or jsonb_typeof(p_rec -> 'recipe_version') <> 'number'
     or jsonb_typeof(p_rec -> 'drop_no') <> 'number' or jsonb_typeof(p_rec -> 'at') <> 'number' then
    raise exception 'a production field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_rec ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:prod-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_rec ->> 'id')::uuid;
  v_kind := p_rec ->> 'kind';
  if v_kind not in ('dough', 'batch') then -- rule:prod-kind
    raise exception 'the kind is dough or batch' using errcode = '22023';
  end if;
  v_pid := p_rec ->> 'product_id';
  v_qty := (p_rec ->> 'qty')::numeric;
  v_rej := (p_rec ->> 'rejects')::numeric;
  v_target := (p_rec ->> 'target')::numeric;
  v_ver := (p_rec ->> 'recipe_version')::numeric;
  v_drop := (p_rec ->> 'drop_no')::numeric;
  v_adj := p_rec -> 'adj';
  v_bad := v_qty <> trunc(v_qty) or v_qty not between 1 and 10000;
  if v_bad then -- rule:prod-qty
    raise exception 'a quantity is a whole number from 1 to 10000' using errcode = '22023';
  end if;
  v_bad := v_rej <> trunc(v_rej) or v_rej < 0 or v_rej > v_qty or (v_kind = 'dough' and v_rej <> 0);
  if v_bad then -- rule:prod-rejects
    raise exception 'rejects are whole, not more than were baked, and only a batch has them' using errcode = '22023';
  end if;
  v_bad := (v_kind = 'dough' and v_target is not null)
           or (v_kind = 'batch' and (v_target is null or v_target <> trunc(v_target) or v_target not between 0 and 10000));
  if v_bad then -- rule:prod-target
    raise exception 'a batch has a planned whole number; dough has none' using errcode = '22023';
  end if;
  v_bad := v_ver <> trunc(v_ver) or v_ver < 1 or v_drop <> trunc(v_drop) or v_drop not between 0 and 100000;
  if v_bad then
    raise exception 'the version and the drop are whole numbers' using errcode = '22023';
  end if;
  if (p_rec ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_rec ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:prod-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;
  if v_kind = 'dough' and v_adj <> '{}'::jsonb then -- rule:prod-adj-dough
    raise exception 'dough has no adjustments' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_each(v_adj) a
                    where jsonb_typeof(a.value) <> 'number' or (a.value #>> '{}')::numeric <> trunc((a.value #>> '{}')::numeric)
                       or (a.value #>> '{}')::numeric not between -50 and 50);
  if v_bad then -- rule:prod-adj-range
    raise exception 'an adjustment is a whole number of steps from -50 to 50' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_rec::text, 'UTF8')), 'hex');
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    if v_seen.payload_hash <> v_hash then -- rule:prod-replay-conflict
      raise exception 'that id was already used for a different record' using errcode = '23505';
    end if;
    return query select v_id, true, v_seen.dough_used, v_seen.short;
    return;
  end if;

  -- The catalogue's lock, then the recipe's (save_recipe takes them in this order), then this flavour's production.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_pid, 0));
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_pid, 0));
  select * into v_recipe from public.recipes r where r.product_id = v_pid;
  if not found then -- rule:prod-no-recipe
    raise exception 'that flavour has no recipe' using errcode = 'P0002';
  end if;
  if v_recipe.version <> v_ver::integer then -- rule:prod-stale-version
    raise exception 'the recipe changed since it was read' using errcode = 'P0002';
  end if;
  if v_kind = 'dough' and v_qty > v_recipe.yield_count then -- rule:prod-dough-size
    raise exception 'dough is mixed whole or halved: at most one recipe yield at a time' using errcode = '22023';
  end if;
  -- B3b: an adjustment names an ingredient; a packaging line is never adjusted.
  v_bad := exists (select 1 from jsonb_object_keys(v_adj) k
                    where not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.kind = 'ingredient' and i.item_name = k));
  if v_bad then -- rule:prod-adj-unknown
    raise exception 'an adjustment names an ingredient the recipe does not have' using errcode = '22023';
  end if;
  select p.name into v_flavour from public.products p where p.id = v_pid;

  if v_kind = 'batch' then
    select coalesce(sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end), 0) into v_bal
      from public.production_records r where r.product_id = v_pid and r.kind in ('dough', 'batch', 'discard_dough');
    v_used := least(greatest(v_bal, 0), v_qty)::integer;
    v_mixed := v_qty - v_used;
  else
    v_mixed := v_qty;
  end if;
  -- Every line is qty x mixed / yield with the multiplication first: dividing first leaves a rounded quotient (5/9 has no exact
  -- decimal), and a piece line that is exactly 5 would round up to 6.
  -- B3b: a bake or a dough mix takes the ingredient lines only; the packaging is taken when an order is packed or a sale is made.
  for v_line in select i.item_name as name, i.qty as qty, i.unit as unit, i.item_id as item_id, it.unit as item_unit
                  from public.recipe_ingredients i left join public.inventory_items it on it.id = i.item_id
                 where i.product_id = v_pid and i.kind = 'ingredient' order by i.position, i.id loop
    if v_kind = 'dough' then
      v_raw := v_line.qty * v_mixed / v_recipe.yield_count;
    else
      v_base := round(v_line.qty * v_mixed / v_recipe.yield_count, 1);
      v_step := case v_line.unit when 'pcs' then 1 when 'ml' then 5 else 10 end;
      v_raw := greatest(0, v_base + coalesce((v_adj ->> v_line.name)::numeric, 0) * v_step);
    end if;
    v_amount := case when v_line.unit = 'pcs' then ceil(v_raw) else round(v_raw, 1) end;
    if v_amount > 0 then
      v_plan := v_plan || jsonb_build_object('name', v_line.name, 'unit', v_line.unit, 'amount', v_amount,
        'item_id', case when v_line.item_unit = v_line.unit then v_line.item_id end,
        'why', case when v_line.item_id is null then 'not a stock item' when v_line.item_unit <> v_line.unit then 'unit differs' end);
    end if;
  end loop;
  select array_agg(x ->> 'item_id') into v_ids from jsonb_array_elements(v_plan) x where x ->> 'item_id' is not null;
  perform public.lock_stock_item_ids(coalesce(v_ids, array[]::text[]));

  insert into public.production_records (id, kind, product_id, qty, target, rejects, dough_used, recipe_version, drop_no, at,
                                         payload_hash, created_by)
  values (v_id, v_kind, v_pid, case when v_kind = 'batch' then v_qty::integer - v_rej::integer else v_qty::integer end,
          v_target::integer, v_rej::integer, v_used, v_ver::integer, v_drop::integer, v_at, v_hash, auth.uid());
  v_reason := (case v_kind when 'dough' then 'Mixed dough: ' else 'Baked: ' end) || v_flavour || ', Version ' || v_ver::integer;
  for v_p in select x from jsonb_array_elements(v_plan) x loop
    v_n := v_n + 1;
    if v_p ->> 'item_id' is not null then
      v_left := public.use_stock_item(v_id, v_n, v_p ->> 'item_id', (v_p ->> 'amount')::numeric, v_reason, v_at, true);
    else
      v_left := (v_p ->> 'amount')::numeric;
    end if;
    if v_left > 0 then -- rule:prod-shortfall
      v_short := v_short || (jsonb_build_object('name', v_p ->> 'name', 'by', round(v_left, 1), 'unit', v_p ->> 'unit')
                             || case when v_p ->> 'why' is not null then jsonb_build_object('why', v_p ->> 'why') else '{}'::jsonb end);
    end if;
  end loop;
  update public.production_records r set short = v_short where r.id = v_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.' || v_kind, 'production_records', v_id::text,
    jsonb_build_object('product_id', v_pid, 'qty', v_qty, 'dough_used', v_used, 'short', v_short));
  return query select v_id, false, v_used, v_short;
end;
$$;
revoke execute on function public.record_production(jsonb) from public, anon, authenticated;
grant execute on function public.record_production(jsonb) to authenticated;

/**
 * Packing an order takes its packaging off stock, once per order: the record id is derived from the order, so packing the same order
 * again (a reopened or corrected order) answers the first record and takes nothing more. B3b: what it takes is the owner's packaging
 * rules and the flavours' own packaging lines, worked out from the order's cookies and its own boxes (order_boxes): the boxes are taken
 * smallest size first until every cookie is in one (the last box may be part empty); the rest are loose, each its own container. A rule
 * that does not exist is a shortfall (`why: no packaging rule`), not a silent nothing. Returns the record's id, whether it was already
 * recorded and the shortfall.
 */
create or replace function public.record_pack(p_order text, p_drop integer)
returns table (record_id uuid, duplicate boolean, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id     uuid;
  v_count  integer;
  v_rest   integer;
  v_inbox  integer;
  v_loose  integer;
  v_sizes  jsonb := '[]'::jsonb;
  v_seen   public.production_records%rowtype;
  v_at     timestamptz := now();
  v_plan   jsonb;
  v_p      jsonb;
  v_s      record;
  v_n      integer := 0;
  v_left   numeric;
  v_taken  jsonb := '[]'::jsonb;
  v_short  jsonb;
  v_rules  boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record packing' using errcode = '42501';
  end if;
  if p_order is null or length(p_order) not between 1 and 64 or p_drop is null or p_drop not between 0 and 100000 then
    raise exception 'an order id and a drop are required' using errcode = '22023';
  end if;
  v_id := md5('pack:' || p_order)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    return query select v_id, true, v_seen.short;
    return;
  end if;
  if not exists (select 1 from public.orders o where o.id = p_order) then -- rule:pack-order-missing
    raise exception 'no such order' using errcode = 'P0002';
  end if;
  select coalesce(sum(i.qty), 0)::integer into v_count from public.order_items i where i.order_id = p_order;
  if v_count < 1 then -- rule:pack-empty
    raise exception 'that order has no cookies to pack' using errcode = '22023';
  end if;
  -- B3b: the catalogue's lock first (the rules and the flavours' packaging lines are read under it, as save_packaging_rules and
  -- save_recipe_packaging write them under it), then the items.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_rules := exists (select 1 from public.packaging_rules);
  -- B3b: the order's own boxes, smallest size first, until every cookie is in one; what is left is loose.
  v_rest := v_count;
  for v_s in select b.size, sum(b.qty)::integer as qty from public.order_boxes b where b.order_id = p_order group by b.size order by b.size loop
    exit when v_rest <= 0;
    v_inbox := least(v_s.qty * v_s.size, v_rest);
    v_sizes := v_sizes || jsonb_build_object('size', v_s.size, 'boxes', ceil(v_inbox::numeric / v_s.size)::integer, 'cookies', v_inbox);
    v_rest := v_rest - v_inbox;
  end loop;
  v_loose := v_rest;
  -- B3b: what to take, in the order it is taken: each flavour's packaging lines (flavour id, then position), then the box rules by size,
  -- the loose rules and the order rules (each in position order). A quantity is per container or per cookie.
  select coalesce(jsonb_agg(jsonb_build_object('item_id', q.item_id, 'amount', q.amount) order by q.g, q.k, q.pos, q.rid), '[]'::jsonb)
    into v_plan
    from (
      select 0 as g, r.product_id as k, r.position as pos, r.id::text as rid, r.item_id, r.qty * f.qty as amount
        from public.recipe_ingredients r
        join (select oi.product_id, sum(oi.qty) as qty from public.order_items oi where oi.order_id = p_order group by oi.product_id) f
          on f.product_id = r.product_id
       where r.kind = 'packaging' and r.item_id is not null
      union all
      select 1, lpad(s.size::text, 3, '0'), u.position, u.id::text, u.item_id,
             u.qty * case u.per when 'container' then s.boxes else s.cookies end
        from jsonb_to_recordset(v_sizes) s(size integer, boxes integer, cookies integer)
        join public.packaging_rules u on u.container = 'box' and u.box_size = s.size
      union all
      select 2, '', u.position, u.id::text, u.item_id, u.qty * v_loose
        from public.packaging_rules u where u.container = 'loose'
      union all
      select 3, '', u.position, u.id::text, u.item_id, u.qty * case u.per when 'container' then 1 else v_count end
        from public.packaging_rules u where u.container = 'order'
    ) q
   where q.amount > 0;
  perform public.lock_stock_item_ids(array(select e ->> 'item_id' from jsonb_array_elements(v_plan) e));
  insert into public.production_records (id, kind, ref, qty, drop_no, at, payload_hash, created_by)
  values (v_id, 'pack', p_order, v_count, p_drop, v_at,
          encode(sha256(convert_to('pack:' || p_order, 'UTF8')), 'hex'), auth.uid());
  for v_p in select e from jsonb_array_elements(v_plan) e loop
    v_n := v_n + 1;
    v_left := public.use_stock_item(v_id, v_n, v_p ->> 'item_id', (v_p ->> 'amount')::numeric, 'Packed order ' || p_order, v_at, false);
    if v_left > 0 then -- rule:pack-shortfall
      v_taken := v_taken || jsonb_build_object('item_id', v_p ->> 'item_id', 'by', v_left);
    end if;
  end loop;
  -- B3b: one shortfall entry per item (what several rules could not take adds up), then what has no rule.
  select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'by', round(m.short, 1), 'unit', i.unit) order by m.at_ord), '[]'::jsonb)
    into v_short
    from (select t.value ->> 'item_id' as item_id, sum((t.value ->> 'by')::numeric) as short, min(t.ord) as at_ord
            from jsonb_array_elements(v_taken) with ordinality t(value, ord) group by 1) m
    join public.inventory_items i on i.id = m.item_id;
  if not v_rules then
    v_short := v_short || jsonb_build_object('name', 'packaging rule', 'by', v_count, 'unit', 'pcs', 'why', 'no packaging rule');
  else
    v_short := v_short || coalesce((select jsonb_agg(jsonb_build_object('name', 'box ' || s.size, 'by', s.boxes, 'unit', 'pcs', 'why', 'no packaging rule')
                                                    order by s.size)
                                      from jsonb_to_recordset(v_sizes) s(size integer, boxes integer, cookies integer)
                                     where not exists (select 1 from public.packaging_rules u where u.container = 'box' and u.box_size = s.size)),
                                   '[]'::jsonb);
  end if;
  update public.production_records r set short = v_short where r.id = v_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.pack', 'production_records', v_id::text,
    jsonb_build_object('order_id', p_order, 'cookies', v_count, 'loose', v_loose, 'short', v_short));
  return query select v_id, false, v_short;
end;
$$;
revoke execute on function public.record_pack(text, integer) from public, anon, authenticated;
grant execute on function public.record_pack(text, integer) to authenticated;

-- Internal: a bazaar sale's packaging, on the sale's own id. B3b: each flavour of the sale takes its packaging lines (x its cookies),
-- then the `bazaar_sale` rules (per container x 1, per cookie x the sale's cookies). With no rule of that kind and no flavour line the
-- sale takes nothing and says so. Called by record_event_sale after the sale's items are stored.
create or replace function public.record_sale_packaging(p_sale uuid, p_cookies integer, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  jsonb;
  v_p     jsonb;
  v_n     integer := 0;
  v_left  numeric;
  v_taken jsonb := '[]'::jsonb;
  v_short jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  select coalesce(jsonb_agg(jsonb_build_object('item_id', q.item_id, 'amount', q.amount) order by q.g, q.k, q.pos, q.rid), '[]'::jsonb)
    into v_plan
    from (
      select 0 as g, r.product_id as k, r.position as pos, r.id::text as rid, r.item_id, r.qty * f.qty as amount
        from public.recipe_ingredients r
        join (select s.product_id, sum(s.qty) as qty from public.event_sale_items s where s.sale_id = p_sale group by s.product_id) f
          on f.product_id = r.product_id
       where r.kind = 'packaging' and r.item_id is not null
      union all
      select 1, '', u.position, u.id::text, u.item_id, u.qty * case u.per when 'container' then 1 else p_cookies end
        from public.packaging_rules u where u.container = 'bazaar_sale'
    ) q
   where q.amount > 0;
  perform public.lock_stock_item_ids(array(select e ->> 'item_id' from jsonb_array_elements(v_plan) e));
  insert into public.production_records (id, kind, ref, qty, at, payload_hash, created_by)
  values (p_sale, 'sale', p_sale::text, p_cookies, p_at, encode(sha256(convert_to('sale:' || p_sale::text, 'UTF8')), 'hex'), auth.uid())
  on conflict (id) do nothing;
  if not found then
    return;
  end if;
  for v_p in select e from jsonb_array_elements(v_plan) e loop
    v_n := v_n + 1;
    v_left := public.use_stock_item(p_sale, v_n, v_p ->> 'item_id', (v_p ->> 'amount')::numeric, 'Bazaar sale', p_at, false);
    if v_left > 0 then
      v_taken := v_taken || jsonb_build_object('item_id', v_p ->> 'item_id', 'by', v_left);
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'by', round(m.short, 1), 'unit', i.unit) order by m.at_ord), '[]'::jsonb)
    into v_short
    from (select t.value ->> 'item_id' as item_id, sum((t.value ->> 'by')::numeric) as short, min(t.ord) as at_ord
            from jsonb_array_elements(v_taken) with ordinality t(value, ord) group by 1) m
    join public.inventory_items i on i.id = m.item_id;
  if not exists (select 1 from public.packaging_rules u where u.container = 'bazaar_sale')
     and not exists (select 1 from public.recipe_ingredients r join public.event_sale_items s on s.product_id = r.product_id and s.sale_id = p_sale
                      where r.kind = 'packaging' and r.item_id is not null) then
    v_short := v_short || jsonb_build_object('name', 'packaging rule', 'by', p_cookies, 'unit', 'pcs', 'why', 'no packaging rule');
  end if;
  update public.production_records r set short = v_short where r.id = p_sale;
end;
$$;
revoke execute on function public.record_sale_packaging(uuid, integer, timestamptz) from public, anon, authenticated;

/**
 * What every recipe costs per batch and per cookie, line by line, with its packaging. A line is costed when it names a stock item
 * measured in the line's unit and that item has a cost; a line that is not (why: not a stock item, unit differs, no cost) is listed in
 * `missing` (with its kind) and is not in a total. An ingredient line is per batch, a packaging line per cookie. `batch_cents` is the
 * ingredient lines; `ingredient_per_cookie_cents` that over the yield; `packaging_per_cookie_cents` the packaging lines; `per_cookie_cents`
 * their sum. Each is null when no line of its kind has a cost, and `per_cookie_cents` is null only when no line of either kind has one
 * (never 0). `complete` is true when there is at least one ingredient line and none, of either kind, is missing. Unit costs are
 * rounded to 6 decimals, amounts to 4.
 */
create or replace function public.get_recipe_costs()
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
    raise exception 'only the owner may read recipe costs' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'version', r.version, 'yield', r.yield_count,
      'batch_cents', round(t.batch, 4),
      'ingredient_per_cookie_cents', round(t.batch / r.yield_count, 4),
      'packaging_per_cookie_cents', round(t.pack, 4),
      'per_cookie_cents', case when t.batch is null and t.pack is null then null
                               else round(coalesce(t.batch / r.yield_count, 0) + coalesce(t.pack, 0), 4) end,
      'complete', t.n_ing > 0 and t.miss = 0, 'missing', t.missing, 'lines', t.lines) order by r.product_id), '[]'::jsonb)
    into v_out
    from public.recipes r
    cross join lateral (
      select count(*) filter (where l.kind = 'ingredient') as n_ing, count(*) filter (where l.why is not null) as miss,
             sum(l.cents) filter (where l.kind = 'ingredient') as batch, sum(l.cents) filter (where l.kind = 'packaging') as pack,
             coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'why', l.why, 'kind', l.kind) order by l.ord, l.position, l.id) filter (where l.why is not null), '[]'::jsonb) as missing,
             coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'name', l.name, 'item_id', l.item_id, 'qty', l.qty, 'unit', l.unit,
                                                   'unit_cost', round(l.uc, 6), 'source', l.src, 'cents', round(l.cents, 4))
                                order by l.ord, l.position, l.id), '[]'::jsonb) as lines
        from (select i.id, i.position, i.kind, case i.kind when 'ingredient' then 0 else 1 end as ord,
                     i.item_name as name, i.item_id, i.qty, i.unit, c.unit_cost as uc, c.source as src,
                     i.qty * c.unit_cost as cents,
                     case when i.item_id is null then 'not a stock item'
                          when it.unit <> i.unit then 'unit differs'
                          when c.unit_cost is null then 'no cost' end as why
                from public.recipe_ingredients i
                left join public.inventory_items it on it.id = i.item_id
                left join lateral public.item_unit_cost(i.item_id) c on it.id is not null and it.unit = i.unit
               where i.product_id = r.product_id) l
    ) t;
  return v_out;
end;
$$;
revoke execute on function public.get_recipe_costs() from public, anon, authenticated;
grant execute on function public.get_recipe_costs() to authenticated;
