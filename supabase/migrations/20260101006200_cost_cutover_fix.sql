-- B4a-2 (final-plan.md version 2, section 11, slice B4a): the independent review of migration 62 (20260101006100_cost_cutover.sql), fixed.
-- Migration 62 is committed and applied nowhere but local test databases; the PreToolUse hook refuses an edit to an existing migration, so the
-- fix is this file, which redefines the three functions whole and changes nothing else of 62.
--
-- P1 (money). get_books put a line before or after the cutover by its EVENT DATE (`occurred_at`, a movement's `at`, a correction's `at`), but
-- the opening credit is a snapshot of the stock when the apply commits. A phone chooses its dates (up to a day ahead, any distance back), so a
-- delivery written after the apply but dated before it was shown as an expense yet was not in the credit (its later use was expensed again), and
-- a use dated before the cutover whose stock WAS in the credit was not an expense (its cost vanished). Now the side is the order of writing:
--   cost_cutover.cut_seq        the last stock_movements.seq when the apply held every lock (seq is the order movements were applied, 56).
--   cost_cutover.cut_corr_seq   the same for stock_cost_corrections.seq, a column added here (an identity: the next value is taken at the insert,
--                               not at the transaction's start, and a correction holds its item's lock, which the apply holds, when it inserts).
--   A use or waste movement is after the cutover iff seq > cut_seq; a correction iff seq > cut_corr_seq. A cost or adjustment line tied to a
--   movement (m.ledger_id = l.id) or to a correction (c.ledger_id = l.id) takes that movement's or correction's side; a line tied to nothing
--   (rent) is an expense on either side. The date still decides which PERIOD a line appears in. A bake or pack line that took nothing (the
--   production arm of the uncosted list) has no sequence and keeps its date.
--   used_from (and cost_cutover.at, and the audit) are taken with clock_timestamp() once the locks are held, not now(): the transaction's start
--   predates the wait for them. The opening line is still dated used_from - 1 millisecond.
-- P2. write_packaging_rule only refused a rule item that a recipe took as a PACKAGING line. Now it also refuses (rule packrule-ingredient) an item
--   that any recipe takes as an ingredient, as save_recipe refuses the other way round. A rule and an ingredient that already share an item
--   stop this migration, listing the pairs, so the owner decides which of the two to change.
-- P3. apply_cost_cutover is refused (rule cutover-unvalued, P0001) while an item on hand has no cost: the credit would be short by it. The
--   preview still lists it, so the operator prices it or counts it out first.
--
-- No item name is written in this file. Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it.

-- ---- P2: stop if a rule already takes an item that a recipe takes as an ingredient
do $$
declare
  v_pairs text;
begin
  select string_agg(distinct 'rule ' || p.container || coalesce(' of ' || p.box_size::text, '') || ' / recipe ' || r.product_id || ' / item ' || p.item_id,
                    '; ' order by 'rule ' || p.container || coalesce(' of ' || p.box_size::text, '') || ' / recipe ' || r.product_id || ' / item ' || p.item_id)
    into v_pairs
    from public.packaging_rules p
    join public.recipe_ingredients r on r.item_id = p.item_id and r.kind = 'ingredient';
  if v_pairs is not null then
    raise exception 'a packaging rule takes an item that a recipe takes as an ingredient (change the rule or the recipe, then run this again): %', v_pairs
      using errcode = 'P0001';
  end if;
end $$;

-- ---- P1: the creation order
-- No cutover has been applied anywhere yet (62 is unmerged); one made under 62 has no sequence and could not be told which side its rows are on.
do $$
begin
  if exists (select 1 from public.cost_cutover) then
    raise exception 'a cost cutover was applied under migration 62: it has no creation order; undo it and apply it again' using errcode = 'P0001';
  end if;
end $$;
alter table public.cost_cutover add column cut_seq bigint not null;
alter table public.cost_cutover add column cut_corr_seq bigint not null;
alter table public.stock_cost_corrections add column seq bigint generated always as identity;
create unique index stock_cost_corrections_seq_uq on public.stock_cost_corrections (seq);

/**
 * Applies the cutover the operator previewed, once. p_expected is exactly hash (64 lower-case hex, the preview's) and total_cents (a
 * whole number, the preview's). The preview is worked out again under the stock locks and the call is refused if either differs, or while an
 * item on hand has no cost (the credit would be short by it). B4a-2: the cutover instant, used_from, is taken with clock_timestamp() AFTER
 * every lock is held (the transaction's start predates the lock wait), and with it the creation order the books rest on: the last stock
 * movement and the last correction written, kept as cut_seq and cut_corr_seq. It records the cutover, sets used_from and the basis to used,
 * and writes one audit row. It writes no average cost. Returns used_from, total_cents and the counts.
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
  v_at timestamptz;
  v_cut_seq bigint;
  v_cut_cseq bigint;
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
  if jsonb_array_length(v_pre -> 'unvalued') > 0 then -- rule:cutover-unvalued
    raise exception 'an item on hand has no cost: give it a price and preview again' using errcode = 'P0001';
  end if;

  -- Every lock is held: nothing is written to the stock from here to the commit, so this instant and these two numbers are one moment.
  v_at := clock_timestamp();
  select coalesce(max(m.seq), 0) into v_cut_seq from public.stock_movements m;
  select coalesce(max(c.seq), 0) into v_cut_cseq from public.stock_cost_corrections c;

  insert into public.cost_cutover (at, total_cents, items, payload_hash, created_by, cut_seq, cut_corr_seq)
  values (v_at, (v_pre ->> 'total_cents')::bigint, v_pre -> 'items', v_pre ->> 'hash', auth.uid(), v_cut_seq, v_cut_cseq);
  update public.books_settings b set used_from = v_at, cost_basis = 'used', updated_at = v_at where b.id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.cutover', 'books_settings', 'used_from',
          jsonb_build_object('counts', v_pre -> 'counts', 'total_cents', v_pre -> 'total_cents', 'hash', v_pre -> 'hash'));
  return jsonb_build_object('used_from', v_at, 'total_cents', v_pre -> 'total_cents', 'counts', v_pre -> 'counts');
end;
$$;
revoke execute on function public.apply_cost_cutover(jsonb) from public, anon, authenticated, service_role;

/**
 * The owner's books for a period (from inclusive, to exclusive): the cost basis, every line (kind revenue, refund, expense or draw; `amount_cents`
 * is positive except a correcting expense, which is negative when it lowers a cost, and the opening credit; `at` in epoch milliseconds;
 * `short_qty` the part of a use that stock could not cover, costed with the rest), what has no cost (`uncosted`, never a zero line: the
 * movements of stock used or wasted with no cost, and each production line that could not be taken at all, with its why: a dough mix, a batch,
 * a pack (no packaging rule, not a stock item, a unit that differs) and a bazaar sale; an unknown cost is never reported as nothing) and the
 * delivery receipts of the last 90 days that can be corrected. Revenue is dated when the order was first paid. On the used basis, from the
 * cutover (`used_from`), stock is the cost stamped on each use when it was written, plus each correction's share of stock already used, and a
 * purchase that took stock in is not an expense; before the cutover every line follows the bought rules, and the opening stock is credited once,
 * as the line `k:opening` at the instant before the cutover. B4a-2: which side of the cutover a movement, a correction or a line tied to one
 * is on is the order it was WRITTEN in (stock_movements.seq and stock_cost_corrections.seq against the cut_seq and cut_corr_seq the apply stored),
 * never the date the phone gave it: the opening credit is a snapshot of the stock when the apply committed, and a delivery dated before the
 * cutover but written after it was not in that snapshot. A line tied to nothing (rent) is an expense on either side. The date only decides
 * which period a line appears in.
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
  v_cut_seq bigint;
  v_cut_cseq bigint;
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
  -- A cutover set by hand with no record (a test database) has no creation order: every row is after it.
  v_cut_seq := coalesce((select k.cut_seq from public.cost_cutover k), 0);
  v_cut_cseq := coalesce((select k.cut_corr_seq from public.cost_cutover k), 0);
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
         and (v_basis = 'bought' or v_cut is null
              -- a purchase that took stock in, or a correction's own line, is on the side its movement or correction was written on
              or case when exists (select 1 from public.stock_movements m where m.ledger_id = l.id)
                      then not exists (select 1 from public.stock_movements m where m.ledger_id = l.id and m.seq > v_cut_seq)
                      when exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id)
                      then not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id and c.seq > v_cut_cseq)
                      else true end)
      union all
      select 'l:' || l.id::text, 'draw', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind = 'adjustment' and l.category = 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use' then 'Used: ' else 'Waste: ' end) || i.name,
             round((-m.qty_delta + m.short_qty) * m.unit_cost)::bigint, m.at, m.short_qty
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null and m.at >= p_from and m.at < p_to
         and m.short_qty - m.qty_delta <> 0 and m.seq > v_cut_seq
      union all
      select 'c:' || c.id::text, 'expense', i.category, coalesce(l.memo, 'Correction: ' || i.name), c.used_cents, c.at, 0
        from public.stock_cost_corrections c
        join public.stock_movements r on r.id = c.movement_id
        join public.inventory_items i on i.id = r.item_id
        left join public.ledger_entries l on l.id = c.ledger_id
       where v_basis = 'used' and c.used_cents <> 0 and c.at >= p_from and c.at < p_to and c.seq > v_cut_cseq
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
         and m.short_qty - m.qty_delta <> 0 and m.seq > v_cut_seq
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
 * The one place a packaging rule is validated and written. The body is exactly: container (box, loose, order or bazaar_sale),
 * box_size (a whole number from 2 to 48 for a box, null for the others) and lines (at most 20, each exactly item_id, qty, per). It
 * replaces that container's lines whole, in the order given. Internal: save_packaging_rule and apply_packaging_rule call it. B4a-2: an item
 * that any recipe takes as an INGREDIENT may not be on a rule (a bake takes it, and a pack would take it again).
 */
create or replace function public.write_packaging_rule(p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_container text;
  v_size      integer;
  v_lines     jsonb;
  v_bad       boolean;
  v_at        timestamptz := now();
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'a packaging rule must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_rule) k) is distinct from array['box_size', 'container', 'lines']
           or jsonb_typeof(p_rule -> 'container') is distinct from 'string'
           or jsonb_typeof(p_rule -> 'box_size') not in ('number', 'null')
           or jsonb_typeof(p_rule -> 'lines') is distinct from 'array'
           or exists (select 1 from jsonb_array_elements(p_rule -> 'lines') l
                       where case when jsonb_typeof(l) <> 'object' then true
                                  else (select array_agg(k order by k) from jsonb_object_keys(l) k) is distinct from array['item_id', 'per', 'qty']
                                       or jsonb_typeof(l -> 'item_id') is distinct from 'string'
                                       or jsonb_typeof(l -> 'qty') is distinct from 'number'
                                       or jsonb_typeof(l -> 'per') is distinct from 'string' end);
  if v_bad then -- rule:packrule-keys
    raise exception 'a packaging rule carries exactly container, box_size and lines of item_id, qty and per' using errcode = '22023';
  end if;
  v_container := p_rule ->> 'container';
  if v_container not in ('box', 'loose', 'order', 'bazaar_sale') then -- rule:packrule-container
    raise exception 'the container is box, loose, order or bazaar_sale' using errcode = '22023';
  end if;
  v_bad := case when v_container = 'box'
                then jsonb_typeof(p_rule -> 'box_size') <> 'number'
                     or (p_rule ->> 'box_size')::numeric <> trunc((p_rule ->> 'box_size')::numeric)
                     or (p_rule ->> 'box_size')::numeric not between 2 and 48
                else jsonb_typeof(p_rule -> 'box_size') <> 'null' end;
  if v_bad then -- rule:packrule-box-size
    raise exception 'a box has a whole size from 2 to 48 and nothing else has one' using errcode = '22023';
  end if;
  v_size := (p_rule ->> 'box_size')::numeric::integer;
  v_lines := p_rule -> 'lines';
  if jsonb_array_length(v_lines) > 20 then -- rule:packrule-lines-max
    raise exception 'a container has at most 20 packaging lines' using errcode = '22023';
  end if;
  -- The catalogue's lock (save_recipe and the stock saves take it first), so a recipe cannot become a packaging line between the
  -- double-take check and the write, and a pack never reads a rule that is half replaced.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where not exists (select 1 from public.inventory_items i where i.id = l ->> 'item_id'));
  if v_bad then -- rule:packrule-item-missing
    raise exception 'a packaging line must name a stock item' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where (l ->> 'qty')::numeric <> round((l ->> 'qty')::numeric, 3)
                       or (l ->> 'qty')::numeric not between 0.001 and 9999);
  if v_bad then -- rule:packrule-qty
    raise exception 'a quantity is above 0 and at most 9,999 with at most 3 decimals' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l where l ->> 'per' not in ('container', 'cookie'));
  if v_bad then -- rule:packrule-per
    raise exception 'a line is taken per container or per cookie' using errcode = '22023';
  end if;
  v_bad := (select count(*) <> count(distinct l ->> 'item_id') from jsonb_array_elements(v_lines) l);
  if v_bad then -- rule:packrule-dup
    raise exception 'an item is listed twice in one container' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where (v_container = 'loose' or l ->> 'per' = 'cookie')
                      and exists (select 1 from public.recipe_ingredients r where r.kind = 'packaging' and r.item_id = l ->> 'item_id'));
  if v_bad then -- rule:packrule-double
    raise exception 'that item is already a packaging line of a recipe: a cookie would take it twice' using errcode = '22023';
  end if;
  -- The other kind of recipe line: an ingredient is taken at a bake, so it may not also be taken by a pack, per container or per cookie.
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where exists (select 1 from public.recipe_ingredients r where r.kind = 'ingredient' and r.item_id = l ->> 'item_id'));
  if v_bad then -- rule:packrule-ingredient
    raise exception 'that item is an ingredient of a recipe: a bake takes it, and a pack would take it again' using errcode = '22023';
  end if;
  -- The same guard between containers: a cookie in a box or loose is also a cookie of its order, so an item taken per cookie by the order
  -- rule cannot also be taken per cookie by a box or the loose rule (and the other way round). A box and loose never share a cookie.
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where (v_container = 'loose' or l ->> 'per' = 'cookie')
                      and exists (select 1 from public.packaging_rules r
                                   where r.item_id = l ->> 'item_id' and (r.per = 'cookie' or r.container = 'loose')
                                     and ((v_container = 'order' and r.container in ('box', 'loose'))
                                          or (v_container in ('box', 'loose') and r.container = 'order'))));
  if v_bad then -- rule:packrule-double-order
    raise exception 'that item is already taken per cookie by the order rule or by a box or loose rule' using errcode = '22023';
  end if;

  delete from public.packaging_rules r where r.container = v_container and r.box_size is not distinct from v_size;
  insert into public.packaging_rules (container, box_size, item_id, qty, per, position, updated_by, updated_at)
  select v_container, v_size, l.value ->> 'item_id', (l.value ->> 'qty')::numeric, l.value ->> 'per', l.ord::integer, auth.uid(), v_at
    from jsonb_array_elements(v_lines) with ordinality l(value, ord);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'packaging.rule_saved', 'packaging_rules', v_container || coalesce(':' || v_size::text, ''),
    jsonb_build_object('container', v_container, 'box_size', v_size, 'lines', v_lines));
  return jsonb_build_object('container', v_container, 'box_size', v_size, 'lines', jsonb_array_length(v_lines));
end;
$$;
revoke execute on function public.write_packaging_rule(jsonb) from public, anon, authenticated, service_role;
