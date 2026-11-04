# Bazaar — supplied reference page contracts

Read ../reference-v4-page-contracts.md for source, capture method and proof limits. Actual-app parity remains incomplete.

## bazaar — Weekend market

- Structure: Weekend market → Selling days → Day 1 → Day 2
- Captured controls: All events; Settings; Edit event; Event activity; Continue selling; Device & recovery; Review event
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/bazaar-baseline-1440.png; screenshots/bazaar-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## till — Sell at the bazaar

- Structure: Sell at the bazaar → Double Chocolate Fudge → Happy Camper → White Chocolate Biscoff → PB & Miso → Red Velvet Cheesecake → Nutella Churro → Ube Coconut Crinkle → Espresso Brownie → Apple Pie → Recent sales → Current sale
- Captured controls: Close day; Settings; Edit sale; Charge; Double Chocolate Fudge12 left on the table₱130.00+ Add; Happy Camper10 left on the table₱140.00+ Add; White Chocolate Biscoff14 left on the table₱145.00+ Add; PB & Miso10 left on the table₱80.00+ Add; Red Velvet Cheesecake8 left on the table₱150.00+ Add; Nutella Churro6 left on the table₱200.00+ Add; Ube Coconut Crinkle0 left on the table₱110.00+ Add; Espresso Brownie0 left on the table₱110.00+ Add; Apple Pie0 left on the table₱155.00+ Add; S-003Cash · Sent₱470.00; S-002Wallet · Sent₱560.00; S-001Cash · Sent₱650.00; Back to cookies; Charge ₱0.00; Add cookies; Loss / giveaway; Fees & expenses; All events
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/till-baseline-1440.png; screenshots/till-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## receipt — Receipt S-003

- Structure: Receipt S-003
- Captured controls: Void this sale; Next customer
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/receipt-prepared-1440.png; screenshots/receipt-prepared-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## void — Void S-003

- Structure: Void S-003
- Captured controls: Keep sale; Confirm void
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/void-prepared-1440.png; screenshots/void-prepared-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## close — Close day 1

- Structure: Close day 1 → Cookies left → Cash in the drawer
- Captured controls: I counted: matches table; I counted: cash matches; Review day
- Fields: Double Chocolate Fudge counted leftovers; Leftovers go to; Happy Camper counted leftovers; Leftovers go to; White Chocolate Biscoff counted leftovers; Leftovers go to; PB & Miso counted leftovers; Leftovers go to; Red Velvet Cheesecake counted leftovers; Leftovers go to; Nutella Churro counted leftovers; Leftovers go to; Ube Coconut Crinkle counted leftovers; Leftovers go to; Espresso Brownie counted leftovers; Leftovers go to; Apple Pie counted leftovers; Leftovers go to; number
- Reference images: screenshots/close-baseline-1440.png; screenshots/close-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## close-review — Review day 1

- Structure: Review day 1
- Captured controls: Change counts; Close day 1
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/close-review-baseline-1440.png; screenshots/close-review-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## plan — Prepare day 1

- Structure: Prepare day 1 → Double Chocolate Fudge → Happy Camper → White Chocolate Biscoff → PB & Miso → Red Velvet Cheesecake → Nutella Churro → Ube Coconut Crinkle → Espresso Brownie → Apple Pie
- Captured controls: Back to event; Review opening
- Fields: Double Chocolate Fudge fresh cookies; Double Chocolate Fudge event price; Happy Camper fresh cookies; Happy Camper event price; White Chocolate Biscoff fresh cookies; White Chocolate Biscoff event price; PB & Miso fresh cookies; PB & Miso event price; Red Velvet Cheesecake fresh cookies; Red Velvet Cheesecake event price; Nutella Churro fresh cookies; Nutella Churro event price; Ube Coconut Crinkle fresh cookies; Ube Coconut Crinkle event price; Espresso Brownie fresh cookies; Espresso Brownie event price; Apple Pie fresh cookies; Apple Pie event price; number
- Reference images: screenshots/plan-baseline-1440.png; screenshots/plan-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## plan-review — Review opening

- Structure: Review opening
- Captured controls: Change opening; Open table
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/plan-review-baseline-1440.png; screenshots/plan-review-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## event-review — Review event

- Structure: Review event
- Captured controls: Event activity; Finalize sample event
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/event-review-baseline-1440.png; screenshots/event-review-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## bazaar-settings — Bazaar settings

- Structure: Bazaar settings → Selling display → Classic till
- Captured controls: Day quantities & prices; Save event settings; Open classic till
- Fields: text; number
- Reference images: screenshots/bazaar-settings-baseline-1440.png; screenshots/bazaar-settings-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## events — Bazaar events

- Structure: Bazaar events → Weekend market → Holiday pop-up
- Captured controls: Add event; Open event
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/events-baseline-1440.png; screenshots/events-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## event-edit — Add event

- Structure: Add event
- Captured controls: Back to events; Save event
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/event-edit-prepared-1440.png; screenshots/event-edit-prepared-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## event-tools — Add cookies

- Structure: Add cookies
- Captured controls: Back to selling; Review entry
- Fields: Flavour; number; date; text
- Reference images: screenshots/event-tools-baseline-1440.png; screenshots/event-tools-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## event-tool-review — Review add cookies

- Structure: Review add cookies
- Captured controls: Change entry; Record entry
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/event-tool-review-baseline-1440.png; screenshots/event-tool-review-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## device-recovery — Selling device

- Structure: Selling device
- Captured controls: Back to event; Prepare recovery details
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/device-recovery-baseline-1440.png; screenshots/device-recovery-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## classic-till — Classic till

- Structure: Classic till
- Captured controls: Use card till; −; +; Charge ₱0.00
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/classic-till-baseline-1440.png; screenshots/classic-till-baseline-390.png
- Existing source: src/components/live/bazaar/bazaar-live.tsx; src/components/live/bazaar/till.tsx; src/store/bazaar-days.ts
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.
