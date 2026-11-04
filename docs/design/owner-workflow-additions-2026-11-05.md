# Additional owner requirements — 5 November 2026

These extend the active whole-application goal and the audit fixes. They do not replace them.
Ethan confirmed Claude finished and authorized integrating the tested fixes. Codex owns the primary checkout again. The first fix is being verified in C:/Users/ethan/dev/happy-cookie-audit-fixes before integration.

## Orders

- Remove the redundant Open Order button; make the order row/card directly openable with an accessible keyboard action.
- Requested wording: Ready for Customer Pickup, Picked Up, Completed.
- Ethan clarified: nothing additional happens between Picked Up and Completed; this is wording, not a new business transition.
- Customers pick up cookies directly from Cine. Do not introduce a delivery/shipping workflow.
- Keep backend status/state and existing payment/fulfilment checks intact. Align visible status wording and action labels without inventing another transaction.

## Production

- Reflect the actual prepare dough → refrigerate → bake workflow.
- Allow variable cookie yields.
- Automatically deduct ingredients actually used.
- Preserve simultaneous different products/flavours, independent work items, recipe/version snapshots, actual-versus-plan distinction, rejects, shortages, recovery and acknowledged stock updates.
- Clarification pending: whether ingredient deduction occurs once when dough is prepared, with baking consuming only refrigerated dough. Do not implement another deduction before this is resolved; inspect existing SQL first to avoid duplicating existing consumption.
- Further details are forthcoming. Do not invent refrigeration duration, food-safety limits, yield conversions, cost rules or an owner decision.

## Inventory

- Track remaining ingredients, refrigerated dough and baked cookies separately.
- Standardize inventory additions under Add to Inventory.
- Make packaging actions item-specific, carrying the selected packaging item, unit and pack automatically.
- Preserve the distinction between creating an inventory definition, receiving quantities, physical counting, production and transfers even when access is consolidated.

## UI/UX

- Remove redundant buttons and unnecessary intermediate pages; simplify navigation.
- Preserve feature reachability, useful Back/context and explicit confirmation for consequential changes.
- The owner should not need global feature search or a manual.

## Suppliers and Shopping

- Allow adding and updating suppliers.
- Keep shopping lists grouped by supplier, with item/pack/price context and useful delivery entry paths.

## Customer ordering

- Complete the online order form, including product images.
- Support order-before-payment. An order may be recorded before payment is confirmed; it must never be marked paid based on an expected payment or uploaded proof alone.
- Pickup is from Cine. Existing capacity, price snapshots, extras, unpaid holds, abuse protection and owner verification remain authoritative.
- Changes to locked customer screens must use the approved live-replacement approach, not edits to the protected port. Any new SQL is a new migration and is not applied hosted without authorization.

## Working/stop instruction

Ethan requested fixing every audit finding and these additional requirements, then stopping after the fixes are verified. Do not interpret this as an immediate pause. Do not deploy or mutate hosted records as part of local fixes. Final physical-device/owner and hosted acceptance must remain explicit rather than being claimed from local fixtures.
