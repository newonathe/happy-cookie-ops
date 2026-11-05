# Products

**ACTUAL application.** [Back to make](README.md)

- Manifest id: `make/products`
- Source: `src/components/live/recipes/products-live.tsx`
- Role: owner
- Reference views: make

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/make/products/populated/p320.full.webp)

![Products populated p320](../../screenshots/make/products/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/make/products/populated/p390.full.webp)

![Products populated p390](../../screenshots/make/products/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/make/products/populated/t768.full.webp)

![Products populated t768](../../screenshots/make/products/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/make/products/populated/l1024.full.webp)

![Products populated l1024](../../screenshots/make/products/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/populated/d1440.full.webp)

![Products populated d1440](../../screenshots/make/products/populated/d1440.webp)

**w1920** 1920×1080 · [full page](../../screenshots/make/products/populated/w1920.full.webp)

![Products populated w1920](../../screenshots/make/products/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Products empty p390](../../screenshots/make/products/empty/p390.webp)

**d1440** 1440×900

![Products empty d1440](../../screenshots/make/products/empty/d1440.webp)

## many

60 extra orders and 40 extra stock items. Group: data. Fixture: `data:many`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/make/products/many/p390.full.webp)

![Products many p390](../../screenshots/make/products/many/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/many/d1440.full.webp)

![Products many d1440](../../screenshots/make/products/many/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `make/products/populated@p390`) · [full page](../../screenshots/make/products/populated/p390.full.webp)

![Products long-text p390](../../screenshots/make/products/populated/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/long-text/d1440.full.webp)

![Products long-text d1440](../../screenshots/make/products/long-text/d1440.webp)

## large-values

Prices and book amounts multiplied by 90. Group: data. Fixture: `data:large`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/make/products/large-values/p390.full.webp)

![Products large-values p390](../../screenshots/make/products/large-values/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/large-values/d1440.full.webp)

![Products large-values d1440](../../screenshots/make/products/large-values/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_flavours=never,get_recipes=never`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/make/products/loading/p390.full.webp)

![Products loading p390](../../screenshots/make/products/loading/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/loading/d1440.full.webp)

![Products loading d1440](../../screenshots/make/products/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_flavours=down,get_recipes=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `make/products/loading@p390`) · [full page](../../screenshots/make/products/loading/p390.full.webp)

![Products read-failure p390](../../screenshots/make/products/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `make/products/loading@d1440`) · [full page](../../screenshots/make/products/loading/d1440.full.webp)

![Products read-failure d1440](../../screenshots/make/products/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_flavours=malformed,get_recipes=malformed`. How it was reached: rpc-fixture.

**p390** 390×844

![Products malformed-answer p390](../../screenshots/make/products/malformed-answer/p390.webp)

**d1440** 1440×900

![Products malformed-answer d1440](../../screenshots/make/products/malformed-answer/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/make/products/offline-after-load/p390.full.webp)

![Products offline-after-load p390](../../screenshots/make/products/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/offline-after-load/d1440.full.webp)

![Products offline-after-load d1440](../../screenshots/make/products/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Products focus-keyboard d1440](../../screenshots/make/products/focus-keyboard/d1440.webp)

## filter-all

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/make/products/filter-all/p390.full.webp)

![Products filter-all p390](../../screenshots/make/products/filter-all/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/filter-all/d1440.full.webp)

![Products filter-all d1440](../../screenshots/make/products/filter-all/d1440.webp)

## filter-needs-recipe

Group: business. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/make/products/filter-needs-recipe/p390.full.webp)

![Products filter-needs-recipe p390](../../screenshots/make/products/filter-needs-recipe/p390.webp)

**d1440** 1440×900

![Products filter-needs-recipe d1440](../../screenshots/make/products/filter-needs-recipe/d1440.webp)

## taken-off-order-form

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/make/products/taken-off-order-form/p390.full.webp)

![Products taken-off-order-form p390](../../screenshots/make/products/taken-off-order-form/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/products/taken-off-order-form/d1440.full.webp)

![Products taken-off-order-form d1440](../../screenshots/make/products/taken-off-order-form/d1440.webp)
