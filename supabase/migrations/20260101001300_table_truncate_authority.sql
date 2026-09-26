-- TRUNCATE bypasses row policies; application users have no table-reset capability.
-- Keep trusted service/database maintenance privileges and other grants unchanged.
revoke truncate on table
  public.audit_log, public.bake_batches, public.drops, public.erasure_requests,
  public.event_sale_items, public.event_sales, public.events, public.inventory_items,
  public.ledger_entries, public.order_items, public.orders, public.products,
  public.profiles, public.rate_limits, public.recipe_ingredients, public.recipes,
  public.settings, public.supplier_prices, public.suppliers
from public, anon, authenticated;
