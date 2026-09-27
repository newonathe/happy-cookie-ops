-- MP-09 b1: settings on the database, database half.
--
-- Until now the owner could write any key or value straight to `settings` through
-- PostgREST, RLS included — that skips validation entirely: a wrong type, an out-of-range
-- number or a key nobody recognises would sit there unnoticed. From here every write goes
-- through save_setting(), which knows every key, its column and its bounds. Reads go
-- through get_settings() (the owner, every key) or get_operating_settings() (any active
-- staff, a narrow published-safe subset: capacity, the ordering window, maxPerOrder and
-- the idle-sign-out minutes DP-15 approved as owner-editable — no cost key).
--
-- settings_effective() keeps its signature; only its defaults CTE gains the three new
-- idle-minute keys. get_settings()/get_operating_settings() read it and left-join
-- `settings` for updated_at, rather than duplicating its default values here — the same
-- "one rule" discipline src/lib/rules/capacity.ts exists to enforce.

create or replace function public.settings_effective()
returns table (key text, int_value bigint, text_value text, cents_value bigint, is_default boolean)
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  with defaults (key, int_value, text_value, cents_value) as (
    values
      ('capacity', 200, null::text, null::bigint),
      ('taxRate', 3, null::text, null::bigint),
      ('drawerFloat', null::bigint, null::text, 100000),
      ('discountA', 20, null::text, null::bigint),
      ('discountB', 50, null::text, null::bigint),
      ('restHours', 24, null::text, null::bigint),
      ('doughWarnDays', 14, null::text, null::bigint),
      ('groceryBudget', null::bigint, null::text, 600000),
      ('packagingFee', null::bigint, null::text, 3844),
      ('flatBoxPrice', null::bigint, null::text, 86000),
      ('cogsMultiple', 4, null::text, null::bigint),
      ('priceMode', null::bigint, null::text, null::bigint),
      ('openDow', 1, null::text, null::bigint),
      ('openH', 9, null::text, null::bigint),
      ('openM', 0, null::text, null::bigint),
      ('closeDow', 4, null::text, null::bigint),
      ('closeH', 21, null::text, null::bigint),
      ('closeM', 0, null::text, null::bigint),
      ('extendH', 0, null::text, null::bigint),
      ('retention', null::bigint, '1 year', null::bigint),
      ('maxPerOrder', 24, null::text, null::bigint),
      -- DP-15 (decision register, 2026-09-27): owner/support default 60 idle minutes,
      -- helper 240; the owner may change these, clamped 15-480, once b2 lands.
      ('idleMinutesOwner', 60, null::text, null::bigint),
      ('idleMinutesSupport', 60, null::text, null::bigint),
      ('idleMinutesHelper', 240, null::text, null::bigint)
  )
  select d.key,
         coalesce(s.int_value,   d.int_value),
         coalesce(s.text_value,  d.text_value),
         coalesce(s.cents_value, d.cents_value),
         s.key is null
    from defaults d
    left join settings s on s.key = d.key;
$$;

-- Writes only through save_setting() from here; RLS' owner FOR ALL policy still governs
-- read (the owner keeps direct SELECT), but a raw INSERT/UPDATE/DELETE — validated or
-- not — is no longer possible for anyone but service_role.
revoke insert, update, delete on public.settings from anon, authenticated;

/**
 * Every key the owner may set: which settings column it lives in, and its bounds.
 *
 * Bounds are the engine's own bumpCfg/numCfg call bounds and DEFAULT_CFG
 * (tests/fixtures/settings-cases.json records the same numbers; a unit parity test
 * checks the two against each other and against the running engine). Four keys have no
 * engine-side source and are this migration's own choice, recorded in that fixture too:
 * openDow/closeDow (0-6, a day-of-week index); openM/closeM (0-59, an ordinary clock
 * minute — the engine only ever sets 0, but nothing stops the owner choosing another);
 * extendH (0-168, one week of drop extensions — the engine only ever adds +24 or resets
 * to 0 and never caps it, so this cap is new here); and the three idle-minute keys
 * (15-480, DP-15).
 *
 * `int`/`cents` values must be whole numbers: `int_value`/`cents_value` are `bigint`
 * columns. This is stricter than the engine's own bumpCfg step for taxRate and
 * cogsMultiple (0.5), which can produce a value this function must reject — a known
 * limitation for the owner-editable ± buttons b2 will need to account for, not decided
 * here. discountA/discountB stay in `int_value` as whole pesos, not centavos in
 * `cents_value` — inherited from the original migration, not a new choice.
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
-- RETURNS TABLE (key, updated_at) makes `key`/`updated_at` implicit OUT variables of
-- this function, which PL/pgSQL otherwise prefers over the identically-named `settings`
-- columns below (an ON CONFLICT target list cannot be table-qualified around it).
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
  v_new_key text;
  v_new_at  timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change settings' using errcode = '42501';
  end if;

  -- Read only after the role check: a jsonb parameter is already well-formed by the time
  -- PostgREST calls this function, so jsonb_typeof cannot itself leak anything to a
  -- caller who fails the check above — but keeping every read of the input after the
  -- gate, not before it, is the rule worth stating rather than relying on that once.
  v_typeof := jsonb_typeof(p_value);

  select r.kind, r.min_value, r.max_value, r.enum_values
    into v_kind, v_min, v_max, v_enum
  from (
    values
      ('capacity',           'int',   50::numeric,  600::numeric,   null::text[]),
      ('taxRate',            'int',    0::numeric,   25::numeric,   null::text[]),
      ('drawerFloat',        'cents',  0::numeric,   1000000::numeric, null::text[]),
      ('discountA',          'int',    0::numeric,   500::numeric,  null::text[]),
      ('discountB',          'int',    0::numeric,   500::numeric,  null::text[]),
      ('restHours',          'int',    0::numeric,   96::numeric,   null::text[]),
      ('doughWarnDays',      'int',    1::numeric,   60::numeric,   null::text[]),
      ('groceryBudget',      'cents',  0::numeric,   4000000::numeric, null::text[]),
      ('packagingFee',       'cents',  0::numeric,   50000::numeric, null::text[]),
      ('flatBoxPrice',       'cents',  0::numeric,   500000::numeric, null::text[]),
      ('cogsMultiple',       'int',    1::numeric,   10::numeric,   null::text[]),
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
      ('idleMinutesHelper',  'int',    15::numeric,  480::numeric,  null::text[])
  ) as r(key, kind, min_value, max_value, enum_values)
  where r.key = p_key;

  if not found then
    raise exception 'unknown settings key: %', p_key using errcode = '22023';
  end if;

  if p_value is null or v_typeof = 'null' then
    raise exception 'settings value must not be null: %', p_key using errcode = '22023';
  end if;

  if v_kind in ('int', 'cents') then
    if v_typeof <> 'number' then
      raise exception 'settings value must be a number: %', p_key using errcode = '22023';
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if v_num <> trunc(v_num) then
      raise exception 'settings value must be a whole number: %', p_key using errcode = '22023';
    end if;
    if v_num < v_min or v_num > v_max then
      raise exception 'settings value out of range: %', p_key using errcode = '22023';
    end if;
    v_int := v_num::bigint;
  else
    if v_typeof <> 'string' then
      raise exception 'settings value must be text: %', p_key using errcode = '22023';
    end if;
    v_text := p_value #>> '{}';
    if v_enum is not null and not (v_text = any (v_enum)) then
      raise exception 'settings value not a recognised option: %', p_key using errcode = '22023';
    end if;
  end if;

  -- Optimistic concurrency, the same rule as update_order_state: the caller sends the
  -- updated_at it read (null for a key still at its default, which has no row yet). If
  -- the row has moved on since — including a concurrent first save racing this one to
  -- INSERT — this returns no row and the caller must re-read. Both sides of the match
  -- are truncated to milliseconds: Postgres' timestamptz carries microseconds, but a JS
  -- Date (what a browser caller round-trips this through) does not, so an exact-equality
  -- match against a client-supplied value must not depend on a precision no client has.
  -- `st` avoids ambiguity against this function's own RETURNS TABLE (key, updated_at)
  -- OUT parameters, which PL/pgSQL otherwise prefers over the table's columns here.
  if p_expected_updated_at is null then
    insert into public.settings as st (key, int_value, cents_value, text_value)
      values (
        p_key,
        case when v_kind = 'int' then v_int end,
        case when v_kind = 'cents' then v_int end,
        case when v_kind = 'text' then v_text end
      )
    on conflict (key) do nothing
    returning st.key, st.updated_at into v_new_key, v_new_at;
  else
    update public.settings as st
       -- Every non-matching column is set to null explicitly, not left as-is: a key's
       -- column kind never changes, but a stray value in the wrong column would trip
       -- the settings_one_value check on every future save of this key.
       set int_value   = case when v_kind = 'int' then v_int else null end,
           cents_value = case when v_kind = 'cents' then v_int else null end,
           text_value  = case when v_kind = 'text' then v_text else null end
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
create or replace function public.get_settings()
returns table (key text, int_value bigint, text_value text, cents_value bigint, is_default boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read settings' using errcode = '42501';
  end if;
  return query
    select se.key, se.int_value, se.text_value, se.cents_value, se.is_default, s.updated_at
    from public.settings_effective() se
    left join public.settings s on s.key = se.key;
end;
$$;

revoke execute on function public.get_settings() from public, anon, authenticated;
grant execute on function public.get_settings() to authenticated;

/**
 * The published-safe operating settings: what any active staff member needs to run the
 * shop day to day, with no cost key. Capacity, the ordering window, maxPerOrder and the
 * three idle-sign-out minutes DP-15 lets the owner edit.
 */
create or replace function public.get_operating_settings()
returns table (key text, int_value bigint, text_value text, cents_value bigint, is_default boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'only staff may read operating settings' using errcode = '42501';
  end if;
  return query
    select se.key, se.int_value, se.text_value, se.cents_value, se.is_default, s.updated_at
    from public.settings_effective() se
    left join public.settings s on s.key = se.key
    where se.key = any (array[
      'capacity', 'openDow', 'openH', 'openM', 'closeDow', 'closeH', 'closeM', 'extendH',
      'maxPerOrder', 'idleMinutesOwner', 'idleMinutesSupport', 'idleMinutesHelper'
    ]);
end;
$$;

revoke execute on function public.get_operating_settings() from public, anon, authenticated;
grant execute on function public.get_operating_settings() to authenticated;
