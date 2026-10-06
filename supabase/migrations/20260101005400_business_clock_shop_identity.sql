-- B2 (final-plan.md version 2), database half: the shop's clock and the shop's identity.
--
--   business_clock()   the ONE database definition of the shop's day and week (final-plan C10):
--                      the Manila calendar date of an instant and the Monday of that date's week.
--                      The app's side is src/lib/time/business-clock.ts; tests/fixtures/clock-cases.json
--                      holds both to the same answers (tests/integration/security/shop-identity.sql
--                      replays that fixture against this function). place_order(), get_shop_status()
--                      and join_waitlist() still inline the expression until they are next
--                      redefined (slice B3). It touches no table and has no browser grant: it is
--                      for other SQL functions.
--   shop_identity      one row (id = true): the shop's name, the owner's name, one contact line and
--                      one tagline. There is NO seed row and no default text: an empty shop prints
--                      nothing, and the owner types what the shop says about itself.
--   get_shop_identity  what the shop prints to customers; anon may execute it, as for
--                      get_shop_payment_info().
--   save_shop_identity the owner's save, the same optimistic stamp rule as save_shop_texts().
--
-- The table has no API grant and no policy; writes go only through the owner RPC.

/**
 * The shop's day and week for an instant: today is the Manila calendar date, week_start is the
 * Monday on or before it. Pure: no table access, no browser grant.
 */
create or replace function public.business_clock(p_at timestamptz default now())
returns table (today date, week_start date)
language sql
stable
set search_path = ''
as $$
  select c.d, date_trunc('week', c.d::timestamp)::date
    from (select (p_at at time zone 'Asia/Manila')::date as d) c;
$$;
revoke execute on function public.business_clock(timestamptz) from public, anon, authenticated;

create table public.shop_identity (
  id boolean primary key default true check (id),
  shop_name text not null default ''
    check (length(shop_name) <= 60 and shop_name !~ '[[:cntrl:]]'),
  owner_name text not null default ''
    check (length(owner_name) <= 40 and owner_name !~ '[[:cntrl:]]'),
  contact_line text not null default ''
    check (length(contact_line) <= 160 and contact_line !~ '[[:cntrl:]]'),
  tagline text not null default ''
    check (length(tagline) <= 120 and tagline !~ '[[:cntrl:]]'),
  updated_at timestamptz not null default now()
);
alter table public.shop_identity enable row level security;
revoke all on table public.shop_identity from public, anon, authenticated;
create trigger shop_identity_touch before update on public.shop_identity
for each row execute function public.touch_updated_at();

/** What the shop prints to customers. With no row yet, every text is empty and updated_at is null. */
create or replace function public.get_shop_identity()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('shop_name', i.shop_name, 'owner_name', i.owner_name,
                              'contact_line', i.contact_line, 'tagline', i.tagline,
                              'updated_at', i.updated_at)
      from public.shop_identity i),
    jsonb_build_object('shop_name', '', 'owner_name', '', 'contact_line', '', 'tagline', '',
                       'updated_at', null));
$$;
revoke execute on function public.get_shop_identity() from public, anon, authenticated;
grant execute on function public.get_shop_identity() to anon, authenticated;

/**
 * Saves the four identity texts. p_identity carries exactly shop_name, owner_name, contact_line
 * and tagline, each a string; each is trimmed and then bounded (60, 40, 160, 120 characters) and
 * refused if it holds a control character. A null p_expected_updated_at inserts the row only if
 * there is none; otherwise the stamp must match the row, to the millisecond (P0002 when not).
 */
create or replace function public.save_shop_identity(
  p_identity jsonb,
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
  v_bad     boolean;
  v_shop    text;
  v_owner   text;
  v_contact text;
  v_tagline text;
  v_at      timestamptz;
begin
  v_bad := not public.is_owner();
  if v_bad then -- rule:identity-owner
    raise exception 'only the owner may change the shop identity' using errcode = '42501';
  end if;
  v_bad := p_identity is null or jsonb_typeof(p_identity) <> 'object';
  if v_bad then
    raise exception 'shop identity must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_identity) k;
  if v_keys is distinct from array['contact_line', 'owner_name', 'shop_name', 'tagline'] then -- rule:identity-keys
    raise exception 'shop identity must carry exactly the editable keys' using errcode = '22023';
  end if;
  v_bad := jsonb_typeof(p_identity -> 'shop_name') <> 'string' or jsonb_typeof(p_identity -> 'owner_name') <> 'string'
    or jsonb_typeof(p_identity -> 'contact_line') <> 'string' or jsonb_typeof(p_identity -> 'tagline') <> 'string';
  if v_bad then -- rule:identity-types
    raise exception 'shop identity field has the wrong type' using errcode = '22023';
  end if;
  v_shop := btrim(p_identity ->> 'shop_name');
  v_owner := btrim(p_identity ->> 'owner_name');
  v_contact := btrim(p_identity ->> 'contact_line');
  v_tagline := btrim(p_identity ->> 'tagline');
  v_bad := length(v_shop) > 60 or length(v_owner) > 40 or length(v_contact) > 160 or length(v_tagline) > 120;
  if v_bad then -- rule:identity-length
    raise exception 'shop identity text out of bounds' using errcode = '22023';
  end if;
  v_bad := (v_shop || v_owner || v_contact || v_tagline) ~ '[[:cntrl:]]';
  if v_bad then -- rule:identity-control
    raise exception 'shop identity text may not contain control characters' using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    insert into public.shop_identity as i (id, shop_name, owner_name, contact_line, tagline)
      values (true, v_shop, v_owner, v_contact, v_tagline)
      on conflict (id) do nothing
      returning i.updated_at into v_at;
  else
    update public.shop_identity as i set
        shop_name = v_shop, owner_name = v_owner, contact_line = v_contact, tagline = v_tagline
      where date_trunc('milliseconds', i.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
      returning i.updated_at into v_at;
  end if;
  if v_at is null then -- rule:identity-stale
    raise exception 'shop identity changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_at;
end;
$$;
revoke execute on function public.save_shop_identity(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_shop_identity(jsonb, timestamptz) to authenticated;
