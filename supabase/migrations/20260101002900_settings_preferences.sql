-- MP-09 b3: the owner's preferences and half steps on the database.
--
-- b1's save_setting() could only store whole numbers and text, so three things stayed on
-- the device: the notification channels (on/off per alert), the expense categories and the
-- inactive categories. The tax set-aside and cost multiplier also lost the engine's 0.5
-- step. This adds one `json_value jsonb` column and moves those five keys into it, plus a
-- new `helperSeesSales` switch (0/1, default off) that b4 wires to the helper screens.
--
-- Why jsonb, when 20260101000700 chose typed columns precisely so "a value cannot be stored
-- as the wrong kind, which a jsonb blob would happily allow"? That concern is about an
-- unvalidated writer. Since b1, save_setting() is the only writer for anon/authenticated
-- (direct DML is revoked), and it checks each key's kind below: a half-step key accepts
-- only a JSON number on a 0.5 step inside its bounds, the channel key only an object of
-- known alert names to booleans, and the list keys only arrays of unique, trimmed, bounded
-- strings. A number column would still leave the lists needing jsonb; one column for all
-- five keeps the table at one rule. The settings_one_value check still allows one value
-- column per row.
--
-- settings_effective(), get_settings() and get_operating_settings() gain the column, which
-- changes their return type, so they are dropped and recreated with the grants and
-- search_path of 20260101000900/20260101002000/20260101002800 restated.

alter table public.settings add column json_value jsonb;

alter table public.settings drop constraint settings_one_value;
alter table public.settings add constraint settings_one_value check (
  (int_value is not null)::int + (text_value is not null)::int
    + (cents_value is not null)::int + (json_value is not null)::int <= 1
);

-- The owner's existing whole-number choices move columns unchanged (3 stays 3). The touch
-- trigger is paused so the move keeps who set each value and when: this is a storage
-- change, not a new decision by anyone.
alter table public.settings disable trigger settings_touch_trg;
update public.settings
   set json_value = to_jsonb(int_value), int_value = null
 where key in ('taxRate', 'cogsMultiple') and int_value is not null;
alter table public.settings enable trigger settings_touch_trg;

drop function public.get_settings();
drop function public.get_operating_settings();
drop function public.settings_effective();

create function public.settings_effective()
returns table (key text, int_value bigint, text_value text, cents_value bigint, json_value jsonb, is_default boolean)
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
      ('helperSeesSales', 0, null::text, null::bigint, null::jsonb)
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

/**
 * Every key the owner may set, as in 20260101002800, plus the kinds this migration adds:
 *   half      a JSON number on a 0.5 step, within min..max (the engine's rules-sheet step)
 *   channels  a JSON object whose keys are known alert names (enum_values) and values booleans
 *   list      a JSON array of min..max unique strings, each trimmed and 1-40 characters
 * taxRate and cogsMultiple keep the engine's bounds (0-25, 1-10) and get their 0.5 step back.
 */
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
      ('helperSeesSales',    'int',    0::numeric,   1::numeric,    null::text[])
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

/** The owner's full settings, every key, with each key's updated_at for save_setting. */
create function public.get_settings()
returns table (key text, int_value bigint, text_value text, cents_value bigint, json_value jsonb, is_default boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read settings' using errcode = '42501';
  end if;
  return query
    select se.key, se.int_value, se.text_value, se.cents_value, se.json_value, se.is_default, s.updated_at
    from public.settings_effective() se
    left join public.settings s on s.key = se.key;
end;
$$;

revoke execute on function public.get_settings() from public, anon, authenticated;
grant execute on function public.get_settings() to authenticated;

/**
 * The published-safe operating settings for any active staff member. b1's twelve keys,
 * plus what helper and support screens use: the expense categories and inactive
 * categories (a helper records bazaar expenses by category), the alert channels (support
 * reaches the notifications screen) and helperSeesSales (b4). None is a cost or a price.
 */
create function public.get_operating_settings()
returns table (key text, int_value bigint, text_value text, cents_value bigint, json_value jsonb, is_default boolean, updated_at timestamptz)
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
      'channels', 'categories', 'inactiveCats', 'helperSeesSales'
    ]);
end;
$$;

revoke execute on function public.get_operating_settings() from public, anon, authenticated;
grant execute on function public.get_operating_settings() to authenticated;
