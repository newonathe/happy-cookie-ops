-- Existing trigger bindings remain; application roles may not attach new ones.
revoke trigger on table
  public.audit_log, public.bake_batches, public.drops, public.erasure_requests,
  public.event_sale_items, public.event_sales, public.events, public.inventory_items,
  public.ledger_entries, public.order_items, public.orders, public.products,
  public.profiles, public.rate_limits, public.recipe_ingredients, public.recipes,
  public.settings, public.supplier_prices, public.suppliers
from public, anon, authenticated;

revoke execute on function public.touch_updated_at(), public.settings_touch()
from public, anon, authenticated;
