-- B5-1 (final-plan.md version 2, slice B5): the owner's read of one stock item's history, for the New Stock item page.
-- Ethan's decision of 13 October: the owner sees an item's movements (what came in, what was counted, wasted or adjusted, and what was used).
--
--   get_item_movements(p_item, p_limit)   the item's most recent stock movements, newest first, as a jsonb array. Owner only: a helper,
--                                         support, an inactive owner and anon are all refused (42501; anon does not even hold EXECUTE).
--                                         p_limit is 1 to 200 (22023 otherwise); p_item must be an existing item id (P0002 otherwise).
--
-- Each row carries only the movement itself: id, kind, qty_delta (the change in the stock on hand, signed), unit_cost and cost_source (the
-- cost stamped when it was written, both null when none was known, never 0), paid_cents (what a receipt paid in all, null when it paid
-- nothing or is not a receipt), supplier, reason and at (epoch milliseconds). Order: the order the movements were applied (seq), newest
-- first. It NEVER returns who wrote a movement (created_by) or any other person column, and no payload hash or ledger id.
--
-- This migration adds no table, no column and no table grant; stock_movements stays unreadable by every API role. The function is read-only
-- (stable). Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it. No item name is written in this file.

/**
 * An item's recent movements, newest first (by the order they were applied). Owner only.
 */
create or replace function public.get_item_movements(p_item text, p_limit integer)
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
    raise exception 'only the owner may read an item''s movements' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then -- rule:movements-limit
    raise exception 'the limit must be 1 to 200' using errcode = '22023';
  end if;
  if p_item is null or not exists (select 1 from public.inventory_items i where i.id = p_item) then -- rule:movements-item
    raise exception 'no such item' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(x.j order by x.seq desc), '[]'::jsonb)
    into v_out
    from (
      select m.seq as seq,
             jsonb_build_object(
               'id', m.id, 'kind', m.kind, 'qty_delta', m.qty_delta,
               'unit_cost', round(m.unit_cost, 6), 'cost_source', m.cost_source,
               'paid_cents', m.cost_cents, 'supplier', m.supplier, 'reason', m.reason,
               'at', (extract(epoch from m.at) * 1000)::bigint) as j
        from public.stock_movements m
       where m.item_id = p_item
       order by m.seq desc
       limit p_limit
    ) x;
  return v_out;
end;
$$;
revoke execute on function public.get_item_movements(text, integer) from public, anon, authenticated;
grant execute on function public.get_item_movements(text, integer) to authenticated;
