import { sql } from './stack';

/** Scenario A rows an operator would have entered (mirrors tests/integration/scenarios/scenario-a.sql, minus its own packaging items: the seed already has packaging and a rule, which the spec reads). */
export function seedScenarioA(): void {
  sql(`
insert into public.products(id, name, short_name, price_cents, kind, item_type, capacity_weight, published, active, sort_order, type_id) values
  ('sa-oat', 'Scenario oat', 'Oat', 12000, 'Permanent', 'cookie', 1, true, true, 1, 'cookie'),
  ('sa-choc', 'Scenario choc', 'Choc', 13000, 'Permanent', 'cookie', 1, true, true, 2, 'cookie')
on conflict (id) do nothing;
insert into public.payment_methods(id, label, account_number, account_name, active, sort_order)
values ('sa-gcash', 'SA GCash', '0917', 'Holder', true, 1) on conflict (id) do nothing;
insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('sa-flour', 'SA Flour', 'g', 'Ingredients', true, 1000), ('sa-butter', 'SA Butter', 'g', 'Ingredients', true, 500),
  ('sa-egg', 'SA Egg', 'pcs', 'Ingredients', true, 20), ('sa-cocoa', 'SA Cocoa', 'g', 'Ingredients', true, 200)
on conflict (id) do nothing;
insert into public.recipes(product_id, yield_count) values ('sa-oat', 12), ('sa-choc', 6) on conflict do nothing;
delete from public.recipe_ingredients where product_id in ('sa-oat', 'sa-choc');
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('sa-oat', 'SA Flour', 300, 'g', 0), ('sa-oat', 'SA Butter', 100, 'g', 1), ('sa-oat', 'SA Egg', 1, 'pcs', 2),
  ('sa-choc', 'SA Flour', 100, 'g', 0), ('sa-choc', 'SA Cocoa', 50, 'g', 1);
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
select public.apply_packaging_rule(jsonb_build_object('container', 'box', 'box_size', 6, 'lines', jsonb_build_array(
  jsonb_build_object('name', 'Box of 6', 'qty', 1, 'per', 'container'), jsonb_build_object('name', 'Brand sticker', 'qty', 1, 'per', 'container'))));
select public.apply_packaging_rule(jsonb_build_object('container', 'order', 'box_size', null, 'lines', jsonb_build_array(
  jsonb_build_object('name', 'Thank-you card', 'qty', 1, 'per', 'container'))));
`);
}

/** Back to the scenario's starting shelves and an empty order book (local throwaway stack only). */
export function resetScenarioA(): void {
  sql(`
truncate public.orders, public.production_records, public.stock_movements, public.ledger_entries restart identity cascade;
update public.inventory_items set on_hand = v.q from (values ('sa-flour', 1000), ('sa-butter', 500), ('sa-egg', 20), ('sa-cocoa', 200)) v(id, q) where inventory_items.id = v.id;
update public.inventory_items set on_hand = v.q from (values ('Box of 6', 10), ('Brand sticker', 20), ('Thank-you card', 10)) v(n, q) where inventory_items.name = v.n and category = 'Packaging';
`);
}
