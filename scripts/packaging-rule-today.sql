-- B3b-1 upgrade step: enter today's packaging rule as data.
--
-- Run ONCE, as postgres through the database connector, in the same sitting as migration 20260101005900 (migration 60), straight after
-- it (docs/state/current.md, "Waiting on Ethan", the step after 5). `python scripts/test-b3a-upgrade.py` rehearses it on the local database.
-- Until it is run, packing an order and a bazaar sale take no container packaging and keep a shortfall flagged "no packaging rule".
--
-- It is ONE call, so it is all or nothing: if a name below matches no stock item, or more than one, the call is refused, lists every such
-- name, and nothing is written. Fix the name in Stock (or here) and run it again. It is safe to run again: each container's lines are
-- replaced by the same lines. The items are named here and nowhere in a migration or a function; once entered, the rule is the owner's
-- to change (save_packaging_rule, a screen in a later slice).
--
-- Today's rule, and the one deliberate change from before:
--   box of 6     a Box of 6 and a Brand sticker, each per box
--   loose        a Single cookie pouch and a Brand sticker, each per cookie
--   order        a Thank-you card, once per order (before: once per box, at least one)
--   bazaar sale  a Single cookie pouch per cookie, then a Paper bag per sale (this order: the movement ids the bazaar has always written)
-- A box of any other size (8, 12) has no rule until the owner enters one; packing one is flagged, never silently free.
-- Cine's per-cookie packaging lines come later (B4). In the same sitting as those lines, the pouch is taken off the bazaar-sale rule
-- AND the loose rule, which also takes it per cookie (decision register, 8 October (b)); the save actions refuse an item that is both a
-- recipe packaging line and a per-cookie line. A set (the sampler) counts as one cookie when packing, as it always has.

select public.apply_packaging_rule('[
  {"container": "box", "box_size": 6, "lines": [
    {"name": "Box of 6", "qty": 1, "per": "container"},
    {"name": "Brand sticker", "qty": 1, "per": "container"}]},
  {"container": "loose", "box_size": null, "lines": [
    {"name": "Single cookie pouch", "qty": 1, "per": "cookie"},
    {"name": "Brand sticker", "qty": 1, "per": "cookie"}]},
  {"container": "order", "box_size": null, "lines": [
    {"name": "Thank-you card", "qty": 1, "per": "container"}]},
  {"container": "bazaar_sale", "box_size": null, "lines": [
    {"name": "Single cookie pouch", "qty": 1, "per": "cookie"},
    {"name": "Paper bag", "qty": 1, "per": "container"}]}
]'::jsonb);

-- Read it back: what is now entered, in the order the owner sees it. Expect 7 lines in 4 containers.
select r.container, r.box_size, r.position, i.name, r.qty, r.per
  from public.packaging_rules r join public.inventory_items i on i.id = r.item_id
 order by case r.container when 'box' then 1 when 'loose' then 2 when 'order' then 3 else 4 end, r.box_size nulls first, r.position;

-- Check: expect NO rows. A recipe line that is an ingredient (a quantity per batch) but names an item a rule also takes would come off
-- stock twice, at the bake and when packed. If a row shows, make that line packaging in Recipes, or take the item off the rule.
select i.product_id, i.item_name from public.recipe_ingredients i
 where i.kind = 'ingredient' and i.item_id in (select r.item_id from public.packaging_rules r) order by 1, 2;
