-- Private foundation only: no client writer is enabled in this migration.
-- Stock is the existing product/drop pool, never an invented FIFO allocation.
create table public.bazaar_kitchen_sources (
  scheduled_id uuid not null references public.scheduled_events(id),
  product_id text not null references public.products(id),
  source_drop integer not null check (source_drop between 0 and 100000),
  primary key (scheduled_id, product_id)
);
create table public.bazaar_kitchen_moves (
  id uuid primary key,
  scheduled_id uuid not null,
  product_id text not null,
  day_id uuid not null references public.bazaar_days(id),
  kind text not null check (kind in ('transfer', 'return')),
  qty_delta integer not null check (abs(qty_delta::bigint) between 1 and 9999),
  at timestamptz not null,
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  acknowledgement jsonb not null check (jsonb_typeof(acknowledgement) = 'object'),
  source_records jsonb not null check (jsonb_typeof(source_records) = 'array'),
  created_by uuid not null references auth.users(id),
  foreign key (scheduled_id, product_id) references public.bazaar_kitchen_sources,
  check ((kind = 'transfer' and qty_delta < 0) or (kind = 'return' and qty_delta > 0))
);
create index bazaar_kitchen_moves_pool on public.bazaar_kitchen_moves(scheduled_id, product_id);
alter table public.bazaar_kitchen_sources enable row level security;
alter table public.bazaar_kitchen_moves enable row level security;
revoke all on table public.bazaar_kitchen_sources, public.bazaar_kitchen_moves
  from public, anon, authenticated, service_role;

create function public.kitchen_cookie_balance(p_product text, p_drop integer)
returns bigint language sql volatile security definer set search_path = '' as $$
  select coalesce(sum(x.qty), 0)::bigint from (
    select case r.kind when 'batch' then r.qty when 'discard_baked' then -r.qty
                       when 'batch_correction' then r.qty_delta end as qty
      from public.production_records r where r.product_id = p_product and r.drop_no = p_drop
        and r.kind in ('batch', 'discard_baked', 'batch_correction')
    union all
    select -i.qty from public.production_records r join public.order_items i on i.order_id = r.ref
      where r.kind = 'pack' and r.drop_no = p_drop and i.product_id = p_product
    union all
    select m.qty_delta from public.bazaar_kitchen_moves m
      join public.bazaar_kitchen_sources s using (scheduled_id, product_id)
      where s.product_id = p_product and s.source_drop = p_drop
  ) x
$$;
revoke all on function public.kitchen_cookie_balance(text,integer)
  from public, anon, authenticated, service_role;

-- Append-only source identity and movements; reversals require another movement.
create function public.guard_kitchen_journal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_drop integer;
begin
  if tg_op <> 'INSERT' then
    raise exception 'kitchen transfer history is append-only' using errcode = '55000';
  end if;
  if not public.is_owner() or new.created_by is distinct from auth.uid() then
    raise exception 'only the owner may move kitchen cookies' using errcode = '42501';
  end if;
  select source_drop into strict v_drop from public.bazaar_kitchen_sources
    where scheduled_id = new.scheduled_id and product_id = new.product_id;
  perform pg_advisory_xact_lock(hashtextextended('production:' || new.product_id, 0));
  if not exists (select 1 from public.bazaar_days d
    where d.id = new.day_id and d.scheduled_id = new.scheduled_id) then
    raise exception 'the transfer day belongs to another booking' using errcode = '22023';
  end if;
  -- Separate statements after the product lock obtain fresh READ COMMITTED data.
  if public.kitchen_cookie_balance(new.product_id, v_drop) + new.qty_delta < 0 then
    raise exception 'not enough baked kitchen cookies' using errcode = 'ZB001';
  end if;
  if new.kind = 'return' and new.qty_delta + coalesce((select sum(m.qty_delta)
    from public.bazaar_kitchen_moves m where m.scheduled_id = new.scheduled_id
      and m.product_id = new.product_id), 0) > 0 then
    raise exception 'cannot return more cookies than were transferred' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_kitchen_journal()
  from public, anon, authenticated, service_role;
create trigger kitchen_moves_guard before insert or update or delete on public.bazaar_kitchen_moves
  for each row execute function public.guard_kitchen_journal();
create trigger kitchen_source_immutable before update or delete on public.bazaar_kitchen_sources
  for each row execute function public.guard_kitchen_journal();

-- All competing spenders join the product lock, even before the first transfer.
-- Existing callers keep their catalogue -> product order. Discard/correction
-- already hold product and must never acquire catalogue after it.
create function public.guard_kitchen_cookie_spend()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  if new.kind not in ('pack', 'discard_baked', 'batch_correction') then return new; end if;
  for v in
    select i.product_id, sum(i.qty)::bigint as needed from public.order_items i
      where new.kind = 'pack' and i.order_id = new.ref group by i.product_id
    union all
    select new.product_id, case when new.kind = 'discard_baked' then new.qty
                               else -new.qty_delta end::bigint
      where new.kind <> 'pack'
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('production:' || v.product_id, 0));
    if v.needed > 0 and exists (select 1 from public.bazaar_kitchen_sources s
      where s.product_id = v.product_id and s.source_drop = new.drop_no)
      and public.kitchen_cookie_balance(v.product_id, new.drop_no) < v.needed then
      raise exception 'these cookies have left the kitchen' using errcode = 'ZB001';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_kitchen_cookie_spend()
  from public, anon, authenticated, service_role;
create trigger kitchen_cookie_spend before insert on public.production_records
  for each row execute function public.guard_kitchen_cookie_spend();

-- Keep every existing batch/cost/dough field verbatim; replace only baked stock.
alter function public.get_production(integer) rename to get_production_before_transfers;
revoke all on function public.get_production_before_transfers(integer)
  from public, anon, authenticated, service_role;
create function public.get_production(p_drop integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_out jsonb; v_baked jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read production' using errcode = '42501';
  end if;
  v_out := public.get_production_before_transfers(p_drop);
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'qty', x.qty)
    order by x.product_id) filter (where x.qty > 0), '[]'::jsonb) into v_baked
    from (select p.product_id, greatest(public.kitchen_cookie_balance(p.product_id, p_drop), 0) as qty
      from (select b->>'product_id' as product_id from jsonb_array_elements(v_out->'baked') b
            union select s.product_id from public.bazaar_kitchen_sources s where s.source_drop = p_drop) p) x;
  return jsonb_set(v_out, '{baked}', v_baked);
end;
$$;
revoke all on function public.get_production(integer) from public, anon, authenticated, service_role;
grant execute on function public.get_production(integer) to authenticated, service_role;
