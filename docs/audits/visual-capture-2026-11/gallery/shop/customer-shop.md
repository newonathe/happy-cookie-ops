# Customer shop

**ACTUAL application.** [Back to shop](README.md)

- Manifest id: `shop/customer-shop`
- Source: `src/components/screens/shop.tsx`
- Role: public
- Reference views: customer-shop
- Drawn by an old ported screen, not the refined live interface.

## populated

Group: data. Fixture: `signed-out`. How it was reached: ui-driven.

**p320** 320×700

![Customer shop populated p320](../../screenshots/shop/customer-shop/populated/p320.webp)

**p390** 390×844

![Customer shop populated p390](../../screenshots/shop/customer-shop/populated/p390.webp)

**t768** 768×1024

![Customer shop populated t768](../../screenshots/shop/customer-shop/populated/t768.webp)

**l1024** 1024×768

![Customer shop populated l1024](../../screenshots/shop/customer-shop/populated/l1024.webp)

**d1440** 1440×900

![Customer shop populated d1440](../../screenshots/shop/customer-shop/populated/d1440.webp)

**w1920** 1920×1080

![Customer shop populated w1920](../../screenshots/shop/customer-shop/populated/w1920.webp)

## empty-menu

Group: data. Fixture: `data:empty;signed-out`. How it was reached: rpc-fixture.

**p390** 390×844

![Customer shop empty-menu p390](../../screenshots/shop/customer-shop/empty-menu/p390.webp)

**d1440** 1440×900

![Customer shop empty-menu d1440](../../screenshots/shop/customer-shop/empty-menu/d1440.webp)

## long-text

Group: data. Fixture: `data:long;signed-out`. How it was reached: rpc-fixture.

**p390** 390×844

![Customer shop long-text p390](../../screenshots/shop/customer-shop/long-text/p390.webp)

**d1440** 1440×900

![Customer shop long-text d1440](../../screenshots/shop/customer-shop/long-text/d1440.webp)

## quantities-added

Group: interaction. Fixture: `signed-out`. How it was reached: ui-driven.

**p390** 390×844

![Customer shop quantities-added p390](../../screenshots/shop/customer-shop/quantities-added/p390.webp)

**t768** 768×1024

![Customer shop quantities-added t768](../../screenshots/shop/customer-shop/quantities-added/t768.webp)

**d1440** 1440×900

![Customer shop quantities-added d1440](../../screenshots/shop/customer-shop/quantities-added/d1440.webp)

## shop-closed

Group: business. Fixture: `shop:closed;signed-out`. How it was reached: ui-driven.

**p390** 390×844

![Customer shop shop-closed p390](../../screenshots/shop/customer-shop/shop-closed/p390.webp)

**d1440** 1440×900

![Customer shop shop-closed d1440](../../screenshots/shop/customer-shop/shop-closed/d1440.webp)

## read-failure

Group: failure. Fixture: `signed-out;fail:shop_products=down,get_shop_status=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `shop/customer-shop/empty-menu@p390`)

![Customer shop read-failure p390](../../screenshots/shop/customer-shop/empty-menu/p390.webp)

**d1440** 1440×900 (pixel-identical to `shop/customer-shop/empty-menu@d1440`)

![Customer shop read-failure d1440](../../screenshots/shop/customer-shop/empty-menu/d1440.webp)

## waiting-list

Group: interaction. Fixture: `signed-out`. How it was reached: ui-driven.

**p390** 390×844

![Customer shop waiting-list p390](../../screenshots/shop/customer-shop/waiting-list/p390.webp)

**d1440** 1440×900

![Customer shop waiting-list d1440](../../screenshots/shop/customer-shop/waiting-list/d1440.webp)
