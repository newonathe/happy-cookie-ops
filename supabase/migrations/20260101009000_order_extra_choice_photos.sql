-- One photo association per saved add-on and its exact customer choice.
-- add_ons remains the established pricing/order key contract; older saves never touch this column.
alter table public.order_extras
  add column choice_images jsonb not null default '{}'::jsonb
    check (jsonb_typeof(choice_images) = 'object');

create or replace function public.get_order_extras()
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
    raise exception 'only the owner may read the order extras' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'same_day_enabled', x.same_day_enabled, 'same_day_percent', x.same_day_percent,
           'same_day_on_extras', x.same_day_on_extras, 'sampler_product_id', x.sampler_product_id,
           'sampler_max_qty', x.sampler_max_qty, 'sampler_flavours', to_jsonb(x.sampler_flavours),
           'box_sizes', x.box_sizes, 'add_ons', x.add_ons,
           'choice_images', x.choice_images, 'updated_at', x.updated_at)
    into v_out
    from public.order_extras x where x.id;
  return v_out;
end;
$$;
revoke execute on function public.get_order_extras() from public, anon, authenticated;
grant execute on function public.get_order_extras() to authenticated;

-- Reuse all current financial, sampler, stale-stamp and archive rules, then atomically set photos.
create function public.save_order_extras_with_images(
  p_extras jsonb,
  p_choice_images jsonb,
  p_expected_updated_at timestamptz
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_add_ons jsonb;
  v_add_on jsonb;
  v_pair record;
  v_photo record;
  v_at timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the order extras' using errcode = '42501';
  end if;
  if p_choice_images is null or jsonb_typeof(p_choice_images) <> 'object' then
    raise exception 'choice photos must be an object' using errcode = '22023';
  end if;

  -- This function checks exact keys, prices, bounds, owner authority and the expected stamp.
  -- Any failure below rolls that update back with the photo association in the same transaction.
  perform public.save_order_extras(p_extras, p_expected_updated_at);
  select x.add_ons into v_add_ons
    from public.order_extras x where x.id for update;

  for v_pair in select key, value from jsonb_each(p_choice_images) loop
    if jsonb_typeof(v_pair.value) <> 'object' then
      raise exception 'choice photos for an add-on must be an object' using errcode = '22023';
    end if;
    select a into v_add_on
      from jsonb_array_elements(v_add_ons) a
     where a ->> 'id' = v_pair.key;
    if not found then
      raise exception 'choice photo add-on is no longer saved' using errcode = '22023';
    end if;
    for v_photo in select key, value from jsonb_each(v_pair.value) loop
      if not exists (
           select 1 from jsonb_array_elements_text(v_add_on -> 'variants') v(value)
            where v.value = v_photo.key
         ) then
        raise exception 'choice photo does not match a current choice' using errcode = '22023';
      end if;
      if jsonb_typeof(v_photo.value) <> 'string'
         or (v_photo.value #>> '{}') !~ '^flavours/[0-9a-f]{32}\.(webp|jpg)$' then
        raise exception 'choice photo path is invalid' using errcode = '22023';
      end if;
    end loop;
  end loop;

  update public.order_extras x set choice_images = p_choice_images
   where x.id returning x.updated_at into v_at;
  return query select v_at;
end;
$$;
revoke execute on function public.save_order_extras_with_images(jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_order_extras_with_images(jsonb, jsonb, timestamptz)
  to authenticated;

-- Public thumbnails are only projected for active add-ons and their exact current variants.
create or replace function public.get_shop_extras()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'same_day', jsonb_build_object('enabled', x.same_day_enabled, 'percent', x.same_day_percent,
                                   'on_extras', x.same_day_on_extras),
    'sampler', jsonb_build_object('product_id', x.sampler_product_id, 'max_qty', x.sampler_max_qty,
                                  'flavours', coalesce((select jsonb_agg(f.id order by f.ord)
                                                          from unnest(x.sampler_flavours) with ordinality as f(id, ord)
                                                          join public.products p on p.id = f.id
                                                         where p.active and p.published), '[]'::jsonb)),
    'boxes', coalesce((select jsonb_agg(jsonb_build_object('size', b -> 'size', 'charge_cents', b -> 'charge_cents')
                                        order by (b ->> 'size')::integer)
                         from jsonb_array_elements(x.box_sizes) b
                        where (b ->> 'active')::boolean), '[]'::jsonb),
    'add_ons', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', a -> 'id', 'name', a -> 'name',
                            'price_cents', a -> 'price_cents', 'variants', a -> 'variants',
                            'text_label', a -> 'text_label', 'text_max', a -> 'text_max',
                            'max_qty', a -> 'max_qty',
                            'choice_images', coalesce((
                              select jsonb_object_agg(ci.key, ci.value)
                                from jsonb_each(coalesce(x.choice_images -> (a ->> 'id'), '{}'::jsonb)) ci
                               where ci.key in (select jsonb_array_elements_text(a -> 'variants'))
                                 and ci.value #>> '{}' ~ '^flavours/[0-9a-f]{32}\.(webp|jpg)$'
                            ), '{}'::jsonb)))
                           from jsonb_array_elements(x.add_ons) a
                          where (a ->> 'active')::boolean), '[]'::jsonb))
  from public.order_extras x where x.id;
$$;
revoke execute on function public.get_shop_extras() from public, anon, authenticated;
grant execute on function public.get_shop_extras() to anon, authenticated;
