-- Explicit publication, separate from product availability. Existing rows stay private.
alter table public.products add column published boolean not null default false;
alter table public.drops add column published boolean not null default false;
alter policy "catalogue public read" on public.products using (public.is_owner());
alter policy "drops public read" on public.drops using (public.is_owner());

-- Deliberate fixed-field owner-rights exports; no raw-table permission required.
create view public.shop_products with (security_barrier=true, security_invoker=false) as
select id, name, short_name, price_cents, kind, tag, description, image_path, sort_order
from public.products where published and active;
create view public.shop_drops with (security_barrier=true, security_invoker=false) as
select id, week_label, opens_at, closes_at, pickup_at
from public.drops where published;
alter view public.shop_products owner to postgres;
alter view public.shop_drops owner to postgres;
revoke all on public.shop_products, public.shop_drops from public, anon, authenticated, service_role;
grant select on public.shop_products, public.shop_drops to anon, authenticated, service_role;
