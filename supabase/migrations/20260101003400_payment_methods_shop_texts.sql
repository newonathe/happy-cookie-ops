-- MP-09 c2 (finish-plan slice A2), database half: payment methods, the footer texts and the
-- image bucket. Nothing here holds a real account number or image: the owner enters them
-- at runtime, so a fresh database shows the customer no payment method and no footer claim.
--
--   payment_methods   one row per way to pay (label the customer sees, the account number and
--                     name shown at checkout, an optional QR image path, on/off, order)
--   shop_texts        one row (id = true) with the four footer lines the ported shop footer
--                     hard-codes and finding 16 shows to be untrue for the business
--   shop-media        a public storage bucket; only the owner writes, only png/jpeg/webp,
--                     only under `qr/` and `flavours/`, with a plain generated file name
--
-- Writes go only through the owner RPCs below; the tables have no API grants and no policy.
-- The customer's checkout reads get_shop_payment_info() (anon may execute it: what it
-- returns is exactly what the shop prints). Stored image paths are bucket-relative, with no
-- scheme, colon, `..` or leading slash, so save_flavour()'s path-character rule needs no change.

create table public.payment_methods (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  label text not null check (length(btrim(label)) between 1 and 30),
  account_number text not null default '' check (length(account_number) <= 40),
  account_name text not null default '' check (length(account_name) <= 60),
  qr_path text not null default ''
    check (qr_path = '' or qr_path ~ '^qr/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$'),
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 99),
  updated_at timestamptz not null default now(),
  -- The label is what an order stores as its payment method, so two rows may not share one.
  constraint payment_methods_label_key unique (label)
);
alter table public.payment_methods enable row level security;
revoke all on table public.payment_methods from anon, authenticated;
create trigger payment_methods_touch before update on public.payment_methods
for each row execute function public.touch_updated_at();

create table public.shop_texts (
  id boolean primary key default true check (id),
  registration_badge text not null default '' check (length(registration_badge) <= 20),
  tin_line text not null default '' check (length(tin_line) <= 80),
  invoice_note text not null default '' check (length(invoice_note) <= 200),
  allergen_note text not null default '' check (length(allergen_note) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.shop_texts enable row level security;
revoke all on table public.shop_texts from anon, authenticated;
create trigger shop_texts_touch before update on public.shop_texts
for each row execute function public.touch_updated_at();

/** What the customer's checkout and shop footer may read: active methods and the four texts. */
create or replace function public.get_shop_payment_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'methods', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'label', m.label, 'number', m.account_number,
                                          'name', m.account_name, 'qr', m.qr_path)
                       order by m.sort_order, m.id)
        from public.payment_methods m where m.active), '[]'::jsonb),
    'texts', coalesce((
      select jsonb_build_object('registration_badge', t.registration_badge, 'tin_line', t.tin_line,
                                'invoice_note', t.invoice_note, 'allergen_note', t.allergen_note,
                                'updated_at', t.updated_at)
        from public.shop_texts t),
      jsonb_build_object('registration_badge', '', 'tin_line', '', 'invoice_note', '',
                         'allergen_note', '', 'updated_at', null))
  );
$$;
revoke execute on function public.get_shop_payment_info() from public, anon, authenticated;
grant execute on function public.get_shop_payment_info() to anon, authenticated;

/** The owner's editing list: every method, inactive ones too, with the stamp save needs. */
create or replace function public.get_payment_methods()
returns table (id text, label text, account_number text, account_name text, qr_path text,
               active boolean, sort_order integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the payment methods list' using errcode = '42501';
  end if;
  return query
    select m.id, m.label, m.account_number, m.account_name, m.qr_path, m.active, m.sort_order, m.updated_at
      from public.payment_methods m order by m.sort_order, m.id;
end;
$$;
revoke execute on function public.get_payment_methods() from public, anon, authenticated;
grant execute on function public.get_payment_methods() to authenticated;

/**
 * Creates (p_expected_updated_at null) or replaces one payment method, the same optimistic
 * rule as save_flavour(). `p_method` carries exactly the editable keys; nothing is deleted:
 * a method that stops being offered is `active = false`.
 */
create or replace function public.save_payment_method(
  p_id text,
  p_method jsonb,
  p_expected_updated_at timestamptz
)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_sort numeric;
  v_id   text;
  v_at   timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the payment methods' using errcode = '42501';
  end if;
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
    raise exception 'payment method id must be 1-32 lowercase letters, digits or dashes' using errcode = '22023';
  end if;
  if p_method is null or jsonb_typeof(p_method) <> 'object' then
    raise exception 'payment method must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_method) k;
  if v_keys is distinct from array['account_name', 'account_number', 'active', 'label', 'qr_path', 'sort_order'] then
    raise exception 'payment method must carry exactly the editable keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_method -> 'label') <> 'string' or jsonb_typeof(p_method -> 'account_number') <> 'string'
     or jsonb_typeof(p_method -> 'account_name') <> 'string' or jsonb_typeof(p_method -> 'qr_path') <> 'string'
     or jsonb_typeof(p_method -> 'active') <> 'boolean' or jsonb_typeof(p_method -> 'sort_order') <> 'number' then
    raise exception 'payment method field has the wrong type' using errcode = '22023';
  end if;
  if length(btrim(p_method ->> 'label')) not between 1 and 30
     or length(p_method ->> 'account_number') > 40
     or length(p_method ->> 'account_name') > 60
     -- Bucket-relative and generated: no scheme, colon, `..`, leading slash or subfolder.
     or ((p_method ->> 'qr_path') <> ''
         and (p_method ->> 'qr_path') !~ '^qr/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$') then
    raise exception 'payment method text out of bounds' using errcode = '22023';
  end if;
  v_sort := (p_method ->> 'sort_order')::numeric;
  if v_sort <> trunc(v_sort) or v_sort < 0 or v_sort > 99 then
    raise exception 'payment method number out of range' using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    insert into public.payment_methods as m (id, label, account_number, account_name, qr_path, active, sort_order)
      values (p_id, btrim(p_method ->> 'label'), p_method ->> 'account_number', p_method ->> 'account_name',
              p_method ->> 'qr_path', (p_method ->> 'active')::boolean, v_sort::integer)
      on conflict (id) do nothing
      returning m.id, m.updated_at into v_id, v_at;
  else
    update public.payment_methods as m set
        label = btrim(p_method ->> 'label'), account_number = p_method ->> 'account_number',
        account_name = p_method ->> 'account_name', qr_path = p_method ->> 'qr_path',
        active = (p_method ->> 'active')::boolean, sort_order = v_sort::integer
      where m.id = p_id
        and date_trunc('milliseconds', m.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
      returning m.id, m.updated_at into v_id, v_at;
  end if;
  if v_id is null then
    raise exception 'payment method changed since it was read: %', p_id using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_payment_method(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_payment_method(text, jsonb, timestamptz) to authenticated;

/**
 * Saves the four footer lines. Empty text shows nothing: the shop never prints a
 * registration, TIN, invoice or allergen claim the owner has not typed.
 */
create or replace function public.save_shop_texts(
  p_texts jsonb,
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
  v_at   timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the shop texts' using errcode = '42501';
  end if;
  if p_texts is null or jsonb_typeof(p_texts) <> 'object' then
    raise exception 'shop texts must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_texts) k;
  if v_keys is distinct from array['allergen_note', 'invoice_note', 'registration_badge', 'tin_line'] then
    raise exception 'shop texts must carry exactly the editable keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_texts -> 'registration_badge') <> 'string' or jsonb_typeof(p_texts -> 'tin_line') <> 'string'
     or jsonb_typeof(p_texts -> 'invoice_note') <> 'string' or jsonb_typeof(p_texts -> 'allergen_note') <> 'string' then
    raise exception 'shop text has the wrong type' using errcode = '22023';
  end if;
  if length(btrim(p_texts ->> 'registration_badge')) > 20 or length(btrim(p_texts ->> 'tin_line')) > 80
     or length(btrim(p_texts ->> 'invoice_note')) > 200 or length(btrim(p_texts ->> 'allergen_note')) > 300 then
    raise exception 'shop text out of bounds' using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    insert into public.shop_texts as t (id, registration_badge, tin_line, invoice_note, allergen_note)
      values (true, btrim(p_texts ->> 'registration_badge'), btrim(p_texts ->> 'tin_line'),
              btrim(p_texts ->> 'invoice_note'), btrim(p_texts ->> 'allergen_note'))
      on conflict (id) do nothing
      returning t.updated_at into v_at;
  else
    update public.shop_texts as t set
        registration_badge = btrim(p_texts ->> 'registration_badge'), tin_line = btrim(p_texts ->> 'tin_line'),
        invoice_note = btrim(p_texts ->> 'invoice_note'), allergen_note = btrim(p_texts ->> 'allergen_note')
      where date_trunc('milliseconds', t.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
      returning t.updated_at into v_at;
  end if;
  if v_at is null then
    raise exception 'shop texts changed since they were read' using errcode = 'P0002';
  end if;
  return query select v_at;
end;
$$;
revoke execute on function public.save_shop_texts(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_shop_texts(jsonb, timestamptz) to authenticated;

-- The image bucket. `public` means an object is served by URL without a policy check (the
-- shop's customers are anonymous), so no SELECT policy is granted to anon: the bucket cannot
-- be listed through the API. SVG is left out on purpose (it can carry script).
-- The columns below are added by Storage's own migrations, which a fresh CLI reset has not run
-- yet when this file applies: then the bucket comes from supabase/config.toml instead
-- ([storage.buckets.shop-media], the same settings), and this block does nothing.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types')
     and exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit')
     and exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('shop-media', 'shop-media', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Owner-only writes, and only to a generated name under qr/ or flavours/. The owner needs
-- SELECT as well: an upsert reads the row it replaces.
create policy "shop media owner select" on storage.objects for select to authenticated
  using (bucket_id = 'shop-media' and public.is_owner());
create policy "shop media owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-media' and public.is_owner()
    and name ~ '^(qr|flavours)/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$');
create policy "shop media owner update" on storage.objects for update to authenticated
  using (bucket_id = 'shop-media' and public.is_owner())
  with check (bucket_id = 'shop-media' and public.is_owner()
    and name ~ '^(qr|flavours)/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$');
create policy "shop media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shop-media' and public.is_owner());
