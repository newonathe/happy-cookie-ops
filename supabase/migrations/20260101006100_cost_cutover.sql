-- B3b cost cutover (final-plan.md version 2, DP-04: the books cost the stock "when used").
--
-- The rule. Stock bought before the opening count is already an expense in the historical ledger lines (the 804 lines), so "when used"
-- cannot start from the beginning of the books: it starts from a CUTOVER DATE, books_settings.used_from. Stock that was on hand at the
-- cutover is valued from her price list but is not expensed a second time: its quantity is kept per item (books_cutover) and is an
-- ALLOWANCE that the first uses and wastes after the cutover draw on, in the order they were written (stock_movements.seq), before anything
-- is expensed. Stock counted in as an opening balance after the cutover adds to the allowance of its item. Stock delivered after the cutover
-- has no allowance: its delivery's ledger line is left out of the books and the stock is expensed when it is used. What a use could not take
-- (short_qty) was not in stock, so it was never part of an allowance and is always expensed.
--
-- get_books, from the cutover on the "used" basis:
--   * a ledger expense line dated before the cutover counts exactly as on "bought" (a delivery's own line included): a period before the
--     cutover reads as it did. From the cutover on, a line linked to a stock movement or a cost correction is left out, as before.
--   * a use or waste is expensed only if it is dated at or after the cutover, for (taken - covered + short) units at the cost stamped on
--     it, where covered = least(taken, greatest(0, allowance - taken by the earlier such movements of that item)); nothing expensed, no line.
--   * `uncosted` lists the same movements when they have no cost, with the quantity expensed; production lines that could not be taken only
--     from the cutover.
--   * a cost correction adds its share of stock already used only when the corrected delivery is dated at or after the cutover (an earlier
--     delivery was expensed through its ledger line).
--   * no cutover date (a database whose setting was never switched) costs the stock used as it always did. On "bought" nothing changes.
-- The output gains one key, `used_from` (epoch milliseconds, or null).
--
-- set_cost_basis takes a new cutover (now, and a new snapshot of what is on hand) when the owner switches from "bought" to "used" and only
-- then; choosing "used" again, or "bought", leaves the date and the snapshot alone.
--
-- 20260101006000 already switched the one existing row to "used", so this migration gives that row its cutover: now, with what is on hand.

alter table public.books_settings add column used_from timestamptz;

create table public.books_cutover (
  item_id text primary key references public.inventory_items (id),
  qty numeric(14, 3) not null check (qty >= 0)
);
alter table public.books_cutover enable row level security;
revoke all on table public.books_cutover from public, anon, authenticated;

update public.books_settings b set used_from = now() where b.cost_basis = 'used' and b.used_from is null;
insert into public.books_cutover (item_id, qty)
select i.id, greatest(i.on_hand, 0)
  from public.inventory_items i
 where exists (select 1 from public.books_settings b where b.cost_basis = 'used' and b.used_from is not null);

-- set_cost_basis, as it was (20260101004900) with the cutover taken on a switch from bought to used.
create or replace function public.set_cost_basis(p_basis text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev   text;
  v_switch boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may choose how stock is costed' using errcode = '42501';
  end if;
  if p_basis is null or p_basis not in ('bought', 'used') then -- rule:basis-value
    raise exception 'the cost basis is bought or used' using errcode = '22023';
  end if;
  -- B3b cutover: one choice at a time, so the date and the snapshot always belong together.
  perform pg_advisory_xact_lock(hashtextextended('books_settings', 0));
  select b.cost_basis into v_prev from public.books_settings b where b.id;
  v_switch := p_basis = 'used' and v_prev = 'bought'; -- B3b cutover: only a switch from bought to used starts "when used" again
  update public.books_settings b
     set cost_basis = p_basis, used_from = case when v_switch then now() else b.used_from end, updated_at = now() -- B3b cutover: used_from
   where b.id;
  if v_switch then -- B3b cutover: what is on hand now is the new allowance, replacing the old one
    delete from public.books_cutover c where true;
    insert into public.books_cutover (item_id, qty) select i.id, greatest(i.on_hand, 0) from public.inventory_items i;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.cost_basis', 'books_settings', 'cost_basis', jsonb_build_object('basis', p_basis));
  return p_basis;
end;
$$;
revoke execute on function public.set_cost_basis(text) from public, anon, authenticated;
grant execute on function public.set_cost_basis(text) to authenticated;

/**
 * The owner's books for a period (from inclusive, to exclusive): the cost basis, every line (kind revenue, refund, expense or draw; `amount_cents`
 * is positive except a correcting expense, which is negative when it lowers a cost; `at` in epoch milliseconds; `short_qty` the part of a use that
 * stock could not cover, costed with the rest), what has no cost (`uncosted`, never a zero line: the movements of stock used or wasted with no
 * cost, and each production line that could not be taken at all, with its why; an unknown cost is never reported as nothing) and the
 * delivery receipts of the last 90 days that can be corrected. Revenue is dated when the order was first paid. On the used basis stock is the cost
 * stamped on each use when it was written, plus each correction's share of stock already used, from the cutover date `used_from` on (what was
 * on hand at the cutover is not expensed a second time: books_cutover, the migration that adds it says how).
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
  v_used_from timestamptz; -- B3b cutover: where "when used" starts (null: no cutover)
  v_used jsonb; -- B3b cutover: the id of each use or waste that is expensed -> the quantity of it that is expensed
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
  select b.cost_basis, b.used_from into v_basis, v_used_from from public.books_settings b where b.id; -- B3b cutover: used_from
  -- B3b cutover: what of each use or waste dated at or after the cutover is expensed: what it took, less what the item's allowance covers
  -- (the snapshot at the cutover plus the openings counted since), the allowance being drawn on in seq order, plus what was short.
  select coalesce(jsonb_object_agg(e.id, e.qty), '{}'::jsonb) into v_used
    from (
      select m.id::text as id,
             -m.qty_delta
             - least(-m.qty_delta,
                     greatest(0, (case when v_used_from is null then 0 else coalesce(a.qty, 0) + coalesce(o.qty, 0) end)
                                 - coalesce(sum(-m.qty_delta) over (partition by m.item_id order by m.seq
                                                                    rows between unbounded preceding and 1 preceding), 0)))
             + m.short_qty as qty
        from public.stock_movements m
        left join public.books_cutover a on a.item_id = m.item_id
        left join (select x.item_id, sum(x.qty_delta) as qty from public.stock_movements x
                    where x.kind = 'opening' and x.at >= v_used_from group by x.item_id) o on o.item_id = m.item_id
       where m.kind in ('use', 'waste') and (v_used_from is null or m.at >= v_used_from)
    ) e
   where e.qty > 0;
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
         and (v_basis = 'bought'
              or l.occurred_at < v_used_from -- B3b cutover: before the cutover a line counts as on bought, a delivery's own line included
              or (not exists (select 1 from public.stock_movements m where m.ledger_id = l.id)
                  and not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id)))
      union all
      select 'l:' || l.id::text, 'draw', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind = 'adjustment' and l.category = 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use' then 'Used: ' else 'Waste: ' end) || i.name,
             round((v_used ->> m.id::text)::numeric * m.unit_cost)::bigint, m.at, m.short_qty -- B3b cutover: only the quantity expensed
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null and m.at >= p_from and m.at < p_to
         and v_used ? m.id::text -- B3b cutover: a movement the allowance covered in full writes no line
      union all
      select 'c:' || c.id::text, 'expense', i.category, coalesce(l.memo, 'Correction: ' || i.name), c.used_cents, c.at, 0
        from public.stock_cost_corrections c
        join public.stock_movements r on r.id = c.movement_id
        join public.inventory_items i on i.id = r.item_id
        left join public.ledger_entries l on l.id = c.ledger_id
       where v_basis = 'used' and c.used_cents <> 0 and c.at >= p_from and c.at < p_to
         and (v_used_from is null or r.at >= v_used_from) -- B3b cutover: an earlier delivery was expensed through its ledger line
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'item', u.item, 'qty', u.qty, 'unit', u.unit,
           'at', (extract(epoch from u.at) * 1000)::bigint)
           || case when u.why is not null then jsonb_build_object('why', u.why) else '{}'::jsonb end order by u.at desc, u.id), '[]'::jsonb)
    into v_uncosted
    from (
      select 'm:' || m.id::text as id, m.kind as kind, i.name as item, (v_used ->> m.id::text)::numeric as qty, i.unit as unit, m.at as at, null::text as why -- B3b cutover: qty
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where m.kind in ('use', 'waste') and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to
         and v_used ? m.id::text -- B3b cutover: only what was expensed (not what the allowance covered)
      union all
      select 'p:' || r.id::text || ':' || (e.ord - 1)::text, 'use', e.value ->> 'name', (e.value ->> 'by')::numeric, e.value ->> 'unit', r.at, e.value ->> 'why'
        from public.production_records r
        cross join lateral jsonb_array_elements(r.short) with ordinality e(value, ord)
       where v_basis = 'used' and r.kind in ('dough', 'batch') and (e.value ? 'why') and r.at >= p_from and r.at < p_to
         and (v_used_from is null or v_used_from <= r.at) -- B3b cutover: only from the cutover
    ) u;
  select coalesce(jsonb_agg(jsonb_build_object('movement_id', r.id, 'item', i.name, 'qty', r.qty_delta,
           'cost_cents', public.receipt_cost(r.id), 'supplier', r.supplier, 'at', (extract(epoch from r.at) * 1000)::bigint)
           order by r.at desc), '[]'::jsonb)
    into v_receipts
    from public.stock_movements r join public.inventory_items i on i.id = r.item_id
   where r.kind = 'receipt' and r.ledger_id is not null and r.at >= now() - interval '90 days';
  return jsonb_build_object('basis', v_basis, 'lines', v_lines, 'uncosted', v_uncosted, 'receipts', v_receipts,
    'used_from', case when v_used_from is null then null else (extract(epoch from v_used_from) * 1000)::bigint end); -- B3b cutover: used_from
end;
$$;
revoke execute on function public.get_books(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_books(timestamptz, timestamptz) to authenticated;
