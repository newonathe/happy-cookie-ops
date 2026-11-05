# Home

**ACTUAL application.** [Back to home](README.md)

- Manifest id: `home/home`
- Source: `src/components/live/home/home-live.tsx`
- Role: owner
- Reference views: home

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/home/home/populated/p320.full.webp)

![Home populated p320](../../screenshots/home/home/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/home/home/populated/p390.full.webp)

![Home populated p390](../../screenshots/home/home/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/home/home/populated/t768.full.webp)

![Home populated t768](../../screenshots/home/home/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/home/home/populated/l1024.full.webp)

![Home populated l1024](../../screenshots/home/home/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/home/home/populated/d1440.full.webp)

![Home populated d1440](../../screenshots/home/home/populated/d1440.webp)

**w1920** 1920×1080

![Home populated w1920](../../screenshots/home/home/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/home/home/empty/p390.full.webp)

![Home empty p390](../../screenshots/home/home/empty/p390.webp)

**d1440** 1440×900

![Home empty d1440](../../screenshots/home/home/empty/d1440.webp)

## many

60 extra orders and 40 extra stock items. Group: data. Fixture: `data:many`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/home/home/many/p390.full.webp)

![Home many p390](../../screenshots/home/home/many/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/home/home/many/d1440.full.webp)

![Home many d1440](../../screenshots/home/home/many/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/home/home/long-text/p390.full.webp)

![Home long-text p390](../../screenshots/home/home/long-text/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/home/home/long-text/d1440.full.webp)

![Home long-text d1440](../../screenshots/home/home/long-text/d1440.webp)

## large-values

Prices and book amounts multiplied by 90. Group: data. Fixture: `data:large`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/home/home/large-values/p390.full.webp)

![Home large-values p390](../../screenshots/home/home/large-values/p390.webp)

**d1440** 1440×900

![Home large-values d1440](../../screenshots/home/home/large-values/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_staff_orders=never,get_books=never,get_stock_catalogue=never`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/home/home/loading/p390.full.webp)

![Home loading p390](../../screenshots/home/home/loading/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/home/home/loading/d1440.full.webp)

![Home loading d1440](../../screenshots/home/home/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_staff_orders=down,get_books=down,get_stock_catalogue=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `home/home/loading@p390`) · [full page](../../screenshots/home/home/loading/p390.full.webp)

![Home read-failure p390](../../screenshots/home/home/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `home/home/loading@d1440`) · [full page](../../screenshots/home/home/loading/d1440.full.webp)

![Home read-failure d1440](../../screenshots/home/home/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_staff_orders=malformed,get_books=malformed,get_stock_catalogue=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/home/home/malformed-answer/p390.full.webp)

![Home malformed-answer p390](../../screenshots/home/home/malformed-answer/p390.webp)

**d1440** 1440×900

![Home malformed-answer d1440](../../screenshots/home/home/malformed-answer/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/home/home/offline-after-load/p390.full.webp)

![Home offline-after-load p390](../../screenshots/home/home/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/home/home/offline-after-load/d1440.full.webp)

![Home offline-after-load d1440](../../screenshots/home/home/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Home focus-keyboard d1440](../../screenshots/home/home/focus-keyboard/d1440.webp)

## quick-add-open

Header Quick add panel. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/home/home/quick-add-open/p390.full.webp)

![Home quick-add-open p390](../../screenshots/home/home/quick-add-open/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/home/home/quick-add-open/t768.full.webp)

![Home quick-add-open t768](../../screenshots/home/home/quick-add-open/t768.webp)

**d1440** 1440×900 · [full page](../../screenshots/home/home/quick-add-open/d1440.full.webp)

![Home quick-add-open d1440](../../screenshots/home/home/quick-add-open/d1440.webp)

## shop-closed

Group: business. Fixture: `shop:closed`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/home/home/shop-closed/p390.full.webp)

![Home shop-closed p390](../../screenshots/home/home/shop-closed/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/home/home/shop-closed/d1440.full.webp)

![Home shop-closed d1440](../../screenshots/home/home/shop-closed/d1440.webp)

## hover-row

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Home hover-row d1440](../../screenshots/home/home/hover-row/d1440.webp)

## pressed-row

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900 (pixel-identical to `home/home/hover-row@d1440`)

![Home pressed-row d1440](../../screenshots/home/home/hover-row/d1440.webp)

## reduced-motion

Group: accessibility. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 (pixel-identical to `home/home/populated@p390`) · [full page](../../screenshots/home/home/populated/p390.full.webp)

![Home reduced-motion p390](../../screenshots/home/home/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `home/home/populated@d1440`) · [full page](../../screenshots/home/home/populated/d1440.full.webp)

![Home reduced-motion d1440](../../screenshots/home/home/populated/d1440.webp)

## reduced-transparency

Group: accessibility. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/home/home/reduced-transparency/p390.full.webp)

![Home reduced-transparency p390](../../screenshots/home/home/reduced-transparency/p390.webp)

**d1440** 1440×900 (pixel-identical to `home/home/populated@d1440`) · [full page](../../screenshots/home/home/populated/d1440.full.webp)

![Home reduced-transparency d1440](../../screenshots/home/home/populated/d1440.webp)

## height-constrained

Group: responsive. Fixture: `default`. How it was reached: ui-driven.

**land** 844×390 · [full page](../../screenshots/home/home/height-constrained/land.full.webp)

![Home height-constrained land](../../screenshots/home/home/height-constrained/land.webp)

**short** 1280×600 · [full page](../../screenshots/home/home/height-constrained/short.full.webp)

![Home height-constrained short](../../screenshots/home/home/height-constrained/short.webp)

## playwright-webkit

Playwright WebKit build on Windows. This is not Safari or an iPhone. Group: responsive. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/home/home/playwright-webkit/p390.full.webp)

![Home playwright-webkit p390](../../screenshots/home/home/playwright-webkit/p390.webp)
