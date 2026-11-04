# Sell — supplied reference page contracts

Read ../reference-v4-page-contracts.md for source, capture method and proof limits. Actual-app parity remains incomplete.

## sell — Orders

- Structure: Orders → To prepare → Order #104 · Customer A → Payments & other orders → Order #105 · Customer B → Order #106 · Customer C
- Captured controls: Settings; Orders; Customers/Waitlist; Shop; Open order; Review payment; View details
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/sell-baseline-1440.png; screenshots/sell-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## order — Order #104

- Structure: Order #104 → Order actions
- Captured controls: Mark packed; Item unavailable; Cancel order; Record refund; Customer details
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/order-baseline-1440.png; screenshots/order-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## customers — Customers/Waitlist

- Structure: Customers/Waitlist → Customers → Customer A → Customer B → Customer C → Waitlist → Customer C
- Captured controls: Settings; Orders; Customers/Waitlist; Shop; Open customer
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/customers-baseline-1440.png; screenshots/customers-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## payment-review — Review payment

- Structure: Review payment
- Captured controls: Does not match; Confirm payment received
- Fields: text; checkbox; textarea
- Reference images: screenshots/payment-review-baseline-1440.png; screenshots/payment-review-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## order-action —

- Structure:
- Captured controls: Keep current order; Confirm
- Fields: textarea
- Reference images: screenshots/order-action-baseline-1440.png; screenshots/order-action-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## customer-detail — Customer A

- Structure: Customer A → Order history → Order #104
- Captured controls: Prepare message; Export customer record; Remove contact details; View order
- Fields: No separate field metadata; inspect the prepared capture/DOM.
- Reference images: screenshots/customer-detail-baseline-1440.png; screenshots/customer-detail-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## customer-message — Prepare message

- Structure: Prepare message
- Captured controls: Back to customer; Copy message
- Fields: textarea
- Reference images: screenshots/customer-message-baseline-1440.png; screenshots/customer-message-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.

## contact-remove — Remove contact details

- Structure: Remove contact details
- Captured controls: Keep details; Remove contact details
- Fields: checkbox
- Reference images: screenshots/contact-remove-baseline-1440.png; screenshots/contact-remove-baseline-390.png
- Existing source: src/store/ops-runtime.tsx
- Status: Reference captured; complete actual-app flow/state parity remains to be verified. Baseline/prepared route captured. Save/cancel/back/validation/error interaction coverage is incomplete.
