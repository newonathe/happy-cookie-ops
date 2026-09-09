-- Owner-editable settings.
--
-- The engine carries 21 of these in DEFAULT_CFG and the Settings screen edits them. There
-- was nowhere to store any of it. That is fine while the books live in localStorage, and
-- becomes a real loss the moment T-14 removes it: every setting she has ever changed
-- reverts to a default on a new device, silently, including her capacity and her prices.
--
-- One row, keyed by name, rather than one wide row. The engine's config is a flat bag of
-- scalars that grows, and a wide table needs a migration for each new key while an agent
-- is mid-task. The typed columns keep it honest — a value cannot be stored as the wrong
-- kind, which a jsonb blob would happily allow.
--
-- Money is centavos, consistent with everything else. packagingFee 38.44 is stored 3844.

create table if not exists settings (
  key         text primary key,
  int_value   bigint,
  text_value  text,
  -- Centavos. Separate from int_value so a peso value can never be read as a count.
  cents_value bigint,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users,

  -- Exactly one value column may be set. Without this, a key can hold two different
  -- answers and the reader picks whichever it looked at first.
  constraint settings_one_value check (
    (int_value is not null)::int + (text_value is not null)::int + (cents_value is not null)::int <= 1
  )
);

comment on table settings is
  'Mirrors the engine''s DEFAULT_CFG. Read through settings_effective(); it falls back to the engine defaults for any key the owner has never touched.';

alter table settings enable row level security;
-- Staff read: capacity and the order window drive screens a helper sees.
create policy "settings staff read" on settings for select using (is_staff());
-- Only the owner changes them. These are her prices and her capacity.
create policy "settings owner write" on settings for all
  using (is_owner()) with check (is_owner());

-- Every change is auditable: a wrong capacity or price needs to be traceable to a person.
create or replace function settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists settings_touch_trg on settings;
create trigger settings_touch_trg before insert or update on settings
  for each row execute function settings_touch();

/**
 * The effective configuration: the owner's overrides, with the engine's defaults for
 * anything she has never changed.
 *
 * Seeding the table with the defaults instead would look simpler and be wrong — you
 * could no longer tell a deliberate choice of 200 from a default of 200, which matters
 * the day a default changes and every business silently keeps the old one.
 */
create or replace function settings_effective()
returns table (key text, int_value bigint, text_value text, cents_value bigint, is_default boolean)
language sql
stable
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
      ('maxPerOrder', 24, null::text, null::bigint)
  )
  select d.key,
         coalesce(s.int_value,   d.int_value),
         coalesce(s.text_value,  d.text_value),
         coalesce(s.cents_value, d.cents_value),
         s.key is null
    from defaults d
    left join settings s on s.key = d.key;
$$;

grant execute on function settings_effective() to authenticated;

-- Deliberately NOT granted to anon. The shop needs capacity and the order window, which
-- T-11 should expose through a narrow view rather than by opening the whole table —
-- cogsMultiple and groceryBudget are her margins, and no customer needs them.
