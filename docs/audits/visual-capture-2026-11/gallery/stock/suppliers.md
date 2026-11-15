# Suppliers

**ACTUAL application.** [Back to stock](README.md)

- Manifest id: `stock/suppliers`
- Source: `src/components/live/stock/suppliers-live.tsx`
- Role: owner
- Reference views: suppliers

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/stock/suppliers/populated/p320.full.webp)

![Suppliers populated p320](../../screenshots/stock/suppliers/populated/p320.webp)

**p390** 390×844

![Suppliers populated p390](../../screenshots/stock/suppliers/populated/p390.webp)

**t768** 768×1024

![Suppliers populated t768](../../screenshots/stock/suppliers/populated/t768.webp)

**l1024** 1024×768

![Suppliers populated l1024](../../screenshots/stock/suppliers/populated/l1024.webp)

**d1440** 1440×900

![Suppliers populated d1440](../../screenshots/stock/suppliers/populated/d1440.webp)

**w1920** 1920×1080

![Suppliers populated w1920](../../screenshots/stock/suppliers/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Suppliers empty p390](../../screenshots/stock/suppliers/empty/p390.webp)

**d1440** 1440×900

![Suppliers empty d1440](../../screenshots/stock/suppliers/empty/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844

![Suppliers long-text p390](../../screenshots/stock/suppliers/long-text/p390.webp)

**d1440** 1440×900

![Suppliers long-text d1440](../../screenshots/stock/suppliers/long-text/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_stock_catalogue=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Suppliers loading p390](../../screenshots/stock/suppliers/loading/p390.webp)

**d1440** 1440×900

![Suppliers loading d1440](../../screenshots/stock/suppliers/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_stock_catalogue=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `stock/suppliers/loading@p390`)

![Suppliers read-failure p390](../../screenshots/stock/suppliers/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `stock/suppliers/loading@d1440`)

![Suppliers read-failure d1440](../../screenshots/stock/suppliers/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_stock_catalogue=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `stock/suppliers/loading@p390`)

![Suppliers malformed-answer p390](../../screenshots/stock/suppliers/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `stock/suppliers/loading@d1440`)

![Suppliers malformed-answer d1440](../../screenshots/stock/suppliers/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844

![Suppliers offline-after-load p390](../../screenshots/stock/suppliers/offline-after-load/p390.webp)

**d1440** 1440×900

![Suppliers offline-after-load d1440](../../screenshots/stock/suppliers/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Suppliers focus-keyboard d1440](../../screenshots/stock/suppliers/focus-keyboard/d1440.webp)

## inactive-shown

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844

![Suppliers inactive-shown p390](../../screenshots/stock/suppliers/inactive-shown/p390.webp)

**d1440** 1440×900

![Suppliers inactive-shown d1440](../../screenshots/stock/suppliers/inactive-shown/d1440.webp)
