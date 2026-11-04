# Money — supplied reference page contracts

Read ../reference-v4-page-contracts.md for source, capture method and proof limits. Actual-app parity remains incomplete.

## money — Money

- Structure: Money → Transactions
- Captured controls: Record expense; Settings; Earlier ingredient purchases2026-10-10 · Purchases−₱5,100.00; Earlier orders2026-10-12 · Sales₱8,400.00; Packaging purchase2026-10-30 · Purchases−₱100.00; Earlier market · stall rent2026-11-01 · Stall rent−₱2,000.00; Customer orders2026-10-31 · Sales₱3,600.00; Record owner draw; Export this period
- Fields: Period; Transactions
- Reference images: screenshots/money-baseline-1440.png; screenshots/money-baseline-390.png
- Existing source: src/components/live/money/money-live.tsx; src/lib/data/books.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## money-settings — Money settings

- Structure: Money settings → Books → Recipe costs → Double Chocolate Fudge → Happy Camper → White Chocolate Biscoff → PB & Miso → Red Velvet Cheesecake → Nutella Churro → Ube Coconut Crinkle → Espresso Brownie → Apple Pie → Manage books → Book rules → Expense categories → Owner draws → Export
- Captured controls: View cost; Open product; Open; Export
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/money-settings-baseline-1440.png; screenshots/money-settings-baseline-390.png
- Existing source: src/components/live/money/money-live.tsx; src/lib/data/books.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## money-entry — Record expense

- Structure: Record expense
- Captured controls: Back to Money; Review transaction
- Fields: text; number; date; Category; textarea
- Reference images: screenshots/money-entry-baseline-1440.png; screenshots/money-entry-baseline-390.png
- Existing source: src/components/live/money/money-live.tsx; src/lib/data/books.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## money-review — Review transaction

- Structure: Review transaction
- Captured controls: Change entry; Record transaction
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/money-review-baseline-1440.png; screenshots/money-review-baseline-390.png
- Existing source: src/components/live/money/money-live.tsx; src/lib/data/books.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## transaction — Transaction

- Structure: Transaction
- Captured controls: Back to Money
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/transaction-prepared-1440.png; screenshots/transaction-prepared-390.png
- Existing source: src/components/live/money/money-live.tsx; src/lib/data/books.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## money-categories — Expense categories

- Structure: Expense categories
- Captured controls: Add category
- Fields: text
- Reference images: screenshots/money-categories-baseline-1440.png; screenshots/money-categories-baseline-390.png
- Existing source: src/components/live/money/money-live.tsx; src/lib/data/books.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## book-rules — Book rules

- Structure: Book rules
- Captured controls: Back to Money settings; Save book rules
- Fields: number; number
- Reference images: screenshots/book-rules-baseline-1440.png; screenshots/book-rules-baseline-390.png
- Existing source: src/components/live/money/money-live.tsx; src/lib/data/books.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.
