-- SQL67 accounting body with only the generated sale-label projection changed.
-- Amounts, order, costing, held lines, stored memos, signature and grants stay intact.
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
  v_held_ids uuid[];
  v_held jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the books' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '400 days' then -- rule:books-period
    raise exception 'a period is a from before a to, at most 400 days' using errcode = '22023';
  end if;
  select b.cost_basis, b.used_from into v_basis, v_cut from public.books_settings b where b.id;
  -- B4a-4: "when used" has no meaning without its date. A cutover cleared by hand (used_from null, the basis still used) would count every purchase
  -- and every use; with no cutover the books follow the bought rules.
  if v_cut is null then v_basis := 'bought'; end if;
  -- A cutover set by hand with no record (a test database) has no creation order: every row is after it.
  v_cut_seq := coalesce((select k.cut_seq from public.cost_cutover k), 0);
  v_cut_cseq := coalesce((select k.cut_corr_seq from public.cost_cutover k), 0);
  -- S1 (bazaar days), the one change from 20260101006500: a ledger line of a bazaar day whose booking is not finalised yet is held
  -- back from `lines` (the two `l.id <> all (v_held_ids)` below) and counted in `held`, per booking, for the period asked.
  select coalesce(array_agg(h.ledger_id), '{}'::uuid[]) into v_held_ids from public.bazaar_held_ledger() h;
  select coalesce(jsonb_agg(jsonb_build_object('scheduled_id', g.scheduled_id, 'name', g.name, 'count', g.n,
           'revenue_cents', g.revenue, 'expense_cents', g.expense) order by g.name, g.scheduled_id), '[]'::jsonb)
    into v_held
    from (select h.scheduled_id, h.name, count(*)::integer as n,
                 coalesce(sum(l.amount_cents) filter (where l.kind = 'sale'), 0)::bigint as revenue,
                 coalesce(sum(-l.amount_cents) filter (where l.kind <> 'sale'), 0)::bigint as expense
            from public.bazaar_held_ledger() h join public.ledger_entries l on l.id = h.ledger_id
           where l.occurred_at >= p_from and l.occurred_at < p_to
           group by h.scheduled_id, h.name) g;
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
      select 'l:' || l.id::text, 'revenue', l.category,
             case when l.memo = 'Stall sale ' || s.client_id then
                    'Stall sale · ' || coalesce(nullif(e.name, ''), 'Bazaar')
                  when l.memo = 'Void of stall sale ' || s.client_id then
                    'Void of stall sale · ' || coalesce(nullif(e.name, ''), 'Bazaar')
                  else l.memo end, l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
        left join public.event_sales s on s.id = l.sale_id
        left join public.events e on e.id = s.event_id
       where l.kind = 'sale' and l.occurred_at >= p_from and l.occurred_at < p_to
         and l.id <> all (v_held_ids)
      union all
      select 'l:' || l.id::text, 'expense', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind in ('cost', 'adjustment') and l.category <> 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
         and l.id <> all (v_held_ids)
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
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'count' then 'Count: ' else 'Adjustment: ' end) || i.name,
             round(-m.qty_delta * m.unit_cost)::bigint, m.at, 0
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is not null and m.at >= p_from and m.at < p_to
         and m.seq > v_cut_seq
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
      union all
      select 'm:' || m.id::text, m.kind, i.name, -m.qty_delta, i.unit, m.at, null::text
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to
         and m.seq > v_cut_seq
    ) u;
  select coalesce(jsonb_agg(jsonb_build_object('movement_id', r.id, 'item', i.name, 'qty', r.qty_delta,
           'cost_cents', public.receipt_cost(r.id), 'supplier', r.supplier, 'at', (extract(epoch from r.at) * 1000)::bigint)
           order by r.at desc), '[]'::jsonb)
    into v_receipts
    from public.stock_movements r join public.inventory_items i on i.id = r.item_id
   where r.kind = 'receipt' and r.ledger_id is not null and r.at >= now() - interval '90 days';
  return jsonb_build_object('basis', v_basis, 'lines', v_lines, 'uncosted', v_uncosted, 'receipts', v_receipts, 'held', v_held);
end;
$$;
