# Production

**ACTUAL application.** [Back to make](README.md)

- Manifest id: `make/production`
- Source: `src/components/live/production/production-live.tsx`
- Role: owner
- Reference views: production

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/make/production/populated/p320.full.webp)

![Production populated p320](../../screenshots/make/production/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/make/production/populated/p390.full.webp)

![Production populated p390](../../screenshots/make/production/populated/p390.webp)

**t768** 768×1024 · [full page](../../screenshots/make/production/populated/t768.full.webp)

![Production populated t768](../../screenshots/make/production/populated/t768.webp)

**l1024** 1024×768 · [full page](../../screenshots/make/production/populated/l1024.full.webp)

![Production populated l1024](../../screenshots/make/production/populated/l1024.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/production/populated/d1440.full.webp)

![Production populated d1440](../../screenshots/make/production/populated/d1440.webp)

**w1920** 1920×1080 · [full page](../../screenshots/make/production/populated/w1920.full.webp)

![Production populated w1920](../../screenshots/make/production/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/make/production/empty/p390.full.webp)

![Production empty p390](../../screenshots/make/production/empty/p390.webp)

**d1440** 1440×900

![Production empty d1440](../../screenshots/make/production/empty/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/make/production/long-text/p390.full.webp)

![Production long-text p390](../../screenshots/make/production/long-text/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/production/long-text/d1440.full.webp)

![Production long-text d1440](../../screenshots/make/production/long-text/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_production=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Production loading p390](../../screenshots/make/production/loading/p390.webp)

**d1440** 1440×900

![Production loading d1440](../../screenshots/make/production/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_production=down`. How it was reached: rpc-fixture.

**p390** 390×844

![Production read-failure p390](../../screenshots/make/production/read-failure/p390.webp)

**d1440** 1440×900

![Production read-failure d1440](../../screenshots/make/production/read-failure/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_production=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `make/production/read-failure@p390`)

![Production malformed-answer p390](../../screenshots/make/production/read-failure/p390.webp)

**d1440** 1440×900 (pixel-identical to `make/production/read-failure@d1440`)

![Production malformed-answer d1440](../../screenshots/make/production/read-failure/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/make/production/offline-after-load/p390.full.webp)

![Production offline-after-load p390](../../screenshots/make/production/offline-after-load/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/production/offline-after-load/d1440.full.webp)

![Production offline-after-load d1440](../../screenshots/make/production/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Production focus-keyboard d1440](../../screenshots/make/production/focus-keyboard/d1440.webp)

## two-jobs-in-progress

Group: business. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/make/production/two-jobs-in-progress/p390.full.webp)

![Production two-jobs-in-progress p390](../../screenshots/make/production/two-jobs-in-progress/p390.webp)

**d1440** 1440×900 · [full page](../../screenshots/make/production/two-jobs-in-progress/d1440.full.webp)

![Production two-jobs-in-progress d1440](../../screenshots/make/production/two-jobs-in-progress/d1440.webp)

## reduced-motion

Group: accessibility. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 (pixel-identical to `make/production/populated@p390`) · [full page](../../screenshots/make/production/populated/p390.full.webp)

![Production reduced-motion p390](../../screenshots/make/production/populated/p390.webp)
