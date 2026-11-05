# Shopping

**ACTUAL application.** [Back to stock](README.md)

- Manifest id: `stock/shopping`
- Source: `src/components/live/stock/grocery-live.tsx`
- Role: owner
- Reference views: shopping

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/stock/shopping/populated/p320.full.webp)

![Shopping populated p320](../../screenshots/stock/shopping/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/stock/shopping/populated/p390.full.webp)

![Shopping populated p390](../../screenshots/stock/shopping/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/stock/shopping/populated/t768.full.webp)

![Shopping populated t768](../../screenshots/stock/shopping/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/stock/shopping/populated/l1024.full.webp)

![Shopping populated l1024](../../screenshots/stock/shopping/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/shopping/populated/d1440.full.webp)

![Shopping populated d1440](../../screenshots/stock/shopping/populated/d1440.webp)

**w1920** 1920×1080 · [full page](../../screenshots/stock/shopping/populated/w1920.full.webp)

![Shopping populated w1920](../../screenshots/stock/shopping/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Shopping empty p390](../../screenshots/stock/shopping/empty/p390.webp)

**d1440** 1440×900

![Shopping empty d1440](../../screenshots/stock/shopping/empty/d1440.webp)

## many

60 extra orders and 40 extra stock items. Group: data. Fixture: `data:many`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/stock/shopping/many/p390.full.webp)

![Shopping many p390](../../screenshots/stock/shopping/many/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/shopping/many/d1440.full.webp)

![Shopping many d1440](../../screenshots/stock/shopping/many/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `stock/shopping/populated@p390`) · [full page](../../screenshots/stock/shopping/populated/p390.full.webp)

![Shopping long-text p390](../../screenshots/stock/shopping/populated/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/shopping/long-text/d1440.full.webp)

![Shopping long-text d1440](../../screenshots/stock/shopping/long-text/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_stock_catalogue=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Shopping loading p390](../../screenshots/stock/shopping/loading/p390.webp)

**d1440** 1440×900

![Shopping loading d1440](../../screenshots/stock/shopping/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_stock_catalogue=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `stock/shopping/loading@p390`)

![Shopping read-failure p390](../../screenshots/stock/shopping/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `stock/shopping/loading@d1440`)

![Shopping read-failure d1440](../../screenshots/stock/shopping/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_stock_catalogue=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `stock/shopping/loading@p390`)

![Shopping malformed-answer p390](../../screenshots/stock/shopping/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `stock/shopping/loading@d1440`)

![Shopping malformed-answer d1440](../../screenshots/stock/shopping/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/stock/shopping/offline-after-load/p390.full.webp)

![Shopping offline-after-load p390](../../screenshots/stock/shopping/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/shopping/offline-after-load/d1440.full.webp)

![Shopping offline-after-load d1440](../../screenshots/stock/shopping/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Shopping focus-keyboard d1440](../../screenshots/stock/shopping/focus-keyboard/d1440.webp)

## receive-from-shopping

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844

![Shopping receive-from-shopping p390](../../screenshots/stock/shopping/receive-from-shopping/p390.webp)

**d1440** 1440×900

![Shopping receive-from-shopping d1440](../../screenshots/stock/shopping/receive-from-shopping/d1440.webp)

## compare-from-shopping

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/stock/shopping/compare-from-shopping/p390.full.webp)

![Shopping compare-from-shopping p390](../../screenshots/stock/shopping/compare-from-shopping/p390.webp)

**d1440** 1440×900

![Shopping compare-from-shopping d1440](../../screenshots/stock/shopping/compare-from-shopping/d1440.webp)
