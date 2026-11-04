-- The sampler box's flavours (Ethan, 3 November 2026: "have a list of all the flavours, can toggle which
-- flavours are in the sampler box"). Until now the sampler was one item of kind `set` with a quantity limit;
-- which cookies go in it was not recorded anywhere the shop could show.
--
--   order_extras.sampler_flavours   cookie ids, in the owner's order, at most 24; empty until the owner picks them
--   get_order_extras()              redefined: also returns sampler_flavours
--   save_order_extras()             redefined: accepts sampler_flavours as an optional eighth key (each a cookie
--                                   on the menu, each once). Without the key the saved list is kept, so a page
--                                   built before this migration still saves. Every other rule is the B4a
--                                   function (20260101004000) byte for byte.
--   get_shop_extras()               redefined: sampler.flavours lists the chosen cookies that are active and
--                                   published, in the owner's order; nothing else changes
-- place_order() is untouched: the sampler is still one priced item, and an order never stored its contents.

alter table public.order_extras
  add column sampler_flavours text[] not null default '{}'
    check (cardinality(sampler_flavours) <= 24);

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
           'updated_at', x.updated_at)
    into v_out
    from public.order_extras x where x.id;
  return v_out;
end;
$$;
revoke execute on function public.get_order_extras() from public, anon, authenticated;
grant execute on function public.get_order_extras() to authenticated;

/** Replaces the configuration (the same exact-keys, optimistic rule as save_order_rules()). */
create or replace function public.save_order_extras(
  p_extras jsonb,
  p_expected_updated_at timestamptz
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_ekeys   text[];
  v_el      jsonb;
  v_v       jsonb;
  v_n       numeric;
  v_boxes   jsonb := '[]'::jsonb;
  v_adds    jsonb := '[]'::jsonb;
  v_seen    text[] := '{}';
  v_vseen   text[];
  v_sampler text;
  v_label   jsonb;
  v_at      timestamptz;
  v_flav    text[] := '{}';
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the order extras' using errcode = '42501';
  end if;
  if p_extras is null or jsonb_typeof(p_extras) <> 'object' then
    raise exception 'order extras must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_extras) k;
  -- sampler_flavours is optional, so a page built before this migration still saves (and keeps the list).
  if v_keys is distinct from array['add_ons', 'box_sizes', 'same_day_enabled', 'same_day_on_extras',
                                   'same_day_percent', 'sampler_max_qty', 'sampler_product_id']
     and v_keys is distinct from array['add_ons', 'box_sizes', 'same_day_enabled', 'same_day_on_extras',
                                       'same_day_percent', 'sampler_flavours', 'sampler_max_qty',
                                       'sampler_product_id'] then
    raise exception 'order extras must carry exactly the editable keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_extras -> 'same_day_enabled') <> 'boolean' or jsonb_typeof(p_extras -> 'same_day_on_extras') <> 'boolean'
     or jsonb_typeof(p_extras -> 'add_ons') <> 'array' or jsonb_typeof(p_extras -> 'box_sizes') <> 'array'
     or jsonb_typeof(p_extras -> 'same_day_percent') <> 'number' or jsonb_typeof(p_extras -> 'sampler_max_qty') <> 'number'
     or jsonb_typeof(p_extras -> 'sampler_product_id') not in ('string', 'null') then
    raise exception 'an order extras field has the wrong type' using errcode = '22023';
  end if;
  v_n := (p_extras ->> 'same_day_percent')::numeric;
  if v_n <> trunc(v_n) or v_n not between 0 and 100 then
    raise exception 'the same-day percent must be a whole number from 0 to 100' using errcode = '22023';
  end if;
  v_n := (p_extras ->> 'sampler_max_qty')::numeric;
  if v_n <> trunc(v_n) or v_n not between 1 and 20 then
    raise exception 'the sampler limit must be a whole number from 1 to 20' using errcode = '22023';
  end if;
  if jsonb_typeof(p_extras -> 'sampler_product_id') = 'string' then
    v_sampler := p_extras ->> 'sampler_product_id';
    if not exists (select 1 from public.products p where p.id = v_sampler and p.item_type = 'set') then
      raise exception 'the sampler must be an item of kind set' using errcode = '22023';
    end if;
  end if;
  -- ---- the sampler's flavours: cookies on the menu, each once, in the owner's order
  if p_extras ? 'sampler_flavours' then
    if jsonb_typeof(p_extras -> 'sampler_flavours') <> 'array' or jsonb_array_length(p_extras -> 'sampler_flavours') > 24 then
      raise exception 'the sampler flavours are a list of at most 24 cookies' using errcode = '22023';
    end if;
    for v_v in select f from jsonb_array_elements(p_extras -> 'sampler_flavours') f loop
      if jsonb_typeof(v_v) <> 'string'
         or not exists (select 1 from public.products p where p.id = v_v #>> '{}' and p.item_type = 'cookie') then
        raise exception 'a sampler flavour must be a cookie on the menu' using errcode = '22023';
      end if;
      if (v_v #>> '{}') = any (v_flav) then
        raise exception 'a sampler flavour is listed twice' using errcode = '22023';
      end if;
      v_flav := v_flav || (v_v #>> '{}');
    end loop;
  end if;
  if jsonb_array_length(p_extras -> 'box_sizes') > 12 or jsonb_array_length(p_extras -> 'add_ons') > 20 then
    raise exception 'too many box sizes or add-ons' using errcode = '22023';
  end if;

  -- ---- box sizes
  for v_el in select b from jsonb_array_elements(p_extras -> 'box_sizes') b loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'a box size must be an object' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_ekeys from jsonb_object_keys(v_el) k;
    if v_ekeys is distinct from array['active', 'charge_cents', 'size'] then
      raise exception 'a box size carries exactly size, charge_cents and active' using errcode = '22023';
    end if;
    if jsonb_typeof(v_el -> 'size') <> 'number' or jsonb_typeof(v_el -> 'charge_cents') <> 'number'
       or jsonb_typeof(v_el -> 'active') <> 'boolean' then
      raise exception 'a box size has the wrong type' using errcode = '22023';
    end if;
    if (v_el ->> 'size')::numeric <> trunc((v_el ->> 'size')::numeric) or (v_el ->> 'size')::numeric not between 2 and 48
       or (v_el ->> 'charge_cents')::numeric <> trunc((v_el ->> 'charge_cents')::numeric)
       or (v_el ->> 'charge_cents')::numeric not between 0 and 100000 then
      raise exception 'a box size is 2 to 48 cookies and a whole-centavo charge up to 1000 pesos' using errcode = '22023';
    end if;
    if ((v_el ->> 'size')::numeric::integer)::text = any (v_seen) then
      raise exception 'a box size is listed twice' using errcode = '22023';
    end if;
    v_seen := v_seen || ((v_el ->> 'size')::numeric::integer)::text;
    v_boxes := v_boxes || jsonb_build_object('size', (v_el ->> 'size')::numeric::integer,
                                             'charge_cents', (v_el ->> 'charge_cents')::numeric::bigint,
                                             'active', (v_el ->> 'active')::boolean);
  end loop;

  -- ---- add-ons
  v_seen := '{}';
  for v_el in select a from jsonb_array_elements(p_extras -> 'add_ons') a loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'an add-on must be an object' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_ekeys from jsonb_object_keys(v_el) k;
    if v_ekeys is distinct from array['active', 'id', 'max_qty', 'name', 'price_cents', 'text_label', 'text_max', 'variants'] then
      raise exception 'an add-on carries exactly its own keys' using errcode = '22023';
    end if;
    if jsonb_typeof(v_el -> 'id') <> 'string' or jsonb_typeof(v_el -> 'name') <> 'string'
       or jsonb_typeof(v_el -> 'active') <> 'boolean' or jsonb_typeof(v_el -> 'variants') <> 'array'
       or jsonb_typeof(v_el -> 'price_cents') <> 'number' or jsonb_typeof(v_el -> 'max_qty') <> 'number'
       or jsonb_typeof(v_el -> 'text_max') <> 'number' or jsonb_typeof(v_el -> 'text_label') not in ('string', 'null') then
      raise exception 'an add-on has the wrong type' using errcode = '22023';
    end if;
    if (v_el ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'an add-on id is lowercase letters, digits and dashes' using errcode = '22023';
    end if;
    if (v_el ->> 'id') = any (v_seen) then
      raise exception 'an add-on id is listed twice' using errcode = '22023';
    end if;
    v_seen := v_seen || (v_el ->> 'id');
    if length(btrim(v_el ->> 'name')) not between 1 and 40 or (v_el ->> 'name') ~ '[[:cntrl:]]' then
      raise exception 'an add-on name is 1 to 40 characters' using errcode = '22023';
    end if;
    if (v_el ->> 'price_cents')::numeric <> trunc((v_el ->> 'price_cents')::numeric)
       or (v_el ->> 'price_cents')::numeric not between 0 and 1000000
       or (v_el ->> 'max_qty')::numeric <> trunc((v_el ->> 'max_qty')::numeric)
       or (v_el ->> 'max_qty')::numeric not between 1 and 50
       or (v_el ->> 'text_max')::numeric <> trunc((v_el ->> 'text_max')::numeric)
       or (v_el ->> 'text_max')::numeric not between 1 and 300 then
      raise exception 'an add-on price, limit or text length is out of range' using errcode = '22023';
    end if;
    v_label := v_el -> 'text_label';
    if jsonb_typeof(v_label) = 'string' and (length(btrim(v_label #>> '{}')) not between 1 and 30 or (v_label #>> '{}') ~ '[[:cntrl:]]') then
      raise exception 'an add-on text label is 1 to 30 characters' using errcode = '22023';
    end if;
    if jsonb_array_length(v_el -> 'variants') > 12 then
      raise exception 'an add-on has at most 12 variants' using errcode = '22023';
    end if;
    v_vseen := '{}';
    for v_v in select x from jsonb_array_elements(v_el -> 'variants') x loop
      if jsonb_typeof(v_v) <> 'string' or length(btrim(v_v #>> '{}')) not between 1 and 20 or (v_v #>> '{}') ~ '[[:cntrl:]]' then
        raise exception 'a variant is 1 to 20 characters' using errcode = '22023';
      end if;
      if btrim(v_v #>> '{}') = any (v_vseen) then
        raise exception 'a variant is listed twice' using errcode = '22023';
      end if;
      v_vseen := v_vseen || btrim(v_v #>> '{}');
    end loop;
    v_adds := v_adds || jsonb_build_object(
      'id', v_el ->> 'id', 'name', btrim(v_el ->> 'name'),
      'price_cents', (v_el ->> 'price_cents')::numeric::bigint, 'active', (v_el ->> 'active')::boolean,
      'variants', to_jsonb(v_vseen),
      'text_label', case when jsonb_typeof(v_label) = 'string' then to_jsonb(btrim(v_label #>> '{}')) else 'null'::jsonb end,
      'text_max', (v_el ->> 'text_max')::numeric::integer, 'max_qty', (v_el ->> 'max_qty')::numeric::integer);
  end loop;

  update public.order_extras as x set
      same_day_enabled = (p_extras ->> 'same_day_enabled')::boolean,
      same_day_percent = (p_extras ->> 'same_day_percent')::numeric::integer,
      same_day_on_extras = (p_extras ->> 'same_day_on_extras')::boolean,
      sampler_product_id = v_sampler,
      sampler_max_qty = (p_extras ->> 'sampler_max_qty')::numeric::integer,
      sampler_flavours = case when p_extras ? 'sampler_flavours' then v_flav else x.sampler_flavours end,
      box_sizes = v_boxes,
      add_ons = v_adds
    where x.id and date_trunc('milliseconds', x.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning x.updated_at into v_at;
  if v_at is null then
    raise exception 'order extras changed since they were read' using errcode = 'P0002';
  end if;
  return query select v_at;
end;
$$;
revoke execute on function public.save_order_extras(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_order_extras(jsonb, timestamptz) to authenticated;

/** What a customer's page builds its box and add-on pickers from: active items and the same-day rule, nothing else. */
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
    'add_ons', coalesce((select jsonb_agg(jsonb_build_object('id', a -> 'id', 'name', a -> 'name',
                                          'price_cents', a -> 'price_cents', 'variants', a -> 'variants',
                                          'text_label', a -> 'text_label', 'text_max', a -> 'text_max',
                                          'max_qty', a -> 'max_qty'))
                           from jsonb_array_elements(x.add_ons) a
                          where (a ->> 'active')::boolean), '[]'::jsonb))
  from public.order_extras x where x.id;
$$;
revoke execute on function public.get_shop_extras() from public, anon, authenticated;
grant execute on function public.get_shop_extras() to anon, authenticated;
