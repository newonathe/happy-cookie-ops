# Claude handoff audit and performance follow-up — 4 November

Base reviewed: `d21d302` on `codex/refined-workflows`. The owner's complete application goal stays active.
This package is isolated at `C:/Users/ethan/dev/happy-cookie-perf-followup`, branch
`codex/render-performance-followup`. It has not been integrated into Claude's checkout or deployed.
The user was asked whether Claude has stopped because the saved state assigns it that checkout.
Do not overwrite simultaneous work or describe this package as already visible at localhost:3000.

## What the review establishes

- Claude implemented actual components/controllers for Products, recipe reading, Stock entries,
  Money entries, Sell/Shop/Account/settings and the owner's till. Protected port paths are unchanged.
- Its current source passes pinned `pnpm verify`: 181 files, 2,952 passing tests, two existing TODOs.
- `reference-v4/coverage.md` still lists missing/partial customer, recipe-edit, shopping-plan,
  Bazaar child and recovery flows. The page checklist's Done label means synthetic-preview evidence,
  not proof of all states, hosted behavior, physical-device operation or owner acceptance.
- This was a targeted follow-up review, not a claim that every large Claude commit has been audited.

## Confirmed defects and this package

1. RecipeReader discarded `notTracked` stock rows, then claimed stock covers the batch when none
   of the retained rows needed attention. Missing inventory and incompatible units therefore looked
   sufficient. It now includes every non-enough row, distinguishes unread inventory from a read empty
   list, explains incompatible units, and requires a positive whole batch size before claiming coverage.
2. Shared live display formatting rebuilt Intl configuration on every row/render. Date formatters now
   have a bounded 32-configuration cache, keyed by locale and sorted options, always using the business
   zone. It caches no date, record or formatted result. Quantity formatting reuses one number formatter.
   Quantities, rounding, signs, units, clock rules, money calculations and protected engine are unchanged.

Changed code: `lib/time/business-clock.ts`, `lib/stock/stock-status.ts`,
`components/live/recipes/recipe-reader.tsx`. Regression tests are in the existing clock and recipe-screen
test files; existing Stock formatting and recipe scaling suites also run.

## Performance evidence and limits

Private evidence root:
`C:/Users/ethan/.codex/visualizations/2026/10/23/01a168b8-98ab-7872-9ec3-90530179bab5/gap-refinement/`.

- CLI Chromium CPU profile: 30 repeated view rebuilds created 960 date formatters before this patch,
  zero after warm-up with this patch. That loop measured 762 ms before / 651 ms after on this machine.
- Verified-route sampling averaged 44.3 ms of view-data work before / 29.6 ms after, and navigation
  99.1 ms / 75.0 ms. These are developer-machine synthetic examples, not field INP or database latency.
  See `performance-verified-{before,after}.json`. Initial runs included two invalid destination keys;
  those keys were corrected and excluded from the final comparison.
- localhost:3000 is Next Webpack development mode. One warm document had a 136 ms TTFB but its
  development `main-app.js` took 8.7 seconds; fetched scripts/styles totalled several MB. Development
  compilation/transfer delays are a separate issue from a navigation's view-data CPU time.
- No signed-in hosted read latency or production bundle load was measured. The fresh 3000 browser
  reached sign-in. Do not attribute all reported slowness to this patch's confirmed formatting cost.
- Parent render still builds unused Stock and protected page projections; CPU samples remain dominated
  by protected amount/currency formatting. Do not edit the locked port or patch global Intl/Number.
  Audit projection dependencies before any lazy-view refactor; shared badges, overlays and permission
  modes need their existing fields. Avoid stale money/stock caches as a shortcut.

## Verification / where to inspect

- Focused suites: 67 tests in four files passed.
- Four CLI browser widths (320/390/768/1440): batch scaling, blank quantity, missing/unread inventory
  and Back to Products pass, with no horizontal overflow or page errors.
- Actual components + synthetic RPC: `http://localhost:4188/`. Existing 4186/3000 servers are preserved.
- Full follow-up `pnpm verify` passes: 181 files, 2,954 tests, two existing TODOs; context/port/engine,
  main and E2E typechecks and lint pass. See `performance-followup-full-verify.log` (exit 0).
- This package is saved locally on its isolated branch. No new build, SQL execution, push, merge or
  production release is claimed here. The primary checkout remains clean at d21d302.

Next: reconcile checkout ownership and review/apply only this package; measure the optimized actual
app and signed-in read waterfalls separately, then continue the reference coverage checklist.

## Optimized build measurement follow-up

The isolated decc2c4 live build passes (28 pages, 182.6 seconds locally), with middleware/Sentry
warnings and Edge-runtime warnings in Next internals. The launcher omits SENTRY_AUTH_TOKEN. The normal
standalone server is available at `http://localhost:3001/`; it is a frozen build, not an HMR preview.

Eight fresh-context CLI loads of the anonymous sign-in route at390/1440 have no page errors,
failed local assets or overflow. On390, development page loads were1.33–1.64s; optimized0.19–1.09s.
Transferred scripts were3,967,163bytes in development /213,039bytes optimized (decoded17.1MB/730KB).
These compare development d21d302 with optimized decc2c4; the small display-only patch does not
explain the development payload. Do not generalize this to signed-in data reads or a production phone.
Evidence: `optimized-source-build.log`, `optimized-source-measurements.json` and matching screenshots.

## Events directory follow-up

The active coverage checklist now advances the Events directory: shared PageTitle/Panel, compact
vertical rows and explicit Open event cues. Active selling facts, unread placeholders, filters,
management action, new-row feedback and callbacks remain. Cancel returns focus to Add an event.
The title is Bazaar events; the primary workspace navigation remains Bazaar.

Evidence: 51 focused hub/controller tests and 24 runtime tests pass. Final full `pnpm verify` passes
181files/2955tests+2existingTODOs (exit0), including port/engine, main/E2E typechecks and lint. The first
run found two assertions for the previous heading; they now require Bazaar events, with the selling
state checks unchanged. Sixteen CLI flows cover Events first, both tills, held facts, filters,
row focus/scroll, keyboard/browser Back and motion at320/390/768/1240. Four additional320/390/768/1440
checks capture settled empty/past layouts and Add/Cancel focus/filter retention. No business writes,
overflow or page errors. Logs/JSON/screenshots use `events-directory-*` and `directory-*` privately.
The refreshed live Webpack build also passes (28 static pages,85.1seconds; compiled40seconds), with
the existing middleware/Sentry warnings. The3001 server now uses this newer build; the recorded
mode-comparison measurements above remain the earlier decc2c4 sign-in samples.

Add event still uses the existing sheet. A page conversion was inspected but not retained: making
navigation available during saves first needs draft/request identity outside the component. Build
that retained controller and its identity/late-reply/uncertain-save tests before replacing the sheet;
do not merely keep the component's local UUID in a navigable page. The event-edit page and other
Bazaar coverage gaps remain. No event save rules, RPC or business records changed in this slice.
