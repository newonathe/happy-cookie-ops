-- Direct client row creation cannot enforce authoritative order totals or ownership.
-- Future checkout/staff commands must validate and commit the complete order atomically.
revoke insert on table public.orders, public.order_items from public, anon, authenticated;
grant insert on table public.orders, public.order_items to service_role;
