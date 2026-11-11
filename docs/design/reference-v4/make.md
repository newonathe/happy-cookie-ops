# Make — supplied reference page contracts

Read ../reference-v4-page-contracts.md for source, capture method and proof limits. Actual-app parity remains incomplete.

## make — Products

- Structure: Products → Double Chocolate Fudge → Happy Camper → White Chocolate Biscoff → PB & Miso → Red Velvet Cheesecake → Nutella Churro
- Captured controls: Start production; Settings; Products; Production; Menu; All products; Needs recipe; Recipe drafts; Add product; Recipe; Edit product
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/make-baseline-1440.png; screenshots/make-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## recipe — Double Chocolate Fudge

- Structure: Double Chocolate Fudge → Ingredients → Packaging → Stock for this batch → Brown sugar → Brand sticker
- Captured controls: Recipe; Cost; History; Edit recipe; Start production; Count
- Fields: number; checkbox; checkbox; checkbox; checkbox; checkbox; checkbox; checkbox
- Reference images: screenshots/recipe-baseline-1440.png; screenshots/recipe-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## recipe-edit — Edit Double Chocolate Fudge

- Structure: Edit Double Chocolate Fudge → Ingredients → Packaging per cookie → Method / notes
- Captured controls: Add ingredient; Add packaging; Back to recipe; Review recipe changes
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/recipe-edit-prepared-1440.png; screenshots/recipe-edit-prepared-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## recipe-review — Review recipe changes

- Structure: Review recipe changes
- Captured controls: Change recipe; Save new version
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/recipe-review-prepared-1440.png; screenshots/recipe-review-prepared-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## product-edit — Edit product

- Structure: Edit product
- Captured controls: Back to products; Save product
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/product-edit-prepared-1440.png; screenshots/product-edit-prepared-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## production — Production

- Structure: Production → Cookies made → Baked stock
- Captured controls: Start production; Settings; Products; Production
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/production-baseline-1440.png; screenshots/production-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## production-entry — Record production

- Structure: Record production
- Captured controls: Back to production; Review production
- Fields: Product; number; Made from; text; text
- Reference images: screenshots/production-entry-baseline-1440.png; screenshots/production-entry-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## production-review — Review production

- Structure: Review production → Ingredient use → Packaging used
- Captured controls: Change production; Record production
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/production-review-baseline-1440.png; screenshots/production-review-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## make-settings — Make settings

- Structure: Make settings
- Captured controls: Back to products
- Fields: Show inactive products
- Reference images: screenshots/make-settings-baseline-1440.png; screenshots/make-settings-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## new-product — Add product

- Structure: Add product
- Captured controls: Back to products; Add product
- Fields: text; number; text
- Reference images: screenshots/new-product-baseline-1440.png; screenshots/new-product-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## recipe-drafts — Recipe drafts

- Structure: Recipe drafts → Needs a recipe → Ube Coconut Crinkle → Espresso Brownie → Apple Pie
- Captured controls: Start recipe
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/recipe-drafts-baseline-1440.png; screenshots/recipe-drafts-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## cost-edit — Manual cost

- Structure: Manual cost
- Captured controls: Use recipe estimate instead; Review cost change
- Fields: number; textarea
- Reference images: screenshots/cost-edit-baseline-1440.png; screenshots/cost-edit-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## cost-review — Review cost change

- Structure: Review cost change
- Captured controls: Change cost; Save manual cost
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/cost-review-baseline-1440.png; screenshots/cost-review-baseline-390.png
- Existing source: src/components/live/recipes/products-live.tsx; src/components/live/recipes/recipe-reader.tsx; src/components/live/production/production-plan-entry.tsx; src/lib/production/workspace.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.
