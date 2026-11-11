# Shop — supplied reference page contracts

Read ../reference-v4-page-contracts.md for source, capture method and proof limits. Actual-app parity remains incomplete.

## shop — Shop

- Structure: Shop → Shop status → Order rules → Boxes & add-ons → Payments, schedule & appearance → Payment methods → Opening schedule & drop → Shop details & messages → Customer preview
- Captured controls: Orders; Customers/Waitlist; Shop; Open; Preview shop
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/shop-baseline-1440.png; screenshots/shop-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## shop-status — Shop status

- Structure: Shop status
- Captured controls: Back to Shop
- Fields: Accept new orders
- Reference images: screenshots/shop-status-baseline-1440.png; screenshots/shop-status-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## order-rules — Order rules

- Structure: Order rules
- Captured controls: Back to Shop; Save order rules
- Fields: time; number; text
- Reference images: screenshots/order-rules-baseline-1440.png; screenshots/order-rules-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## boxes — Boxes & add-ons

- Structure: Boxes & add-ons → Sampler box → Box sizes → Add-ons → Gift message → Ribbon
- Captured controls: Add add-on; Remove; Add option; Back to Shop; Save boxes & add-ons
- Fields: Offer sampler box; checkbox; checkbox; checkbox; checkbox; checkbox; checkbox; checkbox; checkbox; checkbox; Box of 3; number; Box of 6; number; text; number; Offer this add-on; Customer chooses an option; text; number; Offer this add-on; Customer chooses an option; text; text
- Reference images: screenshots/boxes-baseline-1440.png; screenshots/boxes-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## payment-methods — Payment methods

- Structure: Payment methods → Wallet → Cash at pickup
- Captured controls: Add payment method; Edit payment method
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/payment-methods-baseline-1440.png; screenshots/payment-methods-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## payment-method-edit — Add payment method

- Structure: Add payment method
- Captured controls: Back to payment methods; Save payment method
- Fields: text; text; textarea; Show at checkout; hc-qr-file
- Reference images: screenshots/payment-method-edit-baseline-1440.png; screenshots/payment-method-edit-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## shop-text — Shop details & messages

- Structure: Shop details & messages
- Captured controls: Back to Shop; Save shop details
- Fields: text; textarea; textarea; textarea
- Reference images: screenshots/shop-text-baseline-1440.png; screenshots/shop-text-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## shop-schedule — Opening schedule & drop

- Structure: Opening schedule & drop
- Captured controls: Back to Shop; Save schedule
- Fields: Shop availability; datetime-local; datetime-local; number
- Reference images: screenshots/shop-schedule-baseline-1440.png; screenshots/shop-schedule-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## customer-shop — The Happy Cookie

- Structure: The Happy Cookie → Double Chocolate Fudge → Happy Camper → White Chocolate Biscoff → PB & Miso → Red Velvet Cheesecake → Nutella Churro → Sampler box
- Captured controls: Back to owner Shop; Add; Checkout
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/customer-shop-baseline-1440.png; screenshots/customer-shop-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## customer-checkout — Checkout

- Structure: Checkout
- Captured controls: Back to shop; Place preview order
- Fields: text; email; Payment method; Box; Add-on
- Reference images: screenshots/customer-checkout-baseline-1440.png; screenshots/customer-checkout-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## customer-status — Your order

- Structure: Your order
- Captured controls: View my order
- Fields: text
- Reference images: screenshots/customer-status-baseline-1440.png; screenshots/customer-status-baseline-390.png
- Existing source: src/components/live/order-extras-form.tsx; src/components/live/order-rules-form.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.
