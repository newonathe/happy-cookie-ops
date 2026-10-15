# Bazaar v2 design spec (slice D0)

Status: **approved by Ethan on 15 October 2026** ("approve D0"), as drawn, decisions 1 to 8 as recommended. The mockups are one private artifact page,
<https://claude.ai/artifact/FEG4Xfriz6P9cCeu534DFa> (Ethan's account; open it signed in). Once approved, this file and that page are the spec for U1 to U9
([../state/bazaar-v2.md](../state/bazaar-v2.md)). Ethan's changes go in the last section, "Changes from Ethan".

Every figure in this file and on the mockups is a **sample**. Prices are the engine's demo prices (already public in
`ops-engine.js`). Cost lines are invented. No real recipe cost, sale or booking appears here; the repository is public.

## 0. How each new element gets built

The ported Home, till and close-out markup is locked. Every element below carries one of these tags, and a slice
builds it only the way its tag says. If an element ever seems to need a locked file restyled, stop and ask.

| Tag       | Meaning                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **[RT]**  | A runtime value fed to a ported screen through `OpsRuntime` (for example, which till tiles are drawn). Markup unchanged.                                                             |
| **[SL]**  | Drawn by the live screen slot (`live-screen-host.tsx`, rendered by the frame before the ported screen list, live mode only): the Home Bazaar card and the "Back to the till" banner. |
| **[LV]**  | A live file under `src/components/live/` (unlocked): the events hub, event page, day plan, review, the bar above the till, the recipe book.                                          |
| **[M70]** | Needs migration 70 (U6): the flavour cost, the final split of stranded cookies, the drawer category, the Ateneo reversal.                                                            |

Money: live screens show two decimals (`₱20,000.00`); the ported screens (Home's strip, the till tiles) keep whole pesos
(`₱130`) until U8 is approved. Dates: `Sat, 24 Oct` (no year inside the current year; no US `10/24/2026`).

## 1. Rules

1. **One thing first.** Each screen opens with its status and the one number that matters, then the explanation, then
   detail. One primary action per screen; everything else is secondary or behind a tap.
2. **Speak the prototype's language.** Big numerals, status pills, progress bars, the accent left-border card, round photo
   chips and photo tiles, steppers, bottom sheets, the primary button with an arrow. New UI must look native next to
   the ported Home. Buttons by role: the screen's one forward action is `brand` with an arrow ("Start the day →"); a
   confirm that commits money or a close is `ink` ("Close the day"), as in the ported close-out; everything else is
   secondary or ghost.
3. **A card holds one headline figure.** Its breakdown opens on tap (`StatTile` → parts). No card lists every figure.
4. **Tiles for flavours.** Wherever flavours are chosen or counted (day plan, till, recipe book), they are photo tiles in a
   grid, menu flavours first. Off-menu flavours sit under "More flavours (n)". A flavour never put on the table is not
   drawn on the till; a real sell-out is hidden behind "Show sold out (n)".
5. **Steppers, not typing, for small counts.** Counts and the float use `Stepper` (tap, long-press repeat, or tap the
   number to type on the numeric keypad). Money that is not a count (rent, a fee) is a decimal field.
6. **Pre-fill facts, never decisions.** Prices from the menu, carried counts from yesterday, expected figures from the
   till are pre-filled. A judgement (how much cash is in the drawer, what happens to leftovers on the last day) is either
   left blank or shown as a visible suggestion the owner confirms.
7. **Errors point at the field.** On submit: an `ErrorSummary` at the top ("There is a problem"), focus moved to it, each
   line a link to its field. Each bad field gets a red border, a red left bar, `aria-invalid`, and a message under it
   (linked by `aria-describedby`) that says what is wrong and how to fix it. Validate a field on blur, the form on submit.
8. **Nothing covers a button.** Screens reserve 88 px at the bottom on phones for the floating add button; toasts sit above
   a sticky footer, never over it.
9. **Every screen says what needs signal.** An offline line under the primary action ("Starting a day needs signal.
   Selling does not.") and the action disabled with the reason, never hidden.
10. **Motion explains, never decorates.** Only `transform` and `opacity` animate. Motion is never the only signal: every
    state change also changes text or a pill. Everything stops under reduced motion (section 4).
11. **Tokens only.** Every colour, radius and shadow comes from `@theme` in `src/app/globals.css`. No new hex value, no
    `color-mix` to make a new shade.

## 2. Tokens

### 2.1 Used as they are

Colour: `ink`, `ink-soft`, `ink-mute`, `ink-faint`, `surface`, `raise`, `inset`, `divide`, `app`, `chip`, `warm-card`,
`line`, `line-strong`, `brand`, `brand-deep`, `accent`, `warm-high`, `warm-line`, `warm-inset`, `ok`, `ok-fill`,
`ok-line`, `warn`, `warn-dot`, `warn-body`, `danger`, `danger-line`, `info-fill`, `info-line`. Radius: `tag 6`, `chip 9`,
`control 12`, `card 18`, `sheet 26`. Shadow: `chip`, `brand`, `lift`. Motion: `ease-out-quint`, `ease-pop`, the
`hcRise`, `hcSheet`, `hcFade`, `hcPop` keyframes, and the global reduced-motion rule.

**Gaps, filled without new colours:**

- There is no danger fill and no warn fill. Error states are white (`surface`) with a `danger` border and a 4 px `danger`
  left bar; the summary box has a 3 px `danger` border, an `ink` title and `danger` links (GOV.UK). Warnings ("count
  again", "start anyway?") use `warm-high` with a `warn-dot` left bar and `warn-strong` text.
- Status pills: Selling = `ok-fill`/`ok-line`/`ok`; Planned = `info-fill`/`info-line`/`ink`; Today = `warm-high`/
  `warm-line`/`brand-deep`; Closed and Past = `chip`/`line`/`ink-mute`; Cost pending = `warm-high`/`warm-line`/`warn`; Good (Open, On the menu, a margin above the floor) = `ok-fill`/`ok-line`/`ok`, no dot.

### 2.2 Proposed for U1 (new names, no new colour)

| Token                                      | Value                             | Use                                          |
| ------------------------------------------ | --------------------------------- | -------------------------------------------- |
| `--space-1` … `--space-6`                  | 4, 8, 12, 16, 24, 32 px           | all gaps and padding in live screens         |
| `--text-display`                           | 40px / 1.0, 700, tracking −0.02em | the headline numeral ("78", "₱6,050")        |
| `--text-title`                             | 22px / 1.2, 700                   | screen and sheet titles                      |
| `--text-body`                              | 15px / 1.45, 500                  | body text                                    |
| `--text-caption`                           | 12.5px / 1.35, 500                | labels, hints, pill text                     |
| `--dur-fast` / `--dur-base` / `--dur-slow` | 150 / 250 / 400 ms                | exits / most changes / large entries         |
| `--ease-enter`                             | `cubic-bezier(0.05, 0.7, 0.1, 1)` | anything arriving (M3 emphasized decel.)     |
| `--ease-exit`                              | `cubic-bezier(0.3, 0, 0.8, 0.15)` | anything leaving (M3 emphasized accel.)      |
| `--ease-standard`                          | `cubic-bezier(0.2, 0, 0, 1)`      | state changes in place                       |
| `--color-scrim`                            | `rgb(58 31 20 / 0.4)`             | sheet backdrop (ink at 40 %, as the shadows) |

The ported `hcRise`, `hcSheet` and `hcFade` animations keep their `ease-out` curves inside ported screens. Live screens use
the new curves.

## 3. Components (U1 builds them in `src/components/ui/`, each with a story)

| Component       | Props                                                                                                            | States                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Card`          | `variant: plain \| accent \| inset \| warm`, `as`, `children`                                                    | default; `accent` has the 4 px brand left bar (Home's "Prepare" card)                                     |
| `SectionHeader` | `title`, `count?`, `action?: {label, onPress}`                                                                   | with or without count/action                                                                              |
| `StatTile`      | `label`, `value`, `unit?`, `detail?`, `tone?: ok \| warn \| danger`, `parts?`, `onOpen?`                         | idle; counting up (first show); open (parts listed below, chevron turned); pending ("—")                  |
| `StatusPill`    | `status: today \| selling \| planned \| closed \| past \| costPending \| good`                                   | one look per status (section 2.1); dot breathes for `selling` only                                        |
| `ProgressBar`   | `value`, `max`, `secondary?`, `label`                                                                            | empty, part, full, over (brand fill to 100 %, label says "over by")                                       |
| `EmptyState`    | `title`, `body`, `action?`                                                                                       | —                                                                                                         |
| `Skeleton`      | `lines`, `tile?`                                                                                                 | shimmer off under reduced motion                                                                          |
| `Banner`        | `tone: info \| warn \| danger \| till`, `title`, `body?`, `action?`, `onDismiss?`                                | enter (slides down), resting, leave                                                                       |
| `Button`        | `variant: primary \| dark \| secondary \| danger \| ghost \| icon`, `size`, `busyLabel?`, `disabled?`, `reason?` | idle, hover, pressed (scale 0.97), busy ("Saving…"), disabled with `reason` shown under it                |
| `FilterChips`   | `options: {id,label,count?}[]`, `value`, `onChange`                                                              | selected (brand-bordered, warm fill, like the sub-tabs), idle                                             |
| `Stepper`       | `value`, `min`, `max`, `step`, `label`, `onChange`, `size: sm \| md`                                             | idle, at min (− disabled), at max, typing (keypad), error                                                 |
| `FlavourTile`   | `name`, `photo`, `price`, `count?`, `badge?`, `state: idle \| inCart \| soldOut \| offMenu`, `stepper?`          | idle; in cart (count badge, brand ring); sold out (dimmed, "Sold out" label, leaves the grid on the till) |
| `ReceiptTable`  | `lines: {label, detail?, value, onRemove?}[]`, `subtotal?`, `total`, `note?`                                     | with Remove per line; empty ("No fees yet")                                                               |
| `Field`         | `label`, `hint?`, `error?`, `mode: text \| decimal \| numeric \| date`, `prefix?` (₱)                            | idle, focus (accent ring), filled, error (danger border + left bar + message), disabled                   |
| `SelectField`   | as `Field`, plus `options`                                                                                       | as `Field`                                                                                                |
| `ErrorSummary`  | `errors: {field, message}[]`                                                                                     | hidden; shown (focus moves to it; each line links to `#field`)                                            |
| `Sheet`         | `title`, `onClose`, `footer`, `side?: bottom \| right`                                                           | bottom sheet on phones; right panel 460 px on desktop; enter, rest, leave                                 |

Money has one helper, `src/lib/money/format.ts` (`peso(centavos)` → `₱1,234.00`). Dates have one, `dayText(date)` →
`Sat, 24 Oct`.

## 4. Motion

Reduced motion: the global rule in `globals.css` stops animations and transitions on `*`, `::before` and `::after`. It
does **not** reach the `::view-transition-*` pseudo-elements, so U1 adds
`@media (prefers-reduced-motion: reduce) { ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; } }`
and `useViewTransition` skips `document.startViewTransition` entirely under reduced motion.

| Element                   | Trigger                      | Property                                               | Duration     | Curve            | Reduced-motion fallback                            |
| ------------------------- | ---------------------------- | ------------------------------------------------------ | ------------ | ---------------- | -------------------------------------------------- |
| Any button                | press                        | transform scale .97                                    | 100 ms       | standard         | no scale; pressed fill only                        |
| Sheet                     | open                         | translateY 30→0, opacity                               | 400 ms       | enter            | appears at once                                    |
| Sheet                     | close                        | translateY 0→30, opacity                               | 150 ms       | exit             | disappears at once                                 |
| Backdrop                  | sheet open / close           | opacity                                                | 250 / 150    | standard / exit  | at once                                            |
| List row / card           | added (`@starting-style`)    | translateY 8→0, opacity                                | 250 ms       | enter            | at once                                            |
| List row                  | removed                      | opacity, scale .98                                     | 150 ms       | exit             | at once                                            |
| New event card            | saved                        | rise, then a warm-high ring fades                      | 250 + 600 ms | enter / standard | ring shown 1 s, no movement                        |
| Till tile                 | sells out                    | scale 1→.92, opacity 1→0                               | 200 ms       | exit             | removed at once; "Show sold out (n)" count changes |
| Till tile                 | back after a void            | scale .92→1, opacity                                   | 250 ms       | enter            | at once                                            |
| Count badge               | +1 / −1                      | scale 1→1.15→1                                         | 250 ms       | `--ease-pop`     | number changes only                                |
| `StatTile` numeral        | first show                   | count-up (text)                                        | 400 ms       | enter            | final value at once                                |
| `StatTile` parts          | open / close                 | opacity, translateY 4→0                                | 250 / 150    | enter / exit     | at once                                            |
| `ProgressBar` fill        | value changes                | transform scaleX                                       | 400 ms       | standard         | at once                                            |
| "Back to the till" banner | first show on another screen | translateY −100%→0                                     | 250 ms       | enter            | at once                                            |
| Filter chip switch        | tap                          | view transition cross-fade                             | 250 ms       | standard         | swap at once                                       |
| Recipe tile → page        | tap                          | view transition, photo morphs                          | 400 ms       | enter            | plain swap                                         |
| Error summary             | submit with errors           | rise 8→0 + focus                                       | 250 ms       | enter            | at once; focus still moves                         |
| Bad field                 | submit with errors           | none (no shake)                                        | —            | —                | —                                                  |
| Day closed                | close succeeds               | stat tiles settle (opacity .6→1), pill swaps to Closed | 250 ms       | standard         | at once                                            |
| Screen change             | navigation                   | the frame's existing `hcScr*` slides (unchanged)       | as ported    | as ported        | ported rule                                        |

No motion library: CSS keyframes, `@starting-style`, and `document.startViewTransition` behind feature detection.

## 5. Screen anatomy

Widths: phone 375 px (one column, 16 px gutters); desktop 1440 px (the frame's sidebar, then the content capped at
960 px; grids widen to 3–4 columns; sheets become a right-hand panel).

### 5.1 Home Bazaar card [SL]

Drawn by the live screen slot, owner only, live mode only. The frame renders the slot under the top bar and before the
ported Home, so the card sits **above** the greeting (`app-frame.tsx:309`). Under the greeting would need a protected
exception (decision 8). One of three states:

- **Selling now:** `Card accent`. Line 1: "Bazaar" label, `StatusPill selling`, event name. Headline: revenue today
  (display numeral) with "from N sales". A `ProgressBar` of cookies sold against cookies on the table ("144 of 200 sold · 53 left"). Round photo chips with the
  count left per flavour (the top four). Primary: **Back to the till →** (brand, like Home's "Start baking"). Secondary: "Review the day".
- **Today, not started:** "Bazaar · Today" pill, name, place, "Day 1 of 2"; primary **Start the day →**; offline line.
- **Next event (none today):** compact row: name, dates, "in 9 days", **Open**.
- No event at all: no card.

### 5.2 Events hub [LV] (U3)

- Header row: title "Bazaar", **Add an event** (dark, top right).
- **Active** (pinned, only when a day is started or today falls inside an event's dates): a large accent card with the
  status pill, name, place, dates, today's revenue and sold, and one action (Open the till / Start the day).
- `FilterChips`: **Upcoming (n)** · **Past (n)**. Rows: name (one line, ellipsis), dates `Sat, 24 Oct – Sun, 25 Oct`,
  place, a status pill (Planned, Closed, Past, Cost pending). Tap → event page.
- Offline line at the bottom. Desktop: the active card spans the width; rows become a two-column grid.

### 5.3 Add-event sheet [LV] (U3)

One event, never the whole booking list. Fields: Name; Place; Dates (start and end, the end defaults to the start);
Stall rent (₱, decimal, optional). Footer: **Save the event** (primary) and Cancel. Errors as rule 7. On save the sheet
closes and the new row enters the Upcoming list with a ring. Editing an event happens on its page.

### 5.4 Event page [LV] (U4)

- **Hero:** name (title), `StatusPill`, place, dates, rent.
- **Stat row:** Revenue · Profit (or "Cost pending", warn pill) · Cookies sold · Against the target (`ProgressBar`).
  Phone: 2×2 tiles; desktop: one row of four.
- **Days timeline:** one row per day: date, status (Planned, Selling, Closed), and for a closed day what happened
  (sold, revenue, left, carried, over or short; finding B4), never its plan. One action per row: Plan, Start, Review and
  close, See the review.
- **Fees:** `ReceiptTable` (rent first, then each fee, Remove on each), total, "Add a fee".
- **Cookie cost:** a receipt per flavour on the table: cost per cookie, "from the recipe" or "typed by Cine" [M70], with a
  tap to open its breakdown (the recipe book's receipt, 5.8).
- **Primary action by state:** Plan a day → Start the day → Review and close → Close the event.

### 5.5 Day plan [LV] (U4)

- Header: "Plan Sat, 24 Oct", event name.
- **Float:** `Stepper` in ₱100 steps, pre-filled with the last day's float.
- **Cookies on the table:** `FlavourTile` grid of the menu flavours (phone 2 columns, desktop 4): photo, name, price
  (pre-filled from the menu, tap to change), `Stepper` "Made", and "Carried: n" when yesterday carried some. Then
  "More flavours (19)" collapsed.
- **Sticky footer:** "50 cookies · ₱6,050.00 at full sale" and **Save the plan** (primary). Offline: "Saving a plan needs
  signal."
- Errors: a flavour with a price of 0 and a count, a float below 0, nothing on the table.

### 5.6 Till [RT] + [LV] (U2)

- The ported Bazaar Mode screen is unchanged, its own header and **Leave** button included (compare
  `build/s31/shots/08-till-*.png`: 2 tile columns on phones, 3 on desktop, Freebie and Charge side by side on desktop).
  Above it, a live bar [LV] in `bazaar-live.tsx`: **← Home** (owner, online
  only), **Show sold out (n)** when any have sold out, and **Add cookies**.
- **Tiles** [RT]: a flavour with nothing made and nothing carried is not drawn; a sold-out flavour leaves the grid (motion
  table) unless it is in the open sale; "Show sold out (n)" brings them back dimmed. When everything is gone: an empty
  state "Everything on the table is sold" with **Add cookies**.
- **Add cookies** opens a sheet: flavour tiles with a stepper each, kind (Made today / Carried over), **Add to the table**.
- Event expenses "Add" [RT] keeps its ported label and opens the live fee form for this day (finding B2); the old till expense is not offered.
- On every other screen while a day is selling: the **Back to the till** banner [SL], under the top bar.

### 5.7 Review and close [LV] (U5)

- Header: "Review · Sat, 24 Oct", `StatusPill selling`, **← Back to the till**.
- **Stat tiles:** Revenue, Cash expected, Sold, Left, Lost; each opens to its parts. Desktop: one row of five.
- **Per flavour:** a compact table: made + carried, sold, given, lost, should be left.
- **Losses** and **Add stock** as small forms (steppers), each behind "Record a loss" / "Add cookies".
- **Close the day** (sheet):
  - per flavour a row of steppers: Left (pre-filled with "should be left", marked "expected"), then the split of the left:
    Carried over, To the shop, Written off. Suggested split (decision 3): not the last day → all carried; last day → to
    the shop if the flavour has a recipe, else written off. Shown as a suggestion line the owner can change.
  - **Cash counted:** blank, with "Expected ₱1,640.00" beside it and an **It matches** button that fills it (decision 2).
    Once typed, a live line: "Over ₱20.00" / "Short ₱20.00" / "Matches".
  - **Count again** (finding A3): over or short above the larger of ₱100.00 and 10 % of expected → a warn banner
    "That is ₱1,000.00 over. Count the drawer again?" with **Count again** (focus back to the field) and **Keep ₱1,000.00**.
  - Footer: **Close the day**.
- **After close:** tiles settle, pill becomes Closed, and a Z-report receipt: sales by flavour, by payment, losses, fees,
  drawer (expected, counted, over or short, booked in its own category [M70]).

### 5.8 Recipe book and cost receipt [LV] (U7)

- Live screen for `recipes`: search, `FilterChips` On the menu (7) · All (26), a `FlavourTile` grid with price, cost and
  margin badges (margin `ok` above the margin floor, `warn` below).
- **Flavour page:** photo hero, price, **cost per cookie** (editable field [M70], saved with `save_flavour_cost`), margin,
  and the **cost receipt**: ingredient lines (amount, cost), packaging lines, total per batch, cookies per batch, cost per
  cookie. With a typed cost: "Typed by Cine on 15 Oct" and the recipe receipt below for comparison.
- "Edit the recipe" opens the old Recipes screen and says so (its save bug is B6).

### 5.9 Errors

As rule 7, on every live form (event sheet, plan, fee, loss, add cookies, cost, close). Messages say what to do:
"Enter the stall rent in pesos, like 2,500.00", "Pick at least one flavour for the table", "The end date must be on or
after Sat, 12 Dec". The summary line and the field's message use the same words.

### 5.10 The Ateneo prompts

- **Start a day that is not today** (A2), sheet: "This day is Mon, 19 Oct. Today is Thu, 15 Oct. Sales will be dated
  today, and the rent stays on Mon, 19 Oct." Actions: **Start anyway** (dark), Cancel.
- **Count again** (A3): in 5.7.
- **Stranded carried cookies** (A1) [M70], when closing the event with cookies carried into a day that will not run: "53
  cookies were carried over for Sun, 25 Oct, which has not started. (Ateneo stranded 43.) Where do they go?" Per flavour: To the shop /
  Written off steppers, suggested all to the shop when the flavour has a recipe. **Close the event**.
- **Cost-pending close** (A5): "Classic Chocolate Chip has no cost per cookie. It sold 18 here. Profit cannot be worked out without its cost." Each flavour
  with an inline cost field [M70] that saves the **flavour's** cost (the recipe book's, not a per-event cost). Actions:
  **Save and close** (primary), **Close without cost** (secondary, explicit).

### 5.11 Offline

Selling, voids and the review's figures work offline (unchanged). Needs signal, shown with the reason: start a day, save
a plan, add or edit an event, fees, the cost, close the day, close the event, leaving the till for Home.

## 6. Decisions for Ethan (all approved as recommended, 15 October)

1. The look as drawn (section 1 rules, the mockups).
2. **Cash counted** stays blank with an **It matches** button, instead of the plan's pre-filled cash (a pre-filled cash
   would make the count-again check never fire). Recommended.
3. The **leftover split suggestion**: not the last day → carried; last day → to the shop if it has a recipe, else written off.
4. **Stranded carried cookies** at "Close the event": suggested to the shop.
5. The proposed U1 tokens (2.2).
6. Placement: the Home card and the till banner through the live screen slot; the till's bar in the live wrapper.
7. Two decimals stay in live screens only until U8 ("approve PESO").
8. **Home card position:** above the greeting, where the slot is (recommended), or below it through a new protected
   exception in `home.tsx`.

## 7. Changes from Ethan

Approved as drawn on 15 October 2026, with no changes. Decisions 1 to 8 in section 6 stand as recommended:

- Cash counted starts empty, with **It matches** (not pre-filled; this replaces U5's "Cash counted = cash expected").
  **Reversed by Ethan on 16 October (U5):** it is pre-filled with the cash expected after all, as the plan said; It matches
  puts that back after an edit, and clearing the field means "not counted".
- The leftover suggestion: carried on a non-last day; on the last day to the shop with a recipe, else written off.
- Stranded carried cookies at "Close the event": suggested to the shop.
- The proposed U1 tokens in 2.2.
- The Home card above the greeting, through the live slot; no protected exception for Home.
- Two decimals on live screens only; the till keeps whole pesos until "approve PESO" (U8).
