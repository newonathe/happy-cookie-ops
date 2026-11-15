# Account

**ACTUAL application.** [Back to account](README.md)

- Manifest id: `account/account`
- Source: `src/components/live/account/account-live.tsx`
- Role: owner
- Reference views: account

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/account/account/populated/p320.full.webp)

![Account populated p320](../../screenshots/account/account/populated/p320.webp)

**p390** 390×844

![Account populated p390](../../screenshots/account/account/populated/p390.webp)

**t768** 768×1024

![Account populated t768](../../screenshots/account/account/populated/t768.webp)

**l1024** 1024×768

![Account populated l1024](../../screenshots/account/account/populated/l1024.webp)

**d1440** 1440×900

![Account populated d1440](../../screenshots/account/account/populated/d1440.webp)

**w1920** 1920×1080

![Account populated w1920](../../screenshots/account/account/populated/w1920.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_settings=never`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `account/account/populated@p390`)

![Account loading p390](../../screenshots/account/account/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `account/account/populated@d1440`)

![Account loading d1440](../../screenshots/account/account/populated/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_settings=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `account/account/populated@p390`)

![Account read-failure p390](../../screenshots/account/account/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `account/account/populated@d1440`)

![Account read-failure d1440](../../screenshots/account/account/populated/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_settings=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `account/account/populated@p390`)

![Account malformed-answer p390](../../screenshots/account/account/populated/p390.webp)

**d1440** 1440×900 (pixel-identical to `account/account/populated@d1440`)

![Account malformed-answer d1440](../../screenshots/account/account/populated/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844

![Account offline-after-load p390](../../screenshots/account/account/offline-after-load/p390.webp)

**d1440** 1440×900

![Account offline-after-load d1440](../../screenshots/account/account/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Account focus-keyboard d1440](../../screenshots/account/account/focus-keyboard/d1440.webp)
