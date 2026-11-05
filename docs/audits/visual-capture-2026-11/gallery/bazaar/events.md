# Bazaar events

**ACTUAL application.** [Back to bazaar](README.md)

- Manifest id: `bazaar/events`
- Source: `src/components/live/bazaar/event-list.tsx`
- Role: owner
- Reference views: events

## populated

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p320** 320×700 · [full page](../../screenshots/bazaar/events/populated/p320.full.webp)

![Bazaar events populated p320](../../screenshots/bazaar/events/populated/p320.webp)

**p390** 390×844 · [full page](../../screenshots/bazaar/events/populated/p390.full.webp)

![Bazaar events populated p390](../../screenshots/bazaar/events/populated/p390.webp)

**t768** 768×1024

![Bazaar events populated t768](../../screenshots/bazaar/events/populated/t768.webp)

**l1024** 1024×768

![Bazaar events populated l1024](../../screenshots/bazaar/events/populated/l1024.webp)

**d1440** 1440×900

![Bazaar events populated d1440](../../screenshots/bazaar/events/populated/d1440.webp)

**w1920** 1920×1080

![Bazaar events populated w1920](../../screenshots/bazaar/events/populated/w1920.webp)

## empty

Simulated server answers with no records. Group: data. Fixture: `data:empty`. How it was reached: rpc-fixture.

**p390** 390×844

![Bazaar events empty p390](../../screenshots/bazaar/events/empty/p390.webp)

**d1440** 1440×900

![Bazaar events empty d1440](../../screenshots/bazaar/events/empty/d1440.webp)

## many

60 extra orders and 40 extra stock items. Group: data. Fixture: `data:many`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/bazaar/events/many/p390.full.webp)

![Bazaar events many p390](../../screenshots/bazaar/events/many/p390.webp)

**d1440** 1440×900

![Bazaar events many d1440](../../screenshots/bazaar/events/many/d1440.webp)

## long-text

Long customer, product and item names. Group: data. Fixture: `data:long`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/bazaar/events/long-text/p390.full.webp)

![Bazaar events long-text p390](../../screenshots/bazaar/events/long-text/p390.webp)

**d1440** 1440×900

![Bazaar events long-text d1440](../../screenshots/bazaar/events/long-text/d1440.webp)

## large-values

Prices and book amounts multiplied by 90. Group: data. Fixture: `data:large`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/bazaar/events/large-values/p390.full.webp)

![Bazaar events large-values p390](../../screenshots/bazaar/events/large-values/p390.webp)

**d1440** 1440×900

![Bazaar events large-values d1440](../../screenshots/bazaar/events/large-values/d1440.webp)

## loading

Reads never answer, so the loading treatment stays on screen. Group: failure. Fixture: `fail:get_scheduled_events=never`. How it was reached: rpc-fixture.

**p390** 390×844

![Bazaar events loading p390](../../screenshots/bazaar/events/loading/p390.webp)

**d1440** 1440×900

![Bazaar events loading d1440](../../screenshots/bazaar/events/loading/d1440.webp)

## read-failure

Reads answer with a connection error (08006). Group: failure. Fixture: `fail:get_scheduled_events=down`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `bazaar/events/loading@p390`)

![Bazaar events read-failure p390](../../screenshots/bazaar/events/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `bazaar/events/loading@d1440`)

![Bazaar events read-failure d1440](../../screenshots/bazaar/events/loading/d1440.webp)

## malformed-answer

Reads answer with a shape the parser refuses. Group: failure. Fixture: `fail:get_scheduled_events=malformed`. How it was reached: rpc-fixture.

**p390** 390×844 (pixel-identical to `bazaar/events/loading@p390`)

![Bazaar events malformed-answer p390](../../screenshots/bazaar/events/loading/p390.webp)

**d1440** 1440×900 (pixel-identical to `bazaar/events/loading@d1440`)

![Bazaar events malformed-answer d1440](../../screenshots/bazaar/events/loading/d1440.webp)

## offline-after-load

Browser goes offline after a populated load. Group: failure. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/bazaar/events/offline-after-load/p390.full.webp)

![Bazaar events offline-after-load p390](../../screenshots/bazaar/events/offline-after-load/p390.webp)

**d1440** 1440×900

![Bazaar events offline-after-load d1440](../../screenshots/bazaar/events/offline-after-load/d1440.webp)

## focus-keyboard

Five Tab presses from page start: what focus looks like. Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**d1440** 1440×900

![Bazaar events focus-keyboard d1440](../../screenshots/bazaar/events/focus-keyboard/d1440.webp)

## upcoming-open

Group: interaction. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 (pixel-identical to `bazaar/events/populated@p390`) · [full page](../../screenshots/bazaar/events/populated/p390.full.webp)

![Bazaar events upcoming-open p390](../../screenshots/bazaar/events/populated/p390.webp)

**d1440** 1440×900

![Bazaar events upcoming-open d1440](../../screenshots/bazaar/events/upcoming-open/d1440.webp)

## past-open

Group: data. Fixture: `default`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/bazaar/events/past-open/p390.full.webp)

![Bazaar events past-open p390](../../screenshots/bazaar/events/past-open/p390.webp)

**d1440** 1440×900

![Bazaar events past-open d1440](../../screenshots/bazaar/events/past-open/d1440.webp)

## active-event-held

Return to selling while a day is held on this device. Group: business. Fixture: `bazaar:planned`. How it was reached: ui-driven.

**p390** 390×844 · [full page](../../screenshots/bazaar/events/active-event-held/p390.full.webp)

![Bazaar events active-event-held p390](../../screenshots/bazaar/events/active-event-held/p390.webp)

**t768** 768×1024

![Bazaar events active-event-held t768](../../screenshots/bazaar/events/active-event-held/t768.webp)

**d1440** 1440×900

![Bazaar events active-event-held d1440](../../screenshots/bazaar/events/active-event-held/d1440.webp)

## detail-summary-loading

The active row reads its figures from get_bazaar; that read never answers. Group: failure. Fixture: `fail:get_bazaar=never`. How it was reached: rpc-fixture.

**p390** 390×844 · [full page](../../screenshots/bazaar/events/detail-summary-loading/p390.full.webp)

![Bazaar events detail-summary-loading p390](../../screenshots/bazaar/events/detail-summary-loading/p390.webp)

**d1440** 1440×900

![Bazaar events detail-summary-loading d1440](../../screenshots/bazaar/events/detail-summary-loading/d1440.webp)
