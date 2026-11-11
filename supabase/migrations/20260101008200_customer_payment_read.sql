-- Private-token status includes recorded payment facts, without changing owner payment rules.
-- Preserve the existing token boundary, contact/note exclusions, extras and execution grants.
create or replace function public.order_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select jsonb_build_object(
           'order_no', o.id, 'state', o.state, 'pay_state', o.pay_state, 'pay_method', o.pay_method,
           'total_cents', o.total_cents, 'paid_cents', o.paid_cents, 'pickup_date', o.pickup_date, 'pickup_window', o.pickup_window,
           'placed_at', o.placed_at,
           'surcharge_cents', o.surcharge_cents, 'same_day', o.same_day,
           'hold_expires_at', case when o.state = 'Payment review' and o.pay_state = 'unpaid'
             then o.placed_at + make_interval(hours => (select r.unpaid_hold_hours from public.order_rules r where r.id))
             else null end,
           'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', oi.product_id, 'name', p.name,
                                    'qty', oi.qty, 'unit_price_cents', oi.unit_price_cents)
                                order by p.sort_order, p.id)
                              from public.order_items oi join public.products p on p.id = oi.product_id
                             where oi.order_id = o.id), '[]'::jsonb),
           'add_ons', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'qty', a.qty,
                                    'unit_price_cents', a.unit_price_cents, 'variant', a.variant)
                                order by a.line_no)
                              from public.order_add_ons a where a.order_id = o.id), '[]'::jsonb),
           'boxes', coalesce((select jsonb_agg(jsonb_build_object('size', b.size, 'qty', b.qty,
                                    'charge_cents', b.charge_cents) order by b.size)
                              from public.order_boxes b where b.order_id = o.id), '[]'::jsonb))
    into v_result
    from public.orders o
   where o.status_token = p_token;
  return v_result;
end;
$$;
revoke execute on function public.order_status(text) from public, anon, authenticated;
grant execute on function public.order_status(text) to anon, authenticated;

