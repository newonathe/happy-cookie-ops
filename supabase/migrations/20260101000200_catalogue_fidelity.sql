-- Brings the schema in line with what the engine actually holds.
--
-- The first migration was written from the data-model note. Reading the engine's own
-- constants afterwards showed three things missing, each load-bearing for a screen that
-- already exists — so none of this is speculative. The seed in supabase/seed.sql is
-- generated from those constants and will fail without these columns.

-- Inventory is grouped as Ingredients / Packaging on the inventory and grocery screens,
-- and the sheet title changes with it ("Add packaging item" vs "Add ingredient").
alter table inventory_items add column if not exists category text not null default 'Ingredients';
comment on column inventory_items.category is
  'Ingredients or Packaging. Drives the grouping on the inventory and grocery screens.';

-- Where a supplier is, as she reads it: 'Congressional Ave', 'Online - ships in 2 days'.
alter table suppliers add column if not exists place text not null default '';

-- products.kind already holds Permanent or Rotating — the engine's own field. A second
-- `rotation` column was drafted here and removed: two columns holding the same fact is
-- the duplication this migration is meant to be fixing.
comment on column products.kind is
  'Permanent or Rotating, verbatim from the engine''s PRODUCTS. Drives the shop badge.';

-- Shelf life, per item. Drives the use-by warnings on the inventory screen.
alter table inventory_items add column if not exists pack_label text not null default '';

/**
 * The supplier price book.
 *
 * This was missing entirely, and the "best buy" comparison on the suppliers screen is
 * built from it: for one item, every supplier that sells it, the pack it comes in, the
 * current price, the last prices paid, and whether it is her preferred source.
 *
 * previous_cents is an array rather than a history table on purpose — the screen shows
 * "was 395, 410" and nothing needs to query across it.
 */
create table if not exists supplier_prices (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    text not null references suppliers on delete cascade,
  item_name      text not null,
  pack_label     text not null,                    -- '1 kg block', '900 g tub'
  price_cents    bigint not null check (price_cents >= 0),
  previous_cents bigint[] not null default '{}',
  last_bought    text not null default '',         -- as she reads it: '2 Aug'
  preferred      boolean not null default false,
  unique (supplier_id, item_name)
);

-- The best-buy query is "cheapest supplier for this item", so the index leads on the name.
create index if not exists supplier_prices_item_idx on supplier_prices (item_name, price_cents);

alter table supplier_prices enable row level security;
create policy "supplier prices staff read" on supplier_prices
  for select using (is_staff());
create policy "supplier prices owner write" on supplier_prices
  for all using (is_owner()) with check (is_owner());

comment on column recipe_ingredients.qty is
  'Exact quantity in the ingredient''s own unit (g, ml, pcs). Never rounded — half a kilo of butter is a real quantity, and rounding here changes a shopping list.';
