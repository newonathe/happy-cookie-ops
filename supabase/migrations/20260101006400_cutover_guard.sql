-- B4a-4 (final-plan.md version 2, section 11, slice B4a): the independent review of migration 62 (the cost cutover), the guards it asked for.
-- Migrations 61, 62 and the 62 fix are committed, so none is edited: this file redefines three functions whole, each exactly as it was in the migration
-- that last defined it, with ONE change each. It adds no table, no column and no grant.
--
--   record_stock_movement   (last defined 20260101005600_item_costs.sql) P1, money. An `opening` movement written AFTER the cutover double-expenses
--                           its item: the item's purchase is already an expense in the historical ledger lines, the item was not in the opening
--                           credit (it had no stock counted at the cutover), and its later uses are expensed on the used basis. Now an opening is
--                           refused once books_settings.used_from is set (rule mv-opening-after-cutover, 22023): the item is brought in by a count.
--                           The check sits after the replay check, so an opening a phone wrote before the cutover and sends again is answered as
--                           the same movement, not refused. A cutover that is applied while the opening is waiting takes the same item lock first.
--   preview_cost_cutover    (20260101006100_cost_cutover.sql; the 62 fix did not redefine it) lists the ACTIVE items that have never been counted
--                           (no movement of kind opening, receipt, count or adjust; a use or a waste row does not count, because a bake writes a
--                           use row even when nothing was taken) as `not_counted` ({item_id, name}, by id), counts them in counts.not_counted and puts them in the hash. What was
--                           never counted cannot be in the credit; the operator must see that before the cutover. apply_cost_cutover is unchanged:
--                           it works the preview out again under the locks and compares the hash, so it agrees with the preview by construction (its
--                           counts and its audit row carry the new count).
--   get_books               (20260101006200_cost_cutover_fix.sql) P3. With used_from null while the basis is `used` (a cutover cleared by hand) the
--                           basis is read as `bought`, so the books do not count every purchase and every use at once.
--
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it: mv-opening-after-cutover. The cutover's own refusals,
-- and the other lines of the three functions, are as they were.

create or replace function public.record_stock_movement(p_movement jsonb)
returns table (item_id text, on_hand numeric, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys     text[];
  v_id       uuid;
  v_item_id  text;
  v_kind     text;
  v_qty      numeric;
  v_cost     numeric;
  v_supplier text;
  v_reason   text;
  v_at       timestamptz;
  v_hash     text;
  v_seen     text;
  v_item     public.inventory_items%rowtype;
  v_delta    numeric;
  v_new      numeric;
  v_ledger   uuid;
  v_bad      boolean;
  v_base     numeric;
  v_avg      numeric;
  v_ucost    numeric;
  v_usrc     text;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record stock movements' using errcode = '42501';
  end if;
  if p_movement is null or jsonb_typeof(p_movement) <> 'object' then
    raise exception 'a movement must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_movement) k;
  if v_keys is distinct from array['at', 'cost_cents', 'id', 'item_id', 'kind', 'qty', 'reason', 'supplier'] then -- rule:mv-keys
    raise exception 'a movement carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_movement -> 'id') <> 'string' or jsonb_typeof(p_movement -> 'item_id') <> 'string'
     or jsonb_typeof(p_movement -> 'kind') <> 'string' or jsonb_typeof(p_movement -> 'qty') <> 'number'
     or jsonb_typeof(p_movement -> 'cost_cents') not in ('number', 'null')
     or jsonb_typeof(p_movement -> 'supplier') <> 'string' or jsonb_typeof(p_movement -> 'reason') <> 'string'
     or jsonb_typeof(p_movement -> 'at') <> 'number' then
    raise exception 'a movement field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_movement ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:mv-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_movement ->> 'id')::uuid;
  v_item_id := p_movement ->> 'item_id';
  v_kind := p_movement ->> 'kind';
  if v_kind not in ('opening', 'receipt', 'count', 'waste', 'adjust') then -- rule:mv-kind
    raise exception 'the kind is opening, receipt, count, waste or adjust' using errcode = '22023';
  end if;
  v_qty := (p_movement ->> 'qty')::numeric;
  v_bad := v_qty <> round(v_qty, 3) or abs(v_qty) > 999999999
           or (v_kind = 'count' and v_qty < 0) or (v_kind = 'adjust' and v_qty = 0)
           or (v_kind in ('opening', 'receipt', 'waste') and v_qty <= 0);
  if v_bad then -- rule:mv-qty
    raise exception 'a quantity has at most 3 decimals; a count is 0 or more, an adjustment is not 0, the rest are above 0' using errcode = '22023';
  end if;
  v_cost := (p_movement ->> 'cost_cents')::numeric;
  v_bad := v_cost is not null and (v_cost <> trunc(v_cost) or v_cost not between 0 and 100000000);
  if v_bad then -- rule:mv-cost
    raise exception 'a cost is whole centavos from 0 to 1,000,000 pesos' using errcode = '22023';
  end if;
  if v_cost is not null and v_kind <> 'receipt' then -- rule:mv-cost-kind
    raise exception 'only a receipt has a cost' using errcode = '22023';
  end if;
  v_supplier := btrim(p_movement ->> 'supplier');
  v_reason := btrim(p_movement ->> 'reason');
  v_bad := length(v_supplier) > 80 or length(v_reason) > 80 or (v_supplier || v_reason) ~ '[[:cntrl:]]';
  if v_bad then -- rule:mv-text
    raise exception 'the supplier and the reason are at most 80 characters' using errcode = '22023';
  end if;
  if v_kind in ('waste', 'adjust') and v_reason = '' then -- rule:mv-reason
    raise exception 'a waste or an adjustment needs a reason' using errcode = '22023';
  end if;
  if (p_movement ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_movement ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:mv-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stock_movement:' || v_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('stock_item:' || v_item_id, 0));
  v_hash := encode(sha256(convert_to(p_movement::text, 'UTF8')), 'hex');
  select m.payload_hash into v_seen from public.stock_movements m where m.id = v_id;
  if found then
    if v_seen <> v_hash then -- rule:mv-replay-conflict
      raise exception 'that id was already used for a different movement' using errcode = '23505';
    end if;
    select i.on_hand into v_new from public.inventory_items i
      join public.stock_movements m on m.item_id = i.id where m.id = v_id;
    return query select v_item_id, v_new, true;
    return;
  end if;
  select * into v_item from public.inventory_items i where i.id = v_item_id for update;
  if not found then -- rule:mv-item-missing
    raise exception 'no such item' using errcode = 'P0002';
  end if;
  if not v_item.active then -- rule:mv-item-inactive
    raise exception 'that item is switched off' using errcode = '22023';
  end if;
  -- B4a-4: after the cost cutover an item is brought in by a count, never by an opening quantity (see the head of this file). This sits after the
  -- replay check above, so a phone that sends again an opening it wrote before the cutover gets its answer, not a refusal.
  if v_kind = 'opening' and exists (select 1 from public.books_settings b where b.id and b.used_from is not null) then -- rule:mv-opening-after-cutover
    raise exception 'an opening quantity cannot be written after the cost cutover: count the item instead' using errcode = '22023';
  end if;
  if v_kind = 'opening' then
    v_bad := exists (select 1 from public.stock_movements m where m.item_id = v_item_id) or v_item.on_hand <> 0;
    if v_bad then -- rule:mv-opening-first
      raise exception 'the opening quantity is the first movement of an item, with nothing on hand' using errcode = '22023';
    end if;
    v_delta := v_qty;
  elsif v_kind = 'count' then
    -- A count is a picture of one moment. If anything moved after it was taken (a delivery, waste, another count), applying
    -- it would wipe that out: it is refused, and she counts again.
    v_bad := exists (select 1 from public.stock_movements m where m.item_id = v_item_id and m.at > v_at);
    if v_bad then -- rule:mv-count-stale
      raise exception 'something moved after this count was taken: count again' using errcode = '22023';
    end if;
    v_delta := v_qty - v_item.on_hand;
  elsif v_kind = 'waste' then
    v_delta := -v_qty;
    if v_qty > v_item.on_hand then -- rule:mv-waste-clamp
      v_delta := -v_item.on_hand;
    end if;
  elsif v_kind = 'adjust' then
    v_delta := greatest(v_qty, -v_item.on_hand);
  else
    v_delta := v_qty;
  end if;
  if v_kind = 'receipt' and coalesce(v_cost, 0) > 0 then -- rule:mv-receipt-books
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values ('cost', v_item.category, v_item.name || case when v_supplier = '' then '' else ' · ' || v_supplier end,
            -v_cost::bigint, v_at, auth.uid())
    returning id into v_ledger;
  end if;
  -- B3a: a costed receipt moves the average: h on hand before, q received, c paid, and a base per unit for what is on hand: the average,
  -- else (nothing paid for it yet) her usual price or a quote, else this delivery's own price. An uncosted receipt, an opening, a count
  -- and an adjustment leave the average alone; with nothing on hand the last average stands until the next costed delivery.
  if v_kind = 'receipt' and coalesce(v_cost, 0) > 0 then
    v_base := v_item.avg_cost;
    if v_base is null and v_item.on_hand > 0 then
      select c.unit_cost into v_base from public.item_unit_cost(v_item_id) c;
    end if;
    v_base := coalesce(v_base, v_cost / v_qty);
    v_avg := (v_item.on_hand * v_base + v_cost) / (v_item.on_hand + v_qty);
  end if;
  -- B3a: a waste is stamped with the cost known at this moment (nothing is stamped when none is known).
  if v_kind = 'waste' then
    select c.unit_cost, c.source into v_ucost, v_usrc from public.item_unit_cost(v_item_id) c;
  end if;
  insert into public.stock_movements (id, item_id, kind, qty_delta, counted, cost_cents, supplier, reason, at, ledger_id,
                                      payload_hash, created_by, unit_cost, cost_source)
  values (v_id, v_item_id, v_kind, v_delta, case when v_kind = 'count' then v_qty end, v_cost::bigint, v_supplier, v_reason,
          v_at, v_ledger, v_hash, auth.uid(), v_ucost, v_usrc);
  update public.inventory_items as i
     set on_hand = i.on_hand + v_delta,
         last_counted = case when v_kind in ('count', 'opening') then v_at else i.last_counted end,
         avg_cost = coalesce(v_avg, i.avg_cost),
         avg_cost_at = case when v_avg is not null then v_at else i.avg_cost_at end
   where i.id = v_item_id
  returning i.on_hand into v_new;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.movement', 'stock_movements', v_id::text,
    jsonb_build_object('item_id', v_item_id, 'kind', v_kind, 'qty_delta', v_delta, 'cost_cents', v_cost));
  return query select v_item_id, v_new, false;
end;
$$;
revoke execute on function public.record_stock_movement(jsonb) from public, anon, authenticated;
grant execute on function public.record_stock_movement(jsonb) to authenticated;

create or replace function public.preview_cost_cutover()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items    jsonb;
  v_unvalued jsonb;
  v_notcounted jsonb;
  v_nc_n     bigint;
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
  -- B4a-4: the active items that have never been counted: no opening, receipt, count or adjustment. A use or a waste row is not a count (a bake or a
  -- dough mix writes a use row even when it took nothing), so flour baked with before anyone counted it is still listed. Nothing was ever counted
  -- for them, so the credit cannot include what they hold;
  -- the operator sees them (and they are in the hash) and decides before the cutover whether to count them first.
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name) order by i.id collate "C"), '[]'::jsonb), count(*)
    into v_notcounted, v_nc_n
    from public.inventory_items i
   where i.active and not exists (select 1 from public.stock_movements m where m.item_id = i.id and m.kind in ('opening', 'receipt', 'count', 'adjust'));
  select max(m.seq) into v_seq from public.stock_movements m;
  return jsonb_build_object(
    'items', v_items,
    'counts', jsonb_build_object('items_on_hand', v_n, 'valued', v_valued, 'unvalued', v_n - v_valued, 'not_counted', v_nc_n),
    'total_cents', v_total,
    'unvalued', v_unvalued,
    'not_counted', v_notcounted,
    'hash', encode(sha256(convert_to(v_items::text || v_notcounted::text || coalesce(v_seq::text, ''), 'UTF8')), 'hex'));
end;
$$;
-- No API role holds EXECUTE, service_role included: the operator runs it as postgres.
revoke execute on function public.preview_cost_cutover() from public, anon, authenticated, service_role;
-- No API role holds EXECUTE, service_role included: the operator runs it as postgres.


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
  -- B4a-4: "when used" has no meaning without its date. A cutover cleared by hand (used_from null, the basis still used) would count every purchase
  -- and every use; with no cutover the books follow the bought rules.
  if v_cut is null then v_basis := 'bought'; end if;
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
