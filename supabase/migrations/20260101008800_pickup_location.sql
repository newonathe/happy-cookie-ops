-- Configurable special pickup location; historical orders are not backfilled.
-- Legacy owner clients may save their original exact keys without overwriting the location.
alter table public.order_rules add column campus_label text not null default 'JSEC Ateneo'
  check (campus_label = btrim(campus_label) and char_length(campus_label) between 1 and 80
    and campus_label !~ '[[:cntrl:]]');
alter table public.orders add column pickup_label text
  check (char_length(pickup_label) between 1 and 140 and pickup_label !~ '[[:cntrl:]]');

-- Existing table grants/RLS stay unchanged. This trigger runs through existing authorised
-- order commands, never trusts a caller-supplied label, and preserves unrelated updates.
create function public.snapshot_order_pickup() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.pickup_date is not distinct from old.pickup_date
       and new.pickup_window is not distinct from old.pickup_window then
      return new;
    end if;
  end if;
  new.pickup_label := null;
  if new.pickup_window = 'campus' then
    select r.campus_label || ' · ' ||
      to_char(('2000-01-01 ' || r.campus_from)::timestamp, 'FMHH12:MI AM') || ' – ' ||
      to_char(('2000-01-01 ' || r.campus_to)::timestamp, 'FMHH12:MI AM')
      into new.pickup_label from public.order_rules r where r.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.snapshot_order_pickup() from public, anon, authenticated;
create trigger orders_pickup_snapshot before insert or update of pickup_date, pickup_window
on public.orders for each row execute function public.snapshot_order_pickup();

-- Return shape gains one column; retain the existing owner-only gate and explicit grants.
drop function public.get_order_rules();
create or replace function public.get_order_rules()
returns table (unpaid_hold_hours integer, max_unpaid_per_phone integer, pickup_days integer[],
               lead_min_days integer, lead_max_days integer, pickup_from_hour integer,
               pickup_cutoff_hour integer, campus_from text, campus_to text, campus_label text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the order rules' using errcode = '42501';
  end if;
  return query
    select r.unpaid_hold_hours, r.max_unpaid_per_phone, r.pickup_days, r.lead_min_days, r.lead_max_days,
           r.pickup_from_hour, r.pickup_cutoff_hour, r.campus_from, r.campus_to, r.campus_label, r.updated_at
      from public.order_rules r where r.id;
end;
$$;
revoke execute on function public.get_order_rules() from public, anon, authenticated;
grant execute on function public.get_order_rules() to authenticated;

create or replace function public.save_order_rules(
  p_rules jsonb,
  p_expected_updated_at timestamptz
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_days integer[];
  v_at   timestamptz;
  v_n    text;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the order rules' using errcode = '42501';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    raise exception 'order rules must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rules) k;
  if v_keys is distinct from array['campus_from', 'campus_to', 'lead_max_days', 'lead_min_days',
      'max_unpaid_per_phone', 'pickup_cutoff_hour', 'pickup_days', 'pickup_from_hour', 'unpaid_hold_hours'] and v_keys is distinct from array['campus_from', 'campus_label', 'campus_to', 'lead_max_days', 'lead_min_days',
      'max_unpaid_per_phone', 'pickup_cutoff_hour', 'pickup_days', 'pickup_from_hour', 'unpaid_hold_hours'] then
    raise exception 'order rules must carry exactly the editable keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rules -> 'campus_from') <> 'string' or jsonb_typeof(p_rules -> 'campus_to') <> 'string'
     or jsonb_typeof(p_rules -> 'pickup_days') <> 'array' then
    raise exception 'order rule has the wrong type' using errcode = '22023';
  end if;
  if p_rules ? 'campus_label' and not coalesce(
      jsonb_typeof(p_rules->'campus_label') = 'string'
      and char_length(btrim(p_rules->>'campus_label')) between 1 and 80
      and (p_rules->>'campus_label') !~ '[[:cntrl:]]', false) then
    raise exception 'pickup location must be 1 to 80 characters on one line' using errcode = '22023';
  end if;
  foreach v_n in array array['lead_max_days', 'lead_min_days', 'max_unpaid_per_phone', 'pickup_cutoff_hour',
                             'pickup_from_hour', 'unpaid_hold_hours'] loop
    if not coalesce(case when jsonb_typeof(p_rules -> v_n) = 'number'
                         then (p_rules ->> v_n)::numeric = trunc((p_rules ->> v_n)::numeric) end, false) then
      raise exception 'order rule must be a whole number: %', v_n using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_rules -> 'pickup_days') d
              where not coalesce(case when jsonb_typeof(d) = 'number'
                                      then (d #>> '{}')::numeric between 1 and 7
                                           and (d #>> '{}')::numeric = trunc((d #>> '{}')::numeric) end, false)) then
    raise exception 'pickup days must be weekday numbers 1 (Monday) to 7 (Sunday)' using errcode = '22023';
  end if;
  select array_agg(distinct (d #>> '{}')::numeric::integer order by (d #>> '{}')::numeric::integer) into v_days
    from jsonb_array_elements(p_rules -> 'pickup_days') d;
  if v_days is null then
    raise exception 'at least one pickup day is required' using errcode = '22023';
  end if;
  if (p_rules ->> 'unpaid_hold_hours')::numeric::integer not between 1 and 168
     or (p_rules ->> 'max_unpaid_per_phone')::numeric::integer not between 1 and 20
     or (p_rules ->> 'lead_min_days')::numeric::integer not between 1 and 30
     or (p_rules ->> 'lead_max_days')::numeric::integer not between 1 and 60
     or (p_rules ->> 'lead_min_days')::numeric::integer > (p_rules ->> 'lead_max_days')::numeric::integer
     or (p_rules ->> 'pickup_from_hour')::numeric::integer not between 0 and 23
     or (p_rules ->> 'pickup_cutoff_hour')::numeric::integer not between 1 and 24
     or (p_rules ->> 'pickup_from_hour')::numeric::integer >= (p_rules ->> 'pickup_cutoff_hour')::numeric::integer
     or (p_rules ->> 'campus_from') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (p_rules ->> 'campus_to') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (p_rules ->> 'campus_from') >= (p_rules ->> 'campus_to') then
    raise exception 'order rule out of bounds' using errcode = '22023';
  end if;

  update public.order_rules as r set
      unpaid_hold_hours = (p_rules ->> 'unpaid_hold_hours')::numeric::integer,
      max_unpaid_per_phone = (p_rules ->> 'max_unpaid_per_phone')::numeric::integer,
      pickup_days = v_days,
      lead_min_days = (p_rules ->> 'lead_min_days')::numeric::integer,
      lead_max_days = (p_rules ->> 'lead_max_days')::numeric::integer,
      pickup_from_hour = (p_rules ->> 'pickup_from_hour')::numeric::integer,
      pickup_cutoff_hour = (p_rules ->> 'pickup_cutoff_hour')::numeric::integer,
      campus_from = p_rules ->> 'campus_from',
      campus_to = p_rules ->> 'campus_to',
      campus_label = coalesce(btrim(p_rules->>'campus_label'), r.campus_label)
    where r.id and date_trunc('milliseconds', r.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning r.updated_at into v_at;
  if v_at is null then
    raise exception 'order rules changed since they were read' using errcode = 'P0002';
  end if;
  return query select v_at;
end;
$$;
revoke execute on function public.save_order_rules(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_order_rules(jsonb, timestamptz) to authenticated;

create or replace function public.get_shop_order_rules()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pickup_days', to_jsonb(r.pickup_days),
    'lead_min_days', r.lead_min_days,
    'lead_max_days', r.lead_max_days,
    'pickup_from_hour', r.pickup_from_hour,
    'pickup_cutoff_hour', r.pickup_cutoff_hour,
    'campus_from', r.campus_from,
    'campus_to', r.campus_to,
    'campus_label', r.campus_label,
    'unpaid_hold_hours', r.unpaid_hold_hours)
  from public.order_rules r where r.id;
$$;
revoke execute on function public.get_shop_order_rules() from public, anon, authenticated;
grant execute on function public.get_shop_order_rules() to anon, authenticated;

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
           'pickup_label', o.pickup_label, 'placed_at', o.placed_at,
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

create or replace function public.get_staff_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hold integer;
  v_out jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the orders' using errcode = '42501';
  end if;
  select r.unpaid_hold_hours into v_hold from public.order_rules r where r.id;
  select coalesce(jsonb_agg(q.x order by q.placed desc), '[]'::jsonb) into v_out
    from (
      select o.placed_at as placed,
             jsonb_build_object(
               'id', o.id, 'name', o.customer_name, 'phone', o.phone, 'ig', o.ig,
               'state', o.state, 'pay_state', o.pay_state, 'pay_method', o.pay_method, 'pay_ref', o.pay_ref,
               'total_cents', o.total_cents, 'paid_cents', o.paid_cents, 'refund_ref', o.refund_ref,
               'surcharge_cents', o.surcharge_cents, 'same_day', o.same_day,
               'notes', o.notes, 'pickup_date', o.pickup_date, 'pickup_window', o.pickup_window,
               'pickup_label', o.pickup_label, 'placed_at', o.placed_at, 'collected_at', o.collected_at, 'updated_at', o.updated_at,
               'status_token', o.status_token,
               'holds', public.order_holds_capacity(o.state, o.pay_state, o.placed_at, now(), coalesce(v_hold, 24)),
               'items', (select coalesce(jsonb_agg(jsonb_build_object(
                                'product_id', i.product_id, 'qty', i.qty,
                                'unit_price_cents', i.unit_price_cents, 'unavailable', i.unavailable)
                              order by i.product_id, i.unit_price_cents), '[]'::jsonb)
                           from public.order_items i where i.order_id = o.id),
               'add_ons', (select coalesce(jsonb_agg(jsonb_build_object(
                                'name', a.name, 'qty', a.qty, 'unit_price_cents', a.unit_price_cents,
                                'variant', a.variant, 'note', a.note)
                              order by a.line_no), '[]'::jsonb)
                           from public.order_add_ons a where a.order_id = o.id),
               'boxes', (select coalesce(jsonb_agg(jsonb_build_object(
                                'size', b.size, 'qty', b.qty, 'charge_cents', b.charge_cents)
                              order by b.size), '[]'::jsonb)
                           from public.order_boxes b where b.order_id = o.id),
               'swaps', (select coalesce(jsonb_agg(jsonb_build_object(
                                'from', s.from_product, 'to', s.to_product, 'qty', s.qty,
                                'delta_cents', s.price_delta_cents, 'at', s.swapped_at)
                              order by s.swapped_at), '[]'::jsonb)
                           from public.order_swaps s where s.order_id = o.id)
             ) as x
        from public.orders o
       where o.state in ('Payment review', 'Confirmed', 'Preparing', 'Ready')
          or o.placed_at > now() - interval '60 days'
       order by (o.state in ('Payment review', 'Confirmed', 'Preparing', 'Ready')) desc, o.placed_at desc
       limit 500
    ) q;
  return v_out;
end;
$$;
revoke execute on function public.get_staff_orders() from public, anon, authenticated;
grant execute on function public.get_staff_orders() to authenticated;
