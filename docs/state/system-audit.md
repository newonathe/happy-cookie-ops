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
