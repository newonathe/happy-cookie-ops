# Happy Cookie Ops: master remediation backlog

> **Published copy (6 November 2026).** Analysis at `c84d23d`; read-only. Local paths from the working copy were replaced by
> branch references, and HCB-001 status updated to draft PR newonathe/happy-cookie-ops#51. No finding, status or
> priority was otherwise changed. Not owner-approved: every decision in section 4 is open.

Read-only analysis, 6 November 2026. No application code, hosted data, migrations, branches or stashes were changed.

## 0. Baselines and method

| Item                                           | Value                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current development head (reconciled against)  | `origin/codex/cloud-full-goal-20261106` at `c84d23d` (contains `codex/refined-workflows` `9313543` + two bake commits)                                                                                                                                                                                                        |
| Visual capture commit                          | `b54239c` (audit branch `audit/actual-app-visual-capture-2026-11` at `970909f`, PR #50 as stated by the user, unmerged)                                                                                                                                                                                                       |
| `src/` difference b54239c → c84d23d            | Only `src/lib/data/bake.ts`, `production.ts`, `live-production-types.ts`, `recovery.ts`, `types/database.ts` and production hunks of `ops-runtime.tsx`. No file behind a visual finding changed except production results.                                                                                                    |
| Earlier audit reconciled                       | `docs/design/system-audit-2026-11-05.md` (Codex, at `b736108`), findings SA-F01..F10                                                                                                                                                                                                                                          |
| Client review reconciled                       | `docs/design/client-meeting-2026-11-04.md` (O*, M*, S*, C*, B* items) and `owner-workflow-additions-2026-11-05.md`                                                                                                                                                                                                            |
| HCB-001 fix                                    | `fix/hcb-001-pickup-date-review-20261106` at `26ac1e4` (cherry-pick of local `1ab9bc8`, change lines identical), draft PR newonathe/happy-cookie-ops#51 targeting `codex/cloud-full-goal-20261106`. Independent review pending.                                                                                               |
| ChatGPT Bazaar v4 review / remediation tickets | **Not found as local files** (searched the filesystem and every branch). The repository's own `docs/design/reference-v4/*` and `reference-v4-page-contracts.md` were read as reference only. Bazaar v2/v3 material (`docs/design/bazaar-v2.md`) is cited only where it records an owner decision or conflicts with a finding. |
| Evidence                                       | Screenshots and `facts.json` for HCB-001 and for every Live@HEAD reproduction below are on the never-merge branch `evidence/hcb-001-pickup-date-20261106` under `docs/audits/hcb-001-pickup-date-2026-11-06/` (images are WebP; names as cited, with `.webp`).                                                                |

**How "reproduced" was established.** Three levels, stated per item:

- **Live@HEAD**: re-run at `c84d23d` with the real components (the repository's owner preview host with synthetic RPC; harness on the evidence branch), Chromium, clock Tue 10 Nov 2026 10:00 Manila, 390 and 1440 px. Facts: `docs/audits/hcb-001-pickup-date-2026-11-06/backlog-reproductions/head-c84d23d/facts.json` and `head-c84d23d-b/facts.json` on `evidence/hcb-001-pickup-date-20261106`.
- **Source@HEAD**: the code path that causes it was read at `c84d23d` and is byte-identical to `b54239c` (diff-proven above), with the audit's screenshot as the observation.
- **Unverified**: not reproduced, or contradicted by source.

Status values: `unverified`, `reproduced`, `already fixed`, `blocked`, `decision required`.
Severity: **S1** money/records/customer promise wrong, **S2** owner given false operational information or blocked from a core task, **S3** degraded task or accessibility failure, **S4** cosmetic or wording.
Priority: **P0** next, **P1** this release, **P2** before owner acceptance, **P3** later.

Source ID key: `V-n` = audit findings.md section n; `M-*` = audit measured-layout results; `SA-Fnn` = 5 Nov system audit; `CR-xx` = 4 Nov client review; `NEW` = found in this pass.

---

## 1. Findings already corrected in the current branch

| Source              | What                                        | Evidence                                                                                                                                                                 | Independence of verification                                                                |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| SA-F01              | Refused event save reported as confirmed    | Fix `7b8e819` is an ancestor of `c84d23d`                                                                                                                                | Commit presence only; behaviour **not** re-probed in this pass                              |
| SA-F02              | Phone/tablet till hid the itemized sale     | Fix `9db3e62` is an ancestor of `c84d23d`                                                                                                                                | Commit presence only; not re-probed                                                         |
| SA-F03              | Recipe quantity dropped at Start production | `7292d4b` in HEAD; `ops-runtime.tsx` `startProductionFromMake(productId, cookies)` toggles the product and sets the quantity                                             | Source verified. **No unit test** covers it; see HCB-031 for a suspected side effect        |
| SA-F04 (stock half) | Inventory showed never-counted items as Out | `5231c6a` in HEAD; `inventory-live.tsx:74,101` shows "Not counted"                                                                                                       | Source verified. The **Home half is still open** (HCB-019)                                  |
| SA-F08 (scope half) | Flavour earnings scope unclear              | `money-live.tsx:466` heading "What each flavour earns, all time"                                                                                                         | Source verified. The chart-scale half is still open (HCB-040)                               |
| V-1                 | Owner pickup date                           | Fix on `fix/hcb-001-pickup-date-review-20261106` (`26ac1e4`), draft PR newonathe/happy-cookie-ops#51: 32 new tests, before/after at 320/390/768/1440 in two client zones | **Not on the development branch.** Reproduced live at `c84d23d`. Independent review pending |

**None of the 13 visual-capture findings is fixed on the development branch.**

---

## 2. Master backlog

### A. Proven bugs

#### HCB-001 · Owner sees the next default pickup, not the order's saved pickup

- **Source:** V-1. **Section/view:** Sell › Orders list and Order detail; all states with orders; all viewports.
- **Observed:** every order reads "Mon 16" (list) / "Monday 16 Nov · 9 AM – 5 PM" (detail). HC-1101 is saved for 11 Nov 10:00; the customer page says "Wed, Nov 11 · 10:00 AM".
- **Evidence:** audit `screenshots/sell/order/claimed-payment-review/d1440.webp`, `sell/orders/populated/d1440.webp`, `shop/customer-status/awaiting-payment-claimed/d1440.webp` @ `b54239c`. Live@HEAD: `head-c84d23d/pickup-{390,1440}.webp`.
- **Code:** `src/store/engine/ops-engine.js:55-70` (`dropCycle`, `windowsFor`), `:673-676` (`windowText`), `:2592`, `:2663`; `src/lib/data/staff-orders.ts:273-313` (`toEngineOrder` keeps only `day`).
- **Status:** reproduced (Live@HEAD). Fix in draft PR newonathe/happy-cookie-ops#51 (`26ac1e4`), independent review pending.
- **Impact:** owner prepares and plans for the wrong day; customers arrive on a day the owner does not expect. **S1 / P0.**
- **Correction (done in `26ac1e4`, PR #51):** runtime overrides `orderList[].pickup` and `od.pickup` from `pickup_date`/`pickup_window`, worded by the customer's `pickupLabel`; missing/invalid shows "Pickup date not saved" with an instruction.
- **Alternatives:** carry pickup fields on `EngineOrder` and override `windowText` per order (impossible without the order identity); edit the engine (forbidden).
- **Conflicts:** new copy is PLACEHOLDER (OD-12).
- **Dependencies:** none. **Blocks:** HCB-016 (same runtime hook), HCB-002a (same file region).
- **Tests/acceptance:** `tests/unit/saved-pickup.test.ts`, `tests/unit/ops-runtime-saved-pickup.test.tsx` (8/9 fail without the fix); `pnpm verify` green.
- **Verification still required:** independent review; push.

#### HCB-002 · Failed reads look like "loading" or a genuine empty result

- **Source:** V-2, SA-F09. **Views:** Orders, Payments, Events, Inventory, Shopping, Suppliers, Money, Sales log, Recipe book, Home (loading = failure); Order rules and Boxes & add-ons fall back to the Shop hub silently.
- **Observed:** with the orders read failing, Orders says "No orders match this filter". Inventory says "Stock is loading." indefinitely. Money says "Books not loaded yet" with no Retry.
- **Evidence:** audit `sell/orders/loading/d1440.webp`, `stock/inventory/loading/d1440.webp`, `home/home/loading/d1440.webp`, `money/money/loading/d1440.webp`, `shop/order-rules/read-failure/d1440.webp`, plus the pixel-identical list in findings.md. Live@HEAD (Orders): `head-c84d23d/ordersFail-{390,1440}.webp`, `saysNoMatch: true, mentionsFailure: false`.
- **Code:** `src/components/live/sell/orders-live.tsx:136-140` (`v.orderEmpty` shown regardless of load); `src/lib/data/staff-orders.ts` `StaffOrderSync.load` (failure returns false, no state exposed); `src/components/live/stock/inventory-live.tsx:362`, `stock-shared.tsx:104`; `src/components/live/money/money-live.tsx:279-285`.
- **Status:** HCB-002a fixed earlier (`a36ddc6`, `7500b6c`). **Probe 12 November** (`tools/owner-preview/probe-failed-reads.cjs`, SYNTHETIC: owner preview, fake data, each screen's read failing from page load via `window.qaFailRpcs`, 390 px, screenshots inspected): 002b Inventory: says "Inventory is unavailable" with Retry (handled). 002c Money P&L: "Your books could not be read" with Retry (handled). **002d Payments (`get_staff_orders` failing): "Everything matched", "No payment references to check.", ₱0 and "Every reference is accounted for": a false all-clear, no Retry — fixed in this slice.** 002e Events (`get_scheduled_events`): "Reading your events…" with skeletons and a disabled Add an event, no Retry — fixed `eac51ab` (failure with Try again; stale list kept with a notice). 002f Shopping and Suppliers: the inventory notice with Retry (handled). 002g Sales log (`get_books`): "0 sales recorded / No sales recorded yet": a false empty — fixed `a19acf5` (the P&L's books-not-loaded panel with Retry). 002g Recipe book (`get_recipes`): inconclusive (the list comes from the catalogue; the cost notice shown is the preview's baseline). 002h Order rules and Boxes (`get_order_rules`, `get_order_extras`): the page does not open and the toast says "Offline. That did not save." for a read: wrong words, open, low. 002i Home: books failure stated; the Orders tile says "Orders are still loading." when the orders read failed (dashes, not zeros): open, low.
- **Impact:** owner believes there are no orders or no stock when the device simply could not read; may miss payments to review or re-buy stock. **S2 / P0 (Orders), P1 (others).**
- **Correction:** each screen distinguishes `loading`, `failed (never loaded)`, `failed (showing last good copy)` and `read`, with a local Retry, using the existing `Banner` (`src/components/ui/banner.tsx`) as `recipe-reader.tsx:117-127` already does. One screen per slice (HCB-002a Orders, 002b Inventory/Stock-shared, 002c Money, 002d Payments, 002e Events, 002f Shopping/Suppliers, 002g Sales log/Recipe book, 002h Order rules/Boxes, 002i Home tiles).
- **Alternatives:** one global "connection problem" banner (loses per-screen recovery); an error boundary (wrong layer; reads do not throw).
- **Conflicts:** none recorded. Copy is placeholder (OD-12).
- **Dependencies:** 002a after HCB-001 lands (same `renderVals` region in `ops-runtime.tsx`).
- **Tests/acceptance:** per screen: first read fails → failure text + Retry, no empty-result sentence; Retry succeeds → list; later reload fails → last good list kept + stale notice; read succeeds empty → genuine empty text only then.
- **Verification:** unit tests on runtime vals and component render; 320/390/768/1440 captures of each state.

#### HCB-003 · Products shows the built-in catalogue and prices after a failed product read

- **Source:** V-3. **View:** Make › Products, product read failed, all viewports.
- **Observed:** ₱130 Double Chocolate Fudge (built-in) shown while the fixture price is ₱125; Recipe, Edit product, Hide offered; no failure notice.
- **Evidence:** audit `make/products/loading/d1440.webp` vs `make/products/populated/d1440.webp`. Live@HEAD: `head-c84d23d/flavoursFail-1440.webp` (`showsBuiltIn130: true, showsFixture125: false, hasEditControls: true`).
- **Code:** `src/store/ops-runtime.tsx` `loadFlavours` (~2088-2116: on failure "the list in hand stays", deliberately, R11); `src/components/live/recipes/products-live.tsx` has no load-state check; `src/lib/data/flavours.ts:294` `FlavourSync.loaded` exists but is not surfaced.
- **Status:** fixed in `fbf4b52` (working branch `claude/dreamy-faraday-74rshc`, not on main). Products shows products and prices only once the catalogue has been read: status line when unread, alert and Try again after a failed first read, last good list labelled "as of" after a failed refresh, genuine-empty line. New `src/lib/data/flavours-read-state.ts`; `FlavourSync` numbers reads. Copy is PLACEHOLDER (OD-12). Review clear with notes; synthetic visual check at 390 and 1440 px.
- **Impact:** owner reads wrong prices as hers and may quote them; edits are refused by `FlavourSync.save` (no row read), so no data damage. **S2 / P1.**
- **Correction:** keep R11's in-memory list for names (batches, till), but Products shows "Menu not loaded" + Retry and hides prices/edit controls while `flavourSync.loaded` is false.
- **Alternatives:** clear the list on failure (breaks R11: running events and batches need names).
- **Conflicts:** R11 (system-audit.md) is preserved by the proposed correction.
- **Dependencies:** none. **Tests:** failed read → no peso prices, no Edit/Hide, Retry present; later success → real prices.

#### HCB-004 · A malformed server answer halts the app or a page

- **Source:** V-12 (worse than recorded). **Views:** start-up chain; Make › Products; Account.
- **Observed (audit):** malformed `get_flavours` → Products blank + "Cannot read properties of undefined (reading 'short')"; `get_settings` → "rows is not iterable". **Live@HEAD (new):** a malformed `get_flavours` answer throws in `engineCatalogue` ("reading 'localeCompare'") and **stops the whole load chain**: only `get_shop_status` and `get_flavours` were called, so orders, stock, production, books and events never load.
- **Evidence:** audit `make/products/malformed-answer/d1440.webp`, `account/account/populated/d1440.webp`; Live@HEAD `head-c84d23d-b/flavoursMalformed-{390,1440}.webp`, `calls: ["get_shop_status","get_flavours"]`.
- **Code:** `src/lib/data/flavours.ts:62-66` (`data ?? []`, no shape check), `:50-60` (`engineCatalogue` sorts on `a.id.localeCompare`); `src/lib/data/settings.ts:113-120`; `src/lib/data/settings-sync.ts:78,101`.
- **Status (11 November):** partly fixed on the working branch (not on main). `de26d26`, corrected by `5b3e979` and `47285e1`: after a failed first catalogue read, a successful Try again starts the Orders and Recipes reads once, only for the verified owner, and keeps working after the tab is hidden and shown again; the first product can be created on a confirmed-empty menu (unread, failed or in-flight reads still refuse). The first version was BLOCKED by review (watch dropped on a same-person re-check); the re-review is clear with one gap, closed in `47285e1`. Gate at `47285e1`: `pnpm verify` 233 files / 3,736 tests + 2 TODO. Boundary validation: fixed `6ff0340` (12 November): `get_flavours` and `get_settings` answers are parsed with Zod; a malformed row fails the whole read (rows are not dropped: a partial menu would be shown as hers and a save from it could shrink it); the gate's other reads still start. Before: a row with no id was shown as a product with Edit and Hide; tied sort orders threw.
- **Open findings, not fixed:**
  - a. After a failed first catalogue read the engine's built-in products and prices showed on owner screens (pre-existing). Per screen: **Bazaar plan and Start day: fixed `42083fc`, follow-ups `3ccde27`** (the till itself was never affected; it draws only the open day's own tiles). **Bake plan** (Shopping, Planned bake product list, `ops-runtime.tsx` ~1093): reproduced, fixed. **Home** ("Products & recipes: 6 on the menu", `flavourCount` over `PRODUCTS`): reproduced, fixed (`PRODUCTS[0]` is not read by the live Home). **Owner's Shop preview** (c1b guard needed `!this.flavourSync`, so after a read attempt the six at P130 showed): reproduced, fixed. **Shop page, This drop's menu** (`dropProducts`, not on the original list): reproduced, fixed. Test: `tests/unit/catalogue-held-screens.test.tsx` (22 tests: failed read, unanswered read, read OK, kept copy, Try again, store entry point, public shop). The public customer shop is not affected: it is never told `catalogueHeld`, has no `flavourSync`, and keeps its own menu notice.
  - a2. **Fixed `a6ae8a2` (12 November), not deployed.** The remaining owner views show no built-in product, price or count after a failed or unanswered first read with nothing kept, and say "not read" instead of a zero or "none": the recipe book and recipe drafts, Production (order plan, work, saved batch names), Inventory dough and baked rows, the Settings and launcher subtitles, the Products subtitle, the pricing example, Shopping's "Cookies to bake", and the All tools "Menu & flavours" count. The source-level proposal (emptying the engine's list) was tested and rejected: it fails `products-read-state` 6a and 8 and three `flavours` tests, and the protected engine throws in `setPrice` and `toggleDropProduct`. Views are gated through `heldProducts()` and `catalogueUnread()` (`ops-runtime.tsx`, beside `catalogueHeld()`). Test: `tests/unit/catalogue-held-owner-views.test.tsx` (41; 18 failed first). Review (Sonnet `security-reviewer`, high): clear with notes. Gate: `pnpm verify` 236 files / 3,815 tests + 2 TODO. Synthetic captures at 390 and 1440 px inspected. Hosted, device and owner acceptance pending.
  - a3. **Fixed `b097b4c` and `d6a4de2` (12 November).** A check that verified on /shop started no staff reads until the next check and the a2 views showed the built-in six. Now the reads start when she reaches a staff screen; while a reader is due but not bound (for example after a same-person sign-in on /shop) `flavoursRead.expect()` keeps every owner view on "not read", the move asks for a check at once, and a check answered for an older identity asks again. Tests a3-1 to a3-6, owner-views e (nine views), `flavours-read-expect`. Reviews clear. Left open (pre-existing, low): a production-scope change verified on /shop after the reads started is not rebound.
  - g. **Fixed `9e657c0` (12 November).** A production batch of a product outside the engine's list, read while the catalogue had failed or not answered, threw at `ops-engine.js` 3869 (`P[v.pid].short`) in the root provider and blanked the whole app; the gate's parallel reads made an ordinary load reachable too. The runtime now lends the existing one-render placeholder to variance product ids (`renderWithSaleLabels` extra ids); live mode never draws those rows. Tests g1-g3 in `catalogue-held-owner-views`. Review clear with notes.
  - b. Creating the first product on a confirmed-empty menu while a Bazaar event is running would shrink the engine list to one row (theoretical, low; possible belt: refuse with a visible reason while `event.stage !== 'closed'`, ~3040).
  - c. An older read answering empty after a newer read failed sets `readEmpty` (`flavours.ts` ~387), low.
  - d. Focus is lost after a successful Try again on the Orders and Products notices, low.
  - e. A pre-existing "Offline..." toast covers part of the first product card at 390 px in the stale state.
  - f. In the offline-restore path Products says "not read yet" with no retry (only Bazaar Mode is reachable offline), low.
- **Impact:** any schema drift between the deployed database and the client (README records the deployed trial differs from this branch) blanks the owner's app. **S2 / P1.** Breaks the AGENTS rule "every API input parsed at the boundary".
- **Correction:** validate rows at the boundary (drop malformed rows, treat a non-array as a failed read) in `fetchFlavours` and `fetchSettings`; isolate each loader in the start chain so one failure cannot stop the next.
- **Alternatives:** try/catch around `engineCatalogue` only (hides the cause, leaves settings).
- **Dependencies:** HCB-003 (shares the failed-read presentation). **Tests:** non-array, missing `id`, wrong-typed price, mixed good/bad rows; the start chain continues after a malformed flavour answer.

#### HCB-005 · Till messages cover Charge and the wallet buttons

- **Source:** V-4, M-covered. **View:** Bazaar › till with a sale; offline toast and "last 4 digits" toast; 390 and 768 px.
- **Observed:** at 768 the offline toast covers Charge (`elementFromPoint` returned the toast; click did nothing until it left); at 390 the reference toast covers GCash.
- **Evidence:** audit `bazaar/till/offline-toast-over-charge/{t768,p390}.webp`, `flows/bazaar-event-to-finalize/10-wallet-needs-reference/p390.webp`.
- **Code:** toasts from protected engine `ops-engine.js:813`, `:3101`; placement overridden in `src/store/ops-runtime.tsx` `liveToastVals` (~8862-8870) only when `device === 'mobile'`, so tablets get the default position; 104 px lift on phones is below the taller sale bar.
- **Status:** fixed `941380c` (12 November). Reproduced in a browser (owner preview, synthetic): covered at 320, 390 and 768. The till measures its sale bar into `--till-sale-bar`; on phone and tablet the toast stands above it; while paying it moves to the top. `tools/owner-preview/check-till-toast.cjs` passes at 320 to 1440 px (Charge, wallet buttons, reference field, Close, Undo). Review clear with notes.
- **Impact:** owner cannot take payment at the stall while the message shows. **S2 / P1.**
- **Correction:** in `liveToastVals`, lift above the measured sale bar on every device class showing the consolidated till, and for the payment sheet place the message inside the sheet (the pattern already used for production sheets).
- **Alternatives:** make the toast click-through (breaks Undo buttons in toasts).
- **Dependencies:** none. **Tests:** at 320/390/768/1024 with cart + offline toast, Charge centre is not covered (`elementFromPoint`); a press on Charge opens payment; same for GCash with the reference toast.

#### HCB-006 · Saved, but the page still asks for the same action

- **Source:** V-5, SA-F09. **View:** Sell › Order, payment confirmed, refresh fails.
- **Observed:** toast "marked paid" while the page still shows "Check this payment" and Confirm payment.
- **Evidence:** audit `sell/order/saved-refresh-failed/d1440.webp`.
- **Code:** `src/lib/data/staff-orders.ts` `StaffOrderSync.run` (`if (outcome.kind === 'ok') await this.load();` ignores the result); `src/store/ops-runtime.tsx` `liveOrder` toasts success regardless.
- **Status:** fixed `b9e5efe` (12 November). The acknowledged row is shown when the refresh fails, with "Saved. Could not refresh the list." and Try again; the action is not re-offered; an older refresh cannot bring the old order back. Tests `order-saved-not-refreshed`, `staff-orders`; browser check `tools/owner-preview/check-saved-not-refreshed.cjs`. Review clear with notes (swap/refund partial patch open, low).
- **Impact:** owner may press Confirm again (server replay is idempotent, so no double charge) or distrust the app. **S3 / P2.**
- **Correction:** after an acknowledged change whose refresh fails, show the acknowledged state for that order (from the RPC answer) with "Saved. Could not refresh the list" + Retry; never re-offer the same action.
- **Dependencies:** HCB-002a (shared read-state). **Tests:** ack ok + reload fails → no Confirm button, saved message, Retry.

#### HCB-007 · Reject cancels an order on the first press

- **Source:** V-6a. **View:** Sell › Order, Payment review.
- **Observed:** one press cancels the order and frees its slots; no question first.
- **Evidence:** audit `sell/order/rejected-at-once/d1440.webp`. Live@HEAD: `head-c84d23d-b/rejectFirstPress-{390,1440}.webp` (`dialogShown: false, sentReject: true`).
- **Code:** `src/components/live/sell/order-live.tsx:62-63`; `src/store/ops-runtime.tsx:8051` (`eng.rejectPayment` sends at once).
- **Status:** fixed `7a1bd63` (12 November), the OD-03 default form (a dialog through the shared Sheet; Keep order first; Confirm sends `staff_reject_payment` once). Test `order-reject-confirm`. Review clear with notes. OD-03 stays open for the owner's choice of form.
- **Impact:** a mis-tap cancels a customer's order and releases capacity; Reopen exists but the customer may already have been told. **S2 / P1.**
- **Conflicts:** owner rule 5 Nov "explicit confirmation for consequential changes" requires a fix; only the form is open (OD-03).
- **Correction:** a confirmation step naming the customer and consequence, reusing the existing void-confirmation pattern on the till.
- **Tests:** first press sends nothing; confirm sends `staff_reject_payment` once; cancel sends nothing.

#### HCB-010 · The helper's Home is blank

- **Source:** V-7. **View:** Home, role helper, all viewports.
- **Evidence:** audit `account/role-helper/home/{d1440,p390}.webp`. Live@HEAD: `head-c84d23d-b/helperHome-{390,1440}.webp` (`liveHomeNull: true`).
- **Code:** `src/store/ops-runtime.tsx` `liveHomeVals` returns null unless `role === 'owner'`; `src/components/live/home/home-live.tsx:94` returns null.
- **Status:** reproduced (Live@HEAD).
- **Impact:** a helper's first screen has no path to their work. **S3 / P2.**
- **Conflicts:** register (decision-register.md, "Who can see what") says helpers open Home, Sales log and Bazaar; content needs OD-04.
- **Correction:** interim: helper Home shows the two allowed destinations (Bazaar, Sales log) and today's open event, with no money figures. Final content per OD-04.
- **Tests:** helper Home has a heading and links to Bazaar and Sales log; contains no peso figure.

#### HCB-011 · Phone Sign out pill floats over content and is under target size

- **Source:** V-8, M-covered, M-targets (245 captures at 73×32). **View:** every owner page at phone width.
- **Evidence:** audit `make/recipe-book/populated/p390.webp`, `make/recipe/default/p390.webp`, `home/home/populated/p390.webp`.
- **Code:** `src/components/app/sign-out-control.tsx:137-150` (fixed, `bottom: calc(safe-area + 84px)`, `minHeight: 32px`); mounted at `src/components/app/live-gate.tsx:623`.
- **Status:** reproduced (Source@HEAD).
- **Impact:** hides content and controls; small target. **S3 / P2.**
- **Correction:** place Sign out in the Account page / account menu for owners; keep a reachable sign-out for the bazaar helper flow (A3 unsent-sales count must still run).
- **Alternatives:** keep the pill but reserve page padding beneath it.
- **Conflicts:** placement is a minor design choice (OD-14).
- **Tests:** at 390 no content element is covered by the sign-out control at any scroll position; sign-out still counts unsent sales.

#### HCB-012 · Back from Compare prices lands on Inventory

- **Source:** V-9a. **Flow:** Stock › Shopping › Compare prices › Back.
- **Evidence:** audit `flows/stock-suppliers-shopping/06-back-to-shopping/d1440.webp`.
- **Code:** `src/store/ops-runtime.tsx:5444-5450` (`openItemPrices` switches to Inventory without recording the origin).
- **Status:** reproduced (Source@HEAD). **Impact:** owner loses her place in the shopping list. **S4 / P2.**
- **Correction:** remember the origin (Shopping or Planned bake) and return there on Back and browser Back.
- **Conflicts:** CR-S7 ("It now opens the item, not a comparison"): destination accepted as interim; real comparison is OD-15.

#### HCB-013 · Reloading the recipe editor lands on the Recipe book

- **Source:** V-9b. **Evidence:** audit `flows/make-recipe/09-reload/d1440.webp`.
- **Code:** `src/components/app/route-sync.tsx` writes only the Bazaar query (`:135`, `:163`, `:206`); the open recipe (`liveRecipeTarget`, `ops-runtime.tsx` ~8559-8611) is memory-only.
- **Status:** reproduced (Source@HEAD). Whether an unsaved edit is lost on reload is **unverified** (HCB-038).
- **Impact:** owner loses her place; possible lost edits. **S3 / P2.**
- **Correction:** encode the recipe id (and editor mode) in the address the way Bazaar does, restoring through RouteSync without remounting (known trap: no router navigation).

#### HCB-014 · Till "Settings" button is announced as "Till menu"

- **Source:** V-10b. **Code:** `src/components/live/bazaar/till.tsx:123`.
- **Status:** reproduced (Source@HEAD; literal `aria-label`). **Impact:** WCAG 2.5.3 Label in Name failure; voice-control users cannot say what they see. **S3 / P2**, one-line fix.
- **Correction:** remove the `aria-label` or make it start with the visible word ("Settings").
- **Tests:** `getByRole('button', { name: 'Settings' })` finds it.

#### HCB-016 · "1 cookies" and similar

- **Source:** V-11b. **Views:** Orders list rows; Production results.
- **Code:** protected engine `ops-engine.js:2591` (`orderCount(o) + ' cookies'`) → fix through the runtime `liveOrderList` override added by HCB-001; `src/components/live/production/production-receipts.tsx:104-105` ("cookies", "balls").
- **Status:** reproduced (Source@HEAD; audit `sell/orders/populated/d1440.webp`). **S4 / P3.**
- **Dependencies:** HCB-001 (adds the override). **Tests:** 1 → "1 cookie"/"1 ball"; 2 → plural.

#### HCB-017 · Money row "Drops" for order income

- **Source:** V-11c. **Code:** `src/lib/data/books.ts:213-221` maps category `Orders` → `Drops` because the engine's P&L reads `Drops`; the label leaks to the screen.
- **Status:** reproduced (Source@HEAD; audit `money/money/populated/d1440.webp`). **S4 / P3.**
- **Correction:** keep the internal mapping; display "Orders" in the live Money view. Check the word list (`tests/unit/ui-language.test.ts`).

#### HCB-019 · Home calls never-counted stock "Out" while Inventory says "Not counted"

- **Source:** SA-F04 (Home half), CR-B6. **Code:** `src/store/home-desk.ts:42-63` (uses `stockStatus(onHand, par)`; comment claims the Stock page's rule, which is now `inventory-live.tsx:74,101`).
- **Status:** reproduced (Source@HEAD). **Impact:** owner told items are out when they are only unverified; may buy unnecessarily. **S3 / P2.**
- **Correction:** Home uses the same rule as Inventory: never counted is its own state, offered "Count stock", not counted in Out.
- **Tests:** never-counted 0-balance item → not in Out count, listed as Not counted with Count action.

#### HCB-020 · Small horizontal overflow

- **Source:** M-overflow. `bazaar/day-plan/{change-existing,new-day}@p390` (2 px, footer text from `src/lib/bazaar/plan.ts:165`); `other/all-tools/default@p320` (1 px, ported `src/components/screens/all-tools.tsx`, protected).
- **Status:** reproduced (Source@HEAD for day plan). **S4 / P3.** All tools fix is **blocked** by the protection rule unless done by value.

### B. Unverified suspected bugs

| ID      | Source                        | Suspicion                                                                                           | Why unverified                                                                                                                                                                                                                                         | Code                                                                                                                                 | Next step                                                                                                                                                                              |
| ------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HCB-030 | V-13                          | Session expiring mid-work does not visibly end                                                      | Source says "no user" → `denied` → `lockOut` (`src/lib/auth/live-gate.ts` `checkStaffProfile`; `src/components/app/live-gate.tsx:385-398, 566-594`). The harness result contradicts this; may be a harness artifact (rate limiter or fake auth events) | as listed                                                                                                                            | Unit test of the live gate re-check with `getUser` → no user after a verified session                                                                                                  |
| HCB-031 | NEW                           | Start production from a recipe guesses "dough" when the quantity equals a full or half recipe yield | Read in source, not exercised                                                                                                                                                                                                                          | `ops-runtime.tsx` `startProductionFromMake`: `const dough = cookies === product.yield \|\| cookies === Math.ceil(product.yield / 2)` | Reproduce: recipe yield 24, request 24 cookies; check whether the planner opens Prepare dough with "24" as a portion count. Owner rule M2 (dough first) may make part of this intended |
| HCB-032 | coverage `record-unavailable` | An order removed while open stays on screen; `RecordUnavailable` unreachable                        | Not reached by the harness                                                                                                                                                                                                                             | `order-live.tsx:163`                                                                                                                 | Remove the order from the read while open; expect RecordUnavailable                                                                                                                    |
| HCB-033 | M-targets                     | 13×13 / 18×18 / 20×20 checkboxes may fail WCAG 2.5.8 (24 px)                                        | Spacing exception not measured                                                                                                                                                                                                                         | bazaar event-edit list, contact-remove, boxes                                                                                        | Measure target plus spacing                                                                                                                                                            |
| HCB-034 | M-contrast                    | "›" chevrons at 3.47:1                                                                              | Likely decorative (no 1.4.3 obligation); 1.4.11 needs 3:1 if essential                                                                                                                                                                                 | many                                                                                                                                 | Confirm they are decorative (aria-hidden)                                                                                                                                              |
| HCB-035 | NEW (found with HCB-001)      | "Pickup reminder: N orders Mon 16" notice uses the default schedule                                 | Aggregate, not re-run                                                                                                                                                                                                                                  | `ops-engine.js:3606` (protected)                                                                                                     | Check in live mode whether the notice appears; fix via runtime if so                                                                                                                   |
| HCB-036 | NEW                           | Customer `pickupLabel` shows "Invalid Date" for a malformed date                                    | Column constraint makes it unlikely                                                                                                                                                                                                                    | `src/lib/orders/status-view.ts:55`                                                                                                   | Unit test with `2026-02-30`                                                                                                                                                            |
| HCB-037 | NEW                           | Order with no pickup date counted in the first bake/pack column                                     | Production logic; requirement says do not change without approval                                                                                                                                                                                      | `src/lib/data/staff-orders.ts:235-239`                                                                                               | Owner decision whether undated orders belong in a column (OD-16)                                                                                                                       |
| HCB-038 | V-9b                          | Reloading the recipe editor discards unsaved edits                                                  | Not exercised                                                                                                                                                                                                                                          | `recipe-editor.tsx`                                                                                                                  | Edit, reload, check draft                                                                                                                                                              |

### C. UI/UX improvements

| ID      | Source        | Problem                                                                                                  | Code                                                                              | Correction                                                           | Sev/Pri | Notes                                                                |
| ------- | ------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| HCB-015 | V-10a, CR-B13 | Till draws header Back and page Back together                                                            | `till-bar.tsx:9-30`, `owner-workspace.tsx:434`                                    | One Back per page; keep "Back to events" in the header slot          | S4/P2   | CR: "worst cases fixed; page-by-page pass remains"                   |
| HCB-018 | V-11a         | Four date formats across Home, till, events, Production                                                  | various                                                                           | One display format per kind (day, day+time), from the business clock | S4/P2   | Needs OD-05                                                          |
| HCB-021 | M-targets     | Header Back 36 px (290 captures), filter chips 40 px, Close 38 px, Dismiss 31 px wide                    | `owner-workspace.module.css:133-137`, `owner-patterns.tsx:116`, `sub-tabs.tsx:50` | 44 px per repo standard (`ui-review-standard.md:43`)                 | S4/P2   | AA (24 px) is met; repo standard is not                              |
| HCB-022 | M-clipped     | Product names, "(below the 65% floor)", amounts clipped at 320                                           | products, recipe book, events, close                                              | Wrap or provide full text; verify nothing essential is hidden        | S4/P3   |                                                                      |
| HCB-023 | M-contrast    | 10 px text at 3.24:1 on customer shop; wallet labels 3.33:1                                              | ported `src/components/screens/shop.tsx`, `src/components/sheets/pay.tsx`         | Raise contrast                                                       | S3/P2   | **Blocked**: protected ported markup; needs live replacement (OD-07) |
| HCB-040 | SA-F08        | Money chart has no peso scale                                                                            | `money-live.tsx:20-63`                                                            | Sparse peso labels or direct values; keep the amounts table          | S4/P3   | Scope half fixed                                                     |
| HCB-041 | CR-B12/B21    | Page-by-page pass: controls before content, mixed form widths                                            | many                                                                              | Continue the client-review plan step 7                               | S4/P3   |                                                                      |
| HCB-042 | SA-F05        | Customer history and export imply lifetime coverage; feed is open + last 60 days, max 500                | `customers-live.tsx:186,211,258`; SQL40:854                                       | Label "recent orders (last 60 days)" now                             | S3/P2   | Full history is D (HCB-054), OD-11                                   |
| HCB-043 | SA-F06        | Planned bake note unscoped (`hc-planned-bake-v1`), storage failure silent                                | `src/store/bake-plan.ts:82,158`                                                   | Scope key to verified owner/backend; say when saving failed          | S3/P2   | Shared-device data leak risk is also F                               |
| HCB-044 | old screens   | Customer pages, classic till, All tools, form queue, helper/support frames still use the older warm look | `src/components/screens/**`                                                       | Live replacements                                                    | S4/P3   | Blocked by protection; OD-07                                         |

### D. Missing functionality

| ID      | Source                       | Missing                                                                                                                                                    | Status                               | Dependency                                                                  |
| ------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| HCB-050 | coverage, SA-F07             | Review step for bazaar stock/fees (`event-tool-review`) and plan review (`plan-review`)                                                                    | decision required                    | OD-06                                                                       |
| HCB-051 | coverage Partial             | Event cost Review (recipe book has one)                                                                                                                    | reproduced (absent)                  | OD-06                                                                       |
| HCB-052 | CR-C1, C2, B15-B17, promises | Customer shop live replacement: sticker pictures, no reference before payment, no placeholder allergens, plain privacy, working status preview, wider shop | blocked                              | OD-07, approved live-replacement route                                      |
| HCB-053 | SA-F06                       | Planned bake → production handoff                                                                                                                          | open                                 | HCB-043                                                                     |
| HCB-054 | SA-F05                       | Complete customer history (authorized paged read)                                                                                                          | decision required                    | OD-11; new migration if approved                                            |
| HCB-055 | CR-S7                        | Real side-by-side supplier price comparison                                                                                                                | open                                 | OD-15                                                                       |
| HCB-056 | CR-M6                        | Bake date on each dough batch                                                                                                                              | open                                 | production contract                                                         |
| HCB-057 | coverage                     | Add/edit person (`person-edit`)                                                                                                                            | blocked                              | OD-08 (hosted accounts)                                                     |
| HCB-058 | coverage                     | Restore from backup page                                                                                                                                   | intentionally excluded               | none (Not a feature unless owner asks)                                      |
| HCB-059 | next-goal                    | Dough-only bake client, definite ZD001/ZD002 refusals, retained drafts, retire legacy production writes                                                    | **in progress** on `c84d23d` (Codex) | Owns `ops-runtime.tsx` production region; schedule other slices to avoid it |

### E. Owner-policy decisions (see register, section 4)

HCB-008 refund reference (OD-02), HCB-009 close-day cash pre-fill (OD-01), and the decision parts of HCB-007, -010, -011, -012, -018, -042, -050..-057.

#### HCB-008 · Refund can be recorded with no reference

- **Source:** V-6b. **Evidence:** audit `sell/order-refund/submitted-empty-reference/d1440.webp`.
- **Code:** `src/store/ops-runtime.tsx:8062-8067`; server `staff_refund` stores `nullif(btrim(p_ref), '')` (`supabase/migrations/20260101003700_staff_orders.sql`), so empty is accepted by design.
- **Status:** decision required (OD-02). The refund sheet itself is the confirmation.

#### HCB-009 · Close the day records "Exact" when nothing was typed

- **Source:** V-6c. **Evidence:** audit `bazaar/close/untouched/d1440.webp`, `bazaar/close/closed-without-cash-typed/d1440.webp`.
- **Code:** `src/components/live/bazaar/close-form.tsx` (`c846d17`).
- **Status:** decision required (OD-01). **This is an explicit owner choice** (Ethan, 16 Oct, U5: pre-fill cash counted with cash expected), which conflicts with the design rule "pre-fill facts, never decisions" (`docs/design/bazaar-v2.md:40-41, 271, 285-286`). Do not change without re-confirmation.

### F. Production-readiness gaps

| ID      | Gap                                                                                                         | Source                            | Status                                       |
| ------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| HCB-070 | Physical iPhone/Safari, safe areas, real touch, on-screen keyboard                                          | audit limits, SA                  | unverified                                   |
| HCB-071 | RLS, SQL rules, real concurrency on the target database                                                     | audit limits                      | unverified                                   |
| HCB-072 | Offline reload through the service worker                                                                   | audit limits                      | unverified                                   |
| HCB-073 | Deployed schema/API compatibility with this branch (trial differs by 13 files; migration 71)                | audit README, SA-F10              | unverified; makes HCB-004 likelier           |
| HCB-074 | Two tabs/devices changing the same record live                                                              | audit limits                      | unverified (only simulated conflicts)        |
| HCB-075 | Idle sign-out after real inactivity                                                                         | audit limits, DP-15               | unverified                                   |
| HCB-076 | CSV export contents and photo upload                                                                        | audit limits                      | unverified                                   |
| HCB-077 | Signed-in production performance with realistic data                                                        | SA §6                             | unverified                                   |
| HCB-078 | Connected business-loop scenarios (order→payment→production→stock→pickup→books; event→close→finalize→books) | SA §4                             | open                                         |
| HCB-079 | Independent review receipts for each money/stock/offline slice                                              | AGENTS, lean-plan                 | open per slice                               |
| HCB-080 | `ops-runtime.tsx` ~9.7k lines; concentration of change risk                                                 | SA-F10                            | open (do not rewrite during release)         |
| HCB-081 | HCB-001 fix awaiting independent review before acceptance                                                   | process                           | open: draft PR newonathe/happy-cookie-ops#51 |
| HCB-082 | Placeholder customer and owner copy awaiting owner wording                                                  | staff-copy.ts, ORDER_COPY         | decision required (OD-12)                    |
| HCB-083 | `/bazaar` Lighthouse Total Blocking Time is at or over its 800 ms budget on slower CI runners, at the base  | CI run 42161225346, PR #51 review | open; partly reduced 11 Nov (see below)      |

#### HCB-083 · `/bazaar` TBT budget fails at the base on slower runners

- **Observed:** CI run 42161225346 (PR #51) failed the Performance budget: `/bazaar` TBT best of 3 was 813 ms against the 800 ms limit (runs 971, 813, 937).
- **Not caused by PR #51:**
  - **Code under test not running:** the Lighthouse build sets no `NEXT_PUBLIC_APP_MODE`, so it is demo mode (`src/lib/config/app-mode.ts:14-16`). The PR's live-mode code never runs there. The script delta is +264 bytes.
  - **Equal conditions (8 interleaved rounds, same `lighthouserc.json` settings):** `/bazaar` base `c84d23d` median 850 ms (695–1,115, 6 of 8 runs over 800) against head `26ac1e4` median 856 ms (750–1,070). Paired difference: median +6 ms.
- **Pass/fail follows runner CPU speed** across five CI runs:

  | Lighthouse benchmarkIndex | `/bazaar` TBT       |
  | ------------------------- | ------------------- |
  | about 4,000               | 322–460 ms          |
  | about 3,000               | 511–617 ms (passed) |
  | about 2,450               | 813–971 ms (failed) |

  The workflow comment says the limits sit "about 1.2x above the measured baseline" (`.github/workflows/ci.yml:148-149`); that margin does not hold on slower runners.

- **Impact:** the gate passes or fails depending on which runner a job lands on, so a red result does not identify a regression and a green one does not prove the page is within budget. **S3 / P1** (process and performance).
- **Correction (to decide; never lower or skip the gate):** investigate `/bazaar` main-thread work at the base (largest long tasks in the Lighthouse trace), and reduce it until the budget holds with margin on slower runners. Alternatives:
  - more runs per URL with a median assertion;
  - recording `benchmarkIndex` beside each result.

  Both change the gate's method and need Ethan's approval.

- **Update, 11 November 2026 (still open):** commit `dcf615c` (`perf(build): leave the live screens out of demo builds`) cut `/bazaar` from 659,366 to 585,750 bytes locally (limit 655,000) and local TBT from 903 to 838 ms. CI passed on it (run 42950921345), but `/bazaar` blocking time still sits at the 800 ms limit.
  - **Evidence from failing run 42842854050** (benchmarkIndex about 2,450): TBT 831, 823 and 797 ms. Long tasks: 431 ms (application chunk evaluation) and 316 ms (first render). 268,393 of 333,505 bytes of the application chunk were unused on `/bazaar`.
  - **CI values for the three passing runs** (`lighthouse-reports` artifacts, values in report-file order; the first `/` run of each report is also the first run, with the lowest benchmarkIndex in runs 1 and 2):

    | Run                             | `/bazaar` TBT (ms) | `/bazaar` bytes | `/bazaar` benchmarkIndex | `/` TBT (ms)      | `/` bytes |
    | ------------------------------- | ------------------ | --------------- | ------------------------ | ----------------- | --------- |
    | 42950921345 (`dcf615c`)         | 657 / 728 / 666    | 585,742         | 2,452 to 2,479           | 1,395 / 612 / 572 | 858,707   |
    | 42952203720 (`main`, `ced7b82`) | 696 / 784 / 828    | 585,750         | 2,445 to 2,477           | 1,199 / 758 / 633 | 858,715   |
    | 42952255396 (trial, `ced7b82`)  | 373 / 391 / 475    | 585,749         | 3,282 to 3,443           | 1,435 / 376 / 371 | 858,714   |

    `/` benchmarkIndex per run: 1,550 / 2,436 / 2,468; 1,897 / 2,454 / 2,456; 2,892 / 3,371 / 3,116.

  - **Proposed C14 items:** split the live build by section, with service-worker caching of the section chunks and live offline acceptance; measure the live export's payload in CI (budgeting it is Ethan's decision).
  - **Also from run 42842854050:** Shop accessibility scored 0.88. Ported markup has 10 px `#a98a5f` text on white at 3.23:1, and the viewport has `maximum-scale=1`.
- **Dependencies:** none. **Conflicts:** none recorded. **Status:** reproduced (baseline), open.

---

## 3. Deduplication record (nothing discarded)

| Merged into       | Also reported as                                                                     | Why merged                           | What was kept distinct                                                                   |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| HCB-002           | V-2 (all screens), SA-F09 (Money retry, state walk), V-5 partially                   | Same root: read state not exposed    | Per-screen slices 002a-002i; HCB-006 kept separate (acknowledged write, not read)        |
| HCB-004           | V-12 (flavours, settings)                                                            | Same root: no boundary validation    | Live@HEAD shows a wider failure (start chain halts) than the audit recorded              |
| HCB-005           | V-4 (offline toast), V-4 (reference toast), M-covered "Sign out covered by Offline…" | Same mechanism: toast placement      | The Sign out overlap is also HCB-011                                                     |
| HCB-011           | V-8, M-targets "Sign out 73×32"                                                      | Same control                         |                                                                                          |
| HCB-015           | V-10a, CR-B13                                                                        | Same rule (one Back)                 | HCB-014 (accessible name) kept separate: different defect class                          |
| HCB-019           | SA-F04 Home half, CR-B6                                                              | Same contradiction                   | Stock half recorded as already fixed                                                     |
| HCB-021           | M-targets rows for Back, chips, Close, Dismiss                                       | Same standard                        | HCB-033 (possible AA failure) kept separate                                              |
| HCB-042 + HCB-054 | SA-F05                                                                               | Labelling now vs capability later    | Split into C and D                                                                       |
| HCB-043 + HCB-053 | SA-F06                                                                               | Retention vs handoff                 | Split into C and D                                                                       |
| HCB-050/051       | SA-F07, coverage Partial rows, V "reference views with no page"                      | Same review gap                      | `person-edit` (HCB-057) and `restore-preview` (HCB-058) kept separate: different reasons |
| HCB-044           | V "old screens", V-11d (theme mix), CR-B21                                           | Same cause: protected ported screens | Contrast on those screens kept as HCB-023                                                |

---

## 4. Owner decisions register

| ID    | Decision                                                                       | Options                                                                                       | Recommendation                                                                                                           | Evidence / existing decision                                                  | Blocks              |
| ----- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------- |
| OD-01 | Close-day cash counted pre-filled?                                             | (a) keep pre-fill (Ethan 16 Oct, U5); (b) blank + "It matches" (D0)                           | Re-confirm with the audit evidence: an untouched form records Exact. If kept, show "Expected, not counted" until touched | `c846d17`; `bazaar-v2.md:40-41, 271, 285-286`                                 | HCB-009             |
| OD-02 | Refund reference required?                                                     | required / optional with warning / optional                                                   | Optional with a visible "no reference recorded" note; server already accepts empty                                       | `staff_orders.sql` `nullif`                                                   | HCB-008             |
| OD-03 | Reject confirmation form                                                       | dialog / undo toast                                                                           | Dialog (rule says explicit confirmation; reject frees capacity immediately)                                              | owner additions 5 Nov                                                         | HCB-007             |
| OD-04 | What a helper's Home shows                                                     | links only / today's event + sales count (no pesos) / sales totals behind the existing switch | Today's event + links; totals only if the helper totals switch is on                                                     | register "Who can see what"; Cine Q4 (helpers may see totals behind a switch) | HCB-010             |
| OD-05 | One date format                                                                | e.g. "Wed, 11 Nov" and "Wed, 11 Nov · 10:00 AM"                                               | Pick one and add it to the word list                                                                                     | V-11a                                                                         | HCB-018             |
| OD-06 | Review step for bazaar stock, fees and event cost                              | inline effect summary / separate review / reversibility only                                  | Inline effect summary (keeps checkout fast)                                                                              | coverage "Ethan to decide"; SA-F07                                            | HCB-050, -051       |
| OD-07 | Rebuild locked customer screens as live replacements now?                      | now / after owner trial                                                                       | Required before contrast, stickers (C1), reference-before-payment (C2), privacy (B16) can change                         | coverage "needs Ethan to ask"; CR §5a                                         | HCB-023, -044, -052 |
| OD-08 | People provisioning                                                            | hosted admin only / in-app                                                                    | Keep hosted admin, explain it in-app                                                                                     | coverage Partial                                                              | HCB-057             |
| OD-09 | Hosted demo data                                                               | approve / decline                                                                             | Needed for owner review of Sell (CR-B22)                                                                                 | CR open decisions                                                             | HCB-078 rehearsal   |
| OD-10 | Correct fridge dough count by hand                                             | yes / no                                                                                      | Owner to answer                                                                                                          | CR open decisions; current.md "physical dough count remains unanswered"       | production slices   |
| OD-11 | Customer history: label the 60-day scope, or build a full paged read           | label / build                                                                                 | Label now; build only if needed (new migration)                                                                          | SA-F05                                                                        | HCB-042, -054       |
| OD-12 | Sign off placeholder copy (including new pickup messages)                      |                                                                                               | Batch review with the owner                                                                                              | `staff-copy.ts` header                                                        | HCB-082             |
| OD-13 | Pickup days in the week view (`windowsFor` Monday only vs Monday and Thursday) |                                                                                               | Confirm before fixing HCB-035                                                                                            | register "pickups on Monday and Thursday… windowsFor returns Monday only"; D2 | HCB-035             |
| OD-14 | Where owners sign out on phones                                                | account page / header menu / pill                                                             | Account page plus header menu                                                                                            | V-8                                                                           | HCB-011             |
| OD-15 | Compare prices: item page (now) or real comparison                             |                                                                                               | Keep item page; add comparison later                                                                                     | CR-S7                                                                         | HCB-055             |
| OD-16 | Where undated orders count in bake/pack columns                                |                                                                                               | Exclude and flag                                                                                                         | NEW                                                                           | HCB-037             |

---

## 5. Priority and dependency matrix

| Order | Slice                                                                                                                               | IDs                      | Sev/Pri           | Depends on                      | Files (main)                                                       | Protected?              | Owner decision?           | Size                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------- | ------------------------------- | ------------------------------------------------------------------ | ----------------------- | ------------------------- | ------------------- |
| 0     | Independently review and accept the pickup fix (PR #51)                                                                             | HCB-001                  | S1/P0             | reviewer                        | none (review only)                                                 | no                      | no                        | done, review only   |
| 1     | **Orders read state + Retry**                                                                                                       | HCB-002a                 | S2/P0             | 0 (same `renderVals` region)    | `staff-orders.ts`, `ops-runtime.tsx`, `orders-live.tsx`, `vals.ts` | no                      | no                        | ~120 lines + tests  |
| 2     | Boundary validation, start chain isolation (fixed 47285e1, 590f58c, a6ae8a2, 9e657c0, b097b4c, d6a4de2, 6ff0340; open: b to f, low) | HCB-004                  | S2/P1             | none                            | `flavours.ts`, `settings.ts`, `ops-runtime.tsx` loaders            | no                      | no                        | ~100                |
| 3     | Products failed read (fixed fbf4b52, working branch)                                                                                | HCB-003                  | S2/P1             | 2                               | `products-live.tsx`, `ops-runtime.tsx`                             | no                      | no                        | ~60                 |
| 4     | Reject confirmation                                                                                                                 | HCB-007                  | S2/P1             | OD-03 (default: dialog)         | `order-live.tsx`, `ops-runtime.tsx`                                | no                      | form only                 | ~60                 |
| 5     | Till toast placement                                                                                                                | HCB-005                  | S2/P1             | avoid Codex production region   | `ops-runtime.tsx` `liveToastVals`                                  | no                      | no                        | ~40                 |
| 6     | Saved + refresh failed                                                                                                              | HCB-006                  | S3/P2             | 1                               | `staff-orders.ts`, `ops-runtime.tsx`                               | no                      | no                        | ~60                 |
| 7     | Accessible name                                                                                                                     | HCB-014                  | S3/P2             | none                            | `till.tsx`                                                         | no                      | no                        | 1 line + test       |
| 8     | Home never-counted                                                                                                                  | HCB-019                  | S3/P2             | none                            | `home-desk.ts`                                                     | no                      | no                        | ~30                 |
| 9-16  | Remaining read-state screens                                                                                                        | HCB-002b..i              | S2/P1             | 1 (pattern)                     | one screen each                                                    | no                      | no                        | ~60-100 each        |
| 17    | Helper Home                                                                                                                         | HCB-010                  | S3/P2             | OD-04 (interim allowed)         | `ops-runtime.tsx`, `home-live.tsx`                                 | no                      | yes                       | ~80                 |
| 18    | Sign out placement                                                                                                                  | HCB-011                  | S3/P2             | OD-14                           | `sign-out-control.tsx`, account page                               | no                      | minor                     | ~60                 |
| 19    | Back/reload context                                                                                                                 | HCB-012, -013            | S3-S4/P2          | none                            | `ops-runtime.tsx`, `route-sync.tsx`                                | no                      | no                        | two slices          |
| 20    | Wording                                                                                                                             | HCB-016, -017, then -018 | S4/P3             | 0; OD-05                        | runtime overrides, `production-receipts.tsx`, money view           | engine via runtime only | -018 yes                  | small each          |
| 21    | Targets, overflow, clipping                                                                                                         | HCB-020, -021, -022      | S4/P2-3           | none                            | CSS modules, `owner-patterns.tsx`                                  | All tools blocked       | no                        | small each          |
| 22    | History label, plan scope                                                                                                           | HCB-042, -043            | S3/P2             | OD-11                           | customers, bake-plan                                               | no                      | partial                   | small each          |
| 23    | Verify suspected bugs                                                                                                               | HCB-030..038             | n/a               | none                            | tests only first                                                   | no                      | -037 yes                  | investigation       |
| later | Review steps, customer live replacement, history read, comparison                                                                   | D items                  | P2-P3             | OD-06, -07, -11, -15            | new components; possibly new migration                             | live replacement route  | yes                       | multi-slice         |
| gate  | Readiness                                                                                                                           | HCB-070..080             | P1 before release | Ethan approvals for hosted work | n/a                                                                | n/a                     | approvals                 | n/a                 |
| perf  | `/bazaar` TBT baseline over budget on slower runners                                                                                | HCB-083                  | S3/P1             | none                            | `/bazaar` route code (to be found from the trace)                  | no                      | method changes need Ethan | investigation first |

Sequencing rules: one slice per branch and commit; rebase each runtime slice on the accepted HCB-001 commit; keep away from the production region of `ops-runtime.tsx` while HCB-059 is in flight; every money/order/offline slice gets an independent review before acceptance.

---

## 6. Evidence and source traceability index

| ID      | Audit evidence (relative to `docs/audits/visual-capture-2026-11/` @ `970909f`, captured at `b54239c`)                                                                                | Live@HEAD evidence (`c84d23d`, on `evidence/hcb-001-pickup-date-20261106`)                                          | Primary code @ `c84d23d`                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| HCB-001 | `screenshots/sell/order/claimed-payment-review/d1440.webp`; `sell/orders/populated/d1440.webp`; `shop/customer-status/awaiting-payment-claimed/d1440.webp`                           | `head-c84d23d/pickup-{390,1440}.webp`; before/after set `hcb-001/{before,after}-{Asia-Manila,America-Los_Angeles}/` | `ops-engine.js:55-70, 673-676, 2592, 2663`; `staff-orders.ts:273-313`                                 |
| HCB-002 | `sell/orders/loading/d1440.webp`; `stock/inventory/loading/d1440.webp`; `home/home/loading/d1440.webp`; `money/money/loading/d1440.webp`; `shop/order-rules/read-failure/d1440.webp` | `head-c84d23d/ordersFail-{390,1440}.webp`                                                                           | `orders-live.tsx:136-140`; `inventory-live.tsx:362`; `stock-shared.tsx:104`; `money-live.tsx:279-285` |
| HCB-003 | `make/products/loading/d1440.webp`; `make/products/populated/d1440.webp`                                                                                                             | `head-c84d23d/flavoursFail-{390,1440}.webp`                                                                         | `ops-runtime.tsx` `loadFlavours`; `flavours.ts:294-333`                                               |
| HCB-004 | `make/products/malformed-answer/d1440.webp`; `account/account/populated/d1440.webp`                                                                                                  | `head-c84d23d-b/flavoursMalformed-{390,1440}.webp`                                                                  | `flavours.ts:50-66`; `settings.ts:113-120`; `settings-sync.ts:78,101`                                 |
| HCB-005 | `bazaar/till/offline-toast-over-charge/{t768,p390}.webp`; `flows/bazaar-event-to-finalize/10-wallet-needs-reference/p390.webp`                                                       | not re-run                                                                                                          | `ops-engine.js:813, 3101`; `ops-runtime.tsx` `liveToastVals`                                          |
| HCB-006 | `sell/order/saved-refresh-failed/d1440.webp`                                                                                                                                         | not re-run                                                                                                          | `staff-orders.ts` `StaffOrderSync.run`; `ops-runtime.tsx` `liveOrder`                                 |
| HCB-007 | `sell/order/rejected-at-once/d1440.webp`                                                                                                                                             | `head-c84d23d-b/rejectFirstPress-{390,1440}.webp`                                                                   | `order-live.tsx:62-63`; `ops-runtime.tsx:8051`                                                        |
| HCB-008 | `sell/order-refund/submitted-empty-reference/d1440.webp`                                                                                                                             | not re-run                                                                                                          | `ops-runtime.tsx:8062-8067`; `20260101003700_staff_orders.sql` `staff_refund`                         |
| HCB-009 | `bazaar/close/untouched/d1440.webp`; `bazaar/close/closed-without-cash-typed/d1440.webp`                                                                                             | not re-run                                                                                                          | `close-form.tsx` (`c846d17`)                                                                          |
| HCB-010 | `account/role-helper/home/{d1440,p390}.webp`                                                                                                                                         | `head-c84d23d-b/helperHome-{390,1440}.webp`                                                                         | `ops-runtime.tsx` `liveHomeVals`; `home-live.tsx:94`                                                  |
| HCB-011 | `make/recipe-book/populated/p390.webp`; `make/recipe/default/p390.webp`; `home/home/populated/p390.webp`                                                                             | not re-run (control mounts in LiveGate, outside the preview)                                                        | `sign-out-control.tsx:137-150`; `live-gate.tsx:623`                                                   |
| HCB-012 | `flows/stock-suppliers-shopping/06-back-to-shopping/d1440.webp`                                                                                                                      | not re-run                                                                                                          | `ops-runtime.tsx:5444-5450`                                                                           |
| HCB-013 | `flows/make-recipe/09-reload/d1440.webp`                                                                                                                                             | not re-run                                                                                                          | `route-sync.tsx:135,163,206`                                                                          |
| HCB-014 | `manifest.json` control list for `bazaar/till/empty-cart`                                                                                                                            | not re-run                                                                                                          | `till.tsx:123`                                                                                        |
| HCB-015 | `bazaar/till/empty-cart/d1440.webp`                                                                                                                                                  | not re-run                                                                                                          | `till-bar.tsx:9-30`; `owner-workspace.tsx:434`                                                        |
| HCB-016 | `sell/orders/populated/d1440.webp`                                                                                                                                                   | not re-run                                                                                                          | `ops-engine.js:2591`; `production-receipts.tsx:104-105`                                               |
| HCB-017 | `money/money/populated/d1440.webp`                                                                                                                                                   | not re-run                                                                                                          | `books.ts:213-221`                                                                                    |
| HCB-019 | SA private screenshots (`home-1440.png`), CR-B6                                                                                                                                      | not re-run                                                                                                          | `home-desk.ts:42-63`; `inventory-live.tsx:74,101`                                                     |
| HCB-020 | `bazaar/day-plan/{change-existing,new-day}/p390.webp`; `other/all-tools/default/p320.webp`                                                                                           | not re-run                                                                                                          | `plan.ts:165`; `screens/all-tools.tsx`                                                                |
| HCB-021 | measured-layout "Touch targets" list                                                                                                                                                 | not re-run                                                                                                          | `owner-workspace.module.css:133-137`; `owner-patterns.tsx:116`; `sub-tabs.tsx:50`                     |
| HCB-030 | `flows/account-expiry/README.md`; `account/access-gate/session-expired-redirect/d1440.webp`                                                                                          | not re-run                                                                                                          | `live-gate.ts` `checkStaffProfile`; `live-gate.tsx:385-398, 566-594`                                  |

Coverage register (`coverage.csv`, 1,230 rows): 1,106 captured, 97 pixel-identical, 13 unverified, 9 flows with optional steps unavailable, 4 unavailable, 1 not applicable, 8 declared limits. Every unverified/unavailable/limit row is mapped above: record-unavailable → HCB-032; idle → HCB-075; references → HCB-050/057/058; limits → HCB-070..076.

---

## 7. First implementation task brief: HCB-002a, Orders read state

**Why this one first.** HCB-001 is already implemented and in draft PR newonathe/happy-cookie-ops#51; it only needs independent review and acceptance (step 0). Of the remaining items, HCB-002a is:

- proven live at `c84d23d` at 390 and 1440 px;
- frequent, because any weak connection triggers it;
- operationally serious: the owner is told "No orders match this filter" when her orders simply could not be read, and may miss payments to review or pickups to prepare;
- small, touching no protected path, no SQL, no hosted system and no owner decision;
- the pattern every later read-state slice (HCB-002b..i, HCB-006) reuses.

It must be built on top of the accepted HCB-001 commit, because both touch the same `renderVals` spread in `ops-runtime.tsx`.

**Goal.** In live mode, Orders tells the truth about its read: `loading` before the first answer, `failed` with Retry when nothing has been read, the last good list plus a stale notice and Retry when a later reload fails, and the empty-result text only after a successful read returns no matching orders.

**Read first (only these):** `AGENTS.md`; `src/lib/data/staff-orders.ts` (`StaffOrderSync`); `src/store/ops-runtime.tsx` (`loadOrders`, `reloadOrders`, the `renderVals` spread near `liveOrderList`/`liveOrderDetail`); `src/components/live/sell/orders-live.tsx`; `src/components/ui/banner.tsx`; `src/components/live/recipes/recipe-reader.tsx:117-127` (pattern to copy); `src/view-models/vals.ts` (`orderList` type); `tests/unit/ops-runtime-staff-orders.test.tsx` (harness to copy).

**Change.**

1. `StaffOrderSync`: add `readState: 'never' | 'loading' | 'read' | 'failed'` and `readAt: number | null`. Set them in `load()` at start, on success and on failure, and notify through a new optional hook `onRead?: () => void` so the runtime re-renders on failure, which `apply` never sees today. No change to `run()` outcomes or RPCs.
2. `OpsRuntime`: pass `onRead: () => this.setState({})` (or a dedicated state key) in `loadOrders`. In the live `renderVals` spread add `liveOrdersRead: { state, stale, readAtText, retry }`, where `stale` = a successful read exists and the latest attempt failed, and `retry` = `() => void this.reloadOrders()`. Widen `OpsVals` in `vals.ts` alongside this.
3. `OrdersLive`: when `liveOrdersRead` is present:
   - `loading` and never read: a status line, no empty-result text;
   - `failed` and never read: `Banner` tone `warn`, "Orders could not be read on this device." with action "Retry", and no empty-result panel;
   - `stale`: `Banner` warn "Could not refresh. Showing orders as of {time}." with Retry, list shown;
   - `read`: today's behaviour, with "No orders match this filter" only here.

   Copy goes in `STAFF_COPY` (placeholder convention).

4. No change to the ported `src/components/screens/orders.tsx`, the engine or demo mode.

**Must not change:** `src/components/screens/**`, `src/components/sheets/**`, `src/components/shell/**`, `ops-engine.js`, migrations, `port-baseline.json`, order RPC calls, payment, capacity or stock logic, `scrub.ts`.

**Tests** (new `tests/unit/ops-runtime-orders-read.test.tsx`; red first against the current code):

- first read fails → `liveOrdersRead.state === 'failed'`; rendered `OrdersLive` shows the failure text and Retry, and does not show "No orders match this filter";
- Retry with the RPC now answering → list shown, banner gone;
- first read succeeds, reload fails → list kept, stale banner with time, Retry works;
- read succeeds with zero orders → "No orders match this filter" shown and no banner;
- loading before any answer → no empty-result text;
- demo mode → `liveOrdersRead` absent, ported screen unchanged;
- a device in a non-Manila time zone shows the Manila time in the stale notice (uses `formatManila`).

**Verification:**

- focused tests;
- `pnpm verify`, with no test weakened;
- captures of the four states at 320/390/768/1440 with the owner preview (synthetic RPC, failure switched on), checking no horizontal overflow, no page errors and no writes;
- independent review (Codex `--profile review` or a different Claude model), because it touches the order read path.

**Acceptance:** all of the above green; the before/after captures show the empty-result sentence gone in the failure state; the reviewer accepts with file:line evidence.

**Out of scope:** other screens (HCB-002b..i), saved-then-refresh-failed (HCB-006), any wording beyond the new placeholder lines.

**Estimated size:** about 120 changed source lines plus tests, under the 400-line slice limit.

---

## 8. Limits of this analysis

- **Not re-run live at HEAD in this pass:** HCB-005, -006, -008, -009, -011..-017, -019, -020. They rest on the audit capture plus source that is unchanged since it.
- **The simulated server** does not exercise RLS, SQL or real concurrency.
- **ChatGPT Bazaar v4 review:** not available locally, so it is not incorporated. If supplied, map each of its tickets to an HCB ID using section 3's method before adding new IDs.
- **SA-F01 and SA-F02:** recorded as fixed by commit presence only, not re-probed.
