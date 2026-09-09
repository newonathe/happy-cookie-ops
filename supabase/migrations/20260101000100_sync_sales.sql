-- Idempotent intake for the offline bazaar queue.
--
-- The device sends everything it holds, every time. This function must be safe to call
-- with the same client_id repeatedly: the second call reports the sale as accepted
-- without writing a second row or a second ledger entry.

create or replace function sync_event_sale(p_sale jsonb)
returns table (client_id text, sale_id uuid, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_client_id text := p_sale ->> 'clientId';
  v_existing  uuid;
  v_sale_id   uuid;
  v_ledger_id uuid;
  v_item      jsonb;
begin
  if not is_staff() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if v_client_id is null or length(v_client_id) = 0 then
    raise exception 'clientId is required' using errcode = '22023';
  end if;

  select es.id into v_existing from event_sales es where es.client_id = v_client_id;
  if v_existing is not null then
    return query select v_client_id, v_existing, true;
    return;
  end if;

  insert into ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
  values (
    'sale', 'Bazaar', 'Stall sale ' || v_client_id,
    (p_sale ->> 'total')::numeric * 100,
    to_timestamp((p_sale ->> 'at')::bigint / 1000.0),
    auth.uid()
  )
  returning id into v_ledger_id;

  insert into event_sales (
    client_id, event_id, gross_cents, discount_cents, total_cents,
    pay_method, pay_ref, tendered_cents, change_cents, clerk, sold_at, ledger_id
  ) values (
    v_client_id,
    nullif(p_sale ->> 'eventId', '')::uuid,
    (p_sale ->> 'gross')::numeric * 100,
    coalesce((p_sale ->> 'discount')::numeric, 0) * 100,
    (p_sale ->> 'total')::numeric * 100,
    coalesce(p_sale ->> 'pay', 'cash'),
    coalesce(p_sale ->> 'ref', ''),
    coalesce((p_sale ->> 'tendered')::numeric, 0) * 100,
    coalesce((p_sale ->> 'change')::numeric, 0) * 100,
    coalesce(p_sale ->> 'clerk', ''),
    to_timestamp((p_sale ->> 'at')::bigint / 1000.0),
    v_ledger_id
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_each(coalesce(p_sale -> 'items', '{}'::jsonb))
  loop
    insert into event_sale_items (sale_id, product_id, qty, unit_price_cents)
    select v_sale_id, p.id, (v_item -> 1)::text::int, p.price_cents
    from products p where p.id = (v_item -> 0)::text;
  end loop;

  insert into audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'sale.synced', 'event_sales', v_sale_id::text, p_sale);

  return query select v_client_id, v_sale_id, false;
end $$;

revoke all on function sync_event_sale(jsonb) from public;
grant execute on function sync_event_sale(jsonb) to authenticated;
