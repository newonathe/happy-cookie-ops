-- B3b cost cutover, by value (supersedes the allowance of 20260101006200; the review that found it wrong by value is the reason).
--
-- 20260101006200 got WHICH movements come before and after the cutover right (the order they were applied in, books_settings.used_from_seq)
-- and kept that, but it measured HOW MUCH of a use the stock at the cutover covers in units, and a unit is not a cost. What was on hand at the
-- cutover was expensed already (its deliveries are lines of the ledger): the books must VALUE it, once, and never expense that value a second
-- time or leave some of it out. Three of its results were wrong by value:
--   * price drift: 100 on hand at the cutover bought for 5000, 100 more received after for 15000, 200 wasted. The books expensed 15000 (the
--     units the allowance covered were taken out at the blended average); the two deliveries cost 20000, 5000 of it expensed already;
--   * a miscount: a count to 40 (wrong), then a count back to 100 (right), then 100 wasted. The count down took 60 units off the allowance and
--     nothing gave them back: 16000 expensed for what the cutover had already expensed (10000 in all);
--   * a correction made after the cutover to a delivery from before it, while newer stock was on hand: its full ledger line counted, and its
--     share of the stock on hand also moved the average that later uses are stamped at: the same change twice (12500 where 15000).
--
-- The allowance of an item is now a VALUE:
--   * books_cutover.unit_cost is the item's cost of one unit AT THE CUTOVER (item_unit_cost: the average of what was paid, else her usual
--     price, else the cheapest quote; null when no cost is known), taken with the quantity under the same locks. The allowance is the quantity
--     times that cost;
--   * get_books walks every stock movement of an item applied after the cutover in seq order (a correction takes its place by its own seq: see
--     below). A use or a waste of value w (what it took times the cost stamped on it) is covered by least(w, what is left of the allowance); the
--     rest, plus what was short at the stamp, is expensed. A use or a waste with no stamp is valued at the cost at the cutover, to draw the
--     allowance, and only the quantity it leaves uncovered is listed as uncosted;
--   * a count or an adjustment down takes the cutover cost of the units it removed off the allowance (never more than is left) and remembers
--     what it took; a count or an adjustment up gives back as much as the downs took (never more than that), so a recount restores what a
--     miscount took; a movement that removes stock is not itself an expense;
--   * a correction made after the cutover of a delivery applied by it: its full ledger line counts on its date, as before, and its share of the
--     stock on hand (the change less the share of stock already used, stock_cost_corrections.used_cents) is ADDED to what is left of the
--     allowance at its place in the order, so the uses written after it, stamped at the moved average, are offset by exactly that. A
--     correction that lowers the cost after the allowance was used up leaves a debt, which the next use expenses (the pre-cutover line was
--     credited in full already): the "used" total of an item that is used up always equals its "bought" total;
--   * an opening applied after the cutover (stock that existed and was expensed already, with no cost stamped on it) is a quantity allowance,
--     valued at the cost stamped on each use that takes it. So is the stock of an item with no cost at the cutover (unit_cost null): for it
--     the quantity rule of 20260101006200 stands, covered units times each use's own stamp;
--   * the expense of a line is never negative, and `uncosted` lists exactly the quantity expensed with no stamp, as before.
-- One case is not exact: stock a count found again (after a count down) re-enters at what the count down took off, which is the cost at the
-- cutover, not the average it has since moved to.
--
-- To order a correction with the movements, stock_cost_corrections gains `seq`, numbered from the same sequence as stock_movements.seq (one
-- order of everything that changes what stock is worth); the cutover is the highest of both. A correction is "after the cutover" when its
-- seq is above it. Corrections that exist are numbered in the order the database received them.
--
-- 20260101006100, 20260101006200 and this migration are applied in one sitting, so the cutover of record is taken here again: now, with
-- what is on hand and what it costs. set_cost_basis takes the cutover once, as before, and now keeps the cost per unit.

alter table public.stock_cost_corrections add column seq bigint;
do $$
declare
  v_id uuid;
begin
  for v_id in select c.id from public.stock_cost_corrections c order by c.received_at, c.id loop
    update public.stock_cost_corrections c set seq = nextval('public.stock_movements_seq_seq') where c.id = v_id;
  end loop;
end
$$;
alter table public.stock_cost_corrections
  alter column seq set not null,
  alter column seq set default nextval('public.stock_movements_seq_seq');
create unique index stock_cost_corrections_seq_uq on public.stock_cost_corrections (seq);

alter table public.books_cutover add column unit_cost numeric check (unit_cost is null or unit_cost > 0);

update public.books_settings b
   set used_from = now(),
       used_from_seq = greatest(coalesce((select max(m.seq) from public.stock_movements m), 0),
                                coalesce((select max(c.seq) from public.stock_cost_corrections c), 0))
 where b.cost_basis = 'used' or b.used_from is not null;
delete from public.books_cutover c where true;
insert into public.books_cutover (item_id, qty, unit_cost)
select i.id, greatest(i.on_hand, 0), (select u.unit_cost from public.item_unit_cost(i.id) u)
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
    -- B3b cutover: every writer of stock waits (the catalogue, then each item in id order, as a production takes them), so what is on hand,
    -- what it costs and the highest seq belong to the same moment.
    perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
    perform public.lock_stock_item_ids(array(select i.id from public.inventory_items i));
    delete from public.books_cutover c where true;
    insert into public.books_cutover (item_id, qty, unit_cost) -- B3b cutover by value: the cost of one unit now
    select i.id, greatest(i.on_hand, 0), (select u.unit_cost from public.item_unit_cost(i.id) u) from public.inventory_items i;
  end if;
  update public.books_settings b
     set cost_basis = p_basis,
         used_from = case when v_first then now() else b.used_from end, -- B3b cutover: used_from
         used_from_seq = case when v_first then greatest(coalesce((select max(m.seq) from public.stock_movements m), 0),
                                                         coalesce((select max(c.seq) from public.stock_cost_corrections c), 0))
                              else b.used_from_seq end, -- B3b cutover: the highest seq of a movement or a correction
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
 * the rows were applied in (books_settings.used_from_seq), and what was on hand then is a VALUE the uses and wastes after it are covered by
 * (books_cutover.unit_cost): the migration that adds it says how.
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
  v_cut bigint; -- B3b cutover: the highest seq of a movement or a correction in the snapshot (null: no cutover)
  v_used jsonb; -- B3b cutover: the id of each use or waste that is expensed -> {v: its value, q: its quantity, at: its date}
  v_e record;
  v_item text;
  v_c numeric; -- B3b cutover by value: the item's cost of one unit at the cutover (null: none known)
  v_va numeric; -- B3b cutover by value: what is left of the allowance, in centavos (negative: a debt a correction left)
  v_va_taken numeric; -- B3b cutover by value: what count and adjustment downs took off it and nothing has given back
  v_qa numeric; -- B3b cutover by value: what is left of the quantity allowance (openings, and an item with no cost at the cutover)
  v_qa_taken numeric; -- B3b cutover by value: the units count and adjustment downs took off it and nothing has given back
  v_qty0 numeric;
  v_t numeric; -- taken
  v_rate numeric; -- the cost of a unit of what a use or a waste took: its stamp, else the cost at the cutover
  v_cv numeric;
  v_pv numeric;
  v_units numeric;
  v_part numeric;
  v_val numeric;
  v_at timestamptz;
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
  v_used := '{}'::jsonb;
  -- B3b cutover by value: what of each use or waste applied after the cutover is expensed. Walk the item's movements after it in seq order
  -- (a correction made after it of a delivery applied by it comes in at its own seq), keeping what is left of the allowance of the item.
  for v_e in
    select x.item_id, x.seq, x.id, x.kind, x.qty_delta, x.stamp, x.short_qty, x.at, x.share
      from (
        select m.item_id, m.seq, 0 as ord, m.id::text as id, m.kind, m.qty_delta::numeric as qty_delta, m.unit_cost as stamp,
               m.short_qty::numeric as short_qty, m.at, 0::numeric as share
          from public.stock_movements m
         where (v_cut is null or m.seq > v_cut) and m.kind <> 'receipt'
        union all
        -- B3b cutover by value: the share of the stock on hand of a correction made after the cutover to a delivery applied by it
        select rc.item_id, c.seq, 1, c.id::text, 'correction', 0::numeric, null::numeric, 0::numeric, c.at,
               (c.cost_cents - coalesce((select p.cost_cents from public.stock_cost_corrections p
                                          where p.movement_id = c.movement_id and p.seq < c.seq order by p.seq desc limit 1), rc.cost_cents, 0)
                - c.used_cents)::numeric
          from public.stock_cost_corrections c join public.stock_movements rc on rc.id = c.movement_id
         where v_cut is not null and c.seq > v_cut and rc.seq <= v_cut
      ) x
     order by x.item_id, x.seq, x.ord
  loop
    if v_e.item_id is distinct from v_item then
      v_item := v_e.item_id;
      v_c := null; v_va := 0; v_va_taken := 0; v_qa := 0; v_qa_taken := 0;
      if v_cut is not null then
        select b.qty, b.unit_cost into v_qty0, v_c from public.books_cutover b where b.item_id = v_item;
        if v_c is not null then
          v_va := v_qty0 * v_c; -- B3b cutover by value: what was on hand, at what it cost, was expensed already
        else
          v_qa := coalesce(v_qty0, 0); -- B3b cutover by value: no cost known at the cutover: the quantity rule
        end if;
      end if;
    end if;
    if v_e.kind = 'correction' then
      if v_c is not null then
        v_va := v_va + v_e.share; -- B3b cutover by value: its share of the stock on hand moves the allowance
      end if;
    elsif v_e.kind = 'opening' then
      if v_cut is not null then
        v_qa := v_qa + v_e.qty_delta; -- B3b cutover by value: stock that existed and was expensed already (no cutover: nothing was)
      end if;
    elsif v_e.kind in ('use', 'waste') then
      v_t := - v_e.qty_delta;
      v_at := case when v_cut is null then v_e.at else greatest(v_e.at, v_used_from) end; -- B3b cutover: never a day before the cutover
      v_rate := coalesce(v_e.stamp, v_c);
      v_cv := 0;
      if v_c is not null then
        -- B3b cutover by value: covered by what is left of the allowance, up to its value (a debt is expensed with the next use that has a cost)
        v_cv := least(v_t * v_rate, case when v_e.stamp is null then greatest(v_va, 0) else v_va end);
        v_va := v_va - v_cv;
      end if;
      if v_e.stamp is not null then
        v_val := v_t * v_e.stamp - greatest(v_cv, 0); -- the value of what it took that the allowance left
        v_pv := least(v_val, v_qa * v_e.stamp); -- B3b cutover by value: the quantity allowance covers the rest, at this use's own stamp
        v_qa := v_qa - v_pv / v_e.stamp;
        v_val := v_val - v_pv + v_e.short_qty * v_e.stamp + greatest(- v_cv, 0); -- what was short is never covered
        if v_val > 0 then
          v_used := v_used || jsonb_build_object(v_e.id, jsonb_build_object('v', v_val, 'q', v_val / v_e.stamp, 'at', v_at));
        end if;
      else
        v_units := case when v_c is null then v_t when v_cv >= v_t * v_rate then 0 else v_t - v_cv / v_rate end;
        v_part := least(v_units, v_qa);
        v_qa := v_qa - v_part;
        v_units := v_units - v_part + v_e.short_qty;
        if v_units > 0 then
          v_used := v_used || jsonb_build_object(v_e.id, jsonb_build_object('q', v_units, 'at', v_at));
        end if;
      end if;
    elsif v_e.qty_delta < 0 then
      -- B3b cutover by value: a count or an adjustment down takes the cutover cost of what it removed off the allowance, not expensed
      v_units := - v_e.qty_delta;
      if v_c is not null then
        v_cv := greatest(0, least(v_units * v_c, v_va));
        v_va := v_va - v_cv;
        v_va_taken := v_va_taken + v_cv;
        v_units := case when v_cv >= v_units * v_c then 0 else v_units - v_cv / v_c end;
      end if;
      v_part := least(v_units, v_qa);
      v_qa := v_qa - v_part;
      v_qa_taken := v_qa_taken + v_part;
    elsif v_e.qty_delta > 0 then
      -- B3b cutover by value: a count or an adjustment up gives back what the downs took, no more
      v_units := v_e.qty_delta;
      if v_c is not null then
        v_cv := least(v_units * v_c, v_va_taken);
        v_va := v_va + v_cv;
        v_va_taken := v_va_taken - v_cv;
        v_units := case when v_cv >= v_units * v_c then 0 else v_units - v_cv / v_c end;
      end if;
      v_part := least(v_units, v_qa_taken);
      v_qa := v_qa + v_part;
      v_qa_taken := v_qa_taken - v_part;
    end if;
  end loop;
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
             round((v_used -> m.id::text ->> 'v')::numeric)::bigint, (v_used -> m.id::text ->> 'at')::timestamptz, m.short_qty -- B3b cutover by value: the value expensed
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
