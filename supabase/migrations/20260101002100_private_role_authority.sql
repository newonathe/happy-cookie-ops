-- MP-06j: raw private operations require an active owner profile.
-- Assigned-event helper access requires a later scoped projection/command.
alter policy "batches staff all" on public.bake_batches using (public.is_owner()) with check (public.is_owner());
alter policy "sale items staff insert" on public.event_sale_items with check (public.is_owner());
alter policy "sale items staff read" on public.event_sale_items using (public.is_owner());
alter policy "sales staff insert" on public.event_sales with check (public.is_owner());
alter policy "sales staff read" on public.event_sales using (public.is_owner());
alter policy "events staff read" on public.events using (public.is_owner());
alter policy "stock staff read" on public.inventory_items using (public.is_owner());
alter policy "stock staff write" on public.inventory_items using (public.is_owner()) with check (public.is_owner());
alter policy "order items staff read" on public.order_items using (public.is_owner());
alter policy "order items staff write" on public.order_items using (public.is_owner()) with check (public.is_owner());
alter policy "orders staff read" on public.orders using (public.is_owner());
alter policy "orders staff write" on public.orders using (public.is_owner()) with check (public.is_owner());
alter policy "recipe items staff read" on public.recipe_ingredients using (public.is_owner());
alter policy "recipes staff read" on public.recipes using (public.is_owner());
alter policy "supplier prices staff read" on public.supplier_prices using (public.is_owner());
alter policy "suppliers staff read" on public.suppliers using (public.is_owner());
