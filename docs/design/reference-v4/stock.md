# Stock — supplied reference page contracts

Read ../reference-v4-page-contracts.md for source, capture method and proof limits. Actual-app parity remains incomplete.

## stock — Inventory

- Structure: Inventory
- Captured controls: Add to inventory; Settings; Inventory; Shopping; Suppliers; Receive delivery; Count stock; Ingredients; Packaging; Dough; Baked stock; All-purpose flour1,000 g per pack; Unsalted butter225 g per pack; Brown sugar1,000 g per pack; Chocolate chunks1,000 g per pack; Marshmallows500 g per pack; Biscoff spread400 g per pack; Peanut butter500 g per pack; White miso500 g per pack; Cocoa powder1,000 g per pack; Cream cheese225 g per pack · price missing; Nutella750 g per pack
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/stock-baseline-1440.png; screenshots/stock-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## item — All-purpose flour

- Structure: All-purpose flour → 800 g → Stock history → Price source
- Captured controls: Edit item; Receive; Count; Waste / correction; Supplier prices & history
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/item-baseline-1440.png; screenshots/item-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## item-edit — Edit item details

- Structure: Edit item details
- Captured controls: Back to item; Save item details
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/item-edit-prepared-1440.png; screenshots/item-edit-prepared-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## receive — Receive delivery

- Structure: Receive delivery
- Captured controls: Add another item; Back to inventory; Review delivery
- Fields: Supplier; date; Item; number; number; number
- Reference images: screenshots/receive-baseline-1440.png; screenshots/receive-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## receive-review — Review delivery

- Structure: Review delivery
- Captured controls: Change delivery; Record delivery
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/receive-review-prepared-1440.png; screenshots/receive-review-prepared-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## new-item — Add to inventory

- Structure: Add to inventory
- Captured controls: Back to inventory; Add to inventory
- Fields: text; Category; Stock unit; number; number; number; Supplier
- Reference images: screenshots/new-item-baseline-1440.png; screenshots/new-item-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## count — Count stock

- Structure: Count stock
- Captured controls: Back to inventory; Review count
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/count-baseline-1440.png; screenshots/count-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## count-review — Review count

- Structure: Review count
- Captured controls: Recount; Save count
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/count-review-prepared-1440.png; screenshots/count-review-prepared-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## adjust — Waste / correction

- Structure: Waste / correction
- Captured controls: Back to item; Review change
- Fields: Reason; number; text
- Reference images: screenshots/adjust-baseline-1440.png; screenshots/adjust-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## adjust-review — Review stock change

- Structure: Review stock change
- Captured controls: Change entry; Save stock change
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/adjust-review-baseline-1440.png; screenshots/adjust-review-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## shopping — Shopping

- Structure: Shopping → Bake Supply → Count before buying → Brown sugar → Brand sticker
- Captured controls: Edit planned bake; Settings; Inventory; Shopping; Suppliers; Compare prices; View supplier; Receive delivery; Count
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/shopping-baseline-1440.png; screenshots/shopping-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## suppliers — Suppliers

- Structure: Suppliers → Bake Supply → Packaging Supply → Pantry Wholesale
- Captured controls: Add supplier; Settings; Inventory; Shopping; Suppliers; Open
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/suppliers-baseline-1440.png; screenshots/suppliers-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## supplier — Bake Supply

- Structure: Bake Supply → Items & prices → Supplier prices → All-purpose flour → Unsalted butter
- Captured controls: Edit supplier; All-purpose flour1,000 g per pack; Unsalted butter225 g per pack; Brown sugar1,000 g per pack; Chocolate chunks1,000 g per pack; Marshmallows500 g per pack; Biscoff spread400 g per pack; Peanut butter500 g per pack; White miso500 g per pack; Cocoa powder1,000 g per pack; Cream cheese225 g per pack; Nutella750 g per pack; Receive delivery; Compare prices; Add item price
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/supplier-baseline-1440.png; screenshots/supplier-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## supplier-edit — Edit supplier

- Structure: Edit supplier
- Captured controls: Back to suppliers; Save supplier
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/supplier-edit-prepared-1440.png; screenshots/supplier-edit-prepared-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## stock-settings — Stock settings

- Structure: Stock settings → Shopping budget
- Captured controls: Suppliers; Back to inventory; View shopping
- Fields: number
- Reference images: screenshots/stock-settings-baseline-1440.png; screenshots/stock-settings-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## bake-needs — Planned bake

- Structure: Planned bake
- Captured controls: Remove; Add product; Back to shopping; Use this plan
- Fields: Product; number; Product; number
- Reference images: screenshots/bake-needs-baseline-1440.png; screenshots/bake-needs-baseline-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## purchase-prices — Supplier prices

- Structure: Supplier prices → Pantry Wholesale → Bake Supply → Price history
- Captured controls: Use supplier
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/purchase-prices-prepared-1440.png; screenshots/purchase-prices-prepared-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## supplier-price-edit — Add supplier price

- Structure: Add supplier price
- Captured controls: Back to supplier; Save supplier price
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/supplier-price-edit-prepared-1440.png; screenshots/supplier-price-edit-prepared-390.png
- Existing source: src/components/live/stock/inventory-live.tsx; src/components/live/stock/grocery-live.tsx; src/components/live/stock/suppliers-live.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.
