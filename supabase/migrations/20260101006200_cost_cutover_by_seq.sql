-- B3b cost cutover, by apply order (supersedes the date rule of 20260101006100; the review that rejected it is the reason).
--
-- 20260101006100 started "when used" at a DATE (books_settings.used_from) and classified every line by the date a client sent. The date
-- is not what happened: a delivery dated before the cutover but entered after the snapshot was expensed twice (its ledger line and its
-- use), a cost correction made after the cutover to an earlier delivery vanished, stock a count took away still counted as allowance, a
-- second switch from bought to used moved the cutover and re-read the months between as "bought", and a late-synced use landed in a
-- month already reported. All of them come from comparing a client's date with a snapshot taken at write time.
--
-- The cutover is now the ORDER the rows were applied in: books_settings.used_from_seq is the highest stock_movements.seq at the moment the
-- snapshot (books_cutover) was taken, with every item locked, so a movement is either in the snapshot (seq <= used_from_seq) or after it.
-- used_from stays as the day the books start reading "when used", and is the earliest date a later row can be expensed on.
--
-- get_books on the "used" basis with a cutover (cut = used_from_seq):
--   * a ledger expense line linked to no stock movement and no correction counts as always, on its date;
--   * a line of a delivery counts (on its own date, as on "bought") only if that delivery was applied by the cutover (seq <= cut); a
--     delivery applied after it is left out: the use expenses it, whatever date the delivery carries;
--   * a correction's ledger line counts, in full, only if its delivery was applied by the cutover; for a delivery applied after it the line
--     is left out and the correction's share of stock already used (used_cents) is the expense: never both, never neither;
--   * the allowance of an item is its snapshot plus the openings applied after the cutover. Every movement applied after the cutover that
--     takes stock away (a use, a waste, a count that found less, an adjustment down) draws on it in seq order, so stock that left without
--     being used is no longer allowance for a later use. Only a use or a waste is expensed, for (taken - covered + short) units at the
--     cost stamped on it; a movement applied by the cutover writes nothing;
--   * such a line is dated at its movement's time, but never before the cutover day: a use synced late is not a cost of a past month;
--   * `uncosted` lists the same uses and wastes when they have no cost (the quantity expensed), and the production lines that could not be
--     taken at all, for records applied after the cutover.
-- No cutover (used_from_seq null) costs the stock used as it did before 20260101006100. On "bought" nothing changes.
--
-- set_cost_basis takes the cutover once: when the owner first chooses "used" (used_from is null). It takes the catalogue lock and the lock
-- of every item first, so no stock movement is half in the snapshot. Later switches, either way, change the basis and nothing else.
--
-- 20260101006100 and this migration are applied in one sitting, so the cutover of record is taken here: now, with what is on hand.

alter table public.books_settings add column used_from_seq bigint;

update public.books_settings b
   set used_from = now(), used_from_seq = coalesce((select max(m.seq) from public.stock_movements m), 0)
 where b.cost_basis = 'used' or b.used_from is not null;
delete from public.books_cutover c where true;
insert into public.books_cutover (item_id, qty)
select i.id, greatest(i.on_hand, 0)
  from public.inventory_items i
 where exists (select 1 from public.books_settings b where b.used_from_seq is not null);

create or replace function public.set_cost_basis(p_basis text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may choose how stock is costed' using errcode = '42501';
  end if;
  if p_basis is null or p_basis not in ('bought', 'used') then -- rule:basis-value
    raise exception 'the cost basis is bought or used' using errcode = '22023';
  end if;
  -- B3b cutover: one choice at a time, so the date, the order mark and the snapshot always belong together.
  perform pg_advisory_xact_lock(hashtextextended('books_settings', 0));
  select b.used_from is null into v_first from public.books_settings b where b.id;
  v_first := v_first and p_basis = 'used'; -- B3b cutover: only the first choice of "used" takes a cutover
  if v_first then
    -- B3b cutover: every writer of stock waits (the catalogue, then each item in id order, as a production takes them), so what is on hand
    -- and the highest seq belong to the same moment.
    perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
    perform public.lock_stock_item_ids(array(select i.id from public.inventory_items i));
    delete from public.books_cutover c where true;
    insert into public.books_cutover (item_id, qty) select i.id, greatest(i.on_hand, 0) from public.inventory_items i;
  end if;
  update public.books_settings b
     set cost_basis = p_basis,
         used_from = case when v_first then now() else b.used_from end, -- B3b cutover: used_from
         used_from_seq = case when v_first then coalesce((select max(m.seq) from public.stock_movements m), 0) else b.used_from_seq end,
         updated_at = now()
   where b.id;
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
 * stamped on each use when it was written, plus each correction's share of stock already used. The cutover where "when used" starts is the order
 * the rows were applied in (books_settings.used_from_seq), not their dates: the migration that adds it says how.
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
  v_used_from timestamptz; -- B3b cutover: the day "when used" starts (null: no cutover)
  v_cut bigint; -- B3b cutover: the highest stock_movements.seq in the snapshot (null: no cutover)
  v_used jsonb; -- B3b cutover: the id of each use or waste that is expensed -> {q: the quantity of it that is expensed, at: its date}
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
  select b.cost_basis, b.used_from, b.used_from_seq into v_basis, v_used_from, v_cut from public.books_settings b where b.id; -- B3b cutover: used_from, used_from_seq
  -- B3b cutover: what of each use or waste applied after the cutover is expensed: what it took, less what the item's allowance covers (the
  -- snapshot plus the openings applied since), the allowance being drawn on in seq order by every movement that takes stock away (a count
  -- that found less and an adjustment down included, though only a use or a waste is expensed), plus what was short.
  select coalesce(jsonb_object_agg(e.id, jsonb_build_object('q', e.qty, 'at', e.at)), '{}'::jsonb) into v_used
    from (
      select w.id, w.kind, w.qty, w.at
        from (
          select m.id::text as id, m.kind as kind,
                 -m.qty_delta
                 - least(-m.qty_delta,
                         greatest(0, (case when v_cut is null then 0 else coalesce(a.qty, 0) + coalesce(o.qty, 0) end)
                                     - coalesce(sum(-m.qty_delta) over (partition by m.item_id order by m.seq
                                                                        rows between unbounded preceding and 1 preceding), 0)))
                 + m.short_qty as qty,
                 (case when v_cut is null then m.at else greatest(m.at, v_used_from) end) as at -- B3b cutover: never a day before the cutover
            from public.stock_movements m
            left join public.books_cutover a on a.item_id = m.item_id
            left join (select x.item_id, sum(x.qty_delta) as qty from public.stock_movements x
                        where x.kind = 'opening' and x.seq > v_cut group by x.item_id) o on o.item_id = m.item_id
           where (v_cut is null or m.seq > v_cut) and (m.kind in ('use', 'waste') or m.qty_delta < 0)
        ) w
       where w.kind in ('use', 'waste') and w.qty > 0
    ) e;
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
              or (not exists (select 1 from public.stock_movements m where m.ledger_id = l.id)
                  and not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id))
              -- B3b cutover: a delivery's line, and a correction's line, count only for a delivery applied by the cutover
              or (v_cut is not null
                  and (exists (select 1 from public.stock_movements m where m.ledger_id = l.id and m.seq <= v_cut)
                       or exists (select 1 from public.stock_cost_corrections c join public.stock_movements r on r.id = c.movement_id
                                   where c.ledger_id = l.id and r.seq <= v_cut))))
      union all
      select 'l:' || l.id::text, 'draw', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind = 'adjustment' and l.category = 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use' then 'Used: ' else 'Waste: ' end) || i.name,
             round((v_used -> m.id::text ->> 'q')::numeric * m.unit_cost)::bigint, (v_used -> m.id::text ->> 'at')::timestamptz, m.short_qty -- B3b cutover: only the quantity expensed
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null
         and v_used ? m.id::text -- B3b cutover: a movement the allowance covered in full writes no line
         and (v_used -> m.id::text ->> 'at')::timestamptz >= p_from and (v_used -> m.id::text ->> 'at')::timestamptz < p_to
      union all
      select 'c:' || c.id::text, 'expense', i.category, coalesce(l.memo, 'Correction: ' || i.name), c.used_cents,
             (case when v_cut is null then c.at else greatest(c.at, v_used_from) end), 0
        from public.stock_cost_corrections c
        join public.stock_movements r on r.id = c.movement_id
        join public.inventory_items i on i.id = r.item_id
        left join public.ledger_entries l on l.id = c.ledger_id
       where v_basis = 'used' and c.used_cents <> 0
         and (v_cut is null or r.seq > v_cut) -- B3b cutover: a delivery applied by the cutover was expensed through its ledger line, corrections included
         and (case when v_cut is null then c.at else greatest(c.at, v_used_from) end) >= p_from
         and (case when v_cut is null then c.at else greatest(c.at, v_used_from) end) < p_to
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'item', u.item, 'qty', u.qty, 'unit', u.unit,
           'at', (extract(epoch from u.at) * 1000)::bigint)
           || case when u.why is not null then jsonb_build_object('why', u.why) else '{}'::jsonb end order by u.at desc, u.id), '[]'::jsonb)
    into v_uncosted
    from (
      select 'm:' || m.id::text as id, m.kind as kind, i.name as item, (v_used -> m.id::text ->> 'q')::numeric as qty, i.unit as unit,
             (v_used -> m.id::text ->> 'at')::timestamptz as at, null::text as why -- B3b cutover: qty, at
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where m.kind in ('use', 'waste') and m.unit_cost is null and v_basis = 'used'
         and v_used ? m.id::text -- B3b cutover: only what was expensed (not what the allowance covered)
         and (v_used -> m.id::text ->> 'at')::timestamptz >= p_from
         and (v_used -> m.id::text ->> 'at')::timestamptz < p_to
      union all
      select 'p:' || r.id::text || ':' || (e.ord - 1)::text, 'use', e.value ->> 'name', (e.value ->> 'by')::numeric, e.value ->> 'unit',
             (case when v_cut is null then r.at else greatest(r.at, v_used_from) end), e.value ->> 'why'
        from public.production_records r
        cross join lateral jsonb_array_elements(r.short) with ordinality e(value, ord)
       where v_basis = 'used' and r.kind in ('dough', 'batch') and (e.value ? 'why')
         and (case when v_cut is null then r.at else greatest(r.at, v_used_from) end) >= p_from
         and (case when v_cut is null then r.at else greatest(r.at, v_used_from) end) < p_to
         -- B3b cutover: only a record applied after it: by its stock movements, else (it took nothing) by when it was received
         and (v_cut is null
              or exists (select 1 from public.stock_movements s where s.production_id = r.id and s.seq > v_cut)
              or (not exists (select 1 from public.stock_movements s where s.production_id = r.id) and r.received_at >= v_used_from))
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
