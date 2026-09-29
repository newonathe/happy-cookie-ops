-- B4a (docs/state/finish-plan.md slice B4): boxes, add-ons, the sampler cap and the same-day surcharge,
-- database half. Everything Cine's September form has beyond flavours by the piece, configured by
-- the owner and priced only by the server.
--
--   order_extras          one row (id = true): the owner's configuration. No API grant, no policy.
--                           same-day  on/off, percent (Sept form: +40), whether it also applies to add-ons and
--                                     box charges (decision D7: cookies and the sampler only, by default)
--                           sampler   which item (a flavour of kind `set`, made in the flavour editor) is the
--                                     sampler box, and its quantity limit (Sept form: 1 to 3)
--                           box_sizes [{size, charge_cents, active}]  6 / 8 / 12, charge 0 until she enters one (C5)
--                           add_ons   [{id, name, price_cents, active, variants[], text_label, text_max, max_qty}]
--                                     note card (with a message), ribbon, stickers 1-4, sticker pack
--   get_order_extras() / save_order_extras()   owner only, exact keys, whole numbers in range, stale stamp (P0002)
--   get_shop_extras()     the public read the checkout builds its pickers from: active items only
--   place_order()         redefined: two more optional keys, `add_ons` and `boxes`, and these rules
--                           same-day-off      pickup today while same-day is off
--                           same-day-time     the chosen time (or the campus slot's end) is already past
--                           sampler-cap       more sampler boxes than the owner's limit
--                           box-size          a box size that is not offered (ZC007: the page is out of date)
--                           box-fit           more cookies boxed than the order holds (sets and the sampler are not boxable)
--                           addon-unknown     an add-on that is not offered (ZC007: the page is out of date)
--                           addon-variant     a variant the add-on does not have, or none where it needs one
--                           addon-text        a message where there is no text field, none or too long where there is,
--                                             or more than one card on a message line
--                           addon-qty         more of one add-on than the owner's limit
--                           addon-dup         the same add-on, variant and text listed twice
--                         The total is items + add-ons + box charges + the same-day surcharge, stored in
--                         orders.total_cents. `pickup-lead` now judges every date except today. The rest is
--                         the B3 function (20260101003800) byte for byte, including every rule tag.
--   order_status(), get_staff_orders()   redefined to carry the add-ons, boxes and surcharge; order_status
--                         never carries the note text (a forwarded status link is a credential, not a person)
--   anonymise_customer(), prune_personal_data()   redefined: the note-card message is the customer's own
--                         words (D11), so it is blanked with the name and phone
--
-- A swap changes an order's total only by the item-price difference (20260101003900), so a surcharge or
-- an add-on survives it. The surcharge is (base * percent + 50) / 100 in centavos: rounded once, half up.

-- ------------------------------------------------------------------ owner configuration

create table public.order_extras (
  id boolean primary key default true check (id),
  same_day_enabled boolean not null default true,
  same_day_percent integer not null default 40 check (same_day_percent between 0 and 100),
  same_day_on_extras boolean not null default false,
  sampler_product_id text references public.products (id) on delete set null,
  sampler_max_qty integer not null default 3 check (sampler_max_qty between 1 and 20),
  box_sizes jsonb not null default '[{"size":6,"charge_cents":0,"active":true},{"size":8,"charge_cents":0,"active":true},{"size":12,"charge_cents":0,"active":true}]'::jsonb
    check (jsonb_typeof(box_sizes) = 'array' and jsonb_array_length(box_sizes) <= 12),
  add_ons jsonb not null default '[{"id":"note-card","name":"Note card","price_cents":1000,"active":true,"variants":[],"text_label":"Message","text_max":150,"max_qty":1},{"id":"cream-ribbon","name":"Cream ribbon","price_cents":1000,"active":true,"variants":[],"text_label":null,"text_max":150,"max_qty":10},{"id":"sticker","name":"Sticker","price_cents":1500,"active":true,"variants":["1","2","3","4"],"text_label":null,"text_max":150,"max_qty":10},{"id":"sticker-pack","name":"Sticker pack of 4","price_cents":5000,"active":true,"variants":[],"text_label":null,"text_max":150,"max_qty":10}]'::jsonb
    check (jsonb_typeof(add_ons) = 'array' and jsonb_array_length(add_ons) <= 20),
  updated_at timestamptz not null default now()
);
alter table public.order_extras enable row level security;
revoke all on table public.order_extras from public, anon, authenticated;
create trigger order_extras_touch before update on public.order_extras
for each row execute function public.touch_updated_at();
-- One row, present from the start: the defaults above are the September form's (prices and limits), and
-- Cine changes each of them in the app.
insert into public.order_extras (id) values (true);

-- ------------------------------------------------------------------ what an order carries

alter table public.orders
  add column surcharge_cents bigint not null default 0 check (surcharge_cents >= 0),
  add column same_day boolean not null default false;

-- What an order bought beyond flavours, frozen at order time (a later price change never touches it).
create table public.order_add_ons (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  line_no integer not null check (line_no >= 1),
  add_on_id text not null check (add_on_id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  name text not null check (length(name) between 1 and 40),
  qty integer not null check (qty between 1 and 50),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  variant text check (variant is null or length(variant) between 1 and 20),
  -- The customer's own words (a note-card message): personal data, blanked by erasure and retention.
  note text check (note is null or length(note) <= 300)
);
create index order_add_ons_order_idx on public.order_add_ons (order_id);
alter table public.order_add_ons enable row level security;
revoke all on table public.order_add_ons from public, anon, authenticated;

create table public.order_boxes (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  size integer not null check (size between 2 and 48),
  qty integer not null check (qty between 1 and 50),
  charge_cents bigint not null check (charge_cents >= 0)
);
create index order_boxes_order_idx on public.order_boxes (order_id);
alter table public.order_boxes enable row level security;
revoke all on table public.order_boxes from public, anon, authenticated;

-- ------------------------------------------------------------------ owner: read and save the configuration

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
           'sampler_max_qty', x.sampler_max_qty, 'box_sizes', x.box_sizes, 'add_ons', x.add_ons,
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
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the order extras' using errcode = '42501';
  end if;
  if p_extras is null or jsonb_typeof(p_extras) <> 'object' then
    raise exception 'order extras must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_extras) k;
  if v_keys is distinct from array['add_ons', 'box_sizes', 'same_day_enabled', 'same_day_on_extras',
                                   'same_day_percent', 'sampler_max_qty', 'sampler_product_id'] then
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
    if (v_el ->> 'size') = any (v_seen) then
      raise exception 'a box size is listed twice' using errcode = '22023';
    end if;
    v_seen := v_seen || (v_el ->> 'size');
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
    'sampler', jsonb_build_object('product_id', x.sampler_product_id, 'max_qty', x.sampler_max_qty),
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

-- ------------------------------------------------------------------ place_order (B1, B3, plus B4)

create or replace function public.place_order(p_order jsonb)
returns table (order_no text, status_token text, total_cents bigint, pickup_date date,
               pickup_window text, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_client  uuid;
  v_name    text;
  v_ig      text;
  v_phone   text;
  v_method  text;
  v_ref     text;
  v_notes   text;
  v_raw     text;
  v_date    date;
  v_window  text;
  v_hash    text;
  v_line    jsonb;
  v_pids    text[] := '{}';
  v_qtys    integer[] := '{}';
  v_qty_n   numeric;
  v_found   integer;
  v_qty     integer;
  v_units   integer;
  v_total   bigint;
  v_existing public.orders%rowtype;
  v_rules   public.order_rules%rowtype;
  v_now     timestamptz := now();
  v_local   timestamp := now() at time zone 'Asia/Manila';
  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_capacity integer;
  v_max_qty integer;
  v_open_dow integer;
  v_open_h  integer;
  v_open_m  integer;
  v_close_dow integer;
  v_close_h integer;
  v_close_m integer;
  v_extend_h integer;
  v_open    timestamp;
  v_close   timestamp;
  v_week    date;
  v_minute  integer;
  v_committed integer;
  v_unpaid  integer;
  v_id      text;
  v_token   text;
  v_override text;
  -- B4: boxes, add-ons, same-day
  v_extras  public.order_extras%rowtype;
  v_lkeys   text[];
  v_cfg     jsonb;
  v_i       integer;
  v_variant text;
  v_text    text;
  v_ao_ids  text[] := '{}';
  v_ao_qtys integer[] := '{}';
  v_ao_variants text[] := '{}';
  v_ao_texts text[] := '{}';
  v_ao_names text[] := '{}';
  v_ao_prices bigint[] := '{}';
  v_bx_sizes integer[] := '{}';
  v_bx_qtys integer[] := '{}';
  v_bx_charges bigint[] := '{}';
  v_cookie_qty integer;
  v_boxed   integer := 0;
  v_sampler_qty integer;
  v_addon_total bigint := 0;
  v_box_total bigint := 0;
  v_surcharge bigint := 0;
  v_base    bigint;
  v_same_day boolean := false;
  v_now_min integer;
  v_slot_end integer;
  v_ao_distinct integer;
begin
  -- ---- shape: exactly the customer's own fields, nothing the server decides
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'order must be an object' using errcode = '22023';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(p_order) k;
  if not (v_keys @> array['client_id', 'items', 'ig', 'mobile', 'name', 'pay_method', 'pickup_date', 'pickup_window']) then -- rule:keys-required
    raise exception 'order is missing a required field' using errcode = '22023';
  end if;
  if not (v_keys <@ array['add_ons', 'boxes', 'client_id', 'items', 'ig', 'mobile', 'name', 'notes', 'pay_method', 'pay_ref', 'pickup_date', 'pickup_window']) then -- rule:keys-unknown
    raise exception 'order carries a field the server does not accept' using errcode = '22023';
  end if;
  if jsonb_typeof(p_order -> 'client_id') <> 'string' or jsonb_typeof(p_order -> 'name') <> 'string'
     or jsonb_typeof(p_order -> 'ig') <> 'string' or jsonb_typeof(p_order -> 'mobile') <> 'string'
     or jsonb_typeof(p_order -> 'pickup_date') <> 'string' or jsonb_typeof(p_order -> 'pickup_window') <> 'string'
     or jsonb_typeof(p_order -> 'pay_method') <> 'string' or jsonb_typeof(p_order -> 'items') <> 'array'
     or jsonb_typeof(coalesce(p_order -> 'add_ons', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_order -> 'boxes', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_order -> 'pay_ref', '""'::jsonb)) <> 'string'
     or jsonb_typeof(coalesce(p_order -> 'notes', '""'::jsonb)) <> 'string' then
    raise exception 'order field has the wrong type' using errcode = '22023';
  end if;

  if (p_order ->> 'client_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'client id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_client := (p_order ->> 'client_id')::uuid;

  v_name := btrim(p_order ->> 'name');
  v_ig := btrim(p_order ->> 'ig');
  v_ref := btrim(coalesce(p_order ->> 'pay_ref', ''));
  v_notes := btrim(coalesce(p_order ->> 'notes', ''));
  v_method := p_order ->> 'pay_method';
  v_window := p_order ->> 'pickup_window';
  if length(v_name) not between 1 and 80 or length(v_ig) > 31 or length(v_ref) > 40 or length(v_notes) > 300
     or length(v_method) not between 1 and 30
     or (v_name || v_ig || v_ref || v_notes || v_method || v_window) ~ '[[:cntrl:]]' then
    raise exception 'order text out of bounds' using errcode = '22023';
  end if;
  if v_ig <> '' then
    v_ig := ltrim(v_ig, '@');
    if v_ig !~ '^[A-Za-z0-9._]{1,30}$' then
      raise exception 'instagram handle is not valid' using errcode = '22023';
    end if;
    v_ig := '@' || v_ig;
  end if;

  -- Must match anonymise_customer() and normalisePhone(): digits only, a leading 63 becomes 0, and the
  -- ten-digit form 9xxxxxxxxx gets its 0.
  v_phone := regexp_replace(p_order ->> 'mobile', '\D', '', 'g');
  if left(v_phone, 2) = '63' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone ~ '^9[0-9]{9}$' then v_phone := '0' || v_phone; end if;
  if v_phone !~ '^09[0-9]{9}$' then
    raise exception 'mobile number is not a Philippine mobile number' using errcode = '22023';
  end if;

  if (p_order ->> 'pickup_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'pickup date must be YYYY-MM-DD' using errcode = '22023';
  end if;
  begin
    v_date := (p_order ->> 'pickup_date')::date;
  exception when others then
    raise exception 'pickup date is not a real date' using errcode = '22023';
  end;

  if jsonb_array_length(p_order -> 'items') not between 1 and 50 then
    raise exception 'an order carries 1 to 50 different items' using errcode = '22023';
  end if;
  for v_line in select i from jsonb_array_elements(p_order -> 'items') i loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'an item must be an object' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_line)) <> 2 or not (v_line ?& array['product_id', 'qty']) then
      raise exception 'an item carries exactly a product id and a quantity' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'product_id') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or (v_line ->> 'product_id') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'an item has the wrong type' using errcode = '22023';
    end if;
    v_qty_n := (v_line ->> 'qty')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 1 or v_qty_n > 120 then
      raise exception 'an item quantity must be a whole number from 1 to 120' using errcode = '22023';
    end if;
    v_pids := v_pids || (v_line ->> 'product_id');
    v_qtys := v_qtys || v_qty_n::integer;
  end loop;
  if cardinality(v_pids) <> (select count(distinct x) from unnest(v_pids) x) then
    raise exception 'an item is listed twice' using errcode = '22023';
  end if;

  -- ---- B4 shape: add-on lines and box lines (their rules come after the owner's configuration is read)
  if jsonb_array_length(coalesce(p_order -> 'add_ons', '[]'::jsonb)) > 20
     or jsonb_array_length(coalesce(p_order -> 'boxes', '[]'::jsonb)) > 12 then
    raise exception 'an order carries at most 20 add-on lines and 12 box lines' using errcode = '22023';
  end if;
  for v_line in select i from jsonb_array_elements(coalesce(p_order -> 'add_ons', '[]'::jsonb)) i loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'an add-on must be an object' using errcode = '22023';
    end if;
    select coalesce(array_agg(k order by k), '{}') into v_lkeys from jsonb_object_keys(v_line) k;
    if not (v_lkeys @> array['id', 'qty']) or not (v_lkeys <@ array['id', 'qty', 'text', 'variant']) then
      raise exception 'an add-on carries an id and a quantity, and at most a variant and a text' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'id') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or jsonb_typeof(coalesce(v_line -> 'variant', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(v_line -> 'text', '""'::jsonb)) <> 'string'
       or (v_line ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'an add-on has the wrong type' using errcode = '22023';
    end if;
    v_qty_n := (v_line ->> 'qty')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 1 or v_qty_n > 50 then
      raise exception 'an add-on quantity must be a whole number from 1 to 50' using errcode = '22023';
    end if;
    v_variant := nullif(btrim(coalesce(v_line ->> 'variant', '')), '');
    v_text := nullif(btrim(coalesce(v_line ->> 'text', '')), '');
    if length(v_variant) > 20 or length(v_text) > 300 or (coalesce(v_variant, '') || coalesce(v_text, '')) ~ '[[:cntrl:]]' then
      raise exception 'add-on text out of bounds' using errcode = '22023';
    end if;
    v_ao_ids := array_append(v_ao_ids, v_line ->> 'id');
    v_ao_qtys := array_append(v_ao_qtys, v_qty_n::integer);
    v_ao_variants := array_append(v_ao_variants, v_variant);
    v_ao_texts := array_append(v_ao_texts, v_text);
  end loop;
  for v_line in select i from jsonb_array_elements(coalesce(p_order -> 'boxes', '[]'::jsonb)) i loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'a box must be an object' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_line)) <> 2 or not (v_line ?& array['size', 'qty']) then
      raise exception 'a box carries exactly a size and a quantity' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'size') <> 'number' or jsonb_typeof(v_line -> 'qty') <> 'number' then
      raise exception 'a box has the wrong type' using errcode = '22023';
    end if;
    v_qty_n := (v_line ->> 'size')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 2 or v_qty_n > 48 then
      raise exception 'a box size must be a whole number from 2 to 48' using errcode = '22023';
    end if;
    v_bx_sizes := array_append(v_bx_sizes, v_qty_n::integer);
    v_qty_n := (v_line ->> 'qty')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 1 or v_qty_n > 50 then
      raise exception 'a box quantity must be a whole number from 1 to 50' using errcode = '22023';
    end if;
    v_bx_qtys := array_append(v_bx_qtys, v_qty_n::integer);
  end loop;
  if cardinality(v_bx_sizes) <> (select count(distinct x) from unnest(v_bx_sizes) x) then
    raise exception 'a box size is listed twice' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(p_order::text, 'sha256'), 'hex');

  -- ---- idempotency comes before every limit: a retry of an order that already counts must be
  -- answered with that order, not refused because the first attempt now counts against the limit.
  perform pg_advisory_xact_lock(hashtextextended('order:client:' || v_client::text, 0));
  select * into v_existing from public.orders o where o.client_id = v_client;
  if found then -- rule:replay
    if v_existing.payload_hash is distinct from v_hash then -- rule:client-id-reuse
      raise exception 'order id was already used for a different order' using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.status_token, v_existing.total_cents,
                        v_existing.pickup_date, v_existing.pickup_window, true;
    return;
  end if;

  -- ---- the owner's settings and rules
  select * into v_rules from public.order_rules r where r.id;
  if not found then
    raise exception 'order rules are missing' using errcode = '55000';
  end if;
  select * into v_extras from public.order_extras x where x.id;
  if not found then
    raise exception 'order extras are missing' using errcode = '55000';
  end if;
  select max(se.int_value) filter (where se.key = 'capacity'), max(se.int_value) filter (where se.key = 'maxPerOrder'),
         max(se.int_value) filter (where se.key = 'openDow'), max(se.int_value) filter (where se.key = 'openH'),
         max(se.int_value) filter (where se.key = 'openM'), max(se.int_value) filter (where se.key = 'closeDow'),
         max(se.int_value) filter (where se.key = 'closeH'), max(se.int_value) filter (where se.key = 'closeM'),
         max(se.int_value) filter (where se.key = 'extendH')
    into v_capacity, v_max_qty, v_open_dow, v_open_h, v_open_m, v_close_dow, v_close_h, v_close_m, v_extend_h
    from public.settings_effective() se;

  -- ---- the owner's "close now" / "sold out" switch: it stops orders even inside the window
  select s.override into v_override from public.shop_state s where s.id;
  if v_override = 'closed' then -- rule:override-closed
    raise exception 'ordering is closed' using errcode = 'ZC001';
  end if;
  if v_override = 'soldout' then -- rule:override-soldout
    raise exception 'not enough room left in that pickup week' using errcode = 'ZC002', detail = '0';
  end if;

  -- ---- the ordering window: the engine's dropCycle(), in Asia/Manila (the business clock).
  -- Open from the latest opening instant to the owner's closing time plus any extension.
  v_open := (v_local::date - ((extract(dow from v_local)::integer - v_open_dow + 7) % 7))::timestamp
            + make_interval(hours => v_open_h, mins => v_open_m);
  if v_local < v_open then v_open := v_open - interval '7 days'; end if;
  v_close := (v_open::date + ((v_close_dow - v_open_dow + 7) % 7))::timestamp
             + make_interval(hours => v_close_h, mins => v_close_m) + make_interval(hours => v_extend_h);
  if (v_local < v_open or v_local >= v_close) and v_override is distinct from 'open' and v_override is distinct from 'soon' then -- rule:window
    raise exception 'ordering is closed' using errcode = 'ZC001';
  end if;

  if not exists (select 1 from public.payment_methods m where m.active and m.label = v_method) then -- rule:method
    raise exception 'that payment method is not offered' using errcode = 'ZC005';
  end if;

  -- ---- pickup date and time (Cine's form: Monday and Thursday, before 5 pm, or the campus slot)
  if extract(isodow from v_date)::integer <> all (v_rules.pickup_days) then -- rule:pickup-day
    raise exception 'pickup is not offered on that day' using errcode = 'ZC004';
  end if;
  -- Same-day pickup (Cine's form: +40%): the server derives it from the date, so a customer cannot skip the surcharge.
  if v_date = v_today then
    if not v_extras.same_day_enabled then -- rule:same-day-off
      raise exception 'same-day pickup is not offered' using errcode = 'ZC004';
    end if;
    v_same_day := true;
  end if;
  if v_date <> v_today and (v_date - v_today < v_rules.lead_min_days or v_date - v_today > v_rules.lead_max_days) then -- rule:pickup-lead
    raise exception 'pickup date is outside the allowed lead time' using errcode = 'ZC004';
  end if;
  if v_window <> 'campus' then
    if v_window !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'pickup time must be HH:MM or campus' using errcode = '22023';
    end if;
    v_minute := substr(v_window, 1, 2)::integer * 60 + substr(v_window, 4, 2)::integer;
    if v_minute < v_rules.pickup_from_hour * 60 or v_minute >= v_rules.pickup_cutoff_hour * 60 then -- rule:pickup-time
      raise exception 'pickup time is outside the pickup hours' using errcode = 'ZC004';
    end if;
  end if;
  v_now_min := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_slot_end := case when v_window = 'campus'
                     then substr(v_rules.campus_to, 1, 2)::integer * 60 + substr(v_rules.campus_to, 4, 2)::integer
                     else v_minute end;
  if v_same_day and v_slot_end <= v_now_min then -- rule:same-day-time
    raise exception 'that pickup time has already passed today' using errcode = 'ZC004';
  end if;

  -- ---- price and weigh the items from the menu, never from the request
  -- A share lock keeps a concurrent price change from landing between pricing and writing the lines.
  perform 1 from public.products p where p.id = any (v_pids) for share;
  select coalesce(sum(p.price_cents * t.qty), 0), coalesce(sum(t.qty * p.capacity_weight), 0),
         count(*), coalesce(sum(t.qty), 0)
    into v_total, v_units, v_found, v_qty
    from unnest(v_pids, v_qtys) as t(pid, qty)
    join public.products p on p.id = t.pid and p.published and p.active;
  if v_found <> cardinality(v_pids) then -- rule:menu
    raise exception 'an item is not on the menu' using errcode = '22023';
  end if;
  if v_qty > v_max_qty then -- rule:max-per-order
    raise exception 'an order carries at most % cookies', v_max_qty using errcode = '22023';
  end if;

  -- ---- B4: the sampler limit, boxes and add-ons, priced from the owner's configuration
  select coalesce(sum(t.qty), 0) into v_sampler_qty
    from unnest(v_pids, v_qtys) as t(pid, qty) where t.pid = v_extras.sampler_product_id;
  if v_sampler_qty > v_extras.sampler_max_qty then -- rule:sampler-cap
    raise exception 'an order carries at most % sampler boxes', v_extras.sampler_max_qty using errcode = '22023';
  end if;

  select coalesce(sum(t.qty), 0) into v_cookie_qty
    from unnest(v_pids, v_qtys) as t(pid, qty)
    join public.products p on p.id = t.pid and p.item_type = 'cookie';
  for v_i in 1 .. cardinality(v_bx_sizes) loop
    select b into v_cfg from jsonb_array_elements(v_extras.box_sizes) b
     where (b ->> 'size')::integer = v_bx_sizes[v_i] and (b ->> 'active')::boolean;
    if v_cfg is null then -- rule:box-size
      raise exception 'that box size is not offered' using errcode = 'ZC007';
    end if;
    v_bx_charges := array_append(v_bx_charges, (v_cfg ->> 'charge_cents')::bigint);
    v_boxed := v_boxed + v_bx_sizes[v_i] * v_bx_qtys[v_i];
    v_box_total := v_box_total + (v_cfg ->> 'charge_cents')::bigint * v_bx_qtys[v_i];
  end loop;
  if v_boxed > v_cookie_qty then -- rule:box-fit
    raise exception 'more cookies are boxed than the order holds' using errcode = '22023';
  end if;

  select count(distinct t.id || '|' || coalesce(t.variant, '') || '|' || coalesce(t.txt, '')) into v_ao_distinct
    from unnest(v_ao_ids, v_ao_variants, v_ao_texts) as t(id, variant, txt);
  if cardinality(v_ao_ids) <> v_ao_distinct then -- rule:addon-dup
    raise exception 'an add-on is listed twice' using errcode = '22023';
  end if;
  for v_i in 1 .. cardinality(v_ao_ids) loop
    select a into v_cfg from jsonb_array_elements(v_extras.add_ons) a
     where a ->> 'id' = v_ao_ids[v_i] and (a ->> 'active')::boolean;
    if v_cfg is null then -- rule:addon-unknown
      raise exception 'that add-on is not offered' using errcode = 'ZC007';
    end if;
    if (jsonb_array_length(v_cfg -> 'variants') > 0) is distinct from (v_ao_variants[v_i] is not null) or (v_ao_variants[v_i] is not null and not ((v_cfg -> 'variants') ? v_ao_variants[v_i])) then -- rule:addon-variant
      raise exception 'that add-on needs one of its variants' using errcode = '22023';
    end if;
    if ((v_cfg ->> 'text_label') is null and v_ao_texts[v_i] is not null) or ((v_cfg ->> 'text_label') is not null and (v_ao_texts[v_i] is null or length(v_ao_texts[v_i]) > (v_cfg ->> 'text_max')::integer or v_ao_qtys[v_i] <> 1)) then -- rule:addon-text
      raise exception 'that add-on takes a message of its own, one card at a time' using errcode = '22023';
    end if;
    if v_ao_qtys[v_i] > (v_cfg ->> 'max_qty')::integer then -- rule:addon-qty
      raise exception 'too many of that add-on' using errcode = '22023';
    end if;
    v_ao_names := array_append(v_ao_names, v_cfg ->> 'name');
    v_ao_prices := array_append(v_ao_prices, (v_cfg ->> 'price_cents')::bigint);
    v_addon_total := v_addon_total + (v_cfg ->> 'price_cents')::bigint * v_ao_qtys[v_i];
  end loop;

  if v_same_day then
    v_base := v_total + case when v_extras.same_day_on_extras then v_addon_total + v_box_total else 0 end;
    v_surcharge := (v_base * v_extras.same_day_percent + 50) / 100;
  end if;
  v_total := v_total + v_addon_total + v_box_total + v_surcharge;

  -- ---- serialise the counting: phone, then pickup week, always in this order
  v_week := date_trunc('week', v_date::timestamp)::date;
  perform pg_advisory_xact_lock(hashtextextended('order:phone:' || v_phone, 0));
  perform pg_advisory_xact_lock(hashtextextended('order:week:' || v_week::text, 0));

  select count(*) into v_unpaid
    from public.orders o
   where o.phone = v_phone and o.state = 'Payment review' and o.pay_state = 'unpaid'
     and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
  if v_unpaid >= v_rules.max_unpaid_per_phone then -- rule:phone-limit
    raise exception 'too many unpaid orders on this number' using errcode = 'ZC003';
  end if;

  select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_committed
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
   where o.pickup_date >= v_week and o.pickup_date < v_week + 7
     and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
  if not public.capacity_allows(v_capacity, v_committed, v_units) then -- rule:capacity
    raise exception 'not enough room left in that pickup week' using errcode = 'ZC002',
      detail = greatest(0, v_capacity - v_committed)::text;
  end if;

  -- ---- write
  v_id := 'HC-' || nextval('public.order_number_seq');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.orders (id, customer_name, phone, ig, channel, pay_method, pay_ref, total_cents, notes,
                             pickup_date, pickup_window, client_id, payload_hash, status_token, placed_at,
                             surcharge_cents, same_day)
  values (v_id, v_name, v_phone, v_ig, 'shop', v_method, nullif(v_ref, ''), v_total, v_notes,
          v_date, v_window, v_client, v_hash, v_token, v_now, v_surcharge, v_same_day);
  insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight)
  select v_id, t.pid, t.qty, p.price_cents, p.capacity_weight
    from unnest(v_pids, v_qtys) as t(pid, qty)
    join public.products p on p.id = t.pid;
  insert into public.order_add_ons (order_id, line_no, add_on_id, name, qty, unit_price_cents, variant, note)
  select v_id, t.n, t.id, t.nm, t.qty, t.price, t.variant, t.txt
    from unnest(v_ao_ids, v_ao_names, v_ao_qtys, v_ao_prices, v_ao_variants, v_ao_texts)
         with ordinality as t(id, nm, qty, price, variant, txt, n);
  insert into public.order_boxes (order_id, size, qty, charge_cents)
  select v_id, t.size, t.qty, t.charge
    from unnest(v_bx_sizes, v_bx_qtys, v_bx_charges) as t(size, qty, charge);

  return query select v_id, v_token, v_total, v_date, v_window, false;
end;
$$;
revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------ order_status (B1, plus B4)

/**
 * One order by its status token, for the customer's status page. An unknown or malformed token
 * returns null, never an error. No phone, no Instagram handle, no name and no note-card message is
 * returned: the link is the only credential, and a link is forwarded.
 */
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
           'total_cents', o.total_cents, 'pickup_date', o.pickup_date, 'pickup_window', o.pickup_window,
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

-- ------------------------------------------------------------------ get_staff_orders (B3, plus B4)

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
               'placed_at', o.placed_at, 'collected_at', o.collected_at, 'updated_at', o.updated_at,
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

-- ------------------------------------------------------------------ erasure and retention (B1, plus B4)

-- The note-card message is the customer's own words (D11): it is blanked with the name and phone, and
-- BEFORE the phone is, because the phone is how these orders are found. An unpaid order is deleted and its
-- add-on and box rows go with it (on delete cascade). Only those statements differ from the B1 definitions.
create or replace function public.anonymise_customer(p_phone text, p_note text default '')
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_norm    text;
  v_blocked integer := 0;
  v_removed integer := 0;
begin
  if not is_owner() then
    raise exception 'only the owner may action an erasure request';
  end if;

  -- Must match normalisePhone() in src/lib/idempotency.ts and lookup_order().
  v_norm := regexp_replace(p_phone, '\D', '', 'g');
  if left(v_norm, 2) = '63' then v_norm := '0' || substr(v_norm, 3); end if;
  if v_norm ~ '^9[0-9]{9}$' then v_norm := '0' || v_norm; end if;

  -- Live orders: nothing to preserve, remove them.
  with removed as (
    delete from orders
    where regexp_replace(phone, '\D', '', 'g') = v_norm
      -- 'Payment review' is where an order sits before proof of payment arrives. Nothing
      -- has been paid and no tax record exists, so there is nothing to preserve.
      and state = 'Payment review'
      and pay_state = 'unpaid'
    returning 1
  )
  select count(*) into v_removed from removed;

  update order_add_ons a set note = null
    from orders o
   where a.order_id = o.id and regexp_replace(o.phone, '\D', '', 'g') = v_norm and a.note is not null;

  -- Everything else is a financial record. Block, do not erase.
  with blocked as (
    update orders
       set customer_name = 'Removed on request',
           phone = '',
           notes = '',
           ig = '',
           status_token = null,
           payload_hash = null
     where regexp_replace(phone, '\D', '', 'g') = v_norm
    returning 1
  )
  select count(*) into v_blocked from blocked;

  delete from waitlist_entries where phone = v_norm;

  insert into erasure_requests (phone_hash, actioned_at, action, note, orders_affected)
  values (encode(extensions.digest(v_norm, 'sha256'), 'hex'), now(), 'anonymised', p_note, v_blocked + v_removed);

  return v_blocked + v_removed;
end;
$$;

create or replace function public.prune_personal_data(p_retain_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_count integer;
begin
  update order_add_ons a set note = null
    from orders o
   where a.order_id = o.id and o.placed_at < now() - make_interval(days => p_retain_days)
     and o.phone <> '' and a.note is not null;
  with pruned as (
    update orders
       set customer_name = 'Past customer',
           phone = '',
           notes = '',
           ig = '',
           status_token = null,
           payload_hash = null
     where placed_at < now() - make_interval(days => p_retain_days)
       and phone <> ''
    returning 1
  )
  select count(*) into v_count from pruned;
  delete from waitlist_entries where created_at < now() - make_interval(days => p_retain_days);
  return v_count;
end;
$$;
