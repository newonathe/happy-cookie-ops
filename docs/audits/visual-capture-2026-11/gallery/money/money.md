# Money

**ACTUAL application.** [Back to money](README.md)

- Manifest id: `money/money`
- Source: `src/components/live/money/money-live.tsx`
- Role: owner
- Reference views: money

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/money/money/populated/p320.full.webp)

![Money populated p320](../../screenshots/money/money/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/money/money/populated/p390.full.webp)

![Money populated p390](../../screenshots/money/money/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/money/money/populated/t768.full.webp)

![Money populated t768](../../screenshots/money/money/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/money/money/populated/l1024.full.webp)

![Money populated l1024](../../screenshots/money/money/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/populated/d1440.full.webp)

![Money populated d1440](../../screenshots/money/money/populated/d1440.webp)

**w1920** 1920×1080 · [full page](../../screenshots/money/money/populated/w1920.full.webp)

![Money populated w1920](../../screenshots/money/money/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/money/money/empty/p390.full.webp)

![Money empty p390](../../screenshots/money/money/empty/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/empty/d1440.full.webp)

![Money empty d1440](../../screenshots/money/money/empty/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `money/money/populated@p390`) · [full page](../../screenshots/money/money/populated/p390.full.webp)

![Money long-text p390](../../screenshots/money/money/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `money/money/populated@d1440`) · [full page](../../screenshots/money/money/populated/d1440.full.webp)

![Money long-text d1440](../../screenshots/money/money/populated/d1440.webp)

## large-values

Prices and book amounts multiplied by 90. Group: data. Fixture: `data:large`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/money/money/large-values/p390.full.webp)

![Money large-values p390](../../screenshots/money/money/large-values/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/large-values/d1440.full.webp)

![Money large-values d1440](../../screenshots/money/money/large-values/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_books=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Money loading p390](../../screenshots/money/money/loading/p390.webp)

**d1440** 1440×900

![Money loading d1440](../../screenshots/money/money/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_books=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `money/money/loading@p390`)

![Money read-failure p390](../../screenshots/money/money/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `money/money/loading@d1440`)

![Money read-failure d1440](../../screenshots/money/money/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_books=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `money/money/loading@p390`)

![Money malformed-answer p390](../../screenshots/money/money/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `money/money/loading@d1440`)

![Money malformed-answer d1440](../../screenshots/money/money/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/money/money/offline-after-load/p390.full.webp)

![Money offline-after-load p390](../../screenshots/money/money/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/offline-after-load/d1440.full.webp)

![Money offline-after-load d1440](../../screenshots/money/money/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Money focus-keyboard d1440](../../screenshots/money/money/focus-keyboard/d1440.webp)

## last-7-days

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/money/money/last-7-days/p390.full.webp)

![Money last-7-days p390](../../screenshots/money/money/last-7-days/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/last-7-days/d1440.full.webp)

![Money last-7-days d1440](../../screenshots/money/money/last-7-days/d1440.webp)

## last-30-days

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 (pixel-identical to `money/money/populated@p390`) · [full page](../../screenshots/money/money/populated/p390.full.webp)

![Money last-30-days p390](../../screenshots/money/money/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `money/money/populated@d1440`) · [full page](../../screenshots/money/money/populated/d1440.full.webp)

![Money last-30-days d1440](../../screenshots/money/money/populated/d1440.webp)

## income-only

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/money/money/income-only/p390.full.webp)

![Money income-only p390](../../screenshots/money/money/income-only/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/income-only/d1440.full.webp)

![Money income-only d1440](../../screenshots/money/money/income-only/d1440.webp)

## expenses-only

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/money/money/expenses-only/p390.full.webp)

![Money expenses-only p390](../../screenshots/money/money/expenses-only/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/expenses-only/d1440.full.webp)

![Money expenses-only d1440](../../screenshots/money/money/expenses-only/d1440.webp)

## category-opened

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/money/money/category-opened/p390.full.webp)

![Money category-opened p390](../../screenshots/money/money/category-opened/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/money/money/category-opened/d1440.full.webp)

![Money category-opened d1440](../../screenshots/money/money/category-opened/d1440.webp)

## export-clicked

The browser download itself is not inspected. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900 · [full page](../../screenshots/money/money/export-clicked/d1440.full.webp)

![Money export-clicked d1440](../../screenshots/money/money/export-clicked/d1440.webp)

## reduced-transparency

Group: accessibility. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/money/money/reduced-transparency/p390.full.webp)

![Money reduced-transparency p390](../../screenshots/money/money/reduced-transparency/p390.webp)
