# Phase 05 — Quality

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../../MASTER-PLAN.md), [docs/state/current.md](../../docs/state/current.md) or the [decision register](../../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

The app works and the books are safe. This phase is about the difference between software
that runs and software someone can rely on daily.

---

## T-15 — Accessibility pass

**Give it to** Claude Code · **Depends on** T-01 · ~1 session · **requires `HC_ALLOW_PORTED_EDITS=1`**

**Context** `eslint.config.mjs`, `src/components/screens/`, `src/components/sheets/`, `docs/PORTING.md`, `scripts/check-port-integrity.mjs`

> This is the **only** task that edits ported markup. It is allowed because it changes
> semantics and nothing else. Start it with `HC_ALLOW_PORTED_EDITS=1` in the environment.

### The prompt

> Tech-debt item 5. The ported markup carries two `jsx-a11y` exceptions because the
> prototype used `<div onClick>` in places and its own `<img>` tags. Remove the need for
> the exceptions.
>
> **The constraint is absolute: no visual change.** Not a pixel, not a padding, not a
> colour, not a word of copy. Semantics only.
>
> 1. Every `<div onClick>` or `<span onClick>` becomes a `<button type="button">` **with
>    the same style object**, plus `appearance: 'none'`, `background: 'none'`,
>    `border: 'none'`, `font: 'inherit'`, `textAlign: 'inherit'`, `padding: 0` — whatever
>    it takes to make a button render identically to the div it replaced. Add those to the
>    existing object; do not replace it.
> 2. Every `<img>` gets real `alt` text. A product photo gets the product name. A
>    decorative image gets `alt=""`. The logo gets "The Happy Cookie".
> 3. The toast gets `role="status"` and `aria-live="polite"`. It is how the app confirms
>    that money was recorded; a screen-reader user currently gets nothing.
> 4. Sheets get focus management: focus moves in on open, is trapped while open, returns
>    to the trigger on close, and Escape closes. Add it in `app-frame.tsx` where the sheet
>    layer already lives, so it applies to all 29 rather than being repeated.
> 5. Inputs get labels or `aria-label`. Icon-only buttons get `aria-label` describing the
>    action, not the icon: "Mark as ready", never "check".
> 6. Then delete the two exceptions from `eslint.config.mjs` and make `pnpm lint` pass.
>
> Proving no visual change is part of the task, not an afterthought:
> - screenshot `/`, `/bazaar` and `/orders` before you start;
> - screenshot them after;
> - show me both sets. If anything moved by a pixel, it is wrong.
>
> Then `node scripts/check-port-integrity.mjs --update` and commit the baseline **in the
> same commit**, with a message explaining that this is the accessibility pass. The
> baseline diff is what a reviewer will read to confirm no copy changed — it should show
> style-object counts unchanged or higher, and copy hashes unchanged.
>
> If a copy hash changes, you rewrote a string. Find it and put it back.

### Accept when

- Keyboard: every action reachable by Tab, activatable by Enter and Space.
- Screen reader: every control announces what it does.
- Before/after screenshots identical.
- Baseline copy hashes **unchanged**; style-object counts not lower.
- Both `jsx-a11y` exceptions gone, `pnpm lint` green.

### Stop if

- A copy hash changes and you cannot find why.
- Making something reachable requires moving it. Report it as a design question — it is
  one, and it belongs to the owner.

---

## T-16 — Two devices at once

**Give it to** Claude Code · **Depends on** T-11 · ~1 session

**Context** `src/components/app/offline-bridge.tsx`, `src/store/ops-runtime.tsx`, `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md` (realtime channels)

### The prompt

> When the owner and a helper both have the app open, an order marked ready on one phone
> should appear on the other within a second.
>
> 1. Supabase Realtime on `orders` and `bake_batches` **only**. The ledger is deliberately
>    not realtime — a subscription would push money to a helper's open socket, and money
>    reads on demand for that reason. Do not add channels beyond the two in
>    `docs/CONTRACTS.md`.
> 2. Reconcile into engine state **without clobbering a local edit in progress**. If the
>    owner is halfway through typing an order note and a remote change lands, the note
>    survives. State how you decided what "in progress" means.
> 3. **Never re-fire a toast for this device's own change.** The owner taps "mark ready",
>    sees one confirmation, and the echo from the server must be silent. Track the
>    originating device.
> 4. Handle the connection dropping: reconnect with backoff, and on reconnect do a full
>    reconcile rather than trusting that no events were missed. A missed event is
>    invisible, which is what makes it dangerous.
> 5. Subscribe only while the app is foregrounded. A phone in a pocket at a bazaar should
>    not hold a socket open all day.
>
> Test with two browser contexts: change on A, assert on B within a second; type in A,
> change on B, assert A's draft survived; kill the connection, change on B, restore, assert
> A caught up.

### Accept when

- Change on one device appears on the other within a second.
- A half-typed order survives an incoming change.
- No duplicate toast for a local change.
- Reconnect performs a full reconcile.

---

## T-17 — Error reporting: verify it, do not build it

**Give it to** Codex · **Depends on** T-16b (the DSN) · ~20 min

**Context** `docs/OBSERVABILITY.md` (**read first**), `src/lib/observability/scrub.ts`, `tests/unit/scrub.test.ts`, `instrumentation-client.ts`, `src/components/app/screen-boundary.tsx`

> **This is already built.** Sentry is wired across all three runtimes —
> `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — plus
> `onRequestError` in `instrumentation.ts` for server components and route handlers, which
> never reach a React error boundary. The scrubber is `src/lib/observability/scrub.ts`
> with tests in `tests/unit/scrub.test.ts`.
>
> Your job is to prove it works, not to replace it.
>
> 1. Read `docs/OBSERVABILITY.md` first. **Three of Sentry's own recommended defaults are
>    inverted on purpose** — `sendDefaultPii: false`, session replay off at any sample
>    rate, and reports tunnelled through the app's origin. Each is marked in the config
>    with the reason. Do not "fix" them back.
> 2. Throw deliberately from a screen component. Confirm **exactly one** report arrives.
> 3. Throw from a route handler. Confirm one report, and that it came through
>    `onRequestError` rather than silently 500ing.
> 4. Inspect both payloads. Assert that none of a fixture customer's name, mobile number,
>    order notes, sale contents or payment reference appears anywhere — including inside
>    an exception *message*, which is where they most often hide: a failed insert quotes
>    the offending row back at you.
> 5. Confirm the request URL is truncated at the `?`. The lookup route carries the order
>    number and phone in its query string, so the URL alone is the disclosure.
>
> **Do not:** add an error boundary, a second reporter, or a second scrubber. All three
> exist, and a duplicate boundary swallows the error twice so neither report is complete.
>
> If a report is missing something you genuinely needed to debug it, widen the allowlist in
> `scrub.ts` by **one key**, with a test. Never loosen the scrubber wholesale — it is
> deny-by-default because this is a small business's customer list, and under RA 10173 she
> is the controller of it.
>
> Report what you threw, what arrived, and what was scrubbed.

### Accept when

- One thrown error produces exactly one report, from each of the two paths.
- No fixture customer data survives anywhere in either payload.
- No new boundary, reporter or scrubber was added.
- The three inverted defaults are untouched.

---

## T-18 — Performance on the real device

**Give it to** Codex · **Depends on** T-11 · ~half session

**Context** `docs/ARCHITECTURE.md` (the rendering section), `next.config.ts`

### The prompt

> **Measure first. Report the numbers before proposing a single change.** The rendering
> section of `docs/ARCHITECTURE.md` explains why memoising was rejected during the port,
> and a change that contradicts a documented decision needs data, not intuition.
>
> 1. Lighthouse on `/` and `/shop`, mobile profile, throttled — the target device is a
>    mid-range Android phone on Philippine mobile data, not your laptop.
> 2. Report LCP, TBT, CLS and total transferred bytes for each route.
> 3. Measure the engine too: time `renderVals()` and one full re-render with the seeded
>    data. That is the number the architecture doc claims is under a frame. Confirm or
>    refute it.
> 4. Write the numbers into `docs/ARCHITECTURE.md` as a dated baseline. Without a baseline
>    every future performance discussion is opinion.
>
> Then, and only then, propose changes in priority order with the expected gain for each.
> Implement only what I approve. Do not memoise anything on the grounds that memoising is
> generally good — if the measurement does not justify it, the dependency-array bug
> surface across 53 files is a worse trade.

### Accept when

- Numbers for both routes recorded in `docs/ARCHITECTURE.md` with a date.
- The engine claim confirmed or refuted with a measurement.
- No optimisation merged that the numbers do not justify.

---

## T-19 — Backups and the pre-bazaar ritual

**Give it to** you · **Depends on** T-14 · 1 hour

**Context** `docs/DEPLOY.md`

Not an agent task. This is the hour that decides whether the migration was real.

1. Turn on Supabase backups. Confirm one exists, and **restore it into a scratch project**.
   An untested backup is a belief, not a backup.
2. Export the books from Settings. Store the file somewhere that is not the phone.
3. Walk the pre-bazaar checklist in `docs/DEPLOY.md` on the **owner's actual phone**:
   install from the home screen, aeroplane mode, one real test sale, restore signal,
   confirm the badge clears, void the test sale.
4. Write down everything that was wrong, confusing or slower than expected, and open a
   task for each. This is the highest-quality feedback the project will ever get.
