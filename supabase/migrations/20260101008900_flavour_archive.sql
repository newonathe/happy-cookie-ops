-- Reversible owner removal from current catalogue management; product rows and all references stay intact.
alter table public.products add column archived_at timestamptz;
alter table public.products add constraint products_archive_state
  check (archived_at is null or (not active and not published));

-- Keep optimistic stamps unique even for rapid writes in one transaction/millisecond.
drop trigger products_touch on public.products;
create function public.touch_product_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.archived_at is not null and new.archived_at is not null then
    raise exception 'restore a removed flavour before editing it' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 millisecond');
  end if;
  if new.archived_at is not null then
    new.active := false;
    new.published := false;
  end if;
  return new;
end;
$$;
revoke all on function public.touch_product_updated_at() from public, anon, authenticated, service_role;
create trigger products_archive_guard before insert or update on public.products
for each row execute function public.touch_product_updated_at();

drop function public.get_flavours();
create function public.get_flavours()
returns table (
  id text, name text, short_name text, price_cents bigint, kind text, item_type text,
  capacity_weight integer, tag text, description text, image_path text, allergens text,
  active boolean, published boolean, sort_order integer, updated_at timestamptz, archived_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'only active staff may read the flavour list' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.short_name, p.price_cents, p.kind, p.item_type, p.capacity_weight,
           p.tag, p.description, p.image_path, p.allergens, p.active, p.published,
           p.sort_order, p.updated_at, p.archived_at
      from public.products p order by p.sort_order, p.id;
end;
$$;
revoke execute on function public.get_flavours() from public, anon, authenticated;
grant execute on function public.get_flavours() to authenticated;

create or replace view public.shop_products with (security_barrier=true, security_invoker=false) as
select id, name, short_name, price_cents, kind, tag, description, image_path, sort_order, allergens
       , (item_type = 'item') as sold_by_piece
  from public.products where published and active and archived_at is null;

-- Preserve the existing whole-set contract, but do not let old clients publish a removed ID.
create or replace function public.publish_flavours(p_ids text[])
returns table (id text, published boolean, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then
    raise exception 'only the owner may publish the menu' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) > 200 then
    raise exception 'publish takes a list of at most 200 flavour ids' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_ids) x where x is null or x !~ '^[a-z0-9][a-z0-9-]{0,31}$') then
    raise exception 'flavour id must be 1-32 lowercase letters, digits or dashes' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_ids) x where not exists (select 1 from public.products p where p.id = x)) then
    raise exception 'publish names a flavour that does not exist' using errcode = '22023';
  end if;
  if exists (select 1 from public.products p where p.id = any(p_ids) and p.archived_at is not null) then
    raise exception 'removed flavours must be restored before publishing' using errcode = '23514';
  end if;
  return query
    update public.products as p set published = (p.id = any(p_ids))
     where p.archived_at is null and p.published is distinct from (p.id = any(p_ids))
    returning p.id, p.published, p.updated_at;
end;
$$;
revoke execute on function public.publish_flavours(text[]) from public, anon, authenticated;
grant execute on function public.publish_flavours(text[]) to authenticated;

create function public.archive_flavour(p_id text, p_expected_updated_at timestamptz)
returns table (id text, archived_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may remove a flavour' using errcode = '42501';
  end if;
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' or p_expected_updated_at is null then
    raise exception 'a flavour id and current stamp are required' using errcode = '22023';
  end if;
  perform 1 from public.products p where p.id = p_id
    and date_trunc('milliseconds', p.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    and p.archived_at is null for update;
  if not found then raise exception 'flavour changed since it was read' using errcode = 'P0002'; end if;
  if exists (select 1 from public.order_extras x where x.id and x.sampler_product_id = p_id) then
    raise exception 'change the sampler product before removing this flavour' using errcode = '23514';
  end if;
  return query update public.products p set archived_at = clock_timestamp(), active = false, published = false
    where p.id = p_id returning p.id, p.archived_at, p.updated_at;
end;
$$;
revoke execute on function public.archive_flavour(text, timestamptz) from public, anon, authenticated;
grant execute on function public.archive_flavour(text, timestamptz) to authenticated;

create function public.restore_flavour(p_id text, p_expected_updated_at timestamptz)
returns table (id text, archived_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may restore a flavour' using errcode = '42501';
  end if;
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' or p_expected_updated_at is null then
    raise exception 'a flavour id and current stamp are required' using errcode = '22023';
  end if;
  return query update public.products p set archived_at = null, active = false, published = false
   where p.id = p_id and p.archived_at is not null
     and date_trunc('milliseconds', p.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
   returning p.id, p.archived_at, p.updated_at;
  if not found then raise exception 'flavour changed since it was read' using errcode = 'P0002'; end if;
end;
$$;
revoke execute on function public.restore_flavour(text, timestamptz) from public, anon, authenticated;
grant execute on function public.restore_flavour(text, timestamptz) to authenticated;

-- Legacy whole-object saves must not make a removed SKU selectable after the archive commits.
create function public.guard_order_extras_sampler_archive()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_archived timestamptz;
begin
  if new.sampler_product_id is null then return new; end if;
  select p.archived_at into v_archived from public.products p
   where p.id = new.sampler_product_id for share;
  if not found or v_archived is not null then
    raise exception 'sampler product is no longer available' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_order_extras_sampler_archive() from public, anon, authenticated, service_role;
create trigger order_extras_sampler_archive_guard before insert or update of sampler_product_id
on public.order_extras for each row execute function public.guard_order_extras_sampler_archive();
