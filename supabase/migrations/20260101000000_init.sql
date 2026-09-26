-- The Happy Cookie Ops — initial schema.
--
-- Shape follows docs/reference/spec/02-data-model.md, which was derived from the
-- prototype's single localStorage object. Money is stored in centavos as bigint:
-- the prototype's peso values are all two-decimal, and float arithmetic on a
-- bookkeeping ledger is not acceptable.
--
-- Every table is owned by exactly one bakery (single tenant today, but the column
-- is here so a second one never needs a migration under load).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- identity

create type app_role as enum ('owner', 'helper', 'support');

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        app_role not null default 'helper',
  display_name text not null,
  created_at  timestamptz not null default now()
);

comment on table profiles is
  'One row per signed-in staff member. Customers are not users — they order by name and phone.';

-- role lookup used by every policy below. security definer so the policy can read
-- profiles without recursing into profiles'' own policy.
create or replace function current_role_name() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() = 'owner', false)
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_name() is not null
$$;

-- ---------------------------------------------------------------- catalogue

create table products (
  id          text primary key,               -- 'dcf', 'hc', … the prototype's ids
  name        text not null,
  short_name  text not null,
  price_cents bigint not null check (price_cents >= 0),
  kind        text not null,
  tag         text not null default '',
  description text not null default '',
  image_path  text not null default '',
  active      boolean not null default true,
  sort_order  int not null default 0
);

create table recipes (
  product_id  text primary key references products on delete cascade,
  yield_count int not null check (yield_count > 0)
);

create table recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null references recipes on delete cascade,
  item_name   text not null,
  qty         numeric(12, 3) not null,
  unit        text not null
);

create table suppliers (
  id         text primary key,
  name       text not null,
  phone      text not null default '',
  notes      text not null default ''
);

create table inventory_items (
  id            text primary key,
  name          text not null,
  unit          text not null,
  on_hand       numeric(12, 3) not null default 0,
  par_level     numeric(12, 3) not null default 0,
  pack_size     numeric(12, 3),
  supplier_id   text references suppliers on delete set null,
  use_by_days   int,
  last_counted  timestamptz
);

-- ---------------------------------------------------------------- ordering

-- The engine's own status strings, verbatim, including the spaces and the capitals.
--
-- This looks unusual and is deliberate. The alternative is snake_case values plus a
-- mapping layer, and a mapping layer between the engine's status and the database's state
-- is exactly the two-places-for-one-truth bug that src/lib/rules/capacity.ts exists to
-- prevent. This is a 1:1 port; the engine's vocabulary is the vocabulary.
--
-- Every value here is read out of ops-engine.js (STATUS_LABEL, RECOGNISED, PLANNED).
-- 'Payment review' is where an order starts, awaiting proof of payment.
-- 'No-show'        nobody collected. They stay paid AND the cookies go back into stock —
--                  a real rule with money on both sides, and the previous version of this
--                  enum could not represent it at all.
create type order_state as enum (
  'Payment review', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'No-show'
);

create type pay_state as enum ('unpaid', 'claimed', 'confirmed', 'refunded');

-- Revenue recognition, from the engine's RECOGNISED list. A no-show counts: she keeps the
-- money. Expressed as a function so the P&L query and the closeout cannot disagree.
create or replace function state_is_recognised(p_state order_state)
returns boolean
language sql
immutable
as $$
  select p_state in ('Confirmed', 'Preparing', 'Ready', 'Completed', 'No-show');
$$;

-- The engine's RESERVING list: states that hold capacity against a drop.
create or replace function state_reserves_capacity(p_state order_state)
returns boolean
language sql
immutable
as $$
  select p_state in ('Confirmed', 'Preparing');
$$;

create table drops (
  id          uuid primary key default gen_random_uuid(),
  week_label  text not null,
  opens_at    timestamptz not null,
  closes_at   timestamptz not null,
  pickup_at   timestamptz not null,
  capacity    int not null check (capacity > 0),
  created_at  timestamptz not null default now()
);

create table orders (
  id             text primary key,             -- 'HC-1042', shown to the customer
  drop_id        uuid references drops on delete set null,
  customer_name  text not null,
  phone          text not null,
  channel        text not null default 'form',
  -- Where every order starts: placed, awaiting proof of payment.
  state          order_state not null default 'Payment review',
  pay_state      pay_state not null default 'unpaid',
  pay_method     text,
  pay_ref        text,
  total_cents    bigint not null default 0 check (total_cents >= 0),
  packaging_cents bigint not null default 0,
  notes          text not null default '',
  placed_at      timestamptz not null default now(),
  collected_at   timestamptz,
  cancelled_at   timestamptz,
  updated_at     timestamptz not null default now()
);

create index orders_state_idx on orders (state, placed_at desc);
create index orders_drop_idx on orders (drop_id);
create index orders_phone_idx on orders (phone);

create table order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   text not null references orders on delete cascade,
  product_id text not null references products,
  qty        int not null check (qty > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0)
);

create index order_items_order_idx on order_items (order_id);

-- ---------------------------------------------------------------- production

create table bake_batches (
  id           uuid primary key default gen_random_uuid(),
  drop_id      uuid references drops on delete set null,
  product_id   text not null references products,
  planned_qty  int not null check (planned_qty >= 0),
  baked_qty    int not null default 0 check (baked_qty >= 0),
  started_at   timestamptz,
  finished_at  timestamptz,
  baker        text not null default ''
);

-- ---------------------------------------------------------------- money

create type ledger_kind as enum ('sale', 'cost', 'adjustment');

create table ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  kind        ledger_kind not null,
  category    text not null,
  memo        text not null default '',
  amount_cents bigint not null,               -- signed: costs are negative
  occurred_at timestamptz not null,
  order_id    text references orders on delete set null,
  sale_id     uuid,
  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now()
);

create index ledger_occurred_idx on ledger_entries (occurred_at desc);

-- ---------------------------------------------------------------- bazaar

create table events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  float_cents bigint not null default 0,
  closed_at   timestamptz
);

create table event_sales (
  id           uuid primary key default gen_random_uuid(),
  -- The offline queue's idempotency key: device id + the device''s own sale number +
  -- the timestamp. A retried request cannot create a second sale.
  client_id    text not null unique,
  event_id     uuid references events on delete set null,
  gross_cents  bigint not null check (gross_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents  bigint not null check (total_cents >= 0),
  pay_method   text not null,
  pay_ref      text not null default '',
  tendered_cents bigint not null default 0,
  change_cents bigint not null default 0,
  clerk        text not null default '',
  sold_at      timestamptz not null,
  received_at  timestamptz not null default now(),
  ledger_id    uuid references ledger_entries on delete set null
);

comment on column event_sales.client_id is
  'Idempotency key from the device queue. Never generate this server-side.';

create table event_sale_items (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references event_sales on delete cascade,
  product_id text not null references products,
  qty        int not null check (qty > 0),
  unit_price_cents bigint not null
);

-- ---------------------------------------------------------------- audit

create table audit_log (
  id         bigserial primary key,
  actor      uuid references profiles on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb not null default '{}',
  at         timestamptz not null default now()
);

comment on table audit_log is
  'Append only. Money and stock corrections must be explainable a month later.';

-- ---------------------------------------------------------------- RLS
--
-- Default deny everywhere. Three principals:
--   anon    — the shop, checkout and order-status screens. Reads the catalogue and the
--             open drop; may create an order; may read one order by its own id.
--   helper  — production and stock. No money.
--   owner   — everything.

alter table profiles           enable row level security;
alter table products           enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table suppliers          enable row level security;
alter table inventory_items    enable row level security;
alter table drops              enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table bake_batches       enable row level security;
alter table ledger_entries     enable row level security;
alter table events             enable row level security;
alter table event_sales        enable row level security;
alter table event_sale_items   enable row level security;
alter table audit_log          enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid());
create policy "owner reads staff" on profiles for select using (is_owner());
create policy "owner writes staff" on profiles for all using (is_owner()) with check (is_owner());

-- catalogue: readable by the world (the shop is public), written by the owner
create policy "catalogue public read" on products for select using (active or is_staff());
create policy "catalogue owner write" on products for all using (is_owner()) with check (is_owner());

create policy "recipes staff read" on recipes for select using (is_staff());
create policy "recipes owner write" on recipes for all using (is_owner()) with check (is_owner());
create policy "recipe items staff read" on recipe_ingredients for select using (is_staff());
create policy "recipe items owner write" on recipe_ingredients for all using (is_owner()) with check (is_owner());

create policy "suppliers staff read" on suppliers for select using (is_staff());
create policy "suppliers owner write" on suppliers for all using (is_owner()) with check (is_owner());

create policy "stock staff read" on inventory_items for select using (is_staff());
create policy "stock staff write" on inventory_items for update using (is_staff()) with check (is_staff());
create policy "stock owner insert" on inventory_items for insert with check (is_owner());

create policy "drops public read" on drops for select using (true);
create policy "drops owner write" on drops for all using (is_owner()) with check (is_owner());

-- orders: staff see all; the public can place one, and reads go through the
-- lookup_order() function below rather than a policy, so an id cannot be enumerated.
create policy "orders staff read" on orders for select using (is_staff());
create policy "orders staff write" on orders for update using (is_staff()) with check (is_staff());
-- A customer may create an order, but only in the state a new order is allowed to be in.
-- Without the state check, anyone could insert an order already marked Confirmed.
create policy "orders public insert" on orders for insert
  with check (state = 'Payment review' and pay_state in ('unpaid', 'claimed'));
create policy "order items staff read" on order_items for select using (is_staff());
create policy "order items public insert" on order_items for insert with check (true);
create policy "order items staff write" on order_items for update using (is_staff()) with check (is_staff());

create policy "batches staff all" on bake_batches for all using (is_staff()) with check (is_staff());

-- money: owner only, and the ledger is append-only even for the owner
create policy "ledger owner read" on ledger_entries for select using (is_owner());
create policy "ledger owner insert" on ledger_entries for insert with check (is_owner());

create policy "events staff read" on events for select using (is_staff());
create policy "events owner write" on events for all using (is_owner()) with check (is_owner());

-- a helper working the bazaar stall must be able to record a sale, and must not be
-- able to change or delete one afterwards.
create policy "sales staff read" on event_sales for select using (is_staff());
create policy "sales staff insert" on event_sales for insert with check (is_staff());
create policy "sale items staff read" on event_sale_items for select using (is_staff());
create policy "sale items staff insert" on event_sale_items for insert with check (is_staff());

create policy "audit owner read" on audit_log for select using (is_owner());
create policy "audit staff insert" on audit_log for insert with check (is_staff());

-- ---------------------------------------------------------------- functions

-- The customer-facing "find my order" screen. Requires both the id and the phone,
-- so the order number alone leaks nothing.
create or replace function lookup_order(p_order_id text, p_phone text)
returns table (
  id text, customer_name text, state order_state, pay_state pay_state,
  total_cents bigint, pickup_at timestamptz, placed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select o.id, o.customer_name, o.state, o.pay_state, o.total_cents, d.pickup_at, o.placed_at
  from orders o left join drops d on d.id = o.drop_id
  where o.id = p_order_id
    and regexp_replace(o.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
  limit 1
$$;

revoke all on function lookup_order(text, text) from public;
grant execute on function lookup_order(text, text) to anon, authenticated;

-- Remaining capacity for a drop. The prototype refuses an order that would take the
-- drop past capacity; enforcing it here means two customers checking out at the same
-- moment cannot both slip through.
create or replace function drop_remaining(p_drop_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- Only orders that reserve capacity count, per state_reserves_capacity() above, which
  -- is the engine's RESERVING list. A cancelled or no-show order releases its boxes.
  --
  -- The check has to happen inside the insert transaction, not before it: checking and
  -- then inserting is a race, and the race is two customers taking the last box. See
  -- src/lib/rules/capacity.ts and tests/fixtures/capacity-cases.json.
  select greatest(
    0,
    coalesce((select capacity from drops where id = p_drop_id), 0)
      - coalesce((
          select sum(oi.qty)::int
          from orders o
          join order_items oi on oi.order_id = o.id
          where o.drop_id = p_drop_id
            and state_reserves_capacity(o.state)
        ), 0)
  );
$$;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger orders_touch before update on orders
for each row execute function touch_updated_at();
