# Order rules

**ACTUAL application.** [Back to shop](README.md)

- Manifest id: `shop/order-rules`
- Source: `src/components/live/order-rules-form.tsx`
- Role: owner
- Reference views: order-rules

## default

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/shop/order-rules/default/p390.full.webp)

![Order rules default p390](../../screenshots/shop/order-rules/default/p390.webp)

**t768** 768×1024

![Order rules default t768](../../screenshots/shop/order-rules/default/t768.webp)

**d1440** 1440×900 · [full page](../../screenshots/shop/order-rules/default/d1440.full.webp)

![Order rules default d1440](../../screenshots/shop/order-rules/default/d1440.webp)

## read-failure

The form does not open: the page falls back to the Shop hub, with no message on the page. Group: failure. Fixture: `fail:get_order_rules=down`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/shop/order-rules/read-failure/p390.full.webp)

![Order rules read-failure p390](../../screenshots/shop/order-rules/read-failure/p390.webp)

**d1440** 1440×900

![Order rules read-failure d1440](../../screenshots/shop/order-rules/read-failure/d1440.webp)

## save-conflict

Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/shop/order-rules/save-conflict/p390.full.webp)

![Order rules save-conflict p390](../../screenshots/shop/order-rules/save-conflict/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/shop/order-rules/save-conflict/d1440.full.webp)

![Order rules save-conflict d1440](../../screenshots/shop/order-rules/save-conflict/d1440.webp)
