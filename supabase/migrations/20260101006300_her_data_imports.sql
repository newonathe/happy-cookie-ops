-- B4a-3 (final-plan.md version 2, section 11, slice B4a): her data, entered by the operator.
--
-- Her workbook holds her items, her prices, her recipes, her flavour prices and her bookings. The app's owner screens enter these one at a
-- time; the operator enters a whole reviewed list in one sitting. Five imports, each a PAIR, both internal (no API role holds EXECUTE,
-- service_role included: the operator runs them as postgres through the connector, like apply_identity_links and apply_cost_cutover):
--
--   preview_import_X(rows)            what the call WOULD do. Writes nothing. Returns
--                                       will_write  the rows it would write, each in full (an id, the names it resolved, the values)
--                                       unchanged   the rows that are already there
--                                       unmatched   every row it cannot write, with its position `n`, the row, and a `why`
--                                       counts      how many of each (recipes also count rule_removals)
--                                       hash        the sha256 of the will_write list (canonical: sorted by its own text)
--   apply_import_X(rows, expected)    expected is EXACTLY {hash, counts} of the preview. It takes the catalogue lock, works the preview out
--                                     again, is REFUSED (P0002) when the hash or the counts differ, then writes only will_write, in one
--                                     transaction, with one audit row (action import.X; detail the counts, the hash and the will_write list, so a removed rule line or a flavour's old price can be
--                                     explained later). A call that
--                                     writes nothing writes no audit row either. The whole call is refused, never half applied: an
--                                     unmatched row is listed and left alone, but the caller must approve the preview as it stands.
--
--   X = items            rows {name, unit (g|ml|pcs), category (optional, default Ingredients)}
--                        a new item is made exactly as the owner's save would (active, nothing on hand, no supplier, never counted). Nothing is
--                        priced here. A name that is already an item is unchanged.
--   X = prices           rows {item, unit, price_cents, pack_size, as_of}
--                        her usual price: a dated row in item_prices (append-only; the latest date is the usual price), under an id worked out
--                        from the item, the date, the price and the pack, so the same row again is the same row. created_by is null. A price
--                        with the same price and pack as the item's latest row is unchanged.
--   X = recipes          rows {flavour, yield, lines [{item, qty, unit, kind}]} (kind ingredient|packaging)
--                        written by write_recipe, the one writer save_recipe also ends in. A recipe equal to the current one is unchanged; a
--                        different one is a new version (history kept) listed as `replaces vN`. A recipe with any bad line is held whole.
--                        DECISION (b): the item of a packaging line that a packaging rule takes per cookie (or a loose cookie) is taken
--                        OFF that rule first, by write_packaging_rule, the container's other lines kept; the preview names every removal
--                        (rule_removals, and on the recipe that causes it). Without that the save is refused by recipe-pack-double. A removal
--                        belongs to its recipe: a held recipe, or one that is unchanged, removes nothing.
--   X = flavours         rows {product, price_cents}: products.price_cents, written by write_flavour (the owner's whole-flavour save, with the row's
--                        other columns as they are). A flavour that the owner's save would refuse for another reason is listed with that why.
--   X = bookings         rows {name, starts_on, ends_on, place, rent_cents, active}: scheduled_events, written by write_scheduled_event, under an
--                        id worked out from the name and the dates. A booking with the same name and dates is unchanged, whatever its rent.
--
-- Nothing is guessed. A name must be exactly one record (case and surrounding spaces ignored); none, or several, lists the row and writes
-- nothing. A unit must be the item's own. No item, flavour or person name is written in this file: names are data in the call.
-- A name is also refused (the row is listed) when it holds an invisible space (btrim strips only the ASCII space, so a no-break space after
-- a name would make a second item that looks like the first: U+00A0, U+2000 to U+200F, U+2028 to U+202F, U+205F to U+206F, U+3000, U+FEFF) or
-- is not written in composed form (Unicode NFC), by import_name_ok. Two prices for one item on one day are refused, because the usual price
-- is the latest and two on one day would fall to an arbitrary id; and one flavour twice in a recipes call lists the second, so a packaging
-- rule line taken off for the first cannot be left behind by a second recipe that does not use it. The unchanged lists show the fields they
-- hide (an item's category; a booking's place, rent and switch), so a workbook that says otherwise is visible in the preview.
--
-- ONE RULE, ONE PLACE. The rows are checked by the same code as the owner's saves. Each owner save is split in two: write_X (internal, no owner
-- check: the one place the rule is checked and the row written) and save_X (the owner check, then write_X). The five functions below are the
-- ones this migration redefines, and the bodies of write_X are the old save_X bodies minus the owner check, character for character:
--   write_stock_item(item, stamp)        <- save_stock_item        write_item_price(price)               <- save_item_price
--   write_recipe(recipe, stamp)          <- save_recipe            write_flavour(id, flavour, stamp)     <- save_flavour
--   write_scheduled_event(event, stamp)  <- save_scheduled_event
-- save_* keep their signatures, their owner message and their grants. Their `-- rule:` lines now live in write_*.
--
-- HOW A PREVIEW CAN USE THE WRITERS AND WRITE NOTHING. run_import_X does the work row by row, each row in its own sub-transaction: a row
-- that the writer refuses (or that does not resolve) is caught, listed in `unmatched` with the writer's own message as its `why`, and its
-- writes are undone. preview_import_X runs run_import_X and then rolls the WHOLE run back, carrying the answer out in the error it
-- raises to do so. apply_import_X runs the same function and keeps it. So the preview and the apply cannot disagree about a row, and no rule is
-- copied. A re-run inside one call sees the rows before it (the same name twice is made once).
--
-- Each refusal of the imports is one `if ... then -- rule:name` line so the SQL role suite can neutralise it:
--   import-X-rows (22023: the rows are a list of 1 to 1000), import-X-row (the shape of a row), import-X-expected (22023), import-X-changed (P0002),
--   items: import-items-invisible, -unit, -ambiguous, -unit-differs; prices: import-prices-invisible, -item-none, -item-several, -unit, -same-day;
--   recipes: import-recipes-product-invisible, -product-none, -product-several, -flavour-twice, -line-invisible, -line-none, -line-several,
--   -line-unit, -held; flavours: import-flavours-invisible, -product-none, -product-several; bookings: import-bookings-invisible, -several.
--   The writers keep their own, as they had them.

/**
 * The one place a stock item is validated and written (what save_stock_item was, less the owner check). Creates (no stamp) or changes (with
 * the stamp the read returned) one stock item. Exactly these keys: id, name, category ('Ingredients' or 'Packaging'), unit, par_level,
 * pack_size (or null), pack_label, supplier_id (or null), use_by_days (or null), active. The quantity on hand is never written here.
 * Internal: save_stock_item and run_import_items call it.
 */
create or replace function public.write_stock_item(
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
revoke execute on function public.write_stock_item(jsonb, timestamptz) from public, anon, authenticated, service_role;

/** Owner only. Creates or changes one stock item; the body is write_stock_item's. */
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
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the stock items' using errcode = '42501';
  end if;
  return query select w.id, w.updated_at from public.write_stock_item(p_item, p_expected_updated_at) w;
end;
$$;
revoke execute on function public.save_stock_item(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_stock_item(jsonb, timestamptz) to authenticated;

/**
 * The one place her usual price for a stock item is validated and written (what save_item_price was, less the owner check). Append-only: an
 * edit is a new dated row, and the latest date (then the latest row) is her usual price. The body is exactly: id (a uuid), item_id,
 * price_cents (whole centavos from 1 to 1,000,000 pesos for the whole pack), pack_size (in the item's unit, above 0, at most 3 decimals), as_of
 * (YYYY-MM-DD, not after today in the shop's calendar). Returns the row's id and whether this id was already recorded (an identical retry is
 * answered; a different body under the same id is refused, 23505). Internal: save_item_price and run_import_prices call it.
 */
create or replace function public.write_item_price(p_price jsonb)
returns table (price_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys  text[];
  v_id    uuid;
  v_item  text;
  v_cents numeric;
  v_pack  numeric;
  v_date  date;
  v_hash  text;
  v_seen  text;
  v_bad   boolean;
begin
  if p_price is null or jsonb_typeof(p_price) <> 'object' then
    raise exception 'a price must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_price) k;
  if v_keys is distinct from array['as_of', 'id', 'item_id', 'pack_size', 'price_cents'] then -- rule:itemprice-keys
    raise exception 'a price carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_price -> 'id') <> 'string' or jsonb_typeof(p_price -> 'item_id') <> 'string'
     or jsonb_typeof(p_price -> 'price_cents') <> 'number' or jsonb_typeof(p_price -> 'pack_size') <> 'number'
     or jsonb_typeof(p_price -> 'as_of') <> 'string' then
    raise exception 'a price field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_price ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:itemprice-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_price ->> 'id')::uuid;
  v_item := p_price ->> 'item_id';
  v_cents := (p_price ->> 'price_cents')::numeric;
  v_bad := v_cents <> trunc(v_cents) or v_cents not between 1 and 100000000;
  if v_bad then -- rule:itemprice-cents
    raise exception 'a price is whole centavos from 1 to 1,000,000 pesos' using errcode = '22023';
  end if;
  v_pack := (p_price ->> 'pack_size')::numeric;
  v_bad := v_pack <> round(v_pack, 3) or v_pack not between 0.001 and 999999999;
  if v_bad then -- rule:itemprice-pack
    raise exception 'a pack size is above 0 and at most 999,999,999 with at most 3 decimals' using errcode = '22023';
  end if;
  v_bad := (p_price ->> 'as_of') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  if not v_bad then
    begin
      v_date := (p_price ->> 'as_of')::date;
      v_bad := to_char(v_date, 'YYYY-MM-DD') <> (p_price ->> 'as_of');
    exception when others then
      v_bad := true;
    end;
  end if;
  if v_bad then -- rule:itemprice-date
    raise exception 'the date is a real day written YYYY-MM-DD' using errcode = '22023';
  end if;
  if v_date > (select c.today from public.business_clock() c) then -- rule:itemprice-future
    raise exception 'the date is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('item_price:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_price::text, 'UTF8')), 'hex');
  select p.payload_hash into v_seen from public.item_prices p where p.id = v_id;
  if found then
    if v_seen <> v_hash then -- rule:itemprice-replay-conflict
      raise exception 'that id was already used for a different price' using errcode = '23505';
    end if;
    return query select v_id, true;
    return;
  end if;
  if not exists (select 1 from public.inventory_items i where i.id = v_item) then -- rule:itemprice-item-missing
    raise exception 'no such item' using errcode = 'P0002';
  end if;
  insert into public.item_prices (id, item_id, price_cents, pack_size, as_of, payload_hash, created_by)
  values (v_id, v_item, v_cents::bigint, v_pack, v_date, v_hash, auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'items.price', 'item_prices', v_id::text,
    jsonb_build_object('item_id', v_item, 'price_cents', v_cents, 'pack_size', v_pack, 'as_of', v_date));
  return query select v_id, false;
end;
$$;
revoke execute on function public.write_item_price(jsonb) from public, anon, authenticated, service_role;

/** Owner only. Records her usual price and pack for a stock item, from a date; the body is write_item_price's. */
create or replace function public.save_item_price(p_price jsonb)
returns table (price_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the usual prices' using errcode = '42501';
  end if;
  return query select w.price_id, w.duplicate from public.write_item_price(p_price) w;
end;
$$;
revoke execute on function public.save_item_price(jsonb) from public, anon, authenticated;
grant execute on function public.save_item_price(jsonb) to authenticated;

/**
 * The one place a recipe is validated and written (what save_recipe was, less the owner check). Creates (no stamp) or changes (with the stamp
 * the read returned) one recipe. The body is exactly: product_id, yield, lines (each exactly name, qty, unit, or kind, name, qty, unit). Returns
 * the recipe's version and stamp after the save; a save that changes nothing answers the version it found and makes no new one. B3a: every
 * line names exactly one stock item, whose id is stored with it, and every version, the current one included, has its row in recipe_versions.
 * B3b: a line is an ingredient (a quantity per batch, the default) or packaging (a quantity per cookie, taken when the cookie is packed or sold
 * and never at a bake); a packaging line's item may not also be taken per cookie by a packaging rule. B4a: an item that a packaging rule takes at
 * all is a packaging line, never an ingredient. Internal: save_recipe and run_import_recipes call it.
 */
create or replace function public.write_recipe(
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
             or ((select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['name', 'qty', 'unit']
                 and (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['kind', 'name', 'qty', 'unit']);
    if v_bad then -- rule:line-keys
      raise exception 'a line carries exactly name, qty and unit' using errcode = '22023';
    end if;
    -- B3b: a line is an ingredient (the default) or packaging; the old key set still means an ingredient.
    v_bad := v_line ? 'kind' and (jsonb_typeof(v_line -> 'kind') <> 'string' or (v_line ->> 'kind') not in ('ingredient', 'packaging'));
    if v_bad then -- rule:recipe-kind
      raise exception 'the kind of a line is ingredient or packaging' using errcode = '22023';
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
                   || case when l ->> 'kind' = 'packaging' then jsonb_build_object('kind', 'packaging') else '{}'::jsonb end
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
                            || case when i.kind = 'packaging' then jsonb_build_object('kind', 'packaging') else '{}'::jsonb end
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
  -- B3b: the double-take guard. A packaging line is taken per cookie, so its item may not also be taken per cookie by a container
  -- (a loose cookie counts as per cookie).
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    join public.packaging_rules r on r.item_id = (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x ->> 'name'))
                   where x ->> 'kind' = 'packaging' and (r.per = 'cookie' or r.container = 'loose'));
  if v_bad then -- rule:recipe-pack-double
    raise exception 'that item is already taken per cookie by a packaging rule: a cookie would take it twice' using errcode = '22023';
  end if;
  -- B4a (the B3b-1 review's residual): the other way round. A packaging rule takes its item when the order is packed, so a recipe may
  -- not also take it as an INGREDIENT at a bake (a line sent as an ingredient, or with no kind): a bake and a pack would both take it.
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    join public.packaging_rules r on r.item_id = (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x ->> 'name'))
                   where x ->> 'kind' is distinct from 'packaging');
  if v_bad then -- rule:recipe-ingredient-on-rule
    raise exception 'that item is taken by a packaging rule: it can be a packaging line of a recipe, not an ingredient' using errcode = '22023';
  end if;
  if v_row.product_id is null then
    if p_expected_updated_at is not null then -- rule:recipe-create-stamp
      raise exception 'that recipe does not exist' using errcode = 'P0002';
    end if;
    insert into public.recipes (product_id, yield_count) values (v_product, v_yield::integer)
      returning public.recipes.updated_at into v_at;
    insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id, kind)
      select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer,
             (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x.value ->> 'name')),
             coalesce(x.value ->> 'kind', 'ingredient')
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
  insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id, kind)
    select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer,
           (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x.value ->> 'name')),
           coalesce(x.value ->> 'kind', 'ingredient')
      from jsonb_array_elements(v_norm) with ordinality x(value, ord);
  update public.recipes as r set yield_count = v_yield::integer, version = r.version + 1
    where r.product_id = v_product
    returning r.updated_at into v_at;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    values (v_product, v_row.version + 1, v_yield::integer, v_norm); -- and the new one has its row
  return query select v_product, v_row.version + 1, v_at;
end;
$$;
revoke execute on function public.write_recipe(jsonb, timestamptz) from public, anon, authenticated, service_role;

/** Owner only. Creates or changes one recipe; the body is write_recipe's, and the stamp is passed through. */
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
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the recipes' using errcode = '42501';
  end if;
  return query select w.product_id, w.version, w.updated_at from public.write_recipe(p_recipe, p_expected_updated_at) w;
end;
$$;
revoke execute on function public.save_recipe(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_recipe(jsonb, timestamptz) to authenticated;

/**
 * The one place a flavour is validated and written (what save_flavour was, less the owner check). Creates (p_expected_updated_at null) or
 * replaces one flavour. `p_flavour` must carry exactly the editable keys below: a missing or unknown key is refused, so a caller cannot write a
 * field this function does not check (`published`, `updated_at`).
 *
 * image_path is spliced by the engine into an inline style's `url(...)` unquoted, so it is limited to path characters: no quote, parenthesis,
 * colon, semicolon or space can reach the style. Internal: save_flavour and run_import_flavours call it.
 */
create or replace function public.write_flavour(
  p_id text,
  p_flavour jsonb,
  p_expected_updated_at timestamptz
)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys  text[];
  v_price numeric;
  v_wt    numeric;
  v_sort  numeric;
  v_id    text;
  v_at    timestamptz;
begin

  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
    raise exception 'flavour id must be 1-32 lowercase letters, digits or dashes' using errcode = '22023';
  end if;
  if p_flavour is null or jsonb_typeof(p_flavour) <> 'object' then
    raise exception 'flavour must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_flavour) k;
  if v_keys is distinct from array['active', 'allergens', 'capacity_weight', 'description',
      'image_path', 'item_type', 'kind', 'name', 'price_cents', 'short_name', 'sort_order', 'tag'] then
    raise exception 'flavour must carry exactly the editable keys' using errcode = '22023';
  end if;

  if jsonb_typeof(p_flavour -> 'name') <> 'string' or jsonb_typeof(p_flavour -> 'short_name') <> 'string'
     or jsonb_typeof(p_flavour -> 'kind') <> 'string' or jsonb_typeof(p_flavour -> 'item_type') <> 'string'
     or jsonb_typeof(p_flavour -> 'tag') <> 'string' or jsonb_typeof(p_flavour -> 'description') <> 'string'
     or jsonb_typeof(p_flavour -> 'image_path') <> 'string' or jsonb_typeof(p_flavour -> 'allergens') <> 'string'
     or jsonb_typeof(p_flavour -> 'active') <> 'boolean'
     or jsonb_typeof(p_flavour -> 'price_cents') <> 'number'
     or jsonb_typeof(p_flavour -> 'capacity_weight') <> 'number'
     or jsonb_typeof(p_flavour -> 'sort_order') <> 'number' then
    raise exception 'flavour field has the wrong type' using errcode = '22023';
  end if;

  if length(btrim(p_flavour ->> 'name')) not between 1 and 60
     or length(btrim(p_flavour ->> 'short_name')) not between 1 and 40
     or length(p_flavour ->> 'tag') > 30
     or length(p_flavour ->> 'description') > 300
     -- The shop prints "Contains " + allergens, so an empty value would show a dangling word.
     or length(btrim(p_flavour ->> 'allergens')) not between 1 and 200
     or length(p_flavour ->> 'image_path') > 200
     or (p_flavour ->> 'image_path') !~ '^[A-Za-z0-9/_.-]*$'
     or (p_flavour ->> 'kind') not in ('Permanent', 'Rotating')
     or (p_flavour ->> 'item_type') not in ('cookie', 'set') then
    raise exception 'flavour text out of bounds' using errcode = '22023';
  end if;

  v_price := (p_flavour ->> 'price_cents')::numeric;
  v_wt := (p_flavour ->> 'capacity_weight')::numeric;
  v_sort := (p_flavour ->> 'sort_order')::numeric;
  if v_price <> trunc(v_price) or v_price < 0 or v_price > 1000000
     or v_wt <> trunc(v_wt) or v_wt < 1 or v_wt > 48
     or v_sort <> trunc(v_sort) or v_sort < 0 or v_sort > 999 then
    raise exception 'flavour number out of range' using errcode = '22023';
  end if;

  -- Same optimistic rule as save_setting(): null means "new flavour"; otherwise the row
  -- must still carry the updated_at the caller read (milliseconds, as a JS Date holds it).
  if p_expected_updated_at is null then
    insert into public.products as p (id, name, short_name, price_cents, kind, item_type,
        capacity_weight, tag, description, image_path, allergens, active, sort_order)
      values (p_id, btrim(p_flavour ->> 'name'), btrim(p_flavour ->> 'short_name'), v_price::bigint,
        p_flavour ->> 'kind', p_flavour ->> 'item_type', v_wt::integer, p_flavour ->> 'tag',
        p_flavour ->> 'description', p_flavour ->> 'image_path', p_flavour ->> 'allergens',
        (p_flavour ->> 'active')::boolean, v_sort::integer)
      on conflict (id) do nothing
      returning p.id, p.updated_at into v_id, v_at;
  else
    update public.products as p set
        name = btrim(p_flavour ->> 'name'), short_name = btrim(p_flavour ->> 'short_name'),
        price_cents = v_price::bigint, kind = p_flavour ->> 'kind',
        item_type = p_flavour ->> 'item_type', capacity_weight = v_wt::integer,
        tag = p_flavour ->> 'tag', description = p_flavour ->> 'description',
        image_path = p_flavour ->> 'image_path', allergens = p_flavour ->> 'allergens',
        active = (p_flavour ->> 'active')::boolean, sort_order = v_sort::integer
      where p.id = p_id
        and date_trunc('milliseconds', p.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
      returning p.id, p.updated_at into v_id, v_at;
  end if;

  if v_id is null then
    raise exception 'flavour changed since it was read: %', p_id using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.write_flavour(text, jsonb, timestamptz) from public, anon, authenticated, service_role;

/** Owner only. Creates or replaces one flavour; the body is write_flavour's, and the stamp is passed through. */
create or replace function public.save_flavour(
  p_id text,
  p_flavour jsonb,
  p_expected_updated_at timestamptz
)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the flavour list' using errcode = '42501';
  end if;
  return query select w.id, w.updated_at from public.write_flavour(p_id, p_flavour, p_expected_updated_at) w;
end;
$$;
revoke execute on function public.save_flavour(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_flavour(text, jsonb, timestamptz) to authenticated;

/**
 * The one place a booking is validated and written (what save_scheduled_event was, less the owner check). Creates (the id is minted by the caller,
 * with no stamp) or changes (with the stamp the read returned) one booking. The body is exactly these keys and nothing else: id, name, starts_on,
 * ends_on, place, rent_cents, active. Internal: save_scheduled_event and run_import_bookings call it.
 */
create or replace function public.write_scheduled_event(
  p_event jsonb,
  p_expected_updated_at timestamptz
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys   text[];
  v_id     uuid;
  v_name   text;
  v_place  text;
  v_start  date;
  v_end    date;
  v_rent   numeric;
  v_active boolean;
  v_row    public.scheduled_events%rowtype;
  v_at     timestamptz;
  v_same   boolean;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'a scheduled event must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_event) k;
  if v_keys is distinct from array['active', 'ends_on', 'id', 'name', 'place', 'rent_cents', 'starts_on'] then -- rule:keys
    raise exception 'a scheduled event carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_event -> 'id') <> 'string' or jsonb_typeof(p_event -> 'name') <> 'string'
     or jsonb_typeof(p_event -> 'place') <> 'string' or jsonb_typeof(p_event -> 'starts_on') <> 'string'
     or jsonb_typeof(p_event -> 'ends_on') <> 'string' or jsonb_typeof(p_event -> 'rent_cents') <> 'number'
     or jsonb_typeof(p_event -> 'active') <> 'boolean' then
    raise exception 'a scheduled event field has the wrong type' using errcode = '22023';
  end if;
  if (p_event ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_event ->> 'id')::uuid;
  v_name := btrim(p_event ->> 'name');
  v_place := btrim(p_event ->> 'place');
  if length(v_name) not between 1 and 80 or length(v_place) > 80 or (v_name || v_place) ~ '[[:cntrl:]]' then -- rule:text
    raise exception 'the name is 1 to 80 characters and the place at most 80' using errcode = '22023';
  end if;
  if (p_event ->> 'starts_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (p_event ->> 'ends_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'dates are YYYY-MM-DD' using errcode = '22023';
  end if;
  begin
    v_start := (p_event ->> 'starts_on')::date;
    v_end := (p_event ->> 'ends_on')::date;
  exception when others then
    raise exception 'a date is not a real date' using errcode = '22023';
  end;
  if v_end < v_start or v_end - v_start > 14 then -- rule:dates
    raise exception 'a booking ends on or after it starts, and lasts at most 15 days' using errcode = '22023';
  end if;
  v_rent := (p_event ->> 'rent_cents')::numeric;
  if v_rent <> trunc(v_rent) or v_rent not between 0 and 100000000 then -- rule:rent
    raise exception 'rent is whole centavos from 0 to 1,000,000 pesos' using errcode = '22023';
  end if;
  v_active := (p_event ->> 'active')::boolean;

  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_id::text, 0));
  select * into v_row from public.scheduled_events s where s.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:create-stamp
      raise exception 'that booking does not exist' using errcode = 'P0002';
    end if;
    insert into public.scheduled_events (id, name, starts_on, ends_on, place, rent_cents, active)
    values (v_id, v_name, v_start, v_end, v_place, v_rent::bigint, v_active)
    returning updated_at into v_at;
    return query select v_id, v_at;
    return;
  end if;
  -- A lost reply on a create: the same body again is answered with the row that exists.
  if p_expected_updated_at is null then
    v_same := v_row.name = v_name and v_row.starts_on = v_start and v_row.ends_on = v_end and v_row.place = v_place
              and v_row.rent_cents = v_rent::bigint and v_row.active = v_active;
    if v_same then -- rule:replay
      return query select v_row.id, v_row.updated_at;
      return;
    end if;
    raise exception 'that booking already exists with other values' using errcode = 'P0002';
  end if;
  update public.scheduled_events as s set
      name = v_name, starts_on = v_start, ends_on = v_end, place = v_place,
      rent_cents = v_rent::bigint, active = v_active
    where s.id = v_id and date_trunc('milliseconds', s.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning s.updated_at into v_at;
  if v_at is null then -- rule:stale
    raise exception 'the booking changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.write_scheduled_event(jsonb, timestamptz) from public, anon, authenticated, service_role;

/** Owner only. Creates or changes one booking; the body is write_scheduled_event's, and the stamp is passed through. */
create or replace function public.save_scheduled_event(
  p_event jsonb,
  p_expected_updated_at timestamptz
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the scheduled events' using errcode = '42501';
  end if;
  return query select w.id, w.updated_at from public.write_scheduled_event(p_event, p_expected_updated_at) w;
end;
$$;
revoke execute on function public.save_scheduled_event(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_scheduled_event(jsonb, timestamptz) to authenticated;

-- ================================================================== the imports

/** Internal. True when p_row is an object that has every key of p_required and no key outside p_required and p_optional. */
create or replace function public.import_keys_ok(p_row jsonb, p_required text[], p_optional text[])
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_row) is distinct from 'object' then false
    else not exists (select 1 from unnest(p_required) r(k) where not (p_row ? r.k))
         and not exists (select 1 from jsonb_object_keys(p_row) k where not (k = any (p_required) or k = any (p_optional)))
  end
$$;
revoke execute on function public.import_keys_ok(jsonb, text[], text[]) from public, anon, authenticated, service_role;

/**
 * Internal. True when p_name has no invisible space and is written in composed form (Unicode NFC). btrim strips only the ASCII space, so a name
 * followed by a no-break space (U+00A0), a space of U+2000 to U+200F (the zero-width ones too), U+2028 to U+202F, U+205F to U+206F, an
 * ideographic space (U+3000), a byte-order mark (U+FEFF), or a character that shows nothing (a soft hyphen U+00AD, U+034F, the Hangul fillers
 * U+115F, U+1160, U+3164 and U+FFA0, an Ogham space mark U+1680, U+180E, the variation selectors U+FE00 to U+FE0F, the tag characters U+E0000 to
 * U+E007F) would not be the name it looks like, and an e followed by a combining accent is not the
 * same text as the accented e. The imports refuse such a name, so they cannot make a second item, flavour or booking that looks like the first.
 */
create or replace function public.import_name_ok(p_name text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(p_name = normalize(p_name, nfc)
                  and p_name !~ '[\u00a0\u00ad\u034f\u115f\u1160\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\U000e0000-\U000e007f]', false)
$$;
revoke execute on function public.import_name_ok(text) from public, anon, authenticated, service_role;

/**
 * Internal. True when p_expected is exactly {hash, counts}: hash 64 lower-case hex, counts an object with exactly the keys p_count_keys, each a
 * whole number of 0 or more.
 */
create or replace function public.import_expected_ok(p_expected jsonb, p_count_keys text[])
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_expected is null or jsonb_typeof(p_expected) <> 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(p_expected) k) is distinct from array['counts', 'hash'] then false
    when jsonb_typeof(p_expected -> 'hash') <> 'string' or (p_expected ->> 'hash') !~ '^[0-9a-f]{64}$' then false
    when jsonb_typeof(p_expected -> 'counts') <> 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(p_expected -> 'counts') k)
         is distinct from (select array_agg(c order by c) from unnest(p_count_keys) c) then false
    else not exists (select 1 from jsonb_each(p_expected -> 'counts') e
                      where case when jsonb_typeof(e.value) <> 'number' then true
                                 else (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric) or (e.value #>> '{}')::numeric < 0 end)
  end
$$;
revoke execute on function public.import_expected_ok(jsonb, text[]) from public, anon, authenticated, service_role;

/**
 * Internal. What every preview returns: the will_write list sorted by its own text (so the same work is the same list), the unchanged list
 * sorted the same way, the unmatched list in the order of the call, the counts, and `hash`, the sha256 of the will_write list's text. A recipe
 * import also passes its packaging-rule removals (null for the others) and gets them listed and counted.
 */
create or replace function public.import_result(p_write jsonb, p_same jsonb, p_unmatched jsonb, p_removals jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_write jsonb;
  v_same  jsonb;
  v_out   jsonb;
begin
  select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) into v_write from jsonb_array_elements(p_write) x;
  select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) into v_same from jsonb_array_elements(p_same) x;
  v_out := jsonb_build_object(
    'will_write', v_write, 'unchanged', v_same, 'unmatched', p_unmatched,
    'counts', jsonb_build_object('will_write', jsonb_array_length(v_write), 'unchanged', jsonb_array_length(v_same),
                                 'unmatched', jsonb_array_length(p_unmatched)),
    'hash', encode(sha256(convert_to(v_write::text, 'UTF8')), 'hex'));
  if p_removals is not null then
    v_out := v_out || jsonb_build_object(
      'rule_removals', (select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) from jsonb_array_elements(p_removals) x),
      'counts', (v_out -> 'counts') || jsonb_build_object('rule_removals', jsonb_array_length(p_removals)));
  end if;
  return v_out;
end;
$$;
revoke execute on function public.import_result(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;

/**
 * Internal, for the items import: does the work row by row and returns the import result. Called by preview_import_items (which rolls it back)
 * and apply_import_items (which keeps it). A row is {name, unit, category}: the unit is g, ml or pcs; the name is matched ignoring case and
 * surrounding spaces; none is made as save_stock_item would (through write_stock_item, under an id worked out from the name), one is unchanged
 * when its unit is the row's, several or another unit are listed.
 */
create or replace function public.run_import_items(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad       boolean;
  v_n         integer := 0;
  v_row       jsonb;
  v_name      text;
  v_unit      text;
  v_cat       text;
  v_cnt       integer;
  v_item      public.inventory_items%rowtype;
  v_id        text;
  v_write     jsonb := '[]'::jsonb;
  v_same      jsonb := '[]'::jsonb;
  v_unmatched jsonb := '[]'::jsonb;
begin
  v_bad := case when p_rows is null or jsonb_typeof(p_rows) <> 'array' then true
                else jsonb_array_length(p_rows) not between 1 and 1000 end;
  if v_bad then -- rule:import-items-rows
    raise exception 'the rows are a list of 1 to 1000 items' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  for v_row in select e.value from jsonb_array_elements(p_rows) with ordinality e(value, ord) order by e.ord loop
    v_n := v_n + 1;
    begin
      v_bad := not public.import_keys_ok(v_row, array['name', 'unit'], array['category'])
               or jsonb_typeof(v_row -> 'name') <> 'string' or jsonb_typeof(v_row -> 'unit') <> 'string'
               or (v_row ? 'category' and jsonb_typeof(v_row -> 'category') <> 'string');
      if v_bad then -- rule:import-items-row
        raise exception 'the row carries exactly name, unit and optionally category' using errcode = '22023';
      end if;
      if not public.import_name_ok(v_row ->> 'name') then -- rule:import-items-invisible
        raise exception 'a name has an invisible space or is not in composed form' using errcode = '22023';
      end if;
      v_name := btrim(v_row ->> 'name');
      v_unit := btrim(v_row ->> 'unit');
      v_cat := coalesce(v_row ->> 'category', 'Ingredients');
      if v_unit not in ('g', 'ml', 'pcs') then -- rule:import-items-unit
        raise exception 'the unit is g, ml or pcs' using errcode = '22023';
      end if;
      select count(*) into v_cnt from public.inventory_items i where lower(btrim(i.name)) = lower(v_name);
      if v_cnt > 1 then -- rule:import-items-ambiguous
        raise exception 'several items have that name' using errcode = '22023';
      end if;
      if v_cnt = 1 then
        select * into v_item from public.inventory_items i where lower(btrim(i.name)) = lower(v_name);
        if v_item.unit <> v_unit then -- rule:import-items-unit-differs
          raise exception 'that item is stocked in another unit' using errcode = '22023';
        end if;
        v_same := v_same || jsonb_build_array(jsonb_build_object('id', v_item.id, 'name', v_item.name, 'unit', v_item.unit, 'category', v_item.category));
      else
        v_id := md5('import:item:' || lower(v_name))::uuid::text;
        perform public.write_stock_item(jsonb_build_object('id', v_id, 'name', v_name, 'category', v_cat, 'unit', v_unit, 'par_level', 0,
          'pack_size', null, 'pack_label', '', 'supplier_id', null, 'use_by_days', null, 'active', true), null);
        v_write := v_write || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_name, 'unit', v_unit, 'category', v_cat));
      end if;
    exception when sqlstate '22023' or sqlstate 'P0002' or sqlstate '23505' or sqlstate '23503' or sqlstate '23514' or sqlstate '23502'
                 or sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22001' or sqlstate '22004' then
      v_unmatched := v_unmatched || jsonb_build_array(jsonb_build_object('n', v_n, 'row', v_row, 'why', sqlerrm));
    end;
  end loop;
  return public.import_result(v_write, v_same, v_unmatched, null);
end;
$$;
revoke execute on function public.run_import_items(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: what apply_import_items would do with these rows now, and what it could not. Writes nothing (the work is done and rolled
 * back). Returns will_write, unchanged, unmatched (each with its `n`, the row and a `why`), counts and hash; see the head of this file.
 */
create or replace function public.preview_import_items(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  begin
    v_out := public.run_import_items(p_rows);
    raise exception '%', v_out::text using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    return sqlerrm::jsonb;
  end;
end;
$$;
revoke execute on function public.preview_import_items(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: writes exactly the will_write rows of the preview the operator looked at. p_expected is exactly {hash, counts} of that
 * preview. The preview is worked out again under the catalogue lock and the call is refused (P0002) when either differs. Then the same work is
 * done for real, in this one transaction, and one audit row (action import.items) records the counts, the hash and the will_write list. A call with nothing to write
 * writes nothing and no audit row. Returns what was done, in the shape of the preview.
 */
create or replace function public.apply_import_items(p_rows jsonb, p_expected jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad boolean;
  v_pre jsonb;
  v_res jsonb;
begin
  v_bad := not public.import_expected_ok(p_expected, array['unchanged', 'unmatched', 'will_write']);
  if v_bad then -- rule:import-items-expected
    raise exception 'the expected object is exactly the hash and the counts of the preview' using errcode = '22023';
  end if;
  -- The catalogue's lock (the stock saves, save_recipe and record_production take it first), so nothing moves between the preview and the write.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_pre := public.preview_import_items(p_rows);
  v_bad := p_expected is distinct from jsonb_build_object('hash', v_pre ->> 'hash', 'counts', v_pre -> 'counts');
  if v_bad then -- rule:import-items-changed
    raise exception 'the rows or the catalogue changed since the preview: preview again' using errcode = 'P0002';
  end if;
  v_res := public.run_import_items(p_rows);
  if v_res ->> 'hash' is distinct from v_pre ->> 'hash' or v_res -> 'counts' is distinct from v_pre -> 'counts' then
    raise exception 'the import did not do what its preview said' using errcode = 'XX000';
  end if;
  if (v_res -> 'counts' ->> 'will_write')::integer > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'import.items', 'imports', 'items', jsonb_build_object('counts', v_res -> 'counts', 'hash', v_res ->> 'hash', 'will_write', v_res -> 'will_write'));
  end if;
  return v_res;
end;
$$;
revoke execute on function public.apply_import_items(jsonb, jsonb) from public, anon, authenticated, service_role;

/**
 * Internal, for the prices import: does the work row by row and returns the import result. A row is {item, unit, price_cents, pack_size, as_of}:
 * the item is matched by name (exactly one), its unit must be the row's, the row is checked by write_item_price (and undone), and it is
 * unchanged when its id already exists (an id worked out from the item, the date, the price and the pack) or its price and pack are those of
 * the item's latest row; otherwise it is written by write_item_price with no creator.
 */
create or replace function public.run_import_prices(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad       boolean;
  v_n         integer := 0;
  v_row       jsonb;
  v_cnt       integer;
  v_item      public.inventory_items%rowtype;
  v_cents     numeric;
  v_pack      numeric;
  v_id        uuid;
  v_payload   jsonb;
  v_last      public.item_prices%rowtype;
  v_same      boolean;
  v_entry     jsonb;
  v_write     jsonb := '[]'::jsonb;
  v_unchanged jsonb := '[]'::jsonb;
  v_unmatched jsonb := '[]'::jsonb;
begin
  v_bad := case when p_rows is null or jsonb_typeof(p_rows) <> 'array' then true
                else jsonb_array_length(p_rows) not between 1 and 1000 end;
  if v_bad then -- rule:import-prices-rows
    raise exception 'the rows are a list of 1 to 1000 prices' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  for v_row in select e.value from jsonb_array_elements(p_rows) with ordinality e(value, ord) order by e.ord loop
    v_n := v_n + 1;
    begin
      v_bad := not public.import_keys_ok(v_row, array['as_of', 'item', 'pack_size', 'price_cents', 'unit'], array[]::text[])
               or jsonb_typeof(v_row -> 'item') <> 'string' or jsonb_typeof(v_row -> 'unit') <> 'string'
               or jsonb_typeof(v_row -> 'as_of') <> 'string' or jsonb_typeof(v_row -> 'price_cents') <> 'number'
               or jsonb_typeof(v_row -> 'pack_size') <> 'number';
      if v_bad then -- rule:import-prices-row
        raise exception 'the row carries exactly item, unit, price_cents, pack_size and as_of' using errcode = '22023';
      end if;
      if not public.import_name_ok(v_row ->> 'item') then -- rule:import-prices-invisible
        raise exception 'a name has an invisible space or is not in composed form' using errcode = '22023';
      end if;
      select count(*) into v_cnt from public.inventory_items i where lower(btrim(i.name)) = lower(btrim(v_row ->> 'item'));
      if v_cnt = 0 then -- rule:import-prices-item-none
        raise exception 'no stock item has that name' using errcode = '22023';
      end if;
      if v_cnt > 1 then -- rule:import-prices-item-several
        raise exception 'several stock items have that name' using errcode = '22023';
      end if;
      select * into v_item from public.inventory_items i where lower(btrim(i.name)) = lower(btrim(v_row ->> 'item'));
      if v_item.unit <> btrim(v_row ->> 'unit') then -- rule:import-prices-unit
        raise exception 'that item is stocked in another unit' using errcode = '22023';
      end if;
      v_cents := (v_row ->> 'price_cents')::numeric;
      v_pack := (v_row ->> 'pack_size')::numeric;
      v_id := md5('import:price:' || v_item.id || '|' || (v_row ->> 'as_of') || '|' || trim_scale(v_cents)::text || '|' || trim_scale(v_pack)::text)::uuid;
      v_payload := jsonb_build_object('id', v_id, 'item_id', v_item.id, 'price_cents', trim_scale(v_cents), 'pack_size', trim_scale(v_pack),
                                      'as_of', v_row ->> 'as_of');
      -- Check the row by the owner's rules without writing it: write it, then undo it.
      begin
        perform public.write_item_price(v_payload);
        raise exception 'checked' using errcode = 'P0098';
      exception when sqlstate 'P0098' then
        null;
      end;
      select * into v_last from public.item_prices x where x.item_id = v_item.id order by x.as_of desc, x.received_at desc, x.id desc limit 1;
      v_same := exists (select 1 from public.item_prices x where x.id = v_id)
                or (v_last.id is not null and v_last.price_cents = v_cents and v_last.pack_size = v_pack);
      -- One item, one day, one price: the usual price is the latest row, and two on one day would fall to an arbitrary id. The rows before this
      -- one in the same call are written already, so they are seen here too.
      if not v_same and exists (select 1 from public.item_prices x where x.item_id = v_item.id and x.as_of = (v_row ->> 'as_of')::date and x.id <> v_id) then -- rule:import-prices-same-day
        raise exception 'that item already has a price dated that day' using errcode = '22023';
      end if;
      v_entry := jsonb_build_object('id', v_id, 'item_id', v_item.id, 'item', v_item.name, 'unit', v_item.unit, 'price_cents', trim_scale(v_cents),
                                    'pack_size', trim_scale(v_pack), 'as_of', v_row ->> 'as_of');
      if v_same then
        v_unchanged := v_unchanged || jsonb_build_array(v_entry);
      else
        perform public.write_item_price(v_payload);
        v_write := v_write || jsonb_build_array(v_entry);
      end if;
    exception when sqlstate '22023' or sqlstate 'P0002' or sqlstate '23505' or sqlstate '23503' or sqlstate '23514' or sqlstate '23502'
                 or sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22001' or sqlstate '22004' then
      v_unmatched := v_unmatched || jsonb_build_array(jsonb_build_object('n', v_n, 'row', v_row, 'why', sqlerrm));
    end;
  end loop;
  return public.import_result(v_write, v_unchanged, v_unmatched, null);
end;
$$;
revoke execute on function public.run_import_prices(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: what apply_import_prices would do with these rows now, and what it could not. Writes nothing (the work is done and rolled
 * back). Returns will_write, unchanged, unmatched (each with its `n`, the row and a `why`), counts and hash; see the head of this file.
 */
create or replace function public.preview_import_prices(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  begin
    v_out := public.run_import_prices(p_rows);
    raise exception '%', v_out::text using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    return sqlerrm::jsonb;
  end;
end;
$$;
revoke execute on function public.preview_import_prices(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: writes exactly the will_write rows of the preview the operator looked at. p_expected is exactly {hash, counts} of that
 * preview. The preview is worked out again under the catalogue lock and the call is refused (P0002) when either differs. Then the same work is
 * done for real, in this one transaction, and one audit row (action import.prices) records the counts, the hash and the will_write list. A call with nothing to write
 * writes nothing and no audit row. Returns what was done, in the shape of the preview.
 */
create or replace function public.apply_import_prices(p_rows jsonb, p_expected jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad boolean;
  v_pre jsonb;
  v_res jsonb;
begin
  v_bad := not public.import_expected_ok(p_expected, array['unchanged', 'unmatched', 'will_write']);
  if v_bad then -- rule:import-prices-expected
    raise exception 'the expected object is exactly the hash and the counts of the preview' using errcode = '22023';
  end if;
  -- The catalogue's lock (the stock saves, save_recipe and record_production take it first), so nothing moves between the preview and the write.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_pre := public.preview_import_prices(p_rows);
  v_bad := p_expected is distinct from jsonb_build_object('hash', v_pre ->> 'hash', 'counts', v_pre -> 'counts');
  if v_bad then -- rule:import-prices-changed
    raise exception 'the rows or the catalogue changed since the preview: preview again' using errcode = 'P0002';
  end if;
  v_res := public.run_import_prices(p_rows);
  if v_res ->> 'hash' is distinct from v_pre ->> 'hash' or v_res -> 'counts' is distinct from v_pre -> 'counts' then
    raise exception 'the import did not do what its preview said' using errcode = 'XX000';
  end if;
  if (v_res -> 'counts' ->> 'will_write')::integer > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'import.prices', 'imports', 'prices', jsonb_build_object('counts', v_res -> 'counts', 'hash', v_res ->> 'hash', 'will_write', v_res -> 'will_write'));
  end if;
  return v_res;
end;
$$;
revoke execute on function public.apply_import_prices(jsonb, jsonb) from public, anon, authenticated, service_role;

/**
 * Internal, for the recipes import: does the work row by row and returns the import result. A row is {flavour, yield, lines [{item, qty, unit,
 * kind}]}. The flavour is matched by name (exactly one); every line item by name (exactly one) with its own unit; a recipe with any bad line is
 * held whole. DECISION (b): the item of each packaging line that a packaging rule takes per cookie (or a loose cookie) is first taken off that
 * rule (write_packaging_rule, the container's other lines kept), then the recipe is written by write_recipe with the recipe's own current stamp.
 * All of one recipe is one sub-transaction: a recipe the writer refuses leaves its rules as they were, and a recipe that turns out to be unchanged
 * removes nothing. A new recipe is `new`; a changed one `replaces vN` (the old version is kept in recipe_versions).
 */
create or replace function public.run_import_recipes(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad       boolean;
  v_n         integer := 0;
  v_row       jsonb;
  v_cnt       integer;
  v_pid       text;
  v_pname     text;
  v_line      jsonb;
  v_ord       bigint;
  v_iid       text;
  v_iname     text;
  v_probs     text[];
  v_lines     jsonb;
  v_pack_ids  text[];
  v_before    integer;
  v_stamp     timestamptz;
  v_res       record;
  v_c         record;
  v_gone      jsonb;
  v_keep      jsonb;
  v_removed   jsonb;
  v_noop      boolean;
  v_seen      text[] := '{}';
  v_write     jsonb := '[]'::jsonb;
  v_same      jsonb := '[]'::jsonb;
  v_unmatched jsonb := '[]'::jsonb;
  v_all_gone  jsonb := '[]'::jsonb;
begin
  v_bad := case when p_rows is null or jsonb_typeof(p_rows) <> 'array' then true
                else jsonb_array_length(p_rows) not between 1 and 1000 end;
  if v_bad then -- rule:import-recipes-rows
    raise exception 'the rows are a list of 1 to 1000 recipes' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  for v_row in select e.value from jsonb_array_elements(p_rows) with ordinality e(value, ord) order by e.ord loop
    v_n := v_n + 1;
    begin
      v_bad := case when not public.import_keys_ok(v_row, array['flavour', 'lines', 'yield'], array[]::text[]) then true
                    when jsonb_typeof(v_row -> 'flavour') <> 'string' or jsonb_typeof(v_row -> 'yield') <> 'number'
                         or jsonb_typeof(v_row -> 'lines') <> 'array' then true
                    else exists (select 1 from jsonb_array_elements(v_row -> 'lines') l
                                  where not public.import_keys_ok(l, array['item', 'kind', 'qty', 'unit'], array[]::text[])
                                     or jsonb_typeof(l -> 'item') <> 'string' or jsonb_typeof(l -> 'kind') <> 'string'
                                     or jsonb_typeof(l -> 'qty') <> 'number' or jsonb_typeof(l -> 'unit') <> 'string') end;
      if v_bad then -- rule:import-recipes-row
        raise exception 'the row carries exactly flavour, yield and lines of item, qty, unit and kind' using errcode = '22023';
      end if;
      if not public.import_name_ok(v_row ->> 'flavour') then -- rule:import-recipes-product-invisible
        raise exception 'a name has an invisible space or is not in composed form' using errcode = '22023';
      end if;
      select count(*), min(p.id) into v_cnt, v_pid from public.products p where lower(btrim(p.name)) = lower(btrim(v_row ->> 'flavour'));
      if v_cnt = 0 then -- rule:import-recipes-product-none
        raise exception 'no flavour has that name' using errcode = '22023';
      end if;
      if v_cnt > 1 then -- rule:import-recipes-product-several
        raise exception 'several flavours have that name' using errcode = '22023';
      end if;
      -- A flavour is written once in a call: a second recipe for it would be worked out on the first, and a packaging rule line taken off for the
      -- first would stay off though the second does not use that item. A flavour is marked once its row is done (written, or found unchanged); a
      -- row that fails undoes everything it did, so a later row for the same flavour starts from a clean state and is judged on its own.
      if v_pid = any (v_seen) then -- rule:import-recipes-flavour-twice
        raise exception 'that flavour is already in this call' using errcode = '22023';
      end if;
      select p.name into v_pname from public.products p where p.id = v_pid;

      -- every line item: exactly one stock item, in the line's own unit. All the problems are listed, and the recipe is held whole.
      v_probs := '{}';
      v_lines := '[]'::jsonb;
      for v_line, v_ord in select l.value, l.ord from jsonb_array_elements(v_row -> 'lines') with ordinality l(value, ord) order by l.ord loop
        if not public.import_name_ok(v_line ->> 'item') then -- rule:import-recipes-line-invisible
          v_probs := array_append(v_probs, 'line ' || v_ord || ': a name has an invisible space or is not in composed form');
          continue;
        end if;
        select count(*), min(i.id) into v_cnt, v_iid from public.inventory_items i where lower(btrim(i.name)) = lower(btrim(v_line ->> 'item'));
        if v_cnt = 0 then -- rule:import-recipes-line-none
          v_probs := array_append(v_probs, 'line ' || v_ord || ': no stock item has that name');
        end if;
        if v_cnt > 1 then -- rule:import-recipes-line-several
          v_probs := array_append(v_probs, 'line ' || v_ord || ': several stock items have that name');
        end if;
        if v_cnt = 1 and (select i.unit from public.inventory_items i where i.id = v_iid) <> btrim(v_line ->> 'unit') then -- rule:import-recipes-line-unit
          v_probs := array_append(v_probs, 'line ' || v_ord || ': the item is stocked in another unit');
        end if;
        v_iname := btrim(v_line ->> 'item');
        if v_cnt = 1 then
          select i.name into v_iname from public.inventory_items i where i.id = v_iid;
        end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('name', v_iname, 'qty', v_line -> 'qty', 'unit', v_line -> 'unit', 'kind', v_line -> 'kind'));
      end loop;
      if cardinality(v_probs) > 0 then -- rule:import-recipes-held
        raise exception 'the recipe is held whole: %', array_to_string(v_probs, '; ') using errcode = '22023';
      end if;

      select coalesce(array_agg(i.id), '{}') into v_pack_ids
        from jsonb_array_elements(v_row -> 'lines') l
        join public.inventory_items i on lower(btrim(i.name)) = lower(btrim(l ->> 'item'))
       where l ->> 'kind' = 'packaging';
      select r.version, r.updated_at into v_before, v_stamp from public.recipes r where r.product_id = v_pid;
      v_removed := '[]'::jsonb;
      v_noop := false;
      begin
        -- DECISION (b): first off the rules that take the item per cookie (or loose), the container's other lines kept.
        for v_c in select distinct r.container, r.box_size from public.packaging_rules r
                    where r.item_id = any (v_pack_ids) and (r.per = 'cookie' or r.container = 'loose')
                    order by r.container, r.box_size nulls first loop
          select coalesce(jsonb_agg(jsonb_build_object('container', r.container, 'box_size', r.box_size, 'item_id', r.item_id, 'item', i.name,
                                                       'qty', r.qty, 'per', r.per) order by r.position), '[]'::jsonb)
            into v_gone
            from public.packaging_rules r join public.inventory_items i on i.id = r.item_id
           where r.container = v_c.container and r.box_size is not distinct from v_c.box_size
             and r.item_id = any (v_pack_ids) and (r.per = 'cookie' or r.container = 'loose');
          select coalesce(jsonb_agg(jsonb_build_object('item_id', r.item_id, 'qty', r.qty, 'per', r.per) order by r.position), '[]'::jsonb)
            into v_keep
            from public.packaging_rules r
           where r.container = v_c.container and r.box_size is not distinct from v_c.box_size
             and not (r.item_id = any (v_pack_ids) and (r.per = 'cookie' or r.container = 'loose'));
          perform public.write_packaging_rule(jsonb_build_object('container', v_c.container, 'box_size', v_c.box_size, 'lines', v_keep));
          v_removed := v_removed || v_gone;
        end loop;
        select * into v_res from public.write_recipe(jsonb_build_object('product_id', v_pid, 'yield', v_row -> 'yield', 'lines', v_lines), v_stamp);
        if v_res.version is not distinct from v_before then
          raise exception 'nothing to change' using errcode = 'P0097';
        end if;
      exception when sqlstate 'P0097' then
        v_noop := true;
        v_removed := '[]'::jsonb;
      end;

      if v_noop then
        v_same := v_same || jsonb_build_array(jsonb_build_object('product_id', v_pid, 'flavour', v_pname, 'version', v_res.version));
      else
        v_removed := (select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) from jsonb_array_elements(v_removed) x);
        v_write := v_write || jsonb_build_array(jsonb_build_object(
          'product_id', v_pid, 'flavour', v_pname, 'yield', trim_scale((v_row ->> 'yield')::numeric),
          'lines', (select jsonb_agg(jsonb_build_object('item_id', i.id, 'item', i.name, 'qty', trim_scale(round((l.value ->> 'qty')::numeric, 3)),
                                                         'unit', l.value ->> 'unit', 'kind', l.value ->> 'kind') order by l.ord)
                      from jsonb_array_elements(v_row -> 'lines') with ordinality l(value, ord)
                      join public.inventory_items i on lower(btrim(i.name)) = lower(btrim(l.value ->> 'item'))),
          'action', case when v_before is null then 'new' else 'replaces v' || v_before end,
          'rule_removals', v_removed));
        v_all_gone := v_all_gone || v_removed;
      end if;
      v_seen := array_append(v_seen, v_pid);
    exception when sqlstate '22023' or sqlstate 'P0002' or sqlstate '23505' or sqlstate '23503' or sqlstate '23514' or sqlstate '23502'
                 or sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22001' or sqlstate '22004' then
      v_unmatched := v_unmatched || jsonb_build_array(jsonb_build_object('n', v_n, 'row', v_row, 'why', sqlerrm));
    end;
  end loop;
  return public.import_result(v_write, v_same, v_unmatched, v_all_gone);
end;
$$;
revoke execute on function public.run_import_recipes(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: what apply_import_recipes would do with these rows now, and what it could not. Writes nothing (the work is done and rolled
 * back). Returns will_write, unchanged, unmatched (each with its `n`, the row and a `why`), counts and hash; see the head of this file.
 */
create or replace function public.preview_import_recipes(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  begin
    v_out := public.run_import_recipes(p_rows);
    raise exception '%', v_out::text using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    return sqlerrm::jsonb;
  end;
end;
$$;
revoke execute on function public.preview_import_recipes(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: writes exactly the will_write rows of the preview the operator looked at. p_expected is exactly {hash, counts} of that
 * preview. The preview is worked out again under the catalogue lock and the call is refused (P0002) when either differs. Then the same work is
 * done for real, in this one transaction, and one audit row (action import.recipes) records the counts, the hash and the will_write list. A call with nothing to write
 * writes nothing and no audit row. Returns what was done, in the shape of the preview.
 */
create or replace function public.apply_import_recipes(p_rows jsonb, p_expected jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad boolean;
  v_pre jsonb;
  v_res jsonb;
begin
  v_bad := not public.import_expected_ok(p_expected, array['rule_removals', 'unchanged', 'unmatched', 'will_write']);
  if v_bad then -- rule:import-recipes-expected
    raise exception 'the expected object is exactly the hash and the counts of the preview' using errcode = '22023';
  end if;
  -- The catalogue's lock (the stock saves, save_recipe and record_production take it first), so nothing moves between the preview and the write.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_pre := public.preview_import_recipes(p_rows);
  v_bad := p_expected is distinct from jsonb_build_object('hash', v_pre ->> 'hash', 'counts', v_pre -> 'counts');
  if v_bad then -- rule:import-recipes-changed
    raise exception 'the rows or the catalogue changed since the preview: preview again' using errcode = 'P0002';
  end if;
  v_res := public.run_import_recipes(p_rows);
  if v_res ->> 'hash' is distinct from v_pre ->> 'hash' or v_res -> 'counts' is distinct from v_pre -> 'counts' then
    raise exception 'the import did not do what its preview said' using errcode = 'XX000';
  end if;
  if (v_res -> 'counts' ->> 'will_write')::integer > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'import.recipes', 'imports', 'recipes', jsonb_build_object('counts', v_res -> 'counts', 'hash', v_res ->> 'hash', 'will_write', v_res -> 'will_write'));
  end if;
  return v_res;
end;
$$;
revoke execute on function public.apply_import_recipes(jsonb, jsonb) from public, anon, authenticated, service_role;

/**
 * Internal, for the flavour-prices import: does the work row by row and returns the import result. A row is {product, price_cents}: the flavour
 * is matched by name (exactly one); the same price is unchanged; another is written by write_flavour, the owner's whole-flavour save, with the
 * flavour's other columns as they are and the stamp it carries now. A flavour whose other columns that save would refuse is listed with the
 * save's own message and left alone.
 */
create or replace function public.run_import_flavours(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad       boolean;
  v_n         integer := 0;
  v_row       jsonb;
  v_cnt       integer;
  v_p         public.products%rowtype;
  v_write     jsonb := '[]'::jsonb;
  v_same      jsonb := '[]'::jsonb;
  v_unmatched jsonb := '[]'::jsonb;
begin
  v_bad := case when p_rows is null or jsonb_typeof(p_rows) <> 'array' then true
                else jsonb_array_length(p_rows) not between 1 and 1000 end;
  if v_bad then -- rule:import-flavours-rows
    raise exception 'the rows are a list of 1 to 1000 flavour prices' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  for v_row in select e.value from jsonb_array_elements(p_rows) with ordinality e(value, ord) order by e.ord loop
    v_n := v_n + 1;
    begin
      v_bad := not public.import_keys_ok(v_row, array['price_cents', 'product'], array[]::text[])
               or jsonb_typeof(v_row -> 'product') <> 'string' or jsonb_typeof(v_row -> 'price_cents') <> 'number';
      if v_bad then -- rule:import-flavours-row
        raise exception 'the row carries exactly product and price_cents' using errcode = '22023';
      end if;
      if not public.import_name_ok(v_row ->> 'product') then -- rule:import-flavours-invisible
        raise exception 'a name has an invisible space or is not in composed form' using errcode = '22023';
      end if;
      select count(*) into v_cnt from public.products p where lower(btrim(p.name)) = lower(btrim(v_row ->> 'product'));
      if v_cnt = 0 then -- rule:import-flavours-product-none
        raise exception 'no flavour has that name' using errcode = '22023';
      end if;
      if v_cnt > 1 then -- rule:import-flavours-product-several
        raise exception 'several flavours have that name' using errcode = '22023';
      end if;
      select * into v_p from public.products p where lower(btrim(p.name)) = lower(btrim(v_row ->> 'product'));
      if v_p.price_cents = (v_row ->> 'price_cents')::numeric then
        v_same := v_same || jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'product', v_p.name, 'price_cents', v_p.price_cents));
      else
        perform public.write_flavour(v_p.id, jsonb_build_object('active', v_p.active, 'allergens', v_p.allergens, 'capacity_weight', v_p.capacity_weight,
          'description', v_p.description, 'image_path', v_p.image_path, 'item_type', v_p.item_type, 'kind', v_p.kind, 'name', v_p.name,
          'price_cents', v_row -> 'price_cents', 'short_name', v_p.short_name, 'sort_order', v_p.sort_order, 'tag', v_p.tag), v_p.updated_at);
        v_write := v_write || jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'product', v_p.name, 'from_cents', v_p.price_cents,
                                                                   'price_cents', trim_scale((v_row ->> 'price_cents')::numeric)));
      end if;
    exception when sqlstate '22023' or sqlstate 'P0002' or sqlstate '23505' or sqlstate '23503' or sqlstate '23514' or sqlstate '23502'
                 or sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22001' or sqlstate '22004' then
      v_unmatched := v_unmatched || jsonb_build_array(jsonb_build_object('n', v_n, 'row', v_row, 'why', sqlerrm));
    end;
  end loop;
  return public.import_result(v_write, v_same, v_unmatched, null);
end;
$$;
revoke execute on function public.run_import_flavours(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: what apply_import_flavours would do with these rows now, and what it could not. Writes nothing (the work is done and rolled
 * back). Returns will_write, unchanged, unmatched (each with its `n`, the row and a `why`), counts and hash; see the head of this file.
 */
create or replace function public.preview_import_flavours(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  begin
    v_out := public.run_import_flavours(p_rows);
    raise exception '%', v_out::text using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    return sqlerrm::jsonb;
  end;
end;
$$;
revoke execute on function public.preview_import_flavours(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: writes exactly the will_write rows of the preview the operator looked at. p_expected is exactly {hash, counts} of that
 * preview. The preview is worked out again under the catalogue lock and the call is refused (P0002) when either differs. Then the same work is
 * done for real, in this one transaction, and one audit row (action import.flavour_prices) records the counts, the hash and the will_write list. A call with nothing to write
 * writes nothing and no audit row. Returns what was done, in the shape of the preview.
 */
create or replace function public.apply_import_flavours(p_rows jsonb, p_expected jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad boolean;
  v_pre jsonb;
  v_res jsonb;
begin
  v_bad := not public.import_expected_ok(p_expected, array['unchanged', 'unmatched', 'will_write']);
  if v_bad then -- rule:import-flavours-expected
    raise exception 'the expected object is exactly the hash and the counts of the preview' using errcode = '22023';
  end if;
  -- The catalogue's lock (the stock saves, save_recipe and record_production take it first), so nothing moves between the preview and the write.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_pre := public.preview_import_flavours(p_rows);
  v_bad := p_expected is distinct from jsonb_build_object('hash', v_pre ->> 'hash', 'counts', v_pre -> 'counts');
  if v_bad then -- rule:import-flavours-changed
    raise exception 'the rows or the catalogue changed since the preview: preview again' using errcode = 'P0002';
  end if;
  v_res := public.run_import_flavours(p_rows);
  if v_res ->> 'hash' is distinct from v_pre ->> 'hash' or v_res -> 'counts' is distinct from v_pre -> 'counts' then
    raise exception 'the import did not do what its preview said' using errcode = 'XX000';
  end if;
  if (v_res -> 'counts' ->> 'will_write')::integer > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'import.flavour_prices', 'imports', 'flavour_prices', jsonb_build_object('counts', v_res -> 'counts', 'hash', v_res ->> 'hash', 'will_write', v_res -> 'will_write'));
  end if;
  return v_res;
end;
$$;
revoke execute on function public.apply_import_flavours(jsonb, jsonb) from public, anon, authenticated, service_role;

/**
 * Internal, for the bookings import: does the work row by row and returns the import result. A row is {name, starts_on, ends_on, place,
 * rent_cents, active}. A booking with the same name (case and surrounding spaces ignored) and the same two dates is unchanged, whatever its
 * place, rent or switch (the one that is there is kept); two such bookings are listed; otherwise it is written by write_scheduled_event under an
 * id worked out from the name and the dates, so the same row again is the same booking.
 */
create or replace function public.run_import_bookings(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad       boolean;
  v_n         integer := 0;
  v_row       jsonb;
  v_cnt       integer;
  v_old       public.scheduled_events%rowtype;
  v_id        uuid;
  v_write     jsonb := '[]'::jsonb;
  v_same      jsonb := '[]'::jsonb;
  v_unmatched jsonb := '[]'::jsonb;
begin
  v_bad := case when p_rows is null or jsonb_typeof(p_rows) <> 'array' then true
                else jsonb_array_length(p_rows) not between 1 and 1000 end;
  if v_bad then -- rule:import-bookings-rows
    raise exception 'the rows are a list of 1 to 1000 bookings' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  for v_row in select e.value from jsonb_array_elements(p_rows) with ordinality e(value, ord) order by e.ord loop
    v_n := v_n + 1;
    begin
      v_bad := not public.import_keys_ok(v_row, array['active', 'ends_on', 'name', 'place', 'rent_cents', 'starts_on'], array[]::text[])
               or jsonb_typeof(v_row -> 'name') <> 'string' or jsonb_typeof(v_row -> 'place') <> 'string'
               or jsonb_typeof(v_row -> 'starts_on') <> 'string' or jsonb_typeof(v_row -> 'ends_on') <> 'string'
               or jsonb_typeof(v_row -> 'rent_cents') <> 'number' or jsonb_typeof(v_row -> 'active') <> 'boolean';
      if v_bad then -- rule:import-bookings-row
        raise exception 'the row carries exactly name, starts_on, ends_on, place, rent_cents and active' using errcode = '22023';
      end if;
      if not public.import_name_ok(v_row ->> 'name') then -- rule:import-bookings-invisible
        raise exception 'a name has an invisible space or is not in composed form' using errcode = '22023';
      end if;
      select count(*) into v_cnt from public.scheduled_events s
       where lower(btrim(s.name)) = lower(btrim(v_row ->> 'name'))
         and to_char(s.starts_on, 'YYYY-MM-DD') = v_row ->> 'starts_on' and to_char(s.ends_on, 'YYYY-MM-DD') = v_row ->> 'ends_on';
      if v_cnt > 1 then -- rule:import-bookings-several
        raise exception 'several bookings have that name and dates' using errcode = '22023';
      end if;
      if v_cnt = 1 then
        select * into v_old from public.scheduled_events s
         where lower(btrim(s.name)) = lower(btrim(v_row ->> 'name'))
           and to_char(s.starts_on, 'YYYY-MM-DD') = v_row ->> 'starts_on' and to_char(s.ends_on, 'YYYY-MM-DD') = v_row ->> 'ends_on';
        v_same := v_same || jsonb_build_array(jsonb_build_object('id', v_old.id, 'name', v_old.name, 'starts_on', v_old.starts_on, 'ends_on', v_old.ends_on,
          'place', v_old.place, 'rent_cents', v_old.rent_cents, 'active', v_old.active));
      else
        v_id := md5('import:booking:' || lower(btrim(v_row ->> 'name')) || '|' || (v_row ->> 'starts_on') || '|' || (v_row ->> 'ends_on'))::uuid;
        perform public.write_scheduled_event(jsonb_build_object('id', v_id, 'name', v_row -> 'name', 'starts_on', v_row -> 'starts_on',
          'ends_on', v_row -> 'ends_on', 'place', v_row -> 'place', 'rent_cents', v_row -> 'rent_cents', 'active', v_row -> 'active'), null);
        v_write := v_write || jsonb_build_array(jsonb_build_object('id', v_id, 'name', btrim(v_row ->> 'name'), 'starts_on', v_row ->> 'starts_on',
          'ends_on', v_row ->> 'ends_on', 'place', btrim(v_row ->> 'place'), 'rent_cents', trim_scale((v_row ->> 'rent_cents')::numeric),
          'active', (v_row ->> 'active')::boolean));
      end if;
    exception when sqlstate '22023' or sqlstate 'P0002' or sqlstate '23505' or sqlstate '23503' or sqlstate '23514' or sqlstate '23502'
                 or sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22001' or sqlstate '22004' then
      v_unmatched := v_unmatched || jsonb_build_array(jsonb_build_object('n', v_n, 'row', v_row, 'why', sqlerrm));
    end;
  end loop;
  return public.import_result(v_write, v_same, v_unmatched, null);
end;
$$;
revoke execute on function public.run_import_bookings(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: what apply_import_bookings would do with these rows now, and what it could not. Writes nothing (the work is done and rolled
 * back). Returns will_write, unchanged, unmatched (each with its `n`, the row and a `why`), counts and hash; see the head of this file.
 */
create or replace function public.preview_import_bookings(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  begin
    v_out := public.run_import_bookings(p_rows);
    raise exception '%', v_out::text using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    return sqlerrm::jsonb;
  end;
end;
$$;
revoke execute on function public.preview_import_bookings(jsonb) from public, anon, authenticated, service_role;

/**
 * For the operator: writes exactly the will_write rows of the preview the operator looked at. p_expected is exactly {hash, counts} of that
 * preview. The preview is worked out again under the catalogue lock and the call is refused (P0002) when either differs. Then the same work is
 * done for real, in this one transaction, and one audit row (action import.bookings) records the counts, the hash and the will_write list. A call with nothing to write
 * writes nothing and no audit row. Returns what was done, in the shape of the preview.
 */
create or replace function public.apply_import_bookings(p_rows jsonb, p_expected jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad boolean;
  v_pre jsonb;
  v_res jsonb;
begin
  v_bad := not public.import_expected_ok(p_expected, array['unchanged', 'unmatched', 'will_write']);
  if v_bad then -- rule:import-bookings-expected
    raise exception 'the expected object is exactly the hash and the counts of the preview' using errcode = '22023';
  end if;
  -- The catalogue's lock (the stock saves, save_recipe and record_production take it first), so nothing moves between the preview and the write.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_pre := public.preview_import_bookings(p_rows);
  v_bad := p_expected is distinct from jsonb_build_object('hash', v_pre ->> 'hash', 'counts', v_pre -> 'counts');
  if v_bad then -- rule:import-bookings-changed
    raise exception 'the rows or the catalogue changed since the preview: preview again' using errcode = 'P0002';
  end if;
  v_res := public.run_import_bookings(p_rows);
  if v_res ->> 'hash' is distinct from v_pre ->> 'hash' or v_res -> 'counts' is distinct from v_pre -> 'counts' then
    raise exception 'the import did not do what its preview said' using errcode = 'XX000';
  end if;
  if (v_res -> 'counts' ->> 'will_write')::integer > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'import.bookings', 'imports', 'bookings', jsonb_build_object('counts', v_res -> 'counts', 'hash', v_res ->> 'hash', 'will_write', v_res -> 'will_write'));
  end if;
  return v_res;
end;
$$;
revoke execute on function public.apply_import_bookings(jsonb, jsonb) from public, anon, authenticated, service_role;
