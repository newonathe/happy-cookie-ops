-- A2 (final-plan.md version 2, section 9): the hours Bazaar Mode may open with no signal.
--
-- The bazaar phone may open Bazaar Mode offline only within a set number of hours of the last
-- identity check the server passed on that phone (src/lib/auth/offline-trust.ts). The number is
-- the owner's: `offlineOpenHours`, a whole number from 1 to 72, 48 until she changes it. 48 is
-- a labelled default, not a decision of hers: it covers a two-day bazaar with no signal after
-- the first morning's start, and 72 is the longest a lost phone could keep opening that screen.
--
-- Three functions gain the key and are otherwise exactly as 20260101002900 left them:
--   settings_effective()      its default
--   save_setting()            its kind and bounds (owner only, as before)
--   get_operating_settings()  helpers and support read it too: a helper's phone sells offline
--                             under the same bound. It is not a cost or a price.
-- get_settings() reads settings_effective() and needs no change. Signatures, return types,
-- search paths and grants are unchanged; the grants are restated.

create or replace function public.settings_effective()
returns table (key text, int_value bigint, text_value text, cents_value bigint, "json_value" jsonb, is_default boolean)
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  with defaults (key, int_value, text_value, cents_value, json_value) as (
    values
      ('capacity', 200, null::text, null::bigint, null::jsonb),
      ('taxRate', null::bigint, null::text, null::bigint, '3'::jsonb),
      ('drawerFloat', null::bigint, null::text, 100000, null::jsonb),
      ('discountA', 20, null::text, null::bigint, null::jsonb),
      ('discountB', 50, null::text, null::bigint, null::jsonb),
      ('restHours', 24, null::text, null::bigint, null::jsonb),
      ('doughWarnDays', 14, null::text, null::bigint, null::jsonb),
      ('groceryBudget', null::bigint, null::text, 600000, null::jsonb),
      ('packagingFee', null::bigint, null::text, 3844, null::jsonb),
      ('flatBoxPrice', null::bigint, null::text, 86000, null::jsonb),
      ('cogsMultiple', null::bigint, null::text, null::bigint, '4'::jsonb),
      ('priceMode', null::bigint, null::text, null::bigint, null::jsonb),
      ('openDow', 1, null::text, null::bigint, null::jsonb),
      ('openH', 9, null::text, null::bigint, null::jsonb),
      ('openM', 0, null::text, null::bigint, null::jsonb),
      ('closeDow', 4, null::text, null::bigint, null::jsonb),
      ('closeH', 21, null::text, null::bigint, null::jsonb),
      ('closeM', 0, null::text, null::bigint, null::jsonb),
      ('extendH', 0, null::text, null::bigint, null::jsonb),
      ('retention', null::bigint, '1 year', null::bigint, null::jsonb),
      ('maxPerOrder', 24, null::text, null::bigint, null::jsonb),
      ('idleMinutesOwner', 60, null::text, null::bigint, null::jsonb),
      ('idleMinutesSupport', 60, null::text, null::bigint, null::jsonb),
      ('idleMinutesHelper', 240, null::text, null::bigint, null::jsonb),
      -- MP-09 b3: the engine's BASE_STATE() channels, categories and inactiveCats.
      ('channels', null::bigint, null::text, null::bigint,
        '{"New order": true, "Low stock": true, "Grocery shortage": true, "Pickup reminder": true, "Backup failure": true, "System error": true, "Payment proof received": false, "Dough nearing expiry": false}'::jsonb),
      ('categories', null::bigint, null::text, null::bigint,
        '["Ingredients", "Packaging", "Helper wages", "Bazaar rent", "Transport", "Advertising", "Marketing / influencer", "Printing / collateral", "Business-paid delivery", "Cash variance", "Other"]'::jsonb),
      ('inactiveCats', null::bigint, null::text, null::bigint, '[]'::jsonb),
      -- Cine, 2026-09-28: helpers may see sale totals behind an owner switch, off by default.
      ('helperSeesSales', 0, null::text, null::bigint, null::jsonb),
      -- A2 (Ethan, 2026-10-05): hours Bazaar Mode may open offline after the last online check.
      ('offlineOpenHours', 48, null::text, null::bigint, null::jsonb)
  )
  select d.key,
         coalesce(s.int_value,   d.int_value),
         coalesce(s.text_value,  d.text_value),
         coalesce(s.cents_value, d.cents_value),
         coalesce(s.json_value,  d.json_value),
         s.key is null
    from defaults d
    left join settings s on s.key = d.key;
$$;

revoke execute on function public.settings_effective() from public, anon, authenticated;
grant execute on function public.settings_effective() to service_role;

create or replace function public.save_setting(
  p_key text,
  p_value jsonb,
  p_expected_updated_at timestamptz
)
returns table (key text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_kind    text;
  v_min     numeric;
  v_max     numeric;
  v_enum    text[];
  v_typeof  text;
  v_num     numeric;
  v_int     bigint;
  v_text    text;
  v_json    jsonb;
  v_count   integer;
  v_new_key text;
  v_new_at  timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change settings' using errcode = '42501';
  end if;

  v_typeof := jsonb_typeof(p_value);

  select r.kind, r.min_value, r.max_value, r.enum_values
    into v_kind, v_min, v_max, v_enum
  from (
    values
      ('capacity',           'int',   50::numeric,  600::numeric,   null::text[]),
      ('taxRate',            'half',   0::numeric,   25::numeric,   null::text[]),
      ('drawerFloat',        'cents',  0::numeric,   1000000::numeric, null::text[]),
      ('discountA',          'int',    0::numeric,   500::numeric,  null::text[]),
      ('discountB',          'int',    0::numeric,   500::numeric,  null::text[]),
      ('restHours',          'int',    0::numeric,   96::numeric,   null::text[]),
      ('doughWarnDays',      'int',    1::numeric,   60::numeric,   null::text[]),
      ('groceryBudget',      'cents',  0::numeric,   4000000::numeric, null::text[]),
      ('packagingFee',       'cents',  0::numeric,   50000::numeric, null::text[]),
      ('flatBoxPrice',       'cents',  0::numeric,   500000::numeric, null::text[]),
      ('cogsMultiple',       'half',   1::numeric,   10::numeric,   null::text[]),
      ('priceMode',          'text',   null::numeric, null::numeric,
        array['Sum of menu prices', 'Menu prices + packaging fee', 'Flat price per box', 'Cookie cost × multiplier + packaging']),
      ('openDow',            'int',    0::numeric,   6::numeric,    null::text[]),
      ('openH',              'int',    0::numeric,   23::numeric,   null::text[]),
      ('openM',              'int',    0::numeric,   59::numeric,   null::text[]),
      ('closeDow',           'int',    0::numeric,   6::numeric,    null::text[]),
      ('closeH',             'int',    0::numeric,   23::numeric,   null::text[]),
      ('closeM',             'int',    0::numeric,   59::numeric,   null::text[]),
      ('extendH',            'int',    0::numeric,   168::numeric,  null::text[]),
      ('retention',          'text',   null::numeric, null::numeric,
        array['6 months', '1 year', '2 years', 'Keep until I delete them']),
      ('maxPerOrder',        'int',    1::numeric,   120::numeric,  null::text[]),
      ('idleMinutesOwner',   'int',    15::numeric,  480::numeric,  null::text[]),
      ('idleMinutesSupport', 'int',    15::numeric,  480::numeric,  null::text[]),
      ('idleMinutesHelper',  'int',    15::numeric,  480::numeric,  null::text[]),
      ('channels',           'channels', null::numeric, null::numeric,
        array['New order', 'Low stock', 'Grocery shortage', 'Pickup reminder', 'Backup failure', 'System error', 'Payment proof received', 'Dough nearing expiry']),
      ('categories',         'list',   1::numeric,   40::numeric,   null::text[]),
      ('inactiveCats',       'list',   0::numeric,   40::numeric,   null::text[]),
      ('helperSeesSales',    'int',    0::numeric,   1::numeric,    null::text[]),
      ('offlineOpenHours',   'int',    1::numeric,   72::numeric,   null::text[])
  ) as r(key, kind, min_value, max_value, enum_values)
  where r.key = p_key;

  if not found then
    raise exception 'unknown settings key: %', p_key using errcode = '22023';
  end if;

  if p_value is null or v_typeof = 'null' then
    raise exception 'settings value must not be null: %', p_key using errcode = '22023';
  end if;

  if v_kind in ('int', 'cents', 'half') then
    if v_typeof <> 'number' then
      raise exception 'settings value must be a number: %', p_key using errcode = '22023';
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if v_kind = 'half' then
      if v_num * 2 <> trunc(v_num * 2) then
        raise exception 'settings value must be on a 0.5 step: %', p_key using errcode = '22023';
      end if;
    elsif v_num <> trunc(v_num) then
      raise exception 'settings value must be a whole number: %', p_key using errcode = '22023';
    end if;
    if v_num < v_min or v_num > v_max then
      raise exception 'settings value out of range: %', p_key using errcode = '22023';
    end if;
    if v_kind = 'half' then
      v_json := to_jsonb(v_num);
    else
      v_int := v_num::bigint;
    end if;
  elsif v_kind = 'channels' then
    if v_typeof <> 'object' then
      raise exception 'settings value must be an object: %', p_key using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(p_value) e
       where not (e.key = any (v_enum)) or jsonb_typeof(e.value) <> 'boolean'
    ) then
      raise exception 'settings value has an unknown alert or a non-boolean: %', p_key using errcode = '22023';
    end if;
    v_json := p_value;
  elsif v_kind = 'list' then
    if v_typeof <> 'array' then
      raise exception 'settings value must be a list: %', p_key using errcode = '22023';
    end if;
    v_count := jsonb_array_length(p_value);
    if v_count < v_min or v_count > v_max then
      raise exception 'settings list length out of range: %', p_key using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_value) e
       where jsonb_typeof(e) <> 'string'
          or btrim(e #>> '{}') <> (e #>> '{}')
          or char_length(e #>> '{}') not between 1 and 40
    ) then
      raise exception 'settings list items must be trimmed text of 1-40 characters: %', p_key using errcode = '22023';
    end if;
    if (select count(distinct e #>> '{}') from jsonb_array_elements(p_value) e) <> v_count then
      raise exception 'settings list items must be unique: %', p_key using errcode = '22023';
    end if;
    v_json := p_value;
  else
    if v_typeof <> 'string' then
      raise exception 'settings value must be text: %', p_key using errcode = '22023';
    end if;
    v_text := p_value #>> '{}';
    if v_enum is not null and not (v_text = any (v_enum)) then
      raise exception 'settings value not a recognised option: %', p_key using errcode = '22023';
    end if;
  end if;

  -- Optimistic concurrency exactly as in 20260101002800 (millisecond match, null for a key
  -- still at its default).
  if p_expected_updated_at is null then
    insert into public.settings as st (key, int_value, cents_value, text_value, json_value)
      values (
        p_key,
        case when v_kind = 'int' then v_int end,
        case when v_kind = 'cents' then v_int end,
        case when v_kind = 'text' then v_text end,
        case when v_kind in ('half', 'channels', 'list') then v_json end
      )
    on conflict (key) do nothing
    returning st.key, st.updated_at into v_new_key, v_new_at;
  else
    update public.settings as st
       set int_value   = case when v_kind = 'int' then v_int else null end,
           cents_value = case when v_kind = 'cents' then v_int else null end,
           text_value  = case when v_kind = 'text' then v_text else null end,
           json_value  = case when v_kind in ('half', 'channels', 'list') then v_json else null end
     where st.key = p_key
       and date_trunc('milliseconds', st.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning st.key, st.updated_at into v_new_key, v_new_at;
  end if;

  if v_new_key is null then
    raise exception 'settings save conflict: %', p_key using errcode = 'P0002';
  end if;

  return query select v_new_key, v_new_at;
end;
$$;

revoke execute on function public.save_setting(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_setting(text, jsonb, timestamptz) to authenticated;

create or replace function public.get_operating_settings()
returns table (key text, int_value bigint, text_value text, cents_value bigint, "json_value" jsonb, is_default boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'only staff may read operating settings' using errcode = '42501';
  end if;
  return query
    select se.key, se.int_value, se.text_value, se.cents_value, se.json_value, se.is_default, s.updated_at
    from public.settings_effective() se
    left join public.settings s on s.key = se.key
    where se.key = any (array[
      'capacity', 'openDow', 'openH', 'openM', 'closeDow', 'closeH', 'closeM', 'extendH',
      'maxPerOrder', 'idleMinutesOwner', 'idleMinutesSupport', 'idleMinutesHelper',
      'channels', 'categories', 'inactiveCats', 'helperSeesSales', 'offlineOpenHours'
    ]);
end;
$$;

revoke execute on function public.get_operating_settings() from public, anon, authenticated;
grant execute on function public.get_operating_settings() to authenticated;
