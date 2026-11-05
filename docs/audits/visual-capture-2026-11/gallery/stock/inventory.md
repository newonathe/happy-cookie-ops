# Inventory

**ACTUAL application.** [Back to stock](README.md)

- Manifest id: `stock/inventory`
- Source: `src/components/live/stock/inventory-live.tsx`
- Role: owner
- Reference views: stock

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/stock/inventory/populated/p320.full.webp)

![Inventory populated p320](../../screenshots/stock/inventory/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/stock/inventory/populated/p390.full.webp)

![Inventory populated p390](../../screenshots/stock/inventory/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/stock/inventory/populated/t768.full.webp)

![Inventory populated t768](../../screenshots/stock/inventory/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/stock/inventory/populated/l1024.full.webp)

![Inventory populated l1024](../../screenshots/stock/inventory/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/inventory/populated/d1440.full.webp)

![Inventory populated d1440](../../screenshots/stock/inventory/populated/d1440.webp)

**w1920** 1920×1080 · [full page](../../screenshots/stock/inventory/populated/w1920.full.webp)

![Inventory populated w1920](../../screenshots/stock/inventory/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/empty/p390.full.webp)

![Inventory empty p390](../../screenshots/stock/inventory/empty/p390.webp)

**d1440** 1440×900

![Inventory empty d1440](../../screenshots/stock/inventory/empty/d1440.webp)

## many

60 extra orders and 40 extra stock items. Group: data. Fixture: `data:many`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/many/p390.full.webp)

![Inventory many p390](../../screenshots/stock/inventory/many/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/inventory/many/d1440.full.webp)

![Inventory many d1440](../../screenshots/stock/inventory/many/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/long-text/p390.full.webp)

![Inventory long-text p390](../../screenshots/stock/inventory/long-text/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/inventory/long-text/d1440.full.webp)

![Inventory long-text d1440](../../screenshots/stock/inventory/long-text/d1440.webp)

## large-values

Prices and book amounts multiplied by 90. Group: data. Fixture: `data:large`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/large-values/p390.full.webp)

![Inventory large-values p390](../../screenshots/stock/inventory/large-values/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/inventory/large-values/d1440.full.webp)

![Inventory large-values d1440](../../screenshots/stock/inventory/large-values/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_stock_catalogue=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Inventory loading p390](../../screenshots/stock/inventory/loading/p390.webp)

**d1440** 1440×900

![Inventory loading d1440](../../screenshots/stock/inventory/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_stock_catalogue=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `stock/inventory/loading@p390`)

![Inventory read-failure p390](../../screenshots/stock/inventory/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `stock/inventory/loading@d1440`)

![Inventory read-failure d1440](../../screenshots/stock/inventory/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_stock_catalogue=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `stock/inventory/loading@p390`)

![Inventory malformed-answer p390](../../screenshots/stock/inventory/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `stock/inventory/loading@d1440`)

![Inventory malformed-answer d1440](../../screenshots/stock/inventory/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/offline-after-load/p390.full.webp)

![Inventory offline-after-load p390](../../screenshots/stock/inventory/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/inventory/offline-after-load/d1440.full.webp)

![Inventory offline-after-load d1440](../../screenshots/stock/inventory/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Inventory focus-keyboard d1440](../../screenshots/stock/inventory/focus-keyboard/d1440.webp)

## packaging-tab

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/packaging-tab/p390.full.webp)

![Inventory packaging-tab p390](../../screenshots/stock/inventory/packaging-tab/p390.webp)

**d1440** 1440×900

![Inventory packaging-tab d1440](../../screenshots/stock/inventory/packaging-tab/d1440.webp)

## dough-tab

Group: business. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/dough-tab/p390.full.webp)

![Inventory dough-tab p390](../../screenshots/stock/inventory/dough-tab/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/inventory/dough-tab/d1440.full.webp)

![Inventory dough-tab d1440](../../screenshots/stock/inventory/dough-tab/d1440.webp)

## baked-tab

Group: business. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/baked-tab/p390.full.webp)

![Inventory baked-tab p390](../../screenshots/stock/inventory/baked-tab/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/stock/inventory/baked-tab/d1440.full.webp)

![Inventory baked-tab d1440](../../screenshots/stock/inventory/baked-tab/d1440.webp)

## filter-low

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/stock/inventory/filter-low/p390.full.webp)

![Inventory filter-low p390](../../screenshots/stock/inventory/filter-low/p390.webp)

**d1440** 1440×900

![Inventory filter-low d1440](../../screenshots/stock/inventory/filter-low/d1440.webp)

## filter-out

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844

![Inventory filter-out p390](../../screenshots/stock/inventory/filter-out/p390.webp)

**d1440** 1440×900

![Inventory filter-out d1440](../../screenshots/stock/inventory/filter-out/d1440.webp)

## dough-tab-empty

Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Inventory dough-tab-empty p390](../../screenshots/stock/inventory/dough-tab-empty/p390.webp)

**d1440** 1440×900

![Inventory dough-tab-empty d1440](../../screenshots/stock/inventory/dough-tab-empty/d1440.webp)
