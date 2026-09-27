-- MP-09 c1: the flavour list on the database (docs/state/order-form-audit.md, slice 2).
--
-- `products` already holds the engine's flavour record (name, short name, price, kind =
-- Permanent/Rotating, tag = badge, description, image path, active = on the order form,
-- sort order). This adds what the order-form audit needs and the engine's ALLERGENS map:
--
--   allergens        free text shown as "Contains …" on the shop (Cine: per flavour)
--   item_type        cookie or set — a separate column, because `kind` already means
--                    Permanent/Rotating (20260101000200)
--   capacity_weight  how many slots one of it takes (decision D9, default 1)
--   updated_at       optimistic concurrency, the same rule as save_setting()
--
-- Writes go only through save_flavour() (owner). Reads: get_flavours() for any active
-- staff member (helpers need the list for baking and the bazaar; nothing on a flavour is a
-- cost), and the public shop keeps reading only shop_products, which gains `allergens`
-- because the shop shows them. Nothing is ever deleted: the foreign keys cascade to
-- recipes, so "off the menu" is `active = false`. `published` is not written here;
-- publishing is its own owner command (MP-09 c1b).

alter table public.products
  add column allergens text not null default '',
  add column item_type text not null default 'cookie',
  add column capacity_weight integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add constraint products_item_type check (item_type in ('cookie', 'set')),
  add constraint products_capacity_weight check (capacity_weight between 1 and 48);

create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();

-- The owner's FOR ALL policy plus migration 19's table grants let her write any value
-- straight through PostgREST, skipping validation. From here only save_flavour() writes.
revoke insert, update, delete on public.products from anon, authenticated;

create or replace view public.shop_products with (security_barrier=true, security_invoker=false) as
select id, name, short_name, price_cents, kind, tag, description, image_path, sort_order, allergens
from public.products where published and active;

create or replace function public.get_flavours()
returns table (
  id text, name text, short_name text, price_cents bigint, kind text, item_type text,
  capacity_weight integer, tag text, description text, image_path text, allergens text,
  active boolean, published boolean, sort_order integer, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'only active staff may read the flavour list' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.short_name, p.price_cents, p.kind, p.item_type, p.capacity_weight,
           p.tag, p.description, p.image_path, p.allergens, p.active, p.published,
           p.sort_order, p.updated_at
      from public.products p
     order by p.sort_order, p.id;
end;
$$;
revoke execute on function public.get_flavours() from public, anon, authenticated;
grant execute on function public.get_flavours() to authenticated;

/**
 * Creates (p_expected_updated_at null) or replaces one flavour. `p_flavour` must carry
 * exactly the editable keys below — a missing or unknown key is refused, so a client
 * cannot write a field this function does not check (`published`, `updated_at`).
 *
 * image_path is spliced by the engine into an inline style's `url(…)` unquoted, so it is
 * limited to path characters: no quote, parenthesis, colon, semicolon or space can reach
 * the style. Photo uploads (MP-11) will widen this deliberately.
 */
create or replace function public.save_flavour(
  p_id text,
  p_flavour jsonb,
  p_expected_updated_at timestamptz
)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys  text[];
  v_price numeric;
  v_wt    numeric;
  v_sort  numeric;
  v_id    text;
  v_at    timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the flavour list' using errcode = '42501';
  end if;

  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
    raise exception 'flavour id must be 1-32 lowercase letters, digits or dashes' using errcode = '22023';
  end if;
  if p_flavour is null or jsonb_typeof(p_flavour) <> 'object' then
    raise exception 'flavour must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_flavour) k;
  if v_keys is distinct from array['active', 'allergens', 'capacity_weight', 'description',
      'image_path', 'item_type', 'kind', 'name', 'price_cents', 'short_name', 'sort_order', 'tag'] then
    raise exception 'flavour must carry exactly the editable keys' using errcode = '22023';
  end if;

  if jsonb_typeof(p_flavour -> 'name') <> 'string' or jsonb_typeof(p_flavour -> 'short_name') <> 'string'
     or jsonb_typeof(p_flavour -> 'kind') <> 'string' or jsonb_typeof(p_flavour -> 'item_type') <> 'string'
     or jsonb_typeof(p_flavour -> 'tag') <> 'string' or jsonb_typeof(p_flavour -> 'description') <> 'string'
     or jsonb_typeof(p_flavour -> 'image_path') <> 'string' or jsonb_typeof(p_flavour -> 'allergens') <> 'string'
     or jsonb_typeof(p_flavour -> 'active') <> 'boolean'
     or jsonb_typeof(p_flavour -> 'price_cents') <> 'number'
     or jsonb_typeof(p_flavour -> 'capacity_weight') <> 'number'
     or jsonb_typeof(p_flavour -> 'sort_order') <> 'number' then
    raise exception 'flavour field has the wrong type' using errcode = '22023';
  end if;

  if length(btrim(p_flavour ->> 'name')) not between 1 and 60
     or length(btrim(p_flavour ->> 'short_name')) not between 1 and 40
     or length(p_flavour ->> 'tag') > 30
     or length(p_flavour ->> 'description') > 300
     -- The shop prints "Contains " + allergens, so an empty value would show a dangling word.
     or length(btrim(p_flavour ->> 'allergens')) not between 1 and 200
     or length(p_flavour ->> 'image_path') > 200
     or (p_flavour ->> 'image_path') !~ '^[A-Za-z0-9/_.-]*$'
     or (p_flavour ->> 'kind') not in ('Permanent', 'Rotating')
     or (p_flavour ->> 'item_type') not in ('cookie', 'set') then
    raise exception 'flavour text out of bounds' using errcode = '22023';
  end if;

  v_price := (p_flavour ->> 'price_cents')::numeric;
  v_wt := (p_flavour ->> 'capacity_weight')::numeric;
  v_sort := (p_flavour ->> 'sort_order')::numeric;
  if v_price <> trunc(v_price) or v_price < 0 or v_price > 1000000
     or v_wt <> trunc(v_wt) or v_wt < 1 or v_wt > 48
     or v_sort <> trunc(v_sort) or v_sort < 0 or v_sort > 999 then
    raise exception 'flavour number out of range' using errcode = '22023';
  end if;

  -- Same optimistic rule as save_setting(): null means "new flavour"; otherwise the row
  -- must still carry the updated_at the caller read (milliseconds, as a JS Date holds it).
  if p_expected_updated_at is null then
    insert into public.products as p (id, name, short_name, price_cents, kind, item_type,
        capacity_weight, tag, description, image_path, allergens, active, sort_order)
      values (p_id, btrim(p_flavour ->> 'name'), btrim(p_flavour ->> 'short_name'), v_price::bigint,
        p_flavour ->> 'kind', p_flavour ->> 'item_type', v_wt::integer, p_flavour ->> 'tag',
        p_flavour ->> 'description', p_flavour ->> 'image_path', p_flavour ->> 'allergens',
        (p_flavour ->> 'active')::boolean, v_sort::integer)
      on conflict (id) do nothing
      returning p.id, p.updated_at into v_id, v_at;
  else
    update public.products as p set
        name = btrim(p_flavour ->> 'name'), short_name = btrim(p_flavour ->> 'short_name'),
        price_cents = v_price::bigint, kind = p_flavour ->> 'kind',
        item_type = p_flavour ->> 'item_type', capacity_weight = v_wt::integer,
        tag = p_flavour ->> 'tag', description = p_flavour ->> 'description',
        image_path = p_flavour ->> 'image_path', allergens = p_flavour ->> 'allergens',
        active = (p_flavour ->> 'active')::boolean, sort_order = v_sort::integer
      where p.id = p_id
        and date_trunc('milliseconds', p.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
      returning p.id, p.updated_at into v_id, v_at;
  end if;

  if v_id is null then
    raise exception 'flavour changed since it was read: %', p_id using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_flavour(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_flavour(text, jsonb, timestamptz) to authenticated;
