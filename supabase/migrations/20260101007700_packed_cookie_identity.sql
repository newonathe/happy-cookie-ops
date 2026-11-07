-- Close the recorded-pack / Preparing-state race. Original swap validation,
-- pricing, capacity, exact historical replays and grants stay unchanged.
create or replace function public.staff_swap_item(
  p_order_id text,
  p_from_product text,
  p_to_product text,
  p_client_id uuid,
  p_expected_updated_at timestamptz
)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_prior public.order_swaps;
  v_from public.order_items;
  v_to public.products;
  v_rules public.order_rules;
  v_capacity integer;
  v_committed numeric;
  v_units numeric;
  v_week date;
  v_old_total bigint;
  v_new_total bigint;
  v_now timestamptz := now();
begin
  if not public.is_owner() then
    raise exception 'only the owner may swap a flavour' using errcode = '42501';
  end if;
  if p_client_id is null or p_from_product is null or p_to_product is null then
    raise exception 'swap needs a client id and two flavours' using errcode = '22023';
  end if;
  -- Serialize changing cookie identities with recording their pack, including the gap before Ready.
  perform pg_advisory_xact_lock(hashtextextended('production_record:' || (md5('pack:' || p_order_id)::uuid)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  select * into v_prior from public.order_swaps s where s.client_id = p_client_id;
  if found then
    if v_prior.order_id <> v_o.id or v_prior.from_product <> p_from_product or v_prior.to_product <> p_to_product then -- rule:swap-client-id-reuse
      raise exception 'swap id was already used for a different swap' using errcode = '23505';
    end if;
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if exists (select 1 from public.production_records r where r.id = md5('pack:' || p_order_id)::uuid and r.kind = 'pack') then -- rule:swap-packed-production
    raise exception 'a recorded pack keeps its cookie identities' using errcode = '55000';
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.state not in ('Payment review', 'Confirmed', 'Preparing') then -- rule:swap-state
    raise exception 'a packed or finished order cannot be swapped' using errcode = '55000';
  end if;
  if p_from_product = p_to_product then -- rule:swap-same
    raise exception 'pick a different flavour to swap in' using errcode = '22023';
  end if;
  select * into v_from from public.order_items i
   where i.order_id = v_o.id and i.product_id = p_from_product order by i.unit_price_cents limit 1;
  if not found then -- rule:swap-item
    raise exception 'that flavour is not on the order' using errcode = '55000';
  end if;
  select * into v_to from public.products p where p.id = p_to_product and p.published and p.active for share;
  if not found then -- rule:swap-menu
    raise exception 'that flavour is not on the menu' using errcode = '22023';
  end if;
  if exists (select 1 from public.order_items i where i.order_id = v_o.id and i.product_id = p_to_product and (i.unit_price_cents <> v_to.price_cents or i.capacity_weight <> v_to.capacity_weight)) then -- rule:swap-price-clash
    raise exception 'that flavour is already on the order at another price or weight' using errcode = '55000';
  end if;

  if v_from.qty * v_to.capacity_weight > v_from.qty * v_from.capacity_weight and v_o.pickup_date is not null
     and public.order_holds_capacity(v_o.state, v_o.pay_state, v_o.placed_at, v_now,
           (select r.unpaid_hold_hours from public.order_rules r where r.id)) then
    -- A heavier flavour takes more of the pickup week: the same rule place_order applies.
    select * into v_rules from public.order_rules r where r.id;
    v_week := date_trunc('week', v_o.pickup_date::timestamp)::date;
    perform pg_advisory_xact_lock(hashtextextended('order:week:' || v_week::text, 0));
    select max(se.int_value) filter (where se.key = 'capacity') into v_capacity from public.settings_effective() se;
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_committed
      from public.orders o join public.order_items oi on oi.order_id = o.id
     where o.pickup_date >= v_week and o.pickup_date < v_week + 7 and o.id <> v_o.id
       and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) + v_from.qty * (v_to.capacity_weight - v_from.capacity_weight)
      into v_units from public.order_items oi where oi.order_id = v_o.id;
    if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:swap-capacity
      raise exception 'not enough room left in that pickup week' using errcode = 'ZC002',
        detail = greatest(0, v_capacity - v_committed)::text;
    end if;
  end if;

  select coalesce(sum(i.qty * i.unit_price_cents), 0) into v_old_total from public.order_items i where i.order_id = v_o.id;
  -- Merge into an existing line of the new flavour (same price, checked above), else relabel the line.
  if exists (select 1 from public.order_items i where i.order_id = v_o.id and i.product_id = p_to_product) then
    update public.order_items i set qty = i.qty + v_from.qty
     where i.order_id = v_o.id and i.product_id = p_to_product;
    delete from public.order_items i where i.id = v_from.id;
  else
    update public.order_items i
       set product_id = p_to_product, unit_price_cents = v_to.price_cents,
           capacity_weight = v_to.capacity_weight, unavailable = false
     where i.id = v_from.id;
  end if;
  select coalesce(sum(i.qty * i.unit_price_cents), 0) into v_new_total from public.order_items i where i.order_id = v_o.id;
  insert into public.order_swaps (client_id, order_id, from_product, to_product, qty, price_delta_cents)
  values (p_client_id, v_o.id, p_from_product, p_to_product, v_from.qty, v_new_total - v_old_total);
  -- Only the change in the item prices moves the total: anything else in it (a surcharge) is kept.
  update public.orders o set total_cents = o.total_cents + (v_new_total - v_old_total) where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_swap_item(text, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_swap_item(text, text, text, uuid, timestamptz) to authenticated;
