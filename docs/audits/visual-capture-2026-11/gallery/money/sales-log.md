# Sales

**ACTUAL application.** [Back to money](README.md)

- Manifest id: `money/sales-log`
- Source: `src/components/live/money/sales-live.tsx`
- Role: owner
- Reference views: none (found in code)

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700

![Sales populated p320](../../screenshots/money/sales-log/populated/p320.webp)

**p390** 390×844

![Sales populated p390](../../screenshots/money/sales-log/populated/p390.webp)

**t768** 768×1024

![Sales populated t768](../../screenshots/money/sales-log/populated/t768.webp)

**l1024** 1024×768

![Sales populated l1024](../../screenshots/money/sales-log/populated/l1024.webp)

**d1440** 1440×900

![Sales populated d1440](../../screenshots/money/sales-log/populated/d1440.webp)

**w1920** 1920×1080

![Sales populated w1920](../../screenshots/money/sales-log/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Sales empty p390](../../screenshots/money/sales-log/empty/p390.webp)

**d1440** 1440×900

![Sales empty d1440](../../screenshots/money/sales-log/empty/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_books=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Sales loading p390](../../screenshots/money/sales-log/loading/p390.webp)

**d1440** 1440×900

![Sales loading d1440](../../screenshots/money/sales-log/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_books=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `money/sales-log/loading@p390`)

![Sales read-failure p390](../../screenshots/money/sales-log/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `money/sales-log/loading@d1440`)

![Sales read-failure d1440](../../screenshots/money/sales-log/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_books=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `money/sales-log/loading@p390`)

![Sales malformed-answer p390](../../screenshots/money/sales-log/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `money/sales-log/loading@d1440`)

![Sales malformed-answer d1440](../../screenshots/money/sales-log/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844

![Sales offline-after-load p390](../../screenshots/money/sales-log/offline-after-load/p390.webp)

**d1440** 1440×900

![Sales offline-after-load d1440](../../screenshots/money/sales-log/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Sales focus-keyboard d1440](../../screenshots/money/sales-log/focus-keyboard/d1440.webp)
