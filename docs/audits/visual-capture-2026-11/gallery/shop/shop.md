# Shop

**ACTUAL application.** [Back to shop](README.md)

- Manifest id: `shop/shop`
- Source: `src/components/live/sell/shop-live.tsx`
- Role: owner
- Reference views: shop

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/shop/shop/populated/p320.full.webp)

![Shop populated p320](../../screenshots/shop/shop/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/shop/shop/populated/p390.full.webp)

![Shop populated p390](../../screenshots/shop/shop/populated/p390.webp)

**t768** 768×1024

![Shop populated t768](../../screenshots/shop/shop/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/shop/shop/populated/l1024.full.webp)

![Shop populated l1024](../../screenshots/shop/shop/populated/l1024.webp)

**d1440** 1440×900

![Shop populated d1440](../../screenshots/shop/shop/populated/d1440.webp)

**w1920** 1920×1080

![Shop populated w1920](../../screenshots/shop/shop/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/shop/shop/empty/p390.full.webp)

![Shop empty p390](../../screenshots/shop/shop/empty/p390.webp)

**d1440** 1440×900

![Shop empty d1440](../../screenshots/shop/shop/empty/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_shop_status=never`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `shop/shop/populated@p390`) · [full page](../../screenshots/shop/shop/populated/p390.full.webp)

![Shop loading p390](../../screenshots/shop/shop/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `shop/shop/populated@d1440`)

![Shop loading d1440](../../screenshots/shop/shop/populated/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_shop_status=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `shop/shop/populated@p390`) · [full page](../../screenshots/shop/shop/populated/p390.full.webp)

![Shop read-failure p390](../../screenshots/shop/shop/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `shop/shop/populated@d1440`)

![Shop read-failure d1440](../../screenshots/shop/shop/populated/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_shop_status=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `shop/shop/populated@p390`) · [full page](../../screenshots/shop/shop/populated/p390.full.webp)

![Shop malformed-answer p390](../../screenshots/shop/shop/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `shop/shop/populated@d1440`)

![Shop malformed-answer d1440](../../screenshots/shop/shop/populated/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/shop/shop/offline-after-load/p390.full.webp)

![Shop offline-after-load p390](../../screenshots/shop/shop/offline-after-load/p390.webp)

**d1440** 1440×900

![Shop offline-after-load d1440](../../screenshots/shop/shop/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Shop focus-keyboard d1440](../../screenshots/shop/shop/focus-keyboard/d1440.webp)

## closed-override

Group: business. Fixture: `shop:closed`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/shop/shop/closed-override/p390.full.webp)

![Shop closed-override p390](../../screenshots/shop/shop/closed-override/p390.webp)

**d1440** 1440×900

![Shop closed-override d1440](../../screenshots/shop/shop/closed-override/d1440.webp)
