-- Her own product types (Cine, 14 November 2026: "is there any way to add more options: cookie, set, stickers, other etc"; Ethan: types
-- are hers to configure).
--
-- A type has a name she chooses and one of three behaviours. `item_type` on products stays the behaviour every existing rule reads
-- (orders count only cookies, the sampler is a set of cookies, kitchen transfers move cookies), now with a third value, `item`: sold
-- by the unit, never counted as a cookie. Each product points at one type (`type_id`); its item_type always follows that type's
-- behaviour (a trigger enforces it on every write). Cookie and Set are built in. A type that a product uses keeps its behaviour;
-- its name can change and it can be switched off for new choices. Nothing is deleted.

create table public.product_types (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  label text not null check (length(btrim(label)) between 1 and 30 and label !~ '[[:cntrl:]]'),
  behaves_as text not null check (behaves_as in ('cookie', 'set', 'item')),
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  active boolean not null default true,
  built_in boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index product_types_label_key on public.product_types (lower(btrim(label)));
create trigger product_types_touch before update on public.product_types
for each row execute function public.touch_updated_at();
alter table public.product_types enable row level security;
revoke all on table public.product_types from public, anon, authenticated;

insert into public.product_types (id, label, behaves_as, sort_order, built_in) values
  ('cookie', 'Cookie', 'cookie', 0, true),
  ('set', 'Set', 'set', 1, true);

alter table public.products drop constraint products_item_type;
alter table public.products add constraint products_item_type check (item_type in ('cookie', 'set', 'item'));
alter table public.products add column type_id text not null default 'cookie';
update public.products set type_id = item_type where type_id is distinct from item_type;
alter table public.products add constraint products_type_id_fkey foreign key (type_id) references public.product_types (id);

/**
 * A product's item_type is its type's behaviour, whoever writes the row. A row inserted with only an item_type (the default type)
 * takes the built-in type of that behaviour; an 'item' needs a type of hers, so such an insert is refused.
 */
create or replace function public.product_type_behaviour()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.type_id = 'cookie' and new.item_type is distinct from 'cookie' then
    if new.item_type = 'set' then
      new.type_id := 'set';
    else
      raise exception 'an item needs one of her product types' using errcode = '22023';
    end if;
  end if;
  select t.behaves_as into new.item_type from public.product_types t where t.id = new.type_id;
  if new.item_type is null then
    raise exception 'that product type does not exist' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.product_type_behaviour() from public, anon, authenticated, service_role;
create trigger products_type_behaviour before insert or update of type_id, item_type on public.products
for each row execute function public.product_type_behaviour();

/**
 * The one place a flavour is validated and written, as migration 63 defined it, now with her product type (migration 85). The body
 * carries exactly the editable keys, optionally with `type_id`; without it, item_type names a built-in type. With it, the type must
 * exist (and be switched on unless the product already has it), and item_type must equal the type's behaviour.
 */
create or replace function public.write_flavour(
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
  v_type  text;
  v_behaves text;
  v_price numeric;
  v_wt    numeric;
  v_sort  numeric;
  v_id    text;
  v_at    timestamptz;
begin

  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
    raise exception 'flavour id must be 1-32 lowercase letters, digits or dashes' using errcode = '22023';
  end if;
  if p_flavour is null or jsonb_typeof(p_flavour) <> 'object' then
    raise exception 'flavour must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_flavour) k;
  -- type_id is optional (migration 85): a body without it keeps the built-in type its item_type names.
  if v_keys is distinct from array['active', 'allergens', 'capacity_weight', 'description',
      'image_path', 'item_type', 'kind', 'name', 'price_cents', 'short_name', 'sort_order', 'tag']
     and v_keys is distinct from array['active', 'allergens', 'capacity_weight', 'description',
      'image_path', 'item_type', 'kind', 'name', 'price_cents', 'short_name', 'sort_order', 'tag', 'type_id'] then
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
     or (p_flavour ->> 'item_type') not in ('cookie', 'set', 'item') then
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

  -- Her product type (migration 85). Without type_id the built-in type named by item_type is used; with it, the type must
  -- exist, and a new choice must be switched on. item_type always follows the type's behaviour (the products trigger
  -- enforces it too), so every rule that reads item_type (orders, sampler, kitchen) keeps meaning what it meant.
  -- The same lock as save_product_type: a type's behaviour cannot change while a product is being given it.
  perform pg_advisory_xact_lock(hashtextextended('product_types', 0));
  if p_flavour ? 'type_id' then
    if jsonb_typeof(p_flavour -> 'type_id') <> 'string' then -- rule:type-shape
      raise exception 'flavour field has the wrong type' using errcode = '22023';
    end if;
    v_type := p_flavour ->> 'type_id';
  else
    -- A save without type_id (a price change, Show or Hide, an import) keeps the product's own type while its behaviour
    -- still matches; otherwise the built-in type item_type names.
    select x.type_id into v_type from public.products x join public.product_types t on t.id = x.type_id
     where x.id = p_id and t.behaves_as = p_flavour ->> 'item_type'; -- rule:type-keep
    v_type := coalesce(v_type, p_flavour ->> 'item_type');
  end if;
  select t.behaves_as into v_behaves from public.product_types t
   where t.id = v_type
     and (t.active or exists (select 1 from public.products x where x.id = p_id and x.type_id = t.id));
  if v_behaves is null then -- rule:type-unknown
    raise exception 'that product type does not exist or is switched off' using errcode = '22023';
  end if;
  if v_behaves <> (p_flavour ->> 'item_type') then -- rule:type-behaviour
    raise exception 'the product type and its behaviour disagree' using errcode = '22023';
  end if;
  -- Same optimistic rule as save_setting(): null means "new flavour"; otherwise the row
  -- must still carry the updated_at the caller read (milliseconds, as a JS Date holds it).
  if p_expected_updated_at is null then
    insert into public.products as p (id, name, short_name, price_cents, kind, item_type,
        capacity_weight, tag, description, image_path, allergens, active, sort_order, type_id)
      values (p_id, btrim(p_flavour ->> 'name'), btrim(p_flavour ->> 'short_name'), v_price::bigint,
        p_flavour ->> 'kind', p_flavour ->> 'item_type', v_wt::integer, p_flavour ->> 'tag',
        p_flavour ->> 'description', p_flavour ->> 'image_path', p_flavour ->> 'allergens',
        (p_flavour ->> 'active')::boolean, v_sort::integer, v_type)
      on conflict (id) do nothing
      returning p.id, p.updated_at into v_id, v_at;
  else
    update public.products as p set
        name = btrim(p_flavour ->> 'name'), short_name = btrim(p_flavour ->> 'short_name'),
        price_cents = v_price::bigint, kind = p_flavour ->> 'kind',
        item_type = p_flavour ->> 'item_type', capacity_weight = v_wt::integer,
        tag = p_flavour ->> 'tag', description = p_flavour ->> 'description',
        image_path = p_flavour ->> 'image_path', allergens = p_flavour ->> 'allergens',
        active = (p_flavour ->> 'active')::boolean, sort_order = v_sort::integer, type_id = v_type
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
revoke execute on function public.write_flavour(text, jsonb, timestamptz) from public, anon, authenticated, service_role;

/**
 * Owner only. Creates (no stamp) or changes (with the stamp it was read with) one product type. The body is exactly: id (a slug),
 * label (1 to 30 characters, unique ignoring case), behaves_as ('cookie', 'set' or 'item'), sort_order (0 to 999), active. A type a
 * product uses, and a built-in one, keeps its behaviour; a built-in one stays on. The same body again is answered. Returns its id
 * and stamp.
 */
create or replace function public.save_product_type(p_type jsonb, p_expected_updated_at timestamptz)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys   text[];
  v_id     text;
  v_label  text;
  v_beh    text;
  v_sort   numeric;
  v_active boolean;
  v_row    public.product_types%rowtype;
  v_at     timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the product types' using errcode = '42501';
  end if;
  if p_type is null or jsonb_typeof(p_type) <> 'object' then
    raise exception 'a product type must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_type) k;
  if v_keys is distinct from array['active', 'behaves_as', 'id', 'label', 'sort_order'] then -- rule:ptype-keys
    raise exception 'a product type carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_type -> 'id') <> 'string' or jsonb_typeof(p_type -> 'label') <> 'string'
     or jsonb_typeof(p_type -> 'behaves_as') <> 'string' or jsonb_typeof(p_type -> 'sort_order') <> 'number'
     or jsonb_typeof(p_type -> 'active') <> 'boolean' then -- rule:ptype-types
    raise exception 'a product type field has the wrong type' using errcode = '22023';
  end if;
  v_id := p_type ->> 'id';
  v_label := btrim(p_type ->> 'label');
  v_beh := p_type ->> 'behaves_as';
  v_sort := (p_type ->> 'sort_order')::numeric;
  v_active := (p_type ->> 'active')::boolean;
  if v_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' or length(v_label) not between 1 and 30 or v_label ~ '[[:cntrl:]]'
     or v_beh not in ('cookie', 'set', 'item') or v_sort <> trunc(v_sort) or v_sort not between 0 and 999 then -- rule:ptype-values
    raise exception 'a product type needs a slug id, a name of 1 to 30 characters, a behaviour and an order from 0 to 999' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('product_types', 0));
  if exists (select 1 from public.product_types t where lower(btrim(t.label)) = lower(v_label) and t.id <> v_id) then -- rule:ptype-label-taken
    raise exception 'another product type already has that name' using errcode = '22023';
  end if;
  select * into v_row from public.product_types t where t.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:ptype-create-stamp
      raise exception 'that product type does not exist' using errcode = 'P0002';
    end if;
    insert into public.product_types (id, label, behaves_as, sort_order, active)
    values (v_id, v_label, v_beh, v_sort::integer, v_active)
    returning updated_at into v_at;
  else
    if p_expected_updated_at is null then
      if v_row.label = v_label and v_row.behaves_as = v_beh and v_row.sort_order = v_sort and v_row.active = v_active then -- rule:ptype-replay
        return query select v_row.id, v_row.updated_at;
        return;
      end if;
      raise exception 'that product type already exists with other values' using errcode = 'P0002';
    end if;
    if v_row.behaves_as <> v_beh and (v_row.built_in or exists (select 1 from public.products p where p.type_id = v_id)) then -- rule:ptype-behaviour-locked
      raise exception 'a product type in use keeps its behaviour: add a new type instead' using errcode = '55000';
    end if;
    if v_row.built_in and not v_active then -- rule:ptype-builtin-on
      raise exception 'Cookie and Set stay switched on' using errcode = '55000';
    end if;
    update public.product_types as t set label = v_label, behaves_as = v_beh, sort_order = v_sort::integer, active = v_active
     where t.id = v_id and date_trunc('milliseconds', t.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning t.updated_at into v_at;
    if v_at is null then -- rule:ptype-stale
      raise exception 'the product type changed since it was read' using errcode = 'P0002';
    end if;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'product_type.saved', 'product_types', v_id,
          jsonb_build_object('label', v_label, 'behaves_as', v_beh, 'sort_order', v_sort, 'active', v_active));
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_product_type(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_product_type(jsonb, timestamptz) to authenticated;

/** Active staff. Every product type, in her order, and each product's type: { types: [...], products: { id: type_id } }. */
create or replace function public.get_product_types()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'only active staff may read the product types' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'behaves_as', t.behaves_as,
                'sort_order', t.sort_order, 'active', t.active, 'built_in', t.built_in, 'updated_at', t.updated_at)
                order by t.sort_order, t.id), '[]'::jsonb) from public.product_types t),
    'products', (select coalesce(jsonb_object_agg(p.id, p.type_id), '{}'::jsonb) from public.products p));
end;
$$;
revoke execute on function public.get_product_types() from public, anon, authenticated;
grant execute on function public.get_product_types() to authenticated;
