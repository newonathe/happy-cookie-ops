-- B4a-1 (final-plan.md version 2, section 11, slice B4a), database half: the cost cutover.
--
-- Migration 61 made the books count stock when it is USED. Stock bought before the opening count is already an expense in the
-- historical ledger lines (kind cost or adjustment, no stock movement), so on the used basis its later uses would be expensed a second
-- time. The fix is a date: "when used" starts at a cutover instant, `books_settings.used_from`. Before it the books follow the bought
-- rules, as they always did. At it, the stock then on hand is valued ONCE from her price list and credited, so what was bought and
-- expensed is not expensed again when it is used.
--
--   books_settings.used_from   the cutover instant (null: no cutover yet). The column default of cost_basis goes back to 'bought', and the
--                              one existing row too until a cutover is applied (migration 61 flipped both ahead of this).
--   cost_cutover               one row, written once by apply_cost_cutover: the instant, the stock value credited, the items it was made
--                              of (kept as data, so the figure can be explained a year later) and the hash of the preview it came from.
--                              No API role holds a grant; RLS is on.
--   preview_cost_cutover()     what the opening credit would be: every item with stock on hand, valued at its unit cost now (the average of
--                              what was paid, else her usual price, else the cheapest supplier quote: item_unit_cost, the one cost
--                              function), the total, the items with stock and NO cost (listed, valued at nothing, never as a zero) and a
--                              hash of all of it plus the last stock movement. Writes nothing. No API role holds EXECUTE: the operator
--                              runs it as postgres, like preview_identity_links.
--   apply_cost_cutover(e)      applies exactly the preview the operator looked at (e is its hash and total_cents; refused when the stock
--                              or a cost moved since), once. Records the cutover, sets used_from to now and the basis to used, writes
--                              one audit row. It writes NO average cost: a later use of the opening stock falls back to her usual price
--                              through item_unit_cost, which is what the credit was valued at.
--   set_cost_basis             redefined whole, as it was (20260101004900), with ONE change: choosing 'used' before a cutover is refused.
--   get_books                  redefined whole, as it was (20260101006000), with the cutover: a line is on the used rules only when the
--                              basis is used and its date is on or after used_from; every other line follows the bought rules, so a period
--                              that spans the cutover is right on both sides of it. Before: a purchase is an expense. From it: a purchase
--                              that took stock in is not (its use is), and a stock use is the expense. One line, `k:opening`, credits the
--                              opening stock at the instant before the cutover, once.
--   save_recipe                redefined whole, as it was (20260101005900), with ONE more refusal (the B3b-1 review's residual): an item
--                              that a packaging rule takes may not be an INGREDIENT of a recipe, because a bake would take it and a pack
--                              would take it again. It sits beside recipe-pack-double.
--
-- No item name is written in this file. Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it:
--   rule:cutover-expected   the expected object is exactly a 64-hex hash and a whole total_cents.
--   rule:cutover-once       a cutover is applied once.
--   rule:cutover-changed    the stock or a cost moved since the preview.
--   rule:basis-needs-cutover, rule:basis-value, rule:books-period, rule:recipe-ingredient-on-rule (and save_recipe's own, as before).

alter table public.books_settings add column used_from timestamptz;
alter table public.books_settings alter column cost_basis set default 'bought';
update public.books_settings set cost_basis = 'bought', updated_at = now() where id and used_from is null;

create table public.cost_cutover (
  id boolean primary key default true check (id),
  at timestamptz not null,
  total_cents bigint not null,
  items jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid
);
alter table public.cost_cutover enable row level security;
revoke all on table public.cost_cutover from public, anon, authenticated;

/**
 * What apply_cost_cutover would credit now. Writes nothing. `items` is every stock item with stock on hand, active or not, by id: its
 * on_hand, its unit cost (to 6 places) and where that came from (average, usual, supplier), and value_cents (on_hand times that unit
 * cost, to the centavo; null with no cost). `unvalued` lists the items with stock and no cost: they are valued at nothing, listed, never
 * a zero. `hash` is the sha256 of the items and the last stock movement's seq, so it changes when stock, a cost or the ledger moves.
 */
create or replace function public.preview_cost_cutover()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items    jsonb;
  v_unvalued jsonb;
  v_total    bigint;
  v_n        bigint;
  v_valued   bigint;
  v_seq      bigint;
begin
  -- The catalogue's lock (the stock saves take it), so the list and the hash are of one moment.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  select coalesce(jsonb_agg(jsonb_build_object('item_id', x.id, 'name', x.name, 'unit', x.unit, 'on_hand', x.on_hand,
                                               'unit_cost', x.unit_cost, 'source', x.source, 'value_cents', x.value_cents)
                            order by x.id collate "C"), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('item_id', x.id, 'name', x.name) order by x.id collate "C")
                  filter (where x.value_cents is null), '[]'::jsonb),
         coalesce(sum(x.value_cents), 0)::bigint,
         count(*),
         count(x.value_cents)
    into v_items, v_unvalued, v_total, v_n, v_valued
    from (select i.id, i.name, i.unit, i.on_hand, round(c.unit_cost, 6) as unit_cost, c.source,
                 round(i.on_hand * round(c.unit_cost, 6))::bigint as value_cents
            from public.inventory_items i
            left join lateral public.item_unit_cost(i.id) c on true
           where i.on_hand > 0) x;
  select max(m.seq) into v_seq from public.stock_movements m;
  return jsonb_build_object(
    'items', v_items,
    'counts', jsonb_build_object('items_on_hand', v_n, 'valued', v_valued, 'unvalued', v_n - v_valued),
    'total_cents', v_total,
    'unvalued', v_unvalued,
    'hash', encode(sha256(convert_to(v_items::text || coalesce(v_seq::text, ''), 'UTF8')), 'hex'));
end;
$$;
-- No API role holds EXECUTE, service_role included: the operator runs it as postgres.
revoke execute on function public.preview_cost_cutover() from public, anon, authenticated, service_role;

/**
 * Applies the cutover the operator previewed, once. p_expected is exactly hash (64 lower-case hex, the preview's) and total_cents (a
 * whole number, the preview's). The preview is worked out again under the stock locks and the call is refused if either differs. It
 * records the cutover, sets used_from to now and the basis to used, and writes one audit row. It writes no average cost.
 * Returns used_from, total_cents and the counts.
 */
create or replace function public.apply_cost_cutover(p_expected jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad boolean;
  v_cut timestamptz;
  v_pre jsonb;
  v_now timestamptz := now();
begin
  v_bad := case
    when p_expected is null or jsonb_typeof(p_expected) <> 'object' then true
    when (select array_agg(k order by k) from jsonb_object_keys(p_expected) k) is distinct from array['hash', 'total_cents'] then true
    when jsonb_typeof(p_expected -> 'hash') <> 'string' or jsonb_typeof(p_expected -> 'total_cents') <> 'number' then true
    when (p_expected ->> 'hash') !~ '^[0-9a-f]{64}$' then true
    else (p_expected ->> 'total_cents')::numeric <> trunc((p_expected ->> 'total_cents')::numeric)
    end;
  if v_bad then -- rule:cutover-expected
    raise exception 'the expected object is exactly hash (64 hex) and total_cents (a whole number)' using errcode = '22023';
  end if;

  -- The catalogue's lock, then every item's lock in id order (what a stock use or a receipt holds until it commits), so nothing moves
  -- between the preview and the change.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform public.lock_stock_item_ids(array(select i.id from public.inventory_items i));
  select b.used_from into v_cut from public.books_settings b where b.id;
  if v_cut is not null then -- rule:cutover-once
    raise exception 'the cost cutover has been applied already' using errcode = 'P0001';
  end if;
  v_pre := public.preview_cost_cutover();
  v_bad := (p_expected ->> 'hash') is distinct from (v_pre ->> 'hash')
           or (p_expected ->> 'total_cents')::numeric is distinct from (v_pre ->> 'total_cents')::numeric;
  if v_bad then -- rule:cutover-changed
    raise exception 'the stock or a cost changed since the preview: preview again' using errcode = 'P0002';
  end if;

  insert into public.cost_cutover (at, total_cents, items, payload_hash, created_by)
  values (v_now, (v_pre ->> 'total_cents')::bigint, v_pre -> 'items', v_pre ->> 'hash', auth.uid());
  update public.books_settings b set used_from = v_now, cost_basis = 'used', updated_at = v_now where b.id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.cutover', 'books_settings', 'used_from',
          jsonb_build_object('counts', v_pre -> 'counts', 'total_cents', v_pre -> 'total_cents', 'hash', v_pre -> 'hash'));
  return jsonb_build_object('used_from', v_now, 'total_cents', v_pre -> 'total_cents', 'counts', v_pre -> 'counts');
end;
$$;
revoke execute on function public.apply_cost_cutover(jsonb) from public, anon, authenticated, service_role;

create or replace function public.set_cost_basis(p_basis text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may choose how stock is costed' using errcode = '42501';
  end if;
  if p_basis is null or p_basis not in ('bought', 'used') then -- rule:basis-value
    raise exception 'the cost basis is bought or used' using errcode = '22023';
  end if;
  -- B4a: "when used" starts at the cutover, so there is nothing to choose before one.
  if p_basis = 'used' and not exists (select 1 from public.books_settings b where b.id and b.used_from is not null) then -- rule:basis-needs-cutover
    raise exception 'the books can count stock when used only after the cost cutover' using errcode = '22023';
  end if;
  update public.books_settings b set cost_basis = p_basis, updated_at = now() where b.id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.cost_basis', 'books_settings', 'cost_basis', jsonb_build_object('basis', p_basis));
  return p_basis;
end;
$$;
revoke execute on function public.set_cost_basis(text) from public, anon, authenticated;
grant execute on function public.set_cost_basis(text) to authenticated;

/**
 * The owner's books for a period (from inclusive, to exclusive): the cost basis, every line (kind revenue, refund, expense or draw; `amount_cents`
 * is positive except a correcting expense, which is negative when it lowers a cost, and the opening credit; `at` in epoch milliseconds;
 * `short_qty` the part of a use that stock could not cover, costed with the rest), what has no cost (`uncosted`, never a zero line: the
 * movements of stock used or wasted with no cost, and each production line that could not be taken at all, with its why: a dough mix, a batch,
 * a pack (no packaging rule, not a stock item, a unit that differs) and a bazaar sale; an unknown cost is never reported as nothing) and the
 * delivery receipts of the last 90 days that can be corrected. Revenue is dated when the order was first paid. On the used basis, from the
 * cutover (`used_from`), stock is the cost stamped on each use when it was written, plus each correction's share of stock already used, and a
 * purchase that took stock in is not an expense; before the cutover every line follows the bought rules, and the opening stock is credited once,
 * as the line `k:opening` at the instant before the cutover.
 */
create or replace function public.get_books(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_basis text;
  v_cut timestamptz;
  v_lines jsonb;
  v_uncosted jsonb;
  v_receipts jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the books' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '400 days' then -- rule:books-period
    raise exception 'a period is a from before a to, at most 400 days' using errcode = '22023';
  end if;
  select b.cost_basis, b.used_from into v_basis, v_cut from public.books_settings b where b.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'cat', x.cat, 'label', x.label,
           'amount_cents', x.amount_cents, 'at', (extract(epoch from x.at) * 1000)::bigint, 'short_qty', x.short_qty) order by x.at desc, x.id), '[]'::jsonb)
    into v_lines
    from (
      select 'o:' || o.id as id, 'revenue' as kind, 'Orders' as cat, 'Order ' || o.id || ' · ' || o.customer_name as label,
             o.paid_cents as amount_cents, o.paid_at as at, 0::numeric as short_qty
        from public.orders o where o.paid_at >= p_from and o.paid_at < p_to and o.paid_cents > 0
      union all
      select 'r:' || o.id, 'refund', 'Refunds', 'Refund · order ' || o.id, o.paid_cents, o.refunded_at, 0
        from public.orders o where o.refunded_at >= p_from and o.refunded_at < p_to and o.paid_cents > 0
      union all
      select 'l:' || l.id::text, 'revenue', l.category, l.memo, l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l where l.kind = 'sale' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'l:' || l.id::text, 'expense', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind in ('cost', 'adjustment') and l.category <> 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
         and (v_basis = 'bought' or v_cut is null or l.occurred_at < v_cut
              or (not exists (select 1 from public.stock_movements m where m.ledger_id = l.id)
                  and not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id)))
      union all
      select 'l:' || l.id::text, 'draw', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind = 'adjustment' and l.category = 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use' then 'Used: ' else 'Waste: ' end) || i.name,
             round((-m.qty_delta + m.short_qty) * m.unit_cost)::bigint, m.at, m.short_qty
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null and m.at >= p_from and m.at < p_to
         and m.short_qty - m.qty_delta <> 0 and m.at >= v_cut
      union all
      select 'c:' || c.id::text, 'expense', i.category, coalesce(l.memo, 'Correction: ' || i.name), c.used_cents, c.at, 0
        from public.stock_cost_corrections c
        join public.stock_movements r on r.id = c.movement_id
        join public.inventory_items i on i.id = r.item_id
        left join public.ledger_entries l on l.id = c.ledger_id
       where v_basis = 'used' and c.used_cents <> 0 and c.at >= p_from and c.at < p_to and c.at >= v_cut
      union all
      select 'k:opening', 'expense', 'Stock', 'Opening stock carried in', -k.total_cents, v_cut - interval '1 millisecond', 0
        from public.cost_cutover k
       where v_basis = 'used' and v_cut is not null
         and v_cut - interval '1 millisecond' >= p_from and v_cut - interval '1 millisecond' < p_to
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'item', u.item, 'qty', u.qty, 'unit', u.unit,
           'at', (extract(epoch from u.at) * 1000)::bigint)
           || case when u.why is not null then jsonb_build_object('why', u.why) else '{}'::jsonb end order by u.at desc, u.id), '[]'::jsonb)
    into v_uncosted
    from (
      select 'm:' || m.id::text as id, m.kind as kind, i.name as item, m.short_qty - m.qty_delta as qty, i.unit as unit, m.at as at, null::text as why
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where m.kind in ('use', 'waste') and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to
         and m.short_qty - m.qty_delta <> 0 and m.at >= v_cut
      union all
      select 'p:' || r.id::text || ':' || (e.ord - 1)::text, 'use', e.value ->> 'name', (e.value ->> 'by')::numeric, e.value ->> 'unit', r.at, e.value ->> 'why'
        from public.production_records r
        cross join lateral jsonb_array_elements(r.short) with ordinality e(value, ord)
       where v_basis = 'used' and r.kind in ('dough', 'batch', 'pack', 'sale') and (e.value ? 'why') and r.at >= p_from and r.at < p_to and r.at >= v_cut
    ) u;
  select coalesce(jsonb_agg(jsonb_build_object('movement_id', r.id, 'item', i.name, 'qty', r.qty_delta,
           'cost_cents', public.receipt_cost(r.id), 'supplier', r.supplier, 'at', (extract(epoch from r.at) * 1000)::bigint)
           order by r.at desc), '[]'::jsonb)
    into v_receipts
    from public.stock_movements r join public.inventory_items i on i.id = r.item_id
   where r.kind = 'receipt' and r.ledger_id is not null and r.at >= now() - interval '90 days';
  return jsonb_build_object('basis', v_basis, 'lines', v_lines, 'uncosted', v_uncosted, 'receipts', v_receipts);
end;
$$;
revoke execute on function public.get_books(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_books(timestamptz, timestamptz) to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one recipe. The body is exactly: product_id, yield,
 * lines (each exactly name, qty, unit, or kind, name, qty, unit). Returns the recipe's version and stamp after the save. B3a: every
 * line names exactly one stock item, whose id is stored with it, and every version, the current one included, has its row in
 * recipe_versions. B3b: a line is an ingredient (a quantity per batch, the default) or packaging (a quantity per cookie, taken when
 * the cookie is packed or sold and never at a bake); a packaging line's item may not also be taken per cookie by a packaging rule. B4a: an
 * item that a packaging rule takes at all is a packaging line, never an ingredient.
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
revoke execute on function public.save_recipe(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_recipe(jsonb, timestamptz) to authenticated;
