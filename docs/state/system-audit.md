# Whole-system audit (5 October 2026)

> **Closed and corrected later the same day in [final-plan.md](final-plan.md), version 2, section 5.** C3 is
> partly wrong as written here (prototype prices cannot reach the live figure and supplier prices do feed it;
> the real defects are a best buy chosen by pack price and zeros outside the Products rows). C5 is confirmed.
> C9 is closed: binned dough does reduce the balance, and one bazaar-sale path is reachable. C10 is confirmed.
> Twenty-one more findings are listed there (H12 to H20, N1 to N12), the most serious being that an offline
> page load signs the owner out. Each finding's slice is in the plan's section 9.

Status: **findings only. Nothing was fixed in this pass.** Ethan asked for one last audit
of the whole system for interface, computation, dependency, interconnection, system and
accuracy errors before the final plan, and added during it: **"nothing must be hardcoded."**
That is recorded here as a rule for the rework, and section 2 lists every hard-coded value
found reaching the live app.

How it was done: the live build at `3bc91dd` signed in against the local database; the code
and the SQL migrations read directly; two independent read-only passes by a second model
(computation and units; dependencies, data links and system); `pnpm audit` and
`pnpm outdated`; a read of the hosted project list. Findings already written elsewhere are
not repeated: interface findings 1 to 12 are in [ux-audit.md](ux-audit.md), the source-data
findings in [sot-consolidation.md](sot-consolidation.md), the structural diagnosis in
[product-research.md](product-research.md).

Each finding has an evidence class (**Code** = read in the code or SQL; **Seen** = observed
in the running build; **Likely** = follows from code read but the effect was not observed;
**Unverified**) and a time (**Trial** = before Cine's trial; **Open** = before the shop
opens; **Later**).

## 1. The ten that matter most

| #   | Finding                                                                                                  | Time  |
| --- | -------------------------------------------------------------------------------------------------------- | ----- |
| H1  | Home shows "11 Pickups" always; it is a fixed number from the prototype.                                 | Trial |
| C1  | Home says "Profit this month" over a figure for the last 30 days.                                        | Trial |
| C3  | Cost per cookie can use the prototype's ingredient prices, or zero, and still show as a complete cost.   | Trial |
| L1  | Recipes are tied to stock items by typed name only; a misspelt ingredient saves and then never deducts.  | Trial |
| S1  | No backup, restore, retention or keep-alive job is scheduled anywhere.                                   | Trial |
| S3  | The release check requires exactly two allowed emails; adding Cine's will fail the deploy until changed. | Trial |
| D1  | The framework version has a critical advisory; a patch release fixes it.                                 | Trial |
| H5  | The customer shop says "4 classics + 2 rotating flavours" whatever the menu is.                          | Open  |
| S2  | The offline app shell never refreshes its cache version, and pictures at the same address stay stale.    | Open  |
| C7  | Extra cash in the drawer at close-out is booked as sales revenue.                                        | Open  |

## 2. Hard-coded values that reach the live app

Rule (Ethan, 5 October): nothing is hard-coded. Every number, name and sentence about the
business comes from her data or her settings. Found so far:

| #   | Where it shows             | What is fixed                                                                                                                                             | Evidence   | Time  |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| H1  | Home, status strip         | "Pickups 11" (`ops-engine.js:2515`); the live layer does not replace it.                                                                                  | Code, Seen | Trial |
| H2  | Home, "Your business" grid | "Profit & loss · August", "Products · 4 permanent, 2 rotating", "Suppliers · 8 saved" (`:2535-2539`).                                                     | Code, Seen | Trial |
| H3  | Settings                   | "Proof required", "Courier pickup", "2 helpers, 2 temporary", "Google Form bridge · On" (`:3368-3411`). The first contradicts Cine's 28 September answer. | Code, Seen | Trial |
| H4  | Greeting and account       | "Good morning, Cine." and the helper's name come from the prototype's role list (`:251-253`), not from the signed-in profile.                             | Code, Seen | Trial |
| H5  | Shop, customer-facing      | "4 classics + 2 rotating flavours, baked fresh this weekend." (`shop.tsx:48`).                                                                            | Code, Seen | Open  |
| H6  | "Who can see what"         | The prototype's list of people (`:3824`).                                                                                                                 | Code       | Open  |
| H7  | Cost per cookie            | Packaging is three named items divided by 6 (`:1851`): it ignores other box sizes, pouches and bags.                                                      | Code       | Open  |
| H8  | Cost per cookie            | Ingredient prices fall back to the prototype's price tables when no purchase is recorded (`:1548-1555`).                                                  | Code       | Trial |
| H9  | P&L                        | "Profit, last four months" above a one-bar chart; the prototype's past months are dropped, the title is not.                                              | Seen       | Later |
| H10 | Offline shell              | The cache version is a constant in `public/sw.js:8`.                                                                                                      | Code       | Open  |
| H11 | Release check              | "Exactly two" allowed emails (`check-owner-trial-release.mjs:65,81`).                                                                                     | Code       | Trial |

This list is what was found, not proof there are no others. The engine was written as a
demonstration, so the new screens must take each value from the database or settings and
must not read the engine's view of a screen without checking it against this list.

## 3. Computation and accuracy

| #   | Finding                                                                                                                                                                                                   | Evidence     | Time  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----- |
| C1  | "Profit this month" on Home is the last 30 days (`home.tsx:270`; `ops-engine.js:714`). The P&L screen already says "Last 30 days".                                                                        | Code         | Trial |
| C2  | The books CSV prints times in UTC, not Manila (`books.ts:131`). A sale at 6 am Manila lands on the previous date. The file name's date is UTC too.                                                        | Code         | Trial |
| C3  | Cost per cookie: the "complete" check accepts a supplier price, but the figure is computed from the last purchase, then the prototype's tables, then zero. No code feeds supplier prices into the figure. | Code, Likely | Trial |
| C4  | Production deducts rounded quantities (0.1; whole pieces rounded up) while cost uses unrounded ones. A half batch with one egg deducts 1 and costs 0.5.                                                   | Code         | Later |
| C5  | A stock shortfall during production is recorded but not costed, so "cost when used" can be understated.                                                                                                   | Likely       | Open  |
| C6  | The 200 limit is per pickup week and counts each item's capacity weight; the app's wording calls it a "drop". The parity test cases do not cover weights other than 1 or week edges.                      | Code         | Open  |
| C7  | A cash overage at bazaar close-out is booked as a Bazaar sale (`bazaar_closeout.sql:340`).                                                                                                                | Code         | Open  |
| C8  | The customer sees no total for a same-day order before placing it; the server works it out.                                                                                                               | Code         | Later |
| C9  | Whether a discarded dough batch reduces the dough balance, and whether only the latest of three bazaar-sale booking paths is reachable, were not run to ground.                                           | Unverified   | Open  |
| C10 | The engine's day arithmetic uses the device's local midnight; which live paths still use it was not traced. Manila's "today" is defined in two files.                                                     | Unverified   | Open  |
| C11 | Peso values are summed as decimals in the P&L; no equality test depends on them. Tax set-aside is display only.                                                                                           | Code         | Later |

Sound: one conversion file for centavos and pesos; recipe units are enforced on save;
revenue is dated when paid; prices, boxes, add-ons and the same-day charge are computed on
the server only; bazaar cash expected and variance; receipts cannot be booked twice.

## 4. How the data is linked

| #   | Link                        | State                                                                                                                                            | Evidence | Time  |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----- |
| L1  | Recipe line → stock item    | By typed name. An unknown name saves; production reports it as short instead of failing. Case differs between the rename guard and the matching. | Code     | Trial |
| L2  | Supplier price → stock item | By typed name. A purchase's supplier is free text.                                                                                               | Code     | Open  |
| L3  | Order → customer            | No customer record exists.                                                                                                                       | Code     | Open  |
| L4  | Order line → flavour        | Linked by id; flavours are never deleted. Renaming a flavour renames it on every past order (prices are kept per line).                          | Code     | Later |
| L5  | Production → recipe version | A number, not a link.                                                                                                                            | Code     | Later |
| L6  | Bazaar stock → baked stock  | Not linked; event stock is a counter typed in.                                                                                                   | Code     | Open  |

Sound: purchases to the books, bazaar sales to flavours and the books, bookings to events,
items to suppliers, production to stock movements.

## 5. System and dependencies

| #   | Finding                                                                                                                                                                                     | Evidence | Time  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| S1  | Nothing schedules backup, restore drill, retention or keep-alive: no workflow, no database schedule. Both hosted projects were active on 5 October; a free project can pause when idle.     | Code     | Trial |
| S2  | The offline shell: fixed cache version, so a deploy installs no new worker; `/assets/` is cached forever, so a replaced picture at the same address stays old; old script files pile up.    | Code     | Open  |
| S3  | The release check needs exactly two allowed emails.                                                                                                                                         | Code     | Trial |
| S4  | Error reporting is off in the trial build: no reporting address is set.                                                                                                                     | Code     | Open  |
| S5  | The uptime workflow needs a production address, calls a route the static build does not have, and would be stopped by the access gate.                                                      | Code     | Open  |
| S6  | The performance job measures the demo build, not the live shop page.                                                                                                                        | Code     | Open  |
| D1  | `next` 16.3.3 has a critical advisory in its image-response feature, fixed in 16.3.6 and later. The app does not use that feature and the trial has no Next server; the old demo site does. | Code     | Trial |
| D2  | Four more advisories (2 high, 2 moderate) sit under the error-reporting package's build tools, not in the shipped app.                                                                      | Code     | Later |
| D3  | Development tools are one or more major versions behind (TypeScript, ESLint, Vitest and others). The framework, React and the database client are on current majors.                        | Code     | Later |

## 6. Interface

Already recorded: [ux-audit.md](ux-audit.md) findings 1 to 12 and
[product-research.md](product-research.md) section 7. Added by this pass:

| #   | Finding                                                                                                                | Evidence | Time  |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| U1  | Wording Cine questioned in July is still on screen ("Drop full", "Form queue", "split").                               | Seen     | Trial |
| U2  | Customer pages on a wide screen are a 640-pixel column whose background stops with the content.                        | Seen     | Open  |
| U3  | The same thing has two names in several places (Suppliers and Suppliers & prices; System health and Backups & export). | Seen     | Trial |

## 7. What each finding becomes under the rework

- **Fix in the data layer first**, because new screens would inherit them: C1 to C3, C7,
  L1, L2, L6, H7, H8, S1 to S4, D1.
- **Disappear when the new screens replace the ported ones**, provided the new screens
  take every value from data: H1 to H6, H9, U1 to U3.
- **Become part of a planned slice:** L3 (customer database), C6 (wording), S6
  (performance), H11 with Cine's access.

## 8. What was not checked

- The hosted trial's data and settings were not read; local test data was used.
- No real iPhone or Safari was used.
- Database security rules were not re-audited in this pass; they were reviewed slice by
  slice earlier.
- The 248 places that divide or multiply by 100 were not each read; the conversion file
  and the main paths were.
- Items marked Unverified above.

## 9. What slice B2 did with these findings (6 October 2026)

The rows above are left as they were found. Evidence for every line here is a test in
`pnpm verify` unless it says otherwise; the two tests that hold the whole of it are in
`tests/unit/no-prototype-values.test.tsx` (an empty shop, and two shops that share nothing).

| #   | Now                                                                                                                                                                                                            | Held by                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| H1  | **Closed.** "Pickups" counts today's pickups on the shop's clock; "—" until orders are read.                                                                                                                   | `ops-runtime-names`, `no-prototype-values`                |
| H2  | **Closed.** The three launcher lines come from the P&L's own period, the flavour list and the supplier list.                                                                                                   | the same                                                  |
| H3  | **Closed.** Payment methods and collection options are read from her records and open her forms; the people count is from profiles; the form-bridge row is gone.                                               | the same                                                  |
| H4  | **Closed, the bazaar included.** The greeting, the account chip and the name on each sale are the signed-in person's own. No name known means the role word.                                                   | the same, and the smoke suite reads `event_sales.clerk`   |
| H5  | **Closed.** Her own tagline, or none, through one guarded edit to the locked shop screen ([protected-exception.md](protected-exception.md), last section).                                                     | the same                                                  |
| H6  | **Closed.** "Who can see what" lists the active profiles. What each role can open is worded for the live app.                                                                                                  | `ops-runtime-names`                                       |
| H14 | **Closed.** No sentence names the owner or the shop; each asks `src/lib/orders/identity.ts`, which holds her shop details or neutral wording.                                                                  | `ops-runtime-names`                                       |
| C1  | **Closed by the figure.** "Profit this month" is the shop's calendar month to date. The label is locked; the P&L still shows the last 30 days, and says so.                                                    | `ops-runtime-names`                                       |
| C2  | **Closed.** The books CSV, rows and file name, is on the shop's clock.                                                                                                                                         | `books.test.ts`                                           |
| C10 | **Partly closed.** One module (`src/lib/time/business-clock.ts`) and one function (`public.business_clock()`) define the day, week and month; nothing else in `src/` may name the zone. What is left is below. | `business-clock.test.ts`, the role suite's fixture replay |
| N11 | **Closed for the rules sheet.** A setting never saved says "Default, not confirmed yet."                                                                                                                       | `ops-runtime-names`                                       |

**Found on the way and fixed:** the Settings row for payment rules opened the prototype's
payment channels (a name and two masked numbers); the helper's refusal toast, the "only the
owner" screen and three staff toasts named the owner; an empty menu showed the engine's six flavours; the pricing sheet's example named three ported flavours and crashed on a menu
without them; "Preview checkout" filled the box with the same three; the set-up note named
the operator; the lookup field's hint was a prototype order number; the privacy line named
the shop.

**Recorded, not fixed here:**

| #   | What                                                                                                                                                                                                                                | Goes to               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| R1  | C10, the rest: the engine's ordering window, "closing tonight" and its own date wording read the device clock. On a phone set to Manila they agree with the server. They cannot change without an engine edit.                      | The screens' redesign |
| R2  | `place_order`, `get_shop_status` and `join_waitlist` still write the Manila date inline. Applied migrations are not edited.                                                                                                         | B3                    |
| R3  | Bazaar Mode's payment sheet offers a fixed list of wallets (GCash, Maya, GoTyme), written in the engine, and the ported Payments screen names two of them. Bazaar Mode was not changed before the bazaar beyond the name on a sale. | C7, C1 (orders)       |
| R4  | An empty menu cannot get its first flavour: the editor refuses to add to a list that has never loaded with a row in it (the guard that stops "Publish" emptying the shop). The trial has 26 flavours, so nobody meets it.           | B6                    |
| R5  | The engine cannot draw a shop with no flavour at all (it reads the first one on every render). Live mode answers that one read with a blank entry; the list itself stays empty. A workaround in the subclass, not a fix.            | The screens' redesign |
| R6  | The shop heading "This week's drop", the logo and its alt text are as ported.                                                                                                                                                       | C8                    |
| R7  | The privacy paragraph's own wording, who hosts the data and the one-year retention figure are still text in the footer (H15, H16).                                                                                                  | C5                    |
| R8  | Address, phone, email and the time zone are not settings yet (Ethan, 6 October: only the four the findings need).                                                                                                                   | C5, C11               |
| R9  | Packaging item names in the completeness check and two database functions (H12, H13).                                                                                                                                               | B3                    |
| R10 | `tests/integration/security/test_function_authority.py` is run by nothing: its pinned count had drifted from 94 to 96 before this slice (now 99, correct). The database-side check of the same list did run throughout.             | B7                    |

**R13, to C6.** The name the app greets a person by, and records on each bazaar sale, is
their profile's display name. Nothing in the app edits it: "Who can see what" only lists it.
Until Account has a people form it is set in the database.

**R12, to C3.** Home says "Drop 32": the drop number starts from the engine's own, and baked
stock is counted for that number. It is a counter the owner never set. Found when the smoke
suite ran on a freshly reset database: its seeded batch carried no drop number and the Bazaar
table had nothing to load (fixed in the suite, not in the app).

**R11, to B6.** For the moment before the flavour list arrives on a staff page, and for as
long as it cannot be read, the screens show the six flavours the engine holds, as they did
before B2. Emptying the list there was tried and withdrawn the same day: the smoke suite showed
it takes the whole app down, because batches and baked stock already on the phone name
flavours and the engine cannot draw a name it does not hold. Only an answered, empty menu is
shown as empty. It closes when the new Recipes screens stop reading the engine's list.

**Section 6.7 re-check.** Every row marked "Today: yes" has a form in the live app that offers
something to change; the smoke suite opens each and fails if one does not: Menu & flavours,
Recipe drafts, Stock items, Suppliers & prices, Boxes & add-ons, Order rules, Payment methods,
Shop texts, Bazaar events, Shop status, Books & costs, and the rules sheet behind Settings.
"Shop details" moved from "No" to a form for its first four fields (R8 has the rest).
