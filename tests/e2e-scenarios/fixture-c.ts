import { sql } from './stack';

/** Scenario C starting point: no events, days or sales (local throwaway stack only). The menu comes from the seed plus scenario A's SA products. */
export function resetScenarioC(): void {
  sql(`truncate public.scheduled_events, public.events, public.event_sales, public.event_sale_items, public.event_sale_voids, public.event_expenses,
  public.bazaar_days, public.bazaar_day_lines, public.bazaar_fees, public.bazaar_costs, public.bazaar_losses, public.bazaar_stock_adds,
  public.bazaar_kitchen_moves, public.event_price_versions restart identity cascade;
  truncate public.ledger_entries restart identity cascade;
  delete from public.flavour_costs where product_id in ('sa-oat', 'sa-choc');`);
}
