# Orders

**ACTUAL application.** [Back to sell](README.md)

- Manifest id: `sell/orders`
- Source: `src/components/live/sell/orders-live.tsx`
- Role: owner
- Reference views: sell

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/sell/orders/populated/p320.full.webp)

![Orders populated p320](../../screenshots/sell/orders/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/sell/orders/populated/p390.full.webp)

![Orders populated p390](../../screenshots/sell/orders/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/sell/orders/populated/t768.full.webp)

![Orders populated t768](../../screenshots/sell/orders/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/sell/orders/populated/l1024.full.webp)

![Orders populated l1024](../../screenshots/sell/orders/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/populated/d1440.full.webp)

![Orders populated d1440](../../screenshots/sell/orders/populated/d1440.webp)

**w1920** 1920×1080 · [full page](../../screenshots/sell/orders/populated/w1920.full.webp)

![Orders populated w1920](../../screenshots/sell/orders/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Orders empty p390](../../screenshots/sell/orders/empty/p390.webp)

**d1440** 1440×900

![Orders empty d1440](../../screenshots/sell/orders/empty/d1440.webp)

## many

60 extra orders and 40 extra stock items. Group: data. Fixture: `data:many`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/sell/orders/many/p390.full.webp)

![Orders many p390](../../screenshots/sell/orders/many/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/many/d1440.full.webp)

![Orders many d1440](../../screenshots/sell/orders/many/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/sell/orders/long-text/p390.full.webp)

![Orders long-text p390](../../screenshots/sell/orders/long-text/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/long-text/d1440.full.webp)

![Orders long-text d1440](../../screenshots/sell/orders/long-text/d1440.webp)

## large-values

Prices and book amounts multiplied by 90. Group: data. Fixture: `data:large`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/sell/orders/large-values/p390.full.webp)

![Orders large-values p390](../../screenshots/sell/orders/large-values/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/large-values/d1440.full.webp)

![Orders large-values d1440](../../screenshots/sell/orders/large-values/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_staff_orders=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Orders loading p390](../../screenshots/sell/orders/loading/p390.webp)

**d1440** 1440×900

![Orders loading d1440](../../screenshots/sell/orders/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_staff_orders=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `sell/orders/loading@p390`)

![Orders read-failure p390](../../screenshots/sell/orders/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `sell/orders/loading@d1440`)

![Orders read-failure d1440](../../screenshots/sell/orders/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_staff_orders=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `sell/orders/loading@p390`)

![Orders malformed-answer p390](../../screenshots/sell/orders/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `sell/orders/loading@d1440`)

![Orders malformed-answer d1440](../../screenshots/sell/orders/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/offline-after-load/p390.full.webp)

![Orders offline-after-load p390](../../screenshots/sell/orders/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/offline-after-load/d1440.full.webp)

![Orders offline-after-load d1440](../../screenshots/sell/orders/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Orders focus-keyboard d1440](../../screenshots/sell/orders/focus-keyboard/d1440.webp)

## one-order

Group: data. Fixture: `data:one`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/sell/orders/one-order/p390.full.webp)

![Orders one-order p390](../../screenshots/sell/orders/one-order/p390.webp)

**d1440** 1440×900

![Orders one-order d1440](../../screenshots/sell/orders/one-order/d1440.webp)

## filter-to-review

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/filter-to-review/p390.full.webp)

![Orders filter-to-review p390](../../screenshots/sell/orders/filter-to-review/p390.webp)

**d1440** 1440×900

![Orders filter-to-review d1440](../../screenshots/sell/orders/filter-to-review/d1440.webp)

## filter-paid

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/filter-paid/p390.full.webp)

![Orders filter-paid p390](../../screenshots/sell/orders/filter-paid/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/filter-paid/d1440.full.webp)

![Orders filter-paid d1440](../../screenshots/sell/orders/filter-paid/d1440.webp)

## filter-ready

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/filter-ready/p390.full.webp)

![Orders filter-ready p390](../../screenshots/sell/orders/filter-ready/p390.webp)

**d1440** 1440×900

![Orders filter-ready d1440](../../screenshots/sell/orders/filter-ready/d1440.webp)

## filter-closed

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/filter-closed/p390.full.webp)

![Orders filter-closed p390](../../screenshots/sell/orders/filter-closed/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/filter-closed/d1440.full.webp)

![Orders filter-closed d1440](../../screenshots/sell/orders/filter-closed/d1440.webp)

## search-result

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/search-result/p390.full.webp)

![Orders search-result p390](../../screenshots/sell/orders/search-result/p390.webp)

**d1440** 1440×900

![Orders search-result d1440](../../screenshots/sell/orders/search-result/d1440.webp)

## search-no-match

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/search-no-match/p390.full.webp)

![Orders search-no-match p390](../../screenshots/sell/orders/search-no-match/p390.webp)

**d1440** 1440×900

![Orders search-no-match d1440](../../screenshots/sell/orders/search-no-match/d1440.webp)

## mark-packed-pending

Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 (pixel-identical to `sell/orders/populated@p390`) · [full page](../../screenshots/sell/orders/populated/p390.full.webp)

![Orders mark-packed-pending p390](../../screenshots/sell/orders/populated/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/mark-packed-pending/d1440.full.webp)

![Orders mark-packed-pending d1440](../../screenshots/sell/orders/mark-packed-pending/d1440.webp)

## mark-packed-refused

Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/mark-packed-refused/p390.full.webp)

![Orders mark-packed-refused p390](../../screenshots/sell/orders/mark-packed-refused/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/mark-packed-refused/d1440.full.webp)

![Orders mark-packed-refused d1440](../../screenshots/sell/orders/mark-packed-refused/d1440.webp)

## mark-packed-offline

Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/mark-packed-offline/p390.full.webp)

![Orders mark-packed-offline p390](../../screenshots/sell/orders/mark-packed-offline/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/mark-packed-offline/d1440.full.webp)

![Orders mark-packed-offline d1440](../../screenshots/sell/orders/mark-packed-offline/d1440.webp)

## mark-packed-done

Group: business. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/sell/orders/mark-packed-done/p390.full.webp)

![Orders mark-packed-done p390](../../screenshots/sell/orders/mark-packed-done/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/sell/orders/mark-packed-done/d1440.full.webp)

![Orders mark-packed-done d1440](../../screenshots/sell/orders/mark-packed-done/d1440.webp)

## reduced-motion

Group: accessibility. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 (pixel-identical to `sell/orders/populated@p390`) · [full page](../../screenshots/sell/orders/populated/p390.full.webp)

![Orders reduced-motion p390](../../screenshots/sell/orders/populated/p390.webp)
