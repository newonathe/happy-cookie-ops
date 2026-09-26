-- Applications cannot create foreign keys or manipulate the audit identifier sequence.
revoke references on table
  public.audit_log, public.bake_batches, public.drops, public.erasure_requests,
  public.event_sale_items, public.event_sales, public.events, public.inventory_items,
  public.ledger_entries, public.order_items, public.orders, public.products,
  public.profiles, public.rate_limits, public.recipe_ingredients, public.recipes,
  public.settings, public.supplier_prices, public.suppliers
from public, anon, authenticated;

revoke all privileges on sequence public.audit_log_id_seq from public, anon, authenticated;
