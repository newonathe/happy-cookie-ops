# Payments reconciliation

**ACTUAL application.** [Back to sell](README.md)

- Manifest id: `sell/payments`
- Source: `src/components/live/sell/payments-live.tsx`
- Role: owner
- Reference views: payment-review

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/sell/payments/populated/p320.full.webp)

![Payments reconciliation populated p320](../../screenshots/sell/payments/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/sell/payments/populated/p390.full.webp)

![Payments reconciliation populated p390](../../screenshots/sell/payments/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/sell/payments/populated/t768.full.webp)

![Payments reconciliation populated t768](../../screenshots/sell/payments/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/sell/payments/populated/l1024.full.webp)

![Payments reconciliation populated l1024](../../screenshots/sell/payments/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/payments/populated/d1440.full.webp)

![Payments reconciliation populated d1440](../../screenshots/sell/payments/populated/d1440.webp)

**w1920** 1920×1080 · [full page](../../screenshots/sell/payments/populated/w1920.full.webp)

![Payments reconciliation populated w1920](../../screenshots/sell/payments/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Payments reconciliation empty p390](../../screenshots/sell/payments/empty/p390.webp)

**d1440** 1440×900

![Payments reconciliation empty d1440](../../screenshots/sell/payments/empty/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_staff_orders=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Payments reconciliation loading p390](../../screenshots/sell/payments/loading/p390.webp)

**d1440** 1440×900

![Payments reconciliation loading d1440](../../screenshots/sell/payments/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_staff_orders=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `sell/payments/loading@p390`)

![Payments reconciliation read-failure p390](../../screenshots/sell/payments/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `sell/payments/loading@d1440`)

![Payments reconciliation read-failure d1440](../../screenshots/sell/payments/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_staff_orders=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `sell/payments/loading@p390`)

![Payments reconciliation malformed-answer p390](../../screenshots/sell/payments/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `sell/payments/loading@d1440`)

![Payments reconciliation malformed-answer d1440](../../screenshots/sell/payments/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/payments/offline-after-load/p390.full.webp)

![Payments reconciliation offline-after-load p390](../../screenshots/sell/payments/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/payments/offline-after-load/d1440.full.webp)

![Payments reconciliation offline-after-load d1440](../../screenshots/sell/payments/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Payments reconciliation focus-keyboard d1440](../../screenshots/sell/payments/focus-keyboard/d1440.webp)

## all-ticked

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/payments/all-ticked/p390.full.webp)

![Payments reconciliation all-ticked p390](../../screenshots/sell/payments/all-ticked/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/payments/all-ticked/d1440.full.webp)

![Payments reconciliation all-ticked d1440](../../screenshots/sell/payments/all-ticked/d1440.webp)
