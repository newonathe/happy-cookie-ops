# Bazaar v2: design, flow and motion, in 10 slices

Approved by Ethan on 15 October 2026 (plan mode). Each slice below is its own `/goal` in a new conversation; the goal blocks are at the end.

## Context

Ethan's review of the live bazaar screens gave 13 points:

- The screens are bland and unsectioned, and give the eye no guidance.
- They need too much typing.
- The till traps the owner once a day starts.
- "Add an event" shows every booking as an editable list.
- Decimals are inconsistent.
- Errors do not point at the field.
- Cost is asked per event instead of coming from the flavour.
- There is no picture-led layout.

He wants it planned as separate slices, each with its own plan; researched thoroughly, with animation and transitions; built fast; and done before the 24–25 October bazaar. His earlier choices:

- everything before the bazaar;
- a big Bazaar card on Home;
- a typed cost per flavour, set in the recipe book;
- designs approved before code.

## Revision after the Ateneo audit (15 October, later): read this first

**Ethan's decisions on the audit (15 October):** keep migration 70 before the bazaar (the cost is edited in the recipe book; closing takes a split for leftover cookies); reverse the Ateneo test in the books before the bazaar, through a reviewed owner-only reversal in the same migration, run on the trial only after he says "yes, reverse Ateneo"; leave the public history as it is. Where the text below says "after 26 Oct" for U6, these decisions win.

Ethan ran a test bazaar on the trial, "Ateneo" (19 to 24 Oct, rent ₱20,000.00, target ₱30,000.00). Days 19 and 21 were
run on 15 Oct and the event was closed. It was audited read-only from the trial database (every figure recomputed from
the raw rows). The bazaar screens were then replayed locally at 375 and 1440 px, with the same shape: two days, sales,
a loss, an early close.

**What checked out.** Sales, voids, freebies and discounts add up. Cash expected = float + cash sales. Each flavour
balances: made + carried = sold + given + lost + left + not accounted. The carry-over reached the next day. Clerk names
and payment methods are right, and nothing was double-counted.

### Findings

| #   | Finding (evidence)                                                                                                                                                                                                                                                                   | Severity     | Fix and slice                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Ending an event early strands the carried-over cookies.** Day 21 carried 43 forward and the event was closed; they were costed as "Not accounted", never went back to the shop, and no screen asked. Designed ("a cookie set aside to carry over that never arrived"), but silent. | High         | U4: "Close the event" warns and names them. After 26 Oct (U6): the close takes a final split, to the shop or written off.                         |
| A2  | **A day can be started on any date.** "Mon 19 Oct" was started on Thu 15 Oct. Its sales are dated 15 Oct in the books while the day says 19 Oct, and the rent is booked on 19 Oct. `start_bazaar_day` has no date rule.                                                              | Medium       | U4: starting a day that is not today asks "This day is Mon 19 Oct; today is Thu 15 Oct. Start anyway?" (the rehearsal needs "anyway").            |
| A3  | **No check on a large drawer difference.** Day 19 had ₱0.00 expected and ₱1,000.00 typed, booked without a question.                                                                                                                                                                 | Medium       | U5: an over or short above the larger of ₱100.00 and 10 % of expected asks to count again.                                                        |
| A4  | **The drawer difference is booked as a sale.** The ₱1,000.00 over is a `sale` ledger line in "Bazaar" ("drawer over"), so the books show ₱1,510.00 of bazaar sales against ₱510.00 sold.                                                                                             | Medium       | After 26 Oct (U6): book over and short in their own category. Until then, A3 stops a typo from becoming revenue.                                  |
| A5  | **The event closes with cost pending**, and the books then keep no cookie cost. The confirmation says "Type one under Cost per cookie on the event page" while you are on that page.                                                                                                 | Medium       | U4: the confirmation lists the flavours without a cost, each with its cost field inline; "Close without cost" is explicit.                        |
| A6  | **The test is in the real books.** Ateneo is closed: ₱20,000.00 rent (dated 19 Oct), ₱1,000.00 over, ₱510.00 of sales and the stock use of 50 cookies (as shortfalls) now count in October. Nothing can reverse a closed event.                                                      | High (books) | **Ethan decides:** add reversing entries through a reviewed one-off script before 24 Oct, or leave them and note them. Rehearsal events add more. |
| A7  | **Every bazaar close records "no packaging rule" for bazaar sales** (a shortfall line per close). Recipes already include the pouch and sticker per cookie.                                                                                                                          | Low          | After 26 Oct: a "no packaging per sale" rule for the Bazaar channel, or skip the line when there is no rule.                                      |
| B1  | **Flavours never put on the table show as "Sold out" on the till** (0 made), mixed in with real sell-outs.                                                                                                                                                                           | Medium       | U2: tiles that were never on the table are not drawn; real sell-outs are hidden with "Show sold out (n)".                                         |
| B2  | **Two places to enter a cost:** the till's "Event expenses · Add" (`event_expenses`, cannot be removed) and the event page's "Fees" (`bazaar_fees`, removable). The rent goes to a third place.                                                                                      | Medium       | U2: the till's Add opens the live fee form for that day (one list, removable). The old till expense is no longer offered.                         |
| B3  | Closed and past events stay in the list with no status. "Add an event" sits at the bottom.                                                                                                                                                                                           | Medium       | U3 (as planned), plus a status pill on every row.                                                                                                 |
| B4  | A closed day's card shows its plan ("20 cookies on the table · Float ₱100") instead of what happened.                                                                                                                                                                                | Medium       | U4: a closed day shows sold, revenue, left, carried and over or short, and opens the review.                                                      |
| B5  | The plan lists all 26 flavours, menu and off-menu, each as a full card.                                                                                                                                                                                                              | Medium       | U4: menu flavours first as tiles; the rest under "More flavours".                                                                                 |
| B6  | Toasts and the floating + cover form buttons at both widths. Dates show as 10/14/2026 (US). Small numbers get full-width boxes on desktop.                                                                                                                                           | Low          | U1 layout rules; U3 dates as "Wed, 14 Oct"; steppers for counts.                                                                                  |

### Correcting an earlier premise (costs)

All 7 menu flavours already have a **complete recipe cost** on the trial, and 22 of the 23 recipes are complete (read 15 October; the figures stay out of this public repository). Ateneo's profit used them.

Ethan's choice "she types a cost per flavour" rested on the statement that most recipes could not be costed, and that
statement was wrong. So the cost is already pre-filled from the recipe. Point 9 is met **without a migration**:

- show that cost with a receipt-style breakdown from `get_recipe_costs` lines, on the event page (U4) and in the recipe
  book (U7);
- a per-flavour typed override comes after 26 Oct (U6).

### Debating the plan against the evidence

- _Is "everything before the bazaar" still safe?_ Only if no database change ships before 26 Oct and the locked till is
  touched only through runtime values. **Revised:** there are no migrations before the bazaar. U6 moves after 26 Oct
  with A1, A4 and the cost override. U7 becomes interface-only (read and breakdown).
- _Do bug fixes come before polish?_ They did not. **Revised:** each slice does its findings (A–B) first and then the
  visual work, so a slipped slice still ships the fixes.
- _Is the plan too big for six days?_ Ten slices become eight before the bazaar:
  - D0, U1, U2, U3, U5, U4, U7 (lite), U9;
  - U6 after 26 Oct;
  - U8 only on "approve PESO".
- _What can only the phone prove?_ Safari offline and iOS storage. The rehearsal stays, on the final build.
- _What else is a hidden risk?_ Test events in the real books (A6). Every rehearsal and test adds rows that cannot be
  reversed, so a reversal tool (after 26 Oct) or the one-off script (Ethan's choice) is needed before real reporting.

## Audit: what the code and the screens show (15 Oct)

- **Two design languages.**
  - The ported prototype screens have a strong system:
    - Home: huge numerals ("78 of 200"), an "Open" status pill, a progress bar, an accent left-border "Prepare" card, round flavour photo chips, a dark primary button with an arrow;
    - till: photo tiles with a "– 0 +" stepper;
    - close-out: a bottom sheet with a 2×2 stat grid and a "Count the cash box" inset.
  - The 9 live bazaar files (`src/components/live/bazaar/`, about 4,100 lines with the other live files) use none of it. Every card has equal weight, labels sit stacked on full-width inputs, there are no photos or status pills, and figures are plain text.
- **Hard-coded styles.** 134 hex literals (21 distinct) and 268 inline `style={{}}` objects in `src/components/live`, including `form-styles.ts`, instead of the `@theme` tokens in `src/app/globals.css`.
  - The tokens cover colour, radius, shadow and motion (`--ease-out-quint`, `--ease-pop`, `rise`, `sheet`, `fade`, `pop`, screen-slide `hcScr*`, a global reduced-motion rule), but have no spacing or duration scale.
  - Shared UI is only `pressable.tsx` and `sub-tabs.tsx`.
- **Behaviour gaps** (found by reading the code):
  - The till takes over `/bazaar` whenever `v.event` is set (`bazaar-live.tsx:32`). Leaving is refused (`ops-runtime.tsx:1087`) and the tab strip is hidden (`:5399`), yet nothing actually ends the event on navigation.
  - "Add an event" opens `scheduled-events-form.tsx` with every booking as a row.
  - Sold-out tiles stay on the till (`ops-engine.js:3072`).
  - Add stock lives only in the review.
  - The close form starts blank.
  - Errors are one `role=alert` line at the bottom of the form; no field gets `aria-invalid`.
  - Money uses four helpers: the engine's `PESO` (0 decimals, locked), `pesoText` in `src/lib/bazaar/plan.ts:16`, a local `pesoText` in `ops-runtime.tsx:659`, and `formatPesos` in `src/lib/stock/stock-status.ts:81` (2 decimals).
  - Cost comes from `get_recipe_costs` (8 of 72 ingredients priced) or a per-event typed cost.
- **Usability seen in the screenshots** (phone, 375 px):
  - the floating + button and toasts cover form buttons;
  - long event names wrap into heavy cards;
  - counts are typed into full-width boxes;
  - the review's "Selling" is plain text;
  - the screen has no clear first thing to look at.
- **Platform.** React 19.2.8 / Next 16.3.8. `<ViewTransition>` is stable only from React 19.3 and Next's flag is experimental. Navigation here is `history.replaceState`, not the router. No motion library is installed. A performance budget exists (C8).

## Research → rules applied in every slice

1. **Hierarchy, inverted pyramid:** status and the one number that matters on top, the explanation in the middle, detail last. One primary action per screen, and progressive disclosure for the rest. On a phone, a card shows one headline figure, with the breakdown on tap. (NN/g progressive disclosure; dashboard-density guidance.)
2. **Speak the prototype's language:** big numerals, status pills, progress bars, accent cards, photo tiles, steppers, bottom sheets. It is already the approved visual system, so new UI looks native.
3. **POS tiles:** a photo grid flowing left to right; sold-out hidden from the selling grid, with a one-tap "show sold out"; counts as badges; disabled states explain why. (Roller and Shopify POS tile docs; Shopify merchants asking for sold-out items to be hidden.)
4. **Forms:**
   - pre-fill the dominant answer (facts, never decisions);
   - steppers instead of typing for small counts;
   - one column on phones, numeric keypad for numbers;
   - validate on blur;
   - on submit: an error summary at the top ("There is a problem"), linking to each field, with focus moved there;
   - an inline message under each bad field, linked with `aria-describedby`, plus a red border and `aria-invalid`;
   - each message says what is wrong and how to fix it.
     (GOV.UK error summary and error message; WCAG 2.2 3.3.1 and 3.3.3.)
5. **Motion:**
   - animate only `transform` and `opacity` (web.dev);
   - durations 150–400 ms: enter on an emphasized decelerate curve, exit faster on an accelerate curve (Material 3 tokens: enter `cubic-bezier(0.05,0.7,0.1,1)` 300–400 ms, exit `cubic-bezier(0.3,0,0.8,0.15)` 150–200 ms, standard `cubic-bezier(0.2,0,0,1)`);
   - motion is purposeful and never the only signal (Apple HIG);
   - every animation turns off under `prefers-reduced-motion` (the existing global rule);
   - library-free: CSS keyframes plus `@starting-style` for entry, `document.startViewTransition` behind feature detection for in-screen state swaps, and the frame's existing `hcScr*` slides for screens. No Framer or Motion package (budget, offline bundle).
6. **Process: spec-driven vertical slices.**
   - Each slice is one `/goal`, whose block is the spec. Tokens and components come first; each component has a Storybook story; each slice ends with browser-pane QA at 375 px and 1440 px, axe, and the tests.
   - Two Sonnet builders at most, one writer per file. The interface track runs beside the database track.
   - Opus signs off. Different-model review for money, SQL and offline.
     (Spec Kit and OpenSpec-style "spec, plan, tasks" kept small per slice.)

## Slices, order and dates

```
D0 ─▶ U1 ─┬▶ U2 ─┬▶ U3 ─┐
          │      └▶ U5 ─┼▶ U4 ─▶ U9 ─▶ release ─▶ rehearsal
          └▶ U6 (DB) ───┴▶ U7 ─┘        U8 (needs yes) joins before U9
```

| Slice | What                                                                                                         | Points        | Date (Oct) | Cut if late?                      |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------------- | ---------- | --------------------------------- |
| D0    | Design spec, motion spec, mockups artifact; approval                                                         | 7, 10, 13     | 15–16      | no                                |
| U1    | Design system: tokens, components, motion utilities, stories                                                 | 7, 8, 12, 13  | 16         | no                                |
| U2    | Till freedom: leave and come back, Home card, sold-out hidden, Add cookies                                   | 1, 4, 5       | 17         | no                                |
| U6    | Migration 70: cost per flavour, leftover split at close (A1), drawer category (A4), test-event reversal (A6) | 9             | 17–18      | yes → after 26 (not the reversal) |
| U3    | Events hub: Active pinned, Upcoming and Past, Add top right, single form                                     | 2, 3          | 18         | no                                |
| U5    | Review and close: live stat tiles, pre-filled close, receipt                                                 | 6             | 18         | no                                |
| U4    | Event page and day plan: tile grid, steppers, timeline, red fields                                           | 9, 10, 11, 12 | 19         | no                                |
| U7    | Recipe book tiles, the cost receipt and the cost edit (needs U6)                                             | 9, 11         | 19–20      | yes → after 26                    |
| U8    | Two decimals in the ported screens (protected exception)                                                     | 8             | 20         | yes (needs Ethan's yes)           |
| U9    | Motion pass, full QA, release                                                                                | 13            | 21         | no                                |
| —     | Phone rehearsal → fixes → `RELEASE_HOLD=true`                                                                | —             | 22–23      | rehearsal by 22 Oct at the latest |

## Slice plans

### D0: design spec and mockups (Opus; about 1 session)

- **Output:**
  - `docs/design/bazaar-v2.md`: the rules above, a component list, a motion table (element, trigger, property, duration, curve), screen anatomy;
  - an artifact page of mockups at 375 px and 1440 px, built only from `@theme` tokens: Home card; events hub; add-event sheet; event page; plan tile grid; till frame with Home and Add cookies; review stat tiles and pre-filled close; recipe book and cost receipt; error states; motion demos.
- **Gate:** Ethan approves or marks changes. The approved page is the spec for U1–U9.

### U1: design system foundations (Sonnet; interface track; no behaviour change)

- **Tokens:** add a spacing scale (4/8/12/16/24/32), a type scale (display, title, body, caption), motion durations (`--dur-fast 150ms`, `--dur-base 250ms`, `--dur-slow 400ms`) and the M3 enter, exit and standard curves to `@theme`. No new hex.
- **Components** in `src/components/ui/`, each with a story and a unit test:
  - layout and content: `Card` (plain, accent, inset), `SectionHeader` (title, count, action), `StatTile` (big numeral, label, delta, tap to open), `StatusPill` (Open, Planned, Selling, Closed, Past), `ProgressBar`, `EmptyState`, `Skeleton`, `Banner`;
  - controls: `Button` (primary, dark, secondary, danger, icon, with press scale), `FilterChips`, `Stepper` (– n +, long-press repeat, numeric keypad);
  - selling and money: `FlavourTile` (photo via `src/lib/media/resolve-image.ts`, name, price, count badge, sold-out state), `ReceiptTable` (lines, subtotal, total, two decimals);
  - forms and sheets: `Field`/`SelectField` (label, hint, inline error, `aria-invalid`, red border), `ErrorSummary` (focus, links), `Sheet` (bottom on phone, side or centre on desktop).
- **Money:** one helper `src/lib/money/format.ts` (`peso(centavosOrPesos)` → `₱1,234.00`) with tests. Replace `pesoText` in `src/lib/bazaar/plan.ts` and `ops-runtime.tsx:659`, and the per-cookie formatting in `src/lib/bazaar/review.ts`.
- **Motion utilities** (`src/components/ui/motion.css` or `globals.css`):
  - entry and exit classes using `@starting-style`;
  - list enter and leave;
  - a `useViewTransition(fn)` hook (feature-detected, reduced motion respected);
  - a number count-up for stat tiles (the prototype already counts up).
- Replace the hex values in `src/components/live/form-styles.ts` with tokens.
- **Accept:** Storybook builds; `pnpm verify`; port integrity unchanged.

### U2: till freedom (Sonnet; interface plus runtime; the offline rules apply)

- Add `liveBazaar.leaveTill = () => this.go('today')` (`ops-runtime.tsx`) and a "Home" button above the till in `bazaar-live.tsx`. Owner only, hidden when `!bazaar.online` (A2).
- `liveScreenVals` adds `till: {name, sales, back}`; `live-screen-host.tsx` draws the Home Bazaar card and, on other screens, a "Back to the till" banner. Widen `src/view-models/vals.ts`.
  - The Home card with no day open shows the active or next event: name, dates, a status pill, Open.
- `renderVals`, live only: filter `bzSell` to `!soldOut || inCart>0`, with a "Show sold out (n)" chip. When everything is gone, `allGone` gives an empty state with Add cookies.
- **Add cookies:** export `StockForm` from `day-review.tsx`; add `BazaarDays.addHeldStock` in `src/store/bazaar-days.ts`, reusing `addStock` and the `'stock:'+dayId` pending key.
- **Motion:** a sold-out tile scales and fades out (200 ms), and comes back after a void; the banner slides down on entry.
- **Accept:** smoke steps for leaving the till and coming back, a sold-out tile hidden then back after a void, and Add cookies. Offline: Bazaar only (unchanged). Different-model review (offline).

### U3: events hub (Sonnet; interface)

- `event-list.tsx` becomes:
  - a header "Bazaar" with **Add an event** top right (dark button);
  - **Active**, pinned (a started day, or today within its dates): a large accent card with today's stats;
  - **Upcoming** and **Past** behind `FilterChips`, as compact rows with a status pill and dates.
- **Add an event:** a new single-event `Sheet` (`src/components/live/bazaar/event-form.tsx`) with name, place, dates (a range picker), rent, and pre-filled defaults. It saves through the existing `save_scheduled_event` data path used by `live-form-host.tsx`. Editing happens on the event page.
- The "Bazaar events" sub-tab (`src/lib/nav/function-map.ts:65`) points at this hub.
- **Motion:** the sheet rises (`--animate-sheet`); a new event card enters with a rise and highlight; chip switches cross-fade through the view-transition hook.

#### U3 as built (15 October; branch `claude/bazaar-v2-u3`, cut from `-u2`)

Interface only, no migration. Files: `event-list.tsx` (the hub), `event-form.tsx` (the sheet), and the pure `src/lib/bazaar/hub.ts` and `event-form.ts`; `bazaar-days.ts` gained `readHub` and `addEvent`; `dayRange` sits beside `dayText`.

- **Where a booking is drawn** (`hubPlace`): Active when a day of it is open or started, or today is inside its dates; Upcoming when it is still ahead; Past once it has ended or been closed. A switched-off booking is not listed.
- **The list cannot say "closed", and `started` is no help.** `get_scheduled_events` returns only `active` and `started`, and `started` belongs to the old one-tap start: the Ateneo test (days started, closed, dates still ahead) says `started: false`. So every switched-on booking that is not over is read once with `get_bazaar` when the hub opens (one parallel read each; none offline; the last answer stays while a new one is out): a day open gives **Selling**; a closed event goes under Past as **Closed** (or **Cost pending** when the booked profit was unknown); days started and none open is under way (**Today**, or **Planned** if its dates are ahead); nothing started is placed by its dates. Until the read comes, or if it fails or there is no signal, a row is placed by its dates and claims nothing more (a placeholder pill; an Active card says "so it may already be closed"). A booking that is over is Past with no read. Active cards show today's takings and cookies sold only from a read, never a ₱0.00 for an unknown.
- **Add an event** (top right, dark): a single-event `Sheet`: name, place, first and last day (the last follows the first), stall rent (commas accepted). Nothing pre-filled that is a decision. Errors as rule 7 (summary with links, red fields, validated on blur and submit). It sends `save_scheduled_event` with no stamp and the sheet's own id, kept until it closes; whatever the answer, the bookings are read again, and an event that is now listed counts as saved. On success the sheet closes, the chip returns to Upcoming and the new row carries the ring. Disabled with its reason while offline or before the events are read.
- **Sub-tab:** "Bazaar events" now opens the hub (`openBazaarEvents`: reset, go to Bazaar, read the bookings) and is the entry the strip marks there (the strip is drawn only while no event is on the phone). `function-map.ts` gives it `screen: 'bazaar'`, as "Backups & export" shares System health.
- **Editing stays reachable:** until U4 puts editing on the event page, the hub ends with a quiet "Edit or switch off events" that opens the old multi-row form (`liveBazaar.add`).
- **Dates** in the hub are `dayRange` ("Sat, 24 Oct – Sun, 25 Oct"); Home's next-event card uses it too. `dateRange` (US order) stays for the event page, which U4 rebuilds.
- **Known, left for U4:** Home's next-event card (`nextEvent`, U2) still uses `upcomingEvents`, which filters on `started`. That flag is never set by bazaar days, so a closed event whose dates are still ahead (the Ateneo test) can show on Home as the next event. The hub does not have this flaw; Home should take its next event from the same read (`hubPlace`) or from the hub's list.
- **Reduced motion:** the new row's ring is shown still for 1 s and then dropped (`useRing`), as the D0 table says; the global rule would otherwise cut the fade to nothing.
- Tests: `bazaar-hub.test.ts` (rules, validator against `scheduledEventError`), `bazaar-hub-store.test.ts`, `bazaar-hub-screen.test.tsx`; a smoke step adds an event through the sheet and reads the row back.

#### U5 as built (16 October; branch `claude/bazaar-v2-u3`)

Interface only, no migration. Rules are pure and tested first (`src/lib/bazaar/review.ts`: `closeRowOf`, `drawerCheck`,
`centsToPesosText`, `dayReportOf`; `tests/unit/bazaar-close-u5.test.ts`); screens are `close-form.tsx`, `day-tiles.tsx`,
`day-report.tsx` and `day-review.tsx`. Commits `3d816a8` (rules) and `739b4d2` (screens).

- **Cash counted is pre-filled with the cash expected** (Ethan, 16 Oct, asked directly: this follows the goal text and
  replaces D0 section 7's blank field with "It matches"). The field follows the expected cash until she changes it; clearing it
  sends "not counted"; "It matches" puts the expected cash back. The known cost: an untouched field books the drawer as exact,
  and Ateneo A3 fires only once she edits it (a ₱99,999 entry still blocks the close until she keeps it).
  `cashExpectedCents` and `cashExpectedPesos` are on the view.
- **Pre-filled close:** Left = what should be left (never below 0). The rest sits in one field that follows Left and the
  other fields she typed: carried over (not the last day), else the shop (flavour has a recipe), else written off. With the
  recipes not read yet (`hasRecipe: null`, from the runtime's `recipeRows`) the last day suggests nothing and says so. The
  server's rule is a row in `public.recipes` (`rule:fin-shop-no-recipe`, at "Close the event"). What is sent is what the
  steppers show; a split that does not add up says so under the row and the close refuses it in words.
- **Ateneo A3:** a drawer difference strictly above the larger of ₱100.00 and a tenth of expected (compared in whole
  centavos, the tenth not rounded) shows "That is ₱x over. Count the drawer again?" with Count again and Keep. Keep is for
  that amount and that expected cash: a re-read that moves the expected cash asks again. Enter cannot bypass it.
- **Tiles:** revenue, cash, fees, sold, left (should be left while open), lost; each opens to its parts; a pill
  (Selling, then Closed); the tiles settle once when a day closes while the review is open. `StatTile` numerals step down
  earlier so two-decimal pesos fit a phone tile; `ReceiptTable` gained `totalLabel`.
- **Z-report** (closed day): Takings, How it was paid, Fees and Drawer as receipts whose lines add up to the database's own
  totals (tested), then Sold, Given, Lost by flavour as counts (pesos per flavour cannot be reconciled with revenue).
- **Review (Opus, different model):** two real findings, both fixed (rounded tenth; Keep not tied to the expected cash).
  Everything else held: pesos round trip, blank count, totals, no unknown shown as ₱0.
- **Left as drawn before, for U4/U9:** the per-flavour list is cards, not a compact table; the close is inline, not a sheet;
  the "Day closed." toast overlaps the bottom of a long review (U1 layout rule, U9).
- **Checks:** `pnpm verify` 136 files, 2462 tests; the live smoke passes 16 steps (day 1 closes with the defaults and nothing
  typed or tapped, a ₱99,999 difference blocks the close, day 2 types a written-off count and the shop's share follows);
  screenshots at 375 and 1440 px (`SMOKE_SHOTS=<dir>`); and the browser pane at both widths on the paused smoke
  (`SMOKE_PAUSE_FILE=<file>` holds the run at day 2's open review and writes the address and sign-in there; delete the file
  to go on): no sideways scroll, no clipped numeral, the count-again banner and its focus. Not run: Docker visual, a phone.

#### U4 as built (16 October; branch `claude/bazaar-v2-u4`, cut from `-u3` at `c846d17`)

Interface only, no migration. Rules first and tested (`src/lib/bazaar/plan.ts`: `validatePlan`, `planTotals`, `menuFirst`;
`forms.ts`: fee, loss, cost and target validators; `event-rules.ts`: A1, A2, A5, B4 and the primary action; `tests/unit/bazaar-u4.test.ts`),
then the store and contract (`bazaar-days.ts`, `live-bazaar-types.ts`), then the screens: `event-page.tsx`, `day-plan.tsx`,
`close-event-sheet.tsx`, `start-day-sheet.tsx`, the loss form in `day-review.tsx`, and the hook `use-issues.ts`.

- **Red fields:** every validator returns `{field, message}[]` keyed by the input's id. A form shows the summary and the red
  fields on submit (focus moves to the summary; each line focuses its input), checks one field on blur, and clears its red as
  she types. The summary line and the field say the same words. The stepper gained `id` and `error`. A new rule: a flavour
  with cookies and a price of 0 is refused. A press on a button of the form skips the blur check (`formProps`): the
  message used to push the button down between press and release, and the click was lost (found in the smoke).
- **Event page:** hero with status pill, one primary button by state (review a selling day, else start the first planned day,
  else plan the next date, else Close the event), a stat row (revenue, profit or "Cost pending", cookies sold, profit against the
  target), a days timeline, the fees as a `ReceiptTable` with Remove, the target, the cost per cookie as a receipt per flavour.
  Dates are `Sat, 24 Oct` (`dayRange`) on the event page, the plan and the review (B6).
- **Day plan:** photo tiles with steppers for made and carried, the menu's flavours first and the rest under "More flavours (n)",
  prices from the menu (editable; the menu price is shown when changed), a float stepper in ₱100 steps that starts from the day
  before's float, and a sticky footer ("50 cookies · ₱6,050.00 at full sale"). Totals are whole centavos. The footer stands
  above the phone dock and stops short of the floating button; the runtime lifts the toast above it (`liveToastVals`, a value
  only; the locked frame is untouched). Event pages reserve 96 px at the bottom.
- **Ateneo:** A1, "Close the event" is a sheet that asks where stranded carried cookies go (to the shop with a recipe, written
  off without; nothing suggested while the recipes are unread; the two steppers always add up). A5, flavours with cookies and
  no cost per cookie get an inline cost field in the same sheet, with "Close without cost" as the explicit alternative.
  The store saves each typed cost, reads the event again, re-checks, and closes against the fresh hash with `p_final`.
  **A1 and A5 need migration 70** (`finalise_bazaar(p_final)`, `save_flavour_cost`): local only until U9, so on the trial (69) a
  stranded close and the flavour-cost save are refused. A2, a day that is not today asks ("Start anyway"); the rule is in
  the store (`start(confirmed)`), so any caller is held to it, and the rent clause appears only when this start books it. B4, a
  closed day shows sold, revenue, left, carried and the drawer. B5, menu flavours first.
- **Cost receipt:** `get_recipe_costs` has only aggregates (ingredients and packaging per cookie, and the total), so the receipt
  shows those, only when they are the cost this event is using; if the recipe has changed since, a note says what it costs
  today. No per-line amounts are worked out in the app. The per-event typed cost form stays beside it.
- **Home's next-event card** takes its event from the hub's read (`nextEvent` uses `hubList`; the hub is read when the bookings
  load), so a closed event whose dates are ahead is no longer offered.
- **Left:** the hub's "Edit or switch off events" fallback stays (editing an event is not on its page yet); the add-stock form
  and the close form keep their older error text; the per-flavour review list is still cards; "The event" figures list repeats
  the stat row (the smoke reads it). The Docker visual run and a phone were not run.
- **Checks:** `pnpm verify` green; the live smoke passes 16 steps, on a touch context (empty plan points at its stepper, a bad cost and an empty fee
  are red, day 2 starts from day 1's float and carry, starting tomorrow asks and holds until confirmed, a tap on Add the fee straight from a bad Amount submits, closing the event asks, and with day 1's cookies set aside and day 2 only planned the real summary's `stranded` names them: A1 against migration 70, not a fixture);
  screenshots at 375 and 1440 px (`SMOKE_SHOTS`); the browser pane at 375 px on the paused smoke
  (`SMOKE_PAUSE_EVENT_FILE` with `SMOKE_PAUSE_EVENT_AT=closed|planned`): the red cost field with its summary and focus, no
  sideways scroll. **Review (Opus, read-only, 16 Oct): safe to merge; three mediums fixed.** (1) Closing after a typed cost closed on the fresh hash,
  which would also take in a late sale or a changed stranded count: it now refuses with the stale message unless sales, takings, fees
  and stranded cookies are unchanged. (2) The not-today check was worked out when the page was drawn: it is now also worked out in
  `start`. (3) A second tap could pass the busy check while the till's figures were awaited: busy is set first. Held, with hand-worked
  numbers: the split always adds up; 38.44 x 15 = 57,660 centavos; "12.5" is 1250 and "28.7525" is 2875.25 centavos; commas and limits match
  the database. **Decided by Ethan, 16 Oct: keep it as built.** The cost typed in the close sheet is the FLAVOUR's (design 5.10), and in migration 70 it wins
  over the recipe's for every other bazaar, open or later; the per-event cost (`saveBazaarCost`) would touch only this event.
  Left as is: when the recipes are unread she may send a flavour to the shop that has none, and the database refuses with a general message

#### U7 as built (16 October; branch `claude/bazaar-v2-u7`, cut from `-u4` at `49dab2c`)

Interface only, no migration (it uses U6's `save_flavour_cost` and `get_flavour_costs`, local until U9). Rules first and tested
(`src/lib/recipes/book.ts`; `tests/unit/recipe-book.test.ts`), then the store (`src/store/recipe-book.ts`, `RecipeBook`, wired into
`OpsRuntime` as `liveRecipes`), then the screens (`src/components/live/recipes/`, registered for the key `recipes`).

- **Cost and margin:** a flavour's cost is hers for the flavour when she typed one, else the complete recipe's, else "Cost pending"
  (a recipe with a missing item is never shown as a cookie's cost). Margin is (price - cost) / price, `ok` at or above 65 % and `warn`
  below, compared before rounding (64.99 % reads 64.9 %, never "65%"). The 65 % is a constant (`MARGIN_FLOOR_PERCENT`) until B7 makes it
  a setting; nothing in the repo held it before. A tile shows a mark and a word as well as colour.
- **Book:** `FlavourTile` grid (the tile gained `meta` and `photoName`), search, `FilterChips` On the menu (n) / All (n). The costs are read
  when the book opens (`refresh`, a stable function: a new one per render made the book read in a loop, found in the first smoke run).
- **Flavour page:** photo hero, price, cost, margin with what a cookie keeps, the cost field (starts at her cost or the recipe's, Save waits
  until it is changed so one tap cannot freeze the recipe's cost as hers, blank or "Use the recipe's cost" takes hers away; same words and
  red fields as the event page), and the receipt: ingredients and packaging per cookie, the total, the batch (yield and its ingredients
  cost) and the items with no cost. `get_recipe_costs` has only aggregates, so no per-line amount is worked out in the app. With a typed
  cost the receipt is marked "for comparison". On a database without migration 70 the field is off with its reason.
- **Recipe editing** stays in the ported Recipes screen, drawn inside the book under "Back to the recipe book"; the button says it is the
  older screen and that saving there is on hold (B6). It opens on the flavour (`openRecipe`).
- **Motion:** tile to page through `useViewTransition`; the tile's photo and the hero carry one `view-transition-name` (only the pressed
  tile holds it when the old picture is taken). Where the browser has no view transition, or under reduced motion, the page fades in
  (`motion-enter`, instant under reduced motion). Focus moves to the flavour's heading.
- **Roles and cost:** anyone but the owner keeps the ported Recipes screen (the book returns it when `liveRecipes` is null); the runtime works
  the book out only while the Recipes screen is open.
- **Left:** the event page shows a flavour's typed cost only once a day of that flavour has started (it reads the summary); a planned-only
  flavour still shows the per-event cost or the recipe's. The ported P&L and Products margins still use the recipe's cost, not hers. The
  Docker visual run and a phone were not run. **Review (Opus, read-only, 16 Oct): nothing serious; two mediums and a low fixed.**
  (1) A recipe cost such as 12.916667 (310 over 24 cookies) opened the cost field with six decimals, which its own check refuses: the field now
  starts at four decimals (12.9167). (2) After a save the old figure stayed when the read that follows failed: the saved cost is now kept at
  once, and the flavour page shows the "could not be read" note. (3) "Try again" on the recipe-costs note now reads them again. Left:
  `RecipeBook.reset()` is not called anywhere (sign-out reloads the page). Held, with hand-worked numbers: ₱125 at her ₱40 keeps 68 %;
  64.96 % reads 64.9 % and warns; an unchanged field saves nothing; only the owner reaches `save_flavour_cost`.
- **Checks:** `pnpm verify` green (140 files, 2,581 tests); the live smoke passes 17 steps (the book lists the flavours, axe finds no serious
  violation and nothing scrolls sideways at 320 px with 200 % text on the book and on a flavour page, a bad cost is red and sends nothing,
  a typed cost is read back by `get_flavour_costs`, the event page says "typed by you for the flavour" with its cost, blank takes it away);
  the browser pane at 375 and 1440 px on the paused smoke (`SMOKE_PAUSE_EVENT_FILE` with `SMOKE_PAUSE_EVENT_AT=recipes`): no sideways scroll,
  ok and warn tiles, the red field with its summary, the older screen opening on the flavour.

### U4: event page and day plan (Sonnet; interface)

- **Event page:**
  - a hero (name, place, a status pill, dates);
  - a stat row: revenue, profit (or "Cost pending"), cookies sold, against the target `ProgressBar`;
  - a days timeline (Planned, Selling, Closed);
  - fees as a `ReceiptTable` with Remove;
  - costs as a receipt pre-filled from U6 (from the per-event cost until U6 lands);
  - one primary action per state: Plan a day, Start, Review and close, Close the event.
- **Day plan:**
  - a `FlavourTile` grid (photo, name, menu price) with a `Stepper` for the count, pre-filled prices (editable) and carried counts;
  - a sticky footer total ("50 cookies · ₱6,050.00 at full sale") with the primary action;
  - the float as a stepper with ₱100 steps.
- **Red fields everywhere:** validation returns `{field, message}[]`; `Field` shows inline errors; `ErrorSummary` on submit, with focus moved to it. Applies to plan, fees, losses, cost and the event sheet.
- Remove the FAB overlap: reserve space at the bottom, and position toasts above the sticky footer.

### U5: review and close (Sonnet; interface; money display → review)

- **Live figures** (already in SQL as the day runs): `StatTile`s for revenue, cash expected, sold, left and lost, each opening to its parts (`figure.tsx`, restyled). A "Selling" status pill.
- **Pre-filled close** (`CloseForm`, `day-review.tsx:~142`), with derived defaults:
  - Left = should be left;
  - the remainder goes to Carried over (not the last day), else to the shop if the flavour has a recipe, else Written off;
  - Cash counted = cash expected.
  - Add `hasRecipe` to `ReviewStockRow` (`src/lib/bazaar/live-bazaar-types.ts`, `reviewView`) and `cashExpectedPesos`.
  - Shown as editable steppers per flavour, with an "Over / short ₱x.xx" live line.
- A Z-report-style day summary as a `ReceiptTable` (sales by flavour, by payment, losses, fees, drawer).
- **Motion:** figures count up on open; on close, the stat cards settle into a "Day closed" state.

### U6: cost per flavour (database track; Sonnet high; different-model review)

- **Migration 70** `supabase/migrations/20260101006900_flavour_cost.sql`:
  - `flavour_costs(product_id pk, cost_cents, typed_by, typed_at)`;
  - `save_flavour_cost(p_product, p_cents)`: owner only, `SECURITY DEFINER`, `search_path=''`, grants, `-- rule:` lines;
  - a read through `get_flavour_costs()`;
  - the cost order in `bazaar_line_facts`/`bazaar_summary`: booking typed, then flavour typed, then complete recipe.
- Pins in `tests/fixtures/mp08g-source-pins.json` and `function-authority.json`; role-suite cases in `tests/integration/security/bazaar-days.sql`; regenerate types.
- Rehearse locally, then apply hosted from a scratch folder exported from the commit (dry run first), then the fingerprint check. Same method as 69.
- **Cut:** if not green by 19 Oct, it moves after 26 Oct and U4 keeps the per-event cost.

#### U6 as built (15 October; local only, branch `claude/bazaar-v2-u2`)

Migration 70 is `20260101006900_flavour_cost_closing_reversal.sql` (its header comment is the full contract). Not applied anywhere: the trial stays at 69 of 69 until U9's release.

- **Costs:** `flavour_costs`, `save_flavour_cost` (owner only) and `get_flavour_costs`; a cookie is costed by the booking's typed cost, then the flavour's, then the complete recipe.
- **Stranded cookies (A1):** "stranded" means the cookies the latest started day set aside to carry over, when no later day was started. `finalise_bazaar` takes `p_final`, a split per stranded flavour into `to_shop` and `written_off` that together equal the stranded quantity. `bazaar_summary` lists them under the key `stranded`. The screen that asks for the split belongs to U4 ("Close the event"); until then the call refuses a finalise with stranded cookies and no split.
- **Drawer (A4):** an over is an adjustment and a short is a cost, both in the category 'Cash variance', so an over is no longer revenue. A bazaar sale writes a packaging record only when a `bazaar_sale` packaging rule exists (A7).
- **Reversal (A6):** `reverse_bazaar_test(p_booking, p_confirm_name)` is owner only and appends reversing lines and stock corrections; it deletes nothing. "Real-looking mismatch" means the booking's ledger lines do not equal its stored summary to the centavo (revenue, fees, one drawer line per day with an over or short); a booking touched by hand is refused. It also refuses a booking that sent cookies to the shop, any cost cutover on record, and an item counted since the use.
- **Review:** one Opus subagent (codex refuses its models on this account) read the migration and the new role-suite cases against hand-worked numbers: stranded 4 splits into 3 to the shop and 1 written off, cost 10 × 1000, profit 8000; a nine-line reversal totalling 13,200, revenue −54,000, expense −40,800 (centavos).
- **Run on the trial only on Ethan's explicit go-ahead.** The reversal of the audited test event runs only after he says "yes, reverse" it (U9 step 3); the books are shown before and after. The hosted apply waits for U9 (scratch folder, dry run, fingerprint).

**U6 as built (15 October).** Migration 70 `20260101006900_flavour_cost_closing_reversal.sql`, on branch `claude/bazaar-v2-u2`; not on the trial (hosted apply waits for U9: scratch folder, dry run, fingerprint). Left open when the session stopped: the full role harness (row counts fixed to 312 for the suite and 3,361 for the matrix, not yet re-run to green), the live smoke suite, and the different-model review.

- A1: `finalise_bazaar(…, p_till, p_final default null)`; `bazaar_summary.stranded` is the latest started day's `carry_next` when that day is closed and no later day started. The split must name exactly those flavours, its parts together equal the quantity, and it moves them on that day's line to `to_shop_qty` and `written_off_qty`. The split UI is U4's.
- A4: an over is an `adjustment` in 'Cash variance' (a short stays a cost). `close_event`, the legacy close, still books an over as a sale.
- A6 `reverse_bazaar_test`: "real-looking mismatch" is read as: the booking's ledger lines must equal its stored summary to the centavo (revenue, fees, one drawer line per day with a difference). It refuses a booking with cookies sent to the shop, any cost cutover, or a later count. It appends lines at the originals' dates and positive stock adjustments; it deletes nothing. No screen calls it: run it on the trial only after Ethan's "yes, reverse Ateneo".
- A7: no packaging record when there is no bazaar-sale rule. Flavour cost: `flavour_costs`, `save_flavour_cost`, `get_flavour_costs`; the recipe book (U7) is its screen.

**U6 review (Opus, read-only, 15 October): safe to merge after two fixes, not yet applied.** Hand-worked numbers all check out (Y reversal 13,200 / −54,000 / −40,800, stock 280 / 4 / 12 / 1; W cost 5,000, profit 8,000).

- Medium: in `reverse_bazaar_test`, move `pg_advisory_xact_lock('stock_catalogue:items')` and `lock_stock_item_ids(v_items)` above the `rev-counted` check. A count committing between the check and the locks would be raised by the restored stock.
- Low: in `finalise_bazaar`, make the `fin-final-sum` check NULL-safe (`is distinct from`, or `coalesce(…, -1)`), so a missing part cannot pass and write NULL into `to_shop_qty` and `written_off_qty` if `fin-final-flavours` were ever skipped.
- Add role-suite cases: reversing a booking with a short drawer, and one with an old-format over (kind `sale`, category `Bazaar`). Cosmetic: the engine's P&L may show 'Cash variance' as a negative expense after an over.
- A migration change means: re-pin the sha256 in `mp08g-source-pins.json`, `pnpm db:reset`, regenerate `body_md5` in `function-authority.json`, re-run the harness and the smoke suite.

### U7: recipe book (Sonnet; interface; needs U6)

- A live screen registered for `recipes` (`src/components/live/live-screens.ts`):
  - a `FlavourTile` grid with search, on-menu and all filters, and price, cost and margin badges (margin colour against the margin floor);
  - a flavour page: photo hero, price, cost per cookie (editable, saved with `save_flavour_cost`), margin, and a receipt-style breakdown from `get_recipe_costs` lines (`20260101005900_packaging_rules.sql:916`), or "Typed by Cine" with no lines.
- Recipe editing stays in the old screen (its save bug is B6). Its button says so.
- **Motion:** tile to page through the view-transition hook (the shared photo morphs); fallback is a fade.

### U8: two decimals in the ported screens (needs Ethan's yes)

- A one-line protected exception: `PESO` in `src/store/engine/ops-engine.js:19` uses 2 fraction digits. Record it in `docs/state/protected-exception.md`, add a reversal in `scripts/validate-g0.py`, run `check-port-integrity.mjs --update` in the same commit, regenerate the Docker visual baselines, and get an independent port audit.
- **Cut:** without a yes, the till keeps whole pesos.

### U9: motion pass, QA and release (Opus sign-off)

- Apply the D0 motion table across the slices:
  - press scale 0.97;
  - sheet rise and fall;
  - list enter and leave;
  - tile sold-out fade;
  - count-ups;
  - focus jump to the error summary;
  - the view-transition swaps.
- Check reduced motion. Check the performance budget against the C8 baseline (no new dependency).
- **Full QA:** `pnpm verify`, `test:e2e`, `test:live:smoke` (extended in U2–U5), the role suite (if U6), Docker visual (if U8), browser pane at 320, 375, 768 and 1440 px, and axe.
- **Release:** secret scan → PR → merge → deploy → confirm the version and the Access redirect. Then the phone rehearsal (run sheet), fixes, a re-run, and `RELEASE_HOLD=true`.

## Verification (every slice)

- `pnpm verify` (port integrity unchanged except an approved U8).
- New unit tests for every helper, validator and default.
- The smoke suite extended for each new flow.
- Browser-pane screenshots at 375 px and 1440 px, compared with the approved D0 mockup.
- axe with no serious violations; 44 px targets; no sideways scroll at 320 px or at 200 % text.
- Each slice is committed and pushed to its branch. Only U9 merges and deploys.

## How to run the slices

- One slice = one `/goal`, in a **new conversation**, with auto mode on. Paste the block from below.
- Pairs that may run at the same time in two conversations (different files): **U2 with U6**, **U3 with U5**. Never
  two database slices at once.
- Each slice commits and pushes its own branch and stops. Only U9 merges and deploys (one release, then the rehearsal).
- Every slice ends with browser-pane QA at 375 px and 1440 px against the approved D0 mockups, axe, `pnpm verify`.
- Cut line: U6, U7 and U8 move after 26 October if they are not green by the evening of 19 October. The rehearsal is
  no later than 22 October whatever is cut.

## Goal blocks

### D0

```
/goal Bazaar v2 slice D0 (design spec and mockups) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (Revision after the Ateneo audit, Audit, Research, D0). Look at src/app/globals.css @theme,
docs/reference/screens/states/06-sheet-closeout.png, docs/master-plan/evidence/ui/chromium-phone/01-home.png.
1 Write docs/design/bazaar-v2.md: the rules, each component with its props and states, the motion table (element,
  trigger, property, duration, curve, reduced-motion fallback), and the anatomy of every screen.
2 Publish one artifact page of mockups at 375 and 1440 px, @theme tokens only, no new hex: Home card, events hub,
  add-event sheet, event page, day plan tile grid, till frame (Home, Add cookies, sold-out hidden), review with
  pre-filled close, recipe book and cost receipt, error summary and red fields, and the Ateneo prompts (start a
  day that is not today, count again, stranded carried cookies, cost-pending close); live motion demos.
3 Stop for Ethan's approval; write his changes into the doc. No app code in this slice.
```

Model Opus, effort high, new conversation, plan mode off.

### U1

```
/goal Bazaar v2 slice U1 (design system foundations) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U1), docs/design/bazaar-v2.md and the approved D0 artifact.
1 Tokens in src/app/globals.css @theme: spacing, type scale, durations, M3 enter/exit/standard curves. No new hex.
2 src/components/ui/: Card, SectionHeader, StatTile, StatusPill, ProgressBar, EmptyState, Skeleton, Banner, Button,
  FilterChips, Stepper, FlavourTile, ReceiptTable, Field/SelectField (inline error, aria-invalid), ErrorSummary,
  Sheet; a story and a unit test each.
3 src/lib/money/format.ts (two decimals) replacing pesoText in src/lib/bazaar/plan.ts and src/store/ops-runtime.tsx,
  and per-cookie formatting in src/lib/bazaar/review.ts. Tokens in src/components/live/form-styles.ts.
4 Motion utilities: @starting-style entry, list enter/leave, useViewTransition (feature-detected), count-up.
pnpm verify, build-storybook, stories checked in the browser pane at 375 px. Commit and push the branch; do not merge.
```

Model Sonnet builds with Opus sign-off, effort high, new conversation, plan mode off.

### U2

```
/goal Bazaar v2 slice U2 (till freedom) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (Audit, U2), docs/OFFLINE.md, docs/design/bazaar-v2.md.
1 leaveTill (ops-runtime) and a Home button above the till (bazaar-live.tsx), owner only, hidden offline.
2 liveScreenVals till {name, sales, back}; live-screen-host.tsx draws the Home Bazaar card and the "Back to the till"
  banner; widen src/view-models/vals.ts.
3 renderVals (live only): hide sold-out tiles unless in the cart; "Show sold out (n)"; allGone empty state.
4 Add cookies from the till: export StockForm, BazaarDays.addHeldStock reusing addStock and its pending key.
5 Ateneo findings first: B1 (tiles never on the table are not drawn), B2 (the till's expense Add opens the fee form).
Tests first; extend scripts/test-live-smoke.mjs (leave and return, sold-out hidden then back after a void, add cookies).
One different-model review (offline). Browser-pane QA at 375 and 1440 px. Commit and push the branch; do not merge.
```

Model Sonnet high with Opus sign-off, new conversation, plan mode off.

### U6

```
/goal Bazaar v2 slice U6 (migration 70: costs, closing rules, test reversal) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U6), supabase/migrations/20260101006800_bazaar_hardening.sql by
range (bazaar_line_facts, bazaar_summary), 20260101005900_packaging_rules.sql:880-940.
1 New 20260101006900 migration: finalise takes a final split for carried cookies (Ateneo A1); drawer over/short in
  its own category, not a sale (A4); reverse_bazaar_test(p_booking, p_confirm_name): owner only, appends reversing
  ledger lines and stock corrections, marks the booking reversed, refuses a real-looking mismatch (A6);
  bazaar packaging (A7); flavour_costs, save_flavour_cost (owner only, SECURITY DEFINER,
  search_path='', grants, rule lines), get_flavour_costs, cost order booking typed > flavour typed > complete recipe.
2 Pins (mp08g-source-pins.json, function-authority.json), role-suite cases (bazaar-days.sql), types, data layer.
3 pnpm verify, the role suite twice, the live smoke suite; one different-model review with hand-worked numbers.
4 Commit and push the branch. Hosted apply waits for U9's release (scratch folder, dry run, fingerprint).
```

Model Sonnet high with Opus sign-off, new conversation, plan mode off.

### U3

```
/goal Bazaar v2 slice U3 (events hub) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U3), docs/design/bazaar-v2.md, src/components/live/bazaar/
event-list.tsx, src/components/live/live-form-host.tsx, src/lib/nav/function-map.ts.
1 event-list.tsx: header with Add an event top right; Active pinned; Upcoming and Past behind FilterChips.
2 New event-form.tsx: one blank event in a Sheet (name, place, dates, rent), saved through save_scheduled_event.
3 The Bazaar events sub-tab opens the hub. Motion per the D0 table. Ateneo B3, B6: a status pill per row, dates as "Wed, 14 Oct".
Tests (unit and smoke: add an event in the sheet). Browser-pane QA at 375 and 1440 px. Commit and push; do not merge.
```

Model Sonnet with Opus sign-off, new conversation, plan mode off.

### U5

```
/goal Bazaar v2 slice U5 (review and close) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U5), docs/design/bazaar-v2.md, src/components/live/bazaar/
day-review.tsx, figure.tsx, src/store/bazaar-days.ts (reviewView), src/lib/bazaar/live-bazaar-types.ts.
1 StatTiles for the live figures, each opening to its parts; a status pill.
2 Pre-filled close (derived defaults): left = should be left, rest to carried over (not last day) else to the shop
  with a recipe else written off; cash counted = cash expected; hasRecipe and cashExpectedPesos added; over/short line.
3 Z-report day summary as a ReceiptTable. Motion per the D0 table.
4 Ateneo A3 first: an over or short above max(₱100, 10% of expected) asks to count again.
Tests first (defaults, the close sends what is shown); smoke closes a day with the defaults. One different-model
review (money). Browser-pane QA at 375 and 1440 px. Commit and push; do not merge.
```

Model Sonnet high with Opus sign-off, new conversation, plan mode off.

### U4

```
/goal Bazaar v2 slice U4 (event page and day plan) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U4), docs/design/bazaar-v2.md, src/components/live/bazaar/
event-page.tsx, day-plan.tsx, field.tsx.
1 Event page: hero, stat row with target bar, days timeline, fees ReceiptTable, costs receipt, one primary action.
2 Day plan: FlavourTile grid with photos and Steppers, prices and carried counts pre-filled, sticky total footer,
  float stepper.
3 Validation returns {field, message}[]; red fields and ErrorSummary on plan, fees, losses, cost and event forms.
4 Clear the floating button and toasts from form actions.
5 Ateneo first: A1 (Close the event names stranded carried cookies), A2 (starting a day that is not today asks),
  A5 (cost-pending flavours with inline cost fields in the close confirmation), B4 (closed day shows its outcome),
  B5 (menu flavours first). Cost per cookie shows the recipe's cost with its receipt breakdown (no migration).
Tests (validation keys, plan totals); smoke plans a day with steppers and hits a red field. Browser-pane QA at 375 and
1440 px. Commit and push; do not merge.
```

Model Sonnet with Opus sign-off, new conversation, plan mode off.

### U7

```
/goal Bazaar v2 slice U7 (recipe book) in C:\Users\ethan\dev\happy-cookie-ops-g0, after U6. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U7), docs/design/bazaar-v2.md, src/components/live/live-screens.ts,
src/lib/data/costs.ts.
1 A live screen for recipes: FlavourTile grid, search, on-menu and all filters, price, cost and margin badges.
2 Flavour page: photo hero, editable cost per cookie (save_flavour_cost, pre-filled from the recipe), margin, receipt breakdown from
  get_recipe_costs lines, Recipe editing stays in the old screen.
3 Tile-to-page view transition with a fade fallback.
Tests and smoke (edit a cost, see it on the event page). Browser-pane QA at 375 and 1440 px. Commit and push.
```

Model Sonnet with Opus sign-off, new conversation, plan mode off.

### U8

```
/goal Bazaar v2 slice U8 (two decimals in the ported screens) in C:\Users\ethan\dev\happy-cookie-ops-g0, only after
Ethan says "approve PESO". Read AGENTS.md, docs/state/protected-exception.md, docs/state/bazaar-v2.md (U8).
One-line protected exception to PESO in src/store/engine/ops-engine.js:19 (two fraction digits), recorded in
protected-exception.md, a reversal in scripts/validate-g0.py, check-port-integrity.mjs --update in the same commit,
Docker visual baselines regenerated (docs/TESTING.md), an independent port audit. pnpm verify. Commit and push.
```

Model Sonnet with Opus sign-off, new conversation, plan mode off.

### U9

```
/goal Bazaar v2 slice U9 (motion pass, QA and release) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U9), docs/design/bazaar-v2.md. Merge the finished slice branches.
1 Apply the D0 motion table everywhere; reduced motion; performance budget against the C8 baseline.
2 pnpm verify, test:e2e, test:live:smoke, the role suite (if U6), Docker visual (if U8), browser pane at 320, 375,
  768 and 1440 px, axe.
3 If U6 is green: apply migration 70 to the trial from a scratch folder (dry run, fingerprint). Then, only after
  Ethan says "yes, reverse Ateneo", call reverse_bazaar_test for Ateneo and show the books before and after.
4 Secret scan, PR into agent/codex/MP-04-g1-feasibility, merge, confirm the deployed version and the Access redirect.
5 Update the run sheet and current.md; hand Ethan the rehearsal steps (exact, step by step).
```

Model Opus, effort high, new conversation, plan mode off.
