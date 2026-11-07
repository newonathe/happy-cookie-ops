-- Private transfer contract. Authenticated execution stays disabled until the
-- matching return/finalization boundary is installed by a following migration.
create function public.kitchen_cookie_timeline(p_product text, p_drop integer)
returns table (at timestamptz, qty bigint)
language sql volatile security definer set search_path = '' as $$
  select r.at, (case r.kind when 'batch' then r.qty when 'discard_baked' then -r.qty
                           when 'batch_correction' then r.qty_delta end)::bigint
    from public.production_records r where r.product_id = p_product and r.drop_no = p_drop
      and r.kind in ('batch', 'discard_baked', 'batch_correction')
  union all
  select r.at, -i.qty::bigint from public.production_records r join public.order_items i on i.order_id = r.ref
    where r.kind = 'pack' and r.drop_no = p_drop and i.product_id = p_product
  union all
  select m.at, m.qty_delta::bigint from public.bazaar_kitchen_moves m
    join public.bazaar_kitchen_sources s using (scheduled_id, product_id)
    where s.product_id = p_product and s.source_drop = p_drop
$$;
revoke all on function public.kitchen_cookie_timeline(text,integer)
  from public, anon, authenticated, service_role;
create or replace function public.kitchen_cookie_balance(p_product text, p_drop integer)
returns bigint language sql volatile security definer set search_path = '' as $$
  select coalesce(sum(t.qty), 0)::bigint from public.kitchen_cookie_timeline(p_product, p_drop) t
$$;

-- A transferred flavour cannot also be edited as legacy Made-today stock.
create function public.guard_bazaar_kitchen_line()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_booking uuid; v_product text; v_day uuid; v_expected bigint;
begin
  if tg_op = 'UPDATE' and (old.day_id is distinct from new.day_id or old.product_id is distinct from new.product_id) then
    raise exception 'a day stock line keeps its identity' using errcode = 'ZB002';
  end if;
  v_product := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  v_day := case when tg_op = 'DELETE' then old.day_id else new.day_id end;
  select d.scheduled_id into v_booking from public.bazaar_days d where d.id = v_day;
  if exists (select 1 from public.bazaar_kitchen_sources s
    where s.scheduled_id = v_booking and s.product_id = v_product) then
    if tg_op = 'DELETE' then
      raise exception 'recorded kitchen transfers cannot be removed by editing a day plan' using errcode = 'ZB002';
    end if;
    select coalesce(-sum(m.qty_delta), 0) into v_expected from public.bazaar_kitchen_moves m
      where m.scheduled_id = v_booking and m.product_id = v_product and m.day_id = v_day and m.kind = 'transfer';
    if new.made_qty <> v_expected then
      raise exception 'use a kitchen transfer for this flavour' using errcode = 'ZB002';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_bazaar_kitchen_line()
  from public, anon, authenticated, service_role;
create trigger bazaar_kitchen_line before insert or update or delete on public.bazaar_day_lines
  for each row execute function public.guard_bazaar_kitchen_line();

create function public.transfer_bazaar_stock(p_transfer jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_day uuid; v_product text; v_drop integer; v_qty integer; v_at timestamptz;
  v_booking uuid; v_source integer; v_available bigint; v_at_balance numeric; v_future_min numeric;
  v_d public.bazaar_days%rowtype; v_s public.scheduled_events%rowtype;
  v_line public.bazaar_day_lines%rowtype; v_seen public.bazaar_kitchen_moves%rowtype;
  v_sources jsonb; v_ack jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may transfer kitchen cookies' using errcode = '42501';
  end if;
  if p_transfer is null or jsonb_typeof(p_transfer) <> 'object' then
    raise exception 'a transfer must be an object' using errcode = '22023';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_transfer) k)
    is distinct from array['at','day_id','id','product_id','qty','source_drop'] then
    raise exception 'a transfer carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_transfer->'id') is distinct from 'string'
    or jsonb_typeof(p_transfer->'day_id') is distinct from 'string'
    or jsonb_typeof(p_transfer->'product_id') is distinct from 'string'
    or jsonb_typeof(p_transfer->'qty') is distinct from 'number'
    or jsonb_typeof(p_transfer->'source_drop') is distinct from 'number'
    or jsonb_typeof(p_transfer->'at') is distinct from 'number' then
    raise exception 'a transfer field has the wrong type' using errcode = '22023';
  end if;
  if (p_transfer->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (p_transfer->>'day_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or length(p_transfer->>'product_id') not between 1 and 128
    or (p_transfer->>'qty') !~ '^[1-9][0-9]{0,3}$'
    or (p_transfer->>'source_drop') !~ '^[0-9]{1,6}$'
    or (p_transfer->>'at') !~ '^[0-9]{12,14}$' then
    raise exception 'check the transfer identity, quantity, period and time' using errcode = '22023';
  end if;
  v_id := (p_transfer->>'id')::uuid; v_day := (p_transfer->>'day_id')::uuid;
  v_product := p_transfer->>'product_id'; v_drop := (p_transfer->>'source_drop')::integer;
  v_qty := (p_transfer->>'qty')::integer; v_at := to_timestamp((p_transfer->>'at')::bigint / 1000.0);
  if v_drop > 100000 or v_at > now() + interval '1 day' then
    raise exception 'check the transfer period and time' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kitchen_transfer:' || v_id::text, 0));
  select * into v_seen from public.bazaar_kitchen_moves where id = v_id;
  if found then
    if v_seen.request::text <> p_transfer::text then
      raise exception 'that transfer id was used for another request' using errcode = '23505';
    end if;
    return v_seen.acknowledgement || '{"duplicate":true}'::jsonb;
  end if;
  select d.scheduled_id into v_booking from public.bazaar_days d where d.id = v_day;
  if v_booking is null then raise exception 'no such bazaar day' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  select * into strict v_d from public.bazaar_days where id = v_day for update;
  select * into strict v_s from public.scheduled_events where id = v_booking;
  if not v_s.active or v_s.finalised_at is not null or v_d.closed_review is not null
    or exists (select 1 from public.events e where e.id = v_d.event_id and e.closed_at is not null) then
    raise exception 'that bazaar day cannot receive cookies' using errcode = '55000';
  end if;
  select * into v_line from public.bazaar_day_lines where day_id = v_day and product_id = v_product for update;
  if not found or not exists (select 1 from public.products p
    where p.id = v_product and p.active and p.item_type = 'cookie') then
    raise exception 'that flavour has no available price on this day' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_product, 0));
  -- First-source publication is inside the same product lock as every spender.
  select source_drop into v_source from public.bazaar_kitchen_sources
    where scheduled_id = v_booking and product_id = v_product;
  if found and v_source <> v_drop then
    raise exception 'this flavour already uses another kitchen period' using errcode = 'ZB002';
  end if;
  if v_source is null and exists (select 1 from public.bazaar_day_lines l
    join public.bazaar_days d on d.id = l.day_id
    where d.scheduled_id = v_booking and l.product_id = v_product and l.made_qty > 0) then
    raise exception 'legacy separately-made and kitchen cookies cannot be mixed' using errcode = 'ZB002';
  end if;
  if v_line.made_qty + v_qty > 9999 then
    raise exception 'the day holds at most 9999 of a flavour' using errcode = '22023';
  end if;
  v_available := public.kitchen_cookie_balance(v_product, v_drop);
  if v_available < v_qty then
    raise exception 'not enough baked kitchen cookies' using errcode = 'ZB001';
  end if;
  with deltas as (select t.at, sum(t.qty) as change from public.kitchen_cookie_timeline(v_product, v_drop) t group by t.at),
  timeline as (select at, sum(change) over (order by at rows unbounded preceding) as balance from deltas)
  select coalesce((select balance from timeline where at <= v_at order by at desc limit 1), 0),
    (select min(balance) from timeline where at > v_at) into v_at_balance, v_future_min;
  if least(v_at_balance, coalesce(v_future_min, v_at_balance)) < v_qty then
    raise exception 'kitchen stock cannot support this transfer date' using errcode = 'ZB003';
  end if;
  select coalesce(jsonb_agg(r.id order by r.at, r.id), '[]'::jsonb) into v_sources
    from public.production_records r where r.kind = 'batch' and r.product_id = v_product
      and r.drop_no = v_drop and r.at <= v_at;
  v_ack := jsonb_build_object('id',v_id,'day_id',v_day,'product_id',v_product,'source_drop',v_drop,
    'qty',v_qty,'at',p_transfer->'at','kitchen_remaining',v_available-v_qty,
    'day_total',v_line.made_qty+v_line.carried_qty+v_qty,'source_records',v_sources,'duplicate',false);
  insert into public.bazaar_kitchen_sources values (v_booking,v_product,v_drop) on conflict do nothing;
  insert into public.bazaar_kitchen_moves values
    (v_id,v_booking,v_product,v_day,'transfer',-v_qty,v_at,p_transfer,v_ack,v_sources,auth.uid());
  update public.bazaar_day_lines set made_qty = made_qty + v_qty where day_id = v_day and product_id = v_product;
  update public.bazaar_days set updated_at = clock_timestamp(), plan_hash = encode(sha256(convert_to(
    plan_hash || ':transfer:' || v_id::text, 'UTF8')), 'hex') where id = v_day;
  if v_d.event_id is not null then
    update public.events set loaded = jsonb_set(loaded,array[v_product],v_ack->'day_total') where id = v_d.event_id;
  end if;
  insert into public.audit_log(actor,action,entity,entity_id,detail)
    values (auth.uid(),'bazaar.kitchen_transfer','bazaar_kitchen_moves',v_id::text,v_ack);
  return v_ack;
end;
$$;
revoke all on function public.transfer_bazaar_stock(jsonb)
  from public, anon, authenticated, service_role;
