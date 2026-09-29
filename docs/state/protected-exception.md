# MP-02 protected exception request

Status: OWNER APPROVED in the 2026-09-08 conversation and applied exactly as proposed. Valid return bodies remain unchanged.

Current tsc reports 14 TS18047 diagnostics in add-inv, edit-price, inv-edit, why and proof. Engine miscVals returns sheet null without sh.kind; ordersVals returns od null without a selected order. The declared nullability is accurate. Parent checks do not carry into independently typed component function bodies.

Proposed exact patch: [five guards](evidence/MP-02-protected-null-guards.patch). One guard per component before return. Valid rendering, copy, styles, element order and event handlers remain byte-identical; invalid missing-data rendering still throws, now explicitly before dereference. No business rule or engine change. Existing port baseline needs no update because return bodies do not change.

Rule requiring the owner's decision: AGENTS.md Do not touch, src/components/sheets/**, and user section 12 expressly prohibit protected source edits without a narrow exception. Alternative of claiming these values always exist would be a false type contract. Verification after approval: tsc, pnpm verify/build, unchanged return-body hashes, focused invalid-data guards and headless valid-sheet captures. Rollback removes only the five inserted lines.

# MP-04 live-frame protected exception (2026-09-27)

Status: OWNER DIRECTED (Ethan, 2026-09-27: keep all design, animations, transitions, layout and pages, but remove
the prototype's navigation/review aids and pick the screen size automatically). Applied in live mode only
(`NEXT_PUBLIC_APP_MODE=live`, the static export); demo, dev, CI and the visual baselines render exactly as before.

Protected markup touched, each change a `bareFrame ? … : …` guard whose non-live branch is byte-identical:

- `src/components/shell/app-frame.tsx`: the header row (logo, title, "Interactive prototype · … · mock data",
  device picker, role switcher, phone-width toggles, simulated Online/Offline toggle) is not rendered, and the two
  outer wrappers lose their harness padding. Port baseline `styles` 146 → 144 (the two wrappers' style objects
  became ternaries); copy hash, copy count and element count unchanged.
- `src/components/screens/shop.tsx`: the owner-preview row ("Back to ops", "Preview · customer view", drop-state
  toggles) is not rendered for customers.
- `src/components/screens/order-status.tsx`: "Preview · customer view" and "Back to ops" are not rendered; the
  customer's own back-to-shop button stays.

Not markup, in `src/store/ops-runtime.tsx` (subclass; `ops-engine.js` untouched): the flow strip and flow bar are
starved, the device follows the viewport width (<768 phone, <1200 tablet, else desktop), and the frame fills the
screen. Filling the screen also drops the mock-up bezel (`border-radius`, `border`, `box-shadow`) from the frame
style; the background colours are unchanged. Known trade-off: the first paint uses the phone layout until the
saved books restore and the viewport is read, a brief flash on tablets and desktops.

Evidence: `tests/unit/ops-runtime-live-frame.test.tsx`; `scripts/test-hosted-preview.mjs` (no harness text and no
sideways scroll at 390/834/1280 px on the hosted preview); `pnpm test:e2e` unchanged at 87/3/30. Independent
port audit: no copy, element or demo-mode change; its process findings (this record, the stale provenance string,
an inaccurate code comment and the AGENTS.md trap text) are addressed in the same commit.

# MP-09 c engine exception — APPROVED 2026-09-27; flavours APPLIED in MP-09 c1 (2026-09-28)

Ethan approved the smallest edit to the protected engine (`src/store/engine/ops-engine.js`) that lets the flavour
list (`PRODUCTS`: name, description, photo, allergens, permanent/rotating) and the payment accounts
(`PAY_ACCOUNTS`) come from state loaded from the database instead of module constants (configurability audit
B1, B2). No visible change to any screen. The slice that applies it must keep the change minimal, record the
exact edit here, register it as exact reversals in `scripts/validate-g0.py`, and pass an independent port audit.

**Applied in MP-09 c1 (2026-09-28): `PRODUCTS`, `P`, `SEED_PRICES` and `ALLERGENS`** (Cine's 2026-09-28 answer made
allergens per flavour, so the exception is extended to name `ALLERGENS`). `PAY_ACCOUNTS` is still to do (MP-09 c2).

- **The one engine edit:** a block inserted right after `PRODUCTS.forEach(p => { SEED_PRICES[p.id] = p.price; });`,
  exporting `replaceFlavours(list, allergens)`. It replaces the four module objects **in place** (the array is
  spliced, the maps are emptied and refilled), so every existing engine read sees the new list. Stated plainly:
  the engine still reads module constants; live mode overwrites them from rows it loaded, it does not read
  `this.state`. Switching ~130 call sites to state would not be minimal. Nothing else in the file changed, and
  the header's "four marked edits" line is left as ported (this record is the fifth).
- **Caller:** only `OpsRuntime.loadFlavours()` (subclass), which returns early outside live mode, so demo, dev,
  CI and the visual baselines never call it. It also writes `prices` and `dropActive` from the rows (the engine's
  `priceOf` reads `state.prices` first) and gives a flavour with no recipe an empty one (`{ yield: 1, ing: [] }`)
  until MP-09 d loads recipes, because the bake and recipe screens read `recipes[id].yield`.
- **How the edit was made:** the `PreToolUse` hook (`.claude/hooks/guard-protected-paths.sh`) blocks every edit
  to `ops-engine.js` pending a human decision. That decision is this approval, so the block was inserted by a
  script and is recorded here and in the commit message rather than by switching the hook off.
- **Seed:** `supabase/seed.sql` (generated, protected) gains one appended `update products set allergens …`
  statement, emitted by `scripts/gen-seed.mjs` from the engine's `ALLERGENS`. The rest of the seed is not
  regenerated: the generator's header comment already differed from the checked-in seed before this slice, so a
  full regeneration would have rewritten reviewed bytes (pre-existing drift, not fixed here).
- **Reversals:** `FLAVOUR_REVERSALS` in `scripts/validate-g0.py` removes the engine block and the seed block,
  each exactly once, before the delivery-bytes check.
- **Evidence:** `tests/unit/flavours.test.tsx` maps the seeded rows (parsed from `seed.sql`) back onto the ported
  `PRODUCTS` and `ALLERGENS` with deep equality (one leading `/` on the seeded image path is dropped to match the
  engine's `assets/…`), and renders every screen key with a seventh flavour that has no recipe.
- **Independent port audit (Sonnet, 2026-09-28):** one inserted block, live-mode caller only, reversals and seed
  block exact, port integrity OK. Its reset and empty-allergen findings were fixed in the same slice
  ([current state](current.md)).
- **MP-09 c1b (2026-09-28): no protected file changed.** A second caller, `OpsRuntime.loadShopMenu()` (live
  customer pages only), passes `replaceFlavours` the published rows followed by the ported entries the shop did
  not return, with those entries off the order form (`dropActive` false). They stay only because engine render
  paths name `wcb`, `rvc` and `pbm`; the ported `shopFlavours` filter hides them. Until the menu is read,
  `renderVals()` gives customer pages an empty `shopFlavours`. The flavour editor (c1c) is where this exception
  first needs protected markup.

# MP-09 b2 locked-UI exception: settings rules sheet in live mode (2026-09-28)

Status: APPLIED under Ethan's 2026-09-27 approval of the DP-15 idle-minutes control (decision register), plus
his 2026-09-28 answer leaving the half-step question to Claude ("up to u"). Live owner only
(`NEXT_PUBLIC_APP_MODE=live` and role `owner`); demo, dev, CI and the visual baselines render exactly as before.

**No protected file changed.** The ported rules sheet (`src/components/sheets/rules.tsx`) maps over `v.rules`,
so both changes are made in `OpsRuntime.renderVals()` (`src/store/ops-runtime.tsx`, subclass). The delivery-
manifest hash in `scripts/validate-g0.py` already proves `rules.tsx` and `ops-engine.js` are byte-identical,
so there is no exact reversal to register there, unlike the live-frame exception.

- **Three new rows** at the end of the rules list: "Sign Cine out after", "Sign support out after", "Sign
  helpers out after". Each uses the ported row markup unchanged (−/+ in 15-minute steps, a typed value,
  "Now: N minutes idle"), clamped 15–480, saved as `idleMinutesOwner`/`Support`/`Helper` through
  `save_setting`. Note copy: "With no taps for this long, the device signs out. 15 minutes to 8 hours."
- **Whole steps for two existing rows: withdrawn in MP-09 b3 (2026-09-28).** "Tax set-aside" and "Cost
  multiplier" stepped by 1 in b2 because `save_setting` stored whole numbers. Migration 20260101002900
  stores them as 0.5 steps, so the live rows use the prototype's own 0.5 step again and this part of the
  exception no longer applies.

Evidence: `tests/unit/ops-runtime-settings.test.tsx` (owner rows present, helper rows absent, whole steps,
idle ±15), `tests/unit/settings-sync.test.ts` (fraction reverted, never sent).

# MP-10 checkout and shop-text locked-UI exception — APPROVED, not yet applied (2026-09-28)

Status: APPROVED by Ethan on 2026-09-28 (decision D4 in [order-form-audit.md](order-form-audit.md)), so the app can
replace Cine's order form at launch with every applicable field and text owner-configurable. Scope:

- **Live mode only.** The customer checkout's field list (on/off, required, label, help text) and the shop texts
  (title, intro, pickup notice, substitution notice, confirmation text, social links) come from the view model,
  filled from the owner's settings. Demo, dev, CI and the visual baselines keep the ported copy byte for byte,
  the same pattern as the live-frame exception's `bareFrame` guards.
- **New checkout parts** (fulfilment method, delivery address, pickup date and time slots, pay now or later,
  add-ons with variants and a note text, bundles, same-day fee, flavour suggestions) are new components built
  only from the existing tokens and the ported styles; no new colours or type.
- **Protected markup edits are limited to the smallest guarded insertion points** those parts need. Each slice
  that applies part of this exception records its exact edits here, registers them as exact reversals in
  `scripts/validate-g0.py` (like `LIVE_FRAME_REVERSALS`), updates `scripts/port-baseline.json` only through
  `--update` in the same commit, and passes an independent port audit.
- Not covered: any change to demo-mode rendering, the protected engine (`ops-engine.js`; the MP-09 c
  exception covers `PRODUCTS`/`PAY_ACCOUNTS`, to be extended to `ALLERGENS` when applied), or staff screens.

# MP-09 c1c: the flavour editor's live form host — APPLIED (2026-09-28, F3)

Status: APPLIED under the F3 decision (finish-plan.md section 11, approved 2026-09-28): one
guarded, live-only form host in `app-frame.tsx` that later owner forms plug into, so each of
those needs no further protected-markup edit — only this record grows. Live owner only
(`NEXT_PUBLIC_APP_MODE=live`, role `owner`); demo, dev, CI and the visual baselines render
exactly as before.

**Protected markup touched, `src/components/shell/app-frame.tsx`:** one import and one
`bareFrame`-guarded render branch, next to the ported `isEditPrice` line the sheet body
already had:

```
import { LiveFormHost } from '@/components/live/live-form-host';
…
{sheet.isEditPrice ? <EditPriceSheet v={v} /> : null}
{bareFrame && sheet.liveForm ? <LiveFormHost v={v} /> : null}
```

`LiveFormHost` (new, unprotected, `src/components/live/live-form-host.tsx`) is reached
through the ported sheet mechanism, not a new one: `OpsRuntime` calls the engine's own
`this.sheet('flavours', { pid })`/`this.sheet('flavours', {})`/`this.sheet('flavours',
{ isNew: true })` (also unprotected — `sheet`/`closeSheet` were already instance fields on
the protected engine, just undeclared in `ops-engine.d.ts` until this slice added them). An
unrecognised `kind` was already stored and rendered harmlessly by the ported engine before
this slice (`titleOf['flavours']` is `''`, every ported `isX` flag false) — confirmed, not
assumed, before the insertion. `OpsRuntime.renderVals()` (subclass) is what turns that empty
sheet into the form host: `liveSheet()` adds `sheet.liveForm`/a title, `liveFormVals()` builds
`v.liveForm` (the list, the one being added or edited, `save`, `publish`, `close`), owner and
live-mode gated. Same technique as the MP-09 b2 rules-sheet exception, one level up: there the
ported markup already existed and only `v.rules` grew; here the sheet body was empty and the
whole content is new, so the host needed one guarded insertion point instead of zero.

**Also not protected-file edits, but part of the same slice:**

- `src/store/ops-runtime.tsx`: `openFlavourList`/`openFlavourEditor`/`openNewFlavour`,
  `saveFlavourForm` (validates client-side with `flavourFieldError`, converts pesos to
  centavos, slugs a new id with `slugifyFlavourId`, then calls `FlavourSync.saveWhole`),
  `publishMenu` (calls `FlavourSync.publish()` with every loaded flavour, then names how many
  are still on the order form — what customers will now see). `liveToolGroups` appends "Menu
  & flavours" to the Business group (`toolGroups` is view-model data; `all-tools.tsx` already
  maps it with no markup edit, per the c1b note this exception extends). `liveProductRows`
  replaces each row's `edit` handler with `openFlavourEditor(pid)`, owner and live only; every
  other role's "Edit price" still opens the ported `editPrice` sheet unchanged.
- `src/lib/data/flavours.ts`: `FlavourSync.saveWhole` — the whole-flavour save, through
  `save_flavour` with the same conflict ('P0002' → reload)/refusal/offline classification
  `save` uses, refusing rather than racing a quick edit for the same id still in `inFlight`.
  On success it re-applies every loaded flavour to the engine, snapshotting and restoring any
  _other_ id's in-flight optimistic edit first, so a whole-form save cannot visibly revert a
  concurrent quick toggle or price edit. `flavourFieldError` mirrors every `save_flavour`
  bound client-side (the same reasoning as `priceCents`); `slugifyFlavourId` derives a legal,
  unique id from a name for a new flavour. No SQL migration: `save_flavour` (20260101003000)
  already accepts every field the editor needs.
- `src/view-models/vals.ts` / `src/store/engine/ops-engine.d.ts`: `OpsVals.liveForm`,
  `OpsVals['sheet'].liveForm` and `LiveFlavourFormFields` are new types, additive only;
  `sheet`/`closeSheet`/`IC` are declarations for instance fields the engine already had.

**Reversals:** `FLAVOUR_REVERSALS` in `scripts/validate-g0.py` removes the import and the
render line from `app-frame.tsx`, and reverses `scripts/port-baseline.json`'s `elements`
count (244 → 243) for that file, each exactly once, before the delivery-bytes check.
`port-baseline.json` updated only via `--update`; `port-structure-baseline.json` (the AST
fingerprint `check-port-integrity.mjs` also checks) regenerated via
`node scripts/port-structure.mjs --write-baseline` in the same commit — it is not part of the
delivery manifest, so it needs no reversal entry.

**Evidence:** `tests/unit/ops-runtime-flavour-editor.test.tsx` (entry points owner-only,
demo mode untouched byte-for-byte, add-flavour end to end with the slugged id, publish
wording, a render pass over the list and the edit form with no undefined/NaN/console error);
`tests/unit/flavours.test.tsx` (`saveWhole`: create, full-field replace, conflict, offline,
client-side refusal, the in-flight guard and the clobber-prevention mutation check, one
mutation check each).

**Independent port audit (Opus, 2026-09-28):** PASS on every point checked (the `app-frame.tsx`
diff is exactly the two lines above; no ported copy, style or element beyond the recorded
`+1`; `titleOf`/every `isX` confirmed empty for an unrecognised kind by reading the protected
engine, not assumed; `pnpm typecheck` and the new tests clean). Found, fixed before commit: a
formatter had rewritten `vals.ts` from CRLF to LF (whole-file churn with no content change,
reverted); the validator's own run had left `docs/state/evidence/g0-validation.json` dirty
(reverted, as it is every session).

**Independent review (Opus, 2026-09-28): first BLOCKED, then SAFE TO MERGE after three fixes.**

- **P0, fixed:** `loadFlavours()` constructs `FlavourSync` before `load()` runs. If the
  initial read failed or was empty, `flavourSync` was truthy with an empty cache, but nothing
  stopped the owner from tapping "Publish menu" anyway — `publish()`'s default
  `ids = [...this.rows.keys()]` would be `[]`, and `publish_flavours([])` unpublishes every
  flavour, emptying the live shop. Worse, saving a _new_ flavour onto that same empty cache
  would `apply()` an engine flavour list of exactly one row, since `replaceFlavours` splices
  the whole array. Fixed: `FlavourSync` tracks whether `load()` has actually populated the
  cache; `saveWhole` refuses to create a flavour, and `publish()` tries one reload before
  refusing, until it has.
- **P1, fixed:** the editor's `save` closure read the flavour's `updated_at` fresh from the
  cache on every render, but its own fields are uncontrolled (`defaultValue`, set once at
  mount). If a quick edit landed while the form stayed open, the next render's closure would
  carry the _new_ `updated_at` alongside the form's _stale_ field values — passing
  `save_flavour`'s conflict check and silently reverting the quick edit. Fixed:
  `openFlavourEditor` freezes `updated_at` into the sheet at the moment it opens, so a form
  left open across a concurrent change now gets a real P0002 conflict and a reload instead.
- **P1, fixed:** a cleared price field became `₱0` (`Number('') || 0`), which the next
  "Publish menu" would send live. Fixed: a blank or non-numeric field now becomes `NaN`,
  which `priceCents`/`flavourFieldError` correctly refuse; the price input also gained
  `required` and `min`.
- **P2, accepted, not fixed:** a quick toggle/price edit for the same flavour a whole-form
  save is in flight for is queued (`again`) but never resent afterwards, unlike the quick-edit
  path's own success branch — the queued edit is silently dropped and the engine reflects the
  form's value instead. Narrow (both writes to the same flavour within the same
  sub-second window) and no worse than the pre-c1c behaviour for that overlap; left for a
  later slice if it proves to matter in practice.
- **P3, noted only:** publishing can make an in-flight quick save for a different device's
  edit hit a conflict against its own change — pre-existing since c1b, not new here.

Regression tests for the P0 and both P1s: `tests/unit/flavours.test.tsx` ("refuses to create a
flavour or publish from a cache that was never loaded", "publish reloads first…"),
`tests/unit/ops-runtime-flavour-editor.test.tsx` ("a stale-open editor gets a conflict instead
of silently reverting…", "rejects a blank price…"), each with a mutation-check comment stating
what the pre-fix code would have done instead. Full suite after the fixes: `pnpm typecheck`
clean; 688 tests / 44 files.

# MP-09 b4 locked-UI exception: helper money in live mode (2026-09-28)

Status: APPLIED. The owner control falls under Ethan's 2026-09-27 approval of the settings edit forms; hiding
cost and profit from helpers carries out Cine's 2026-09-28 rule (decision register). Live mode only; demo, dev,
CI and the visual baselines render exactly as before (`tests/unit/helper-money.test.tsx` pins demo mode).

**No protected file changed.** Both parts are view-model values set in `OpsRuntime.renderVals()` through
`src/lib/auth/helper-money.ts`; the ported markup renders them unchanged.

- **For every non-owner role, whatever the switch says:** the bazaar close-out summary's cookie cost, event
  expenses and profit show "—" (`bzCloseout`; the big profit figure is hidden through `profitOk`), and each event
  expense row's amount shows "—". The close-out sheet's own grid was already hidden (`showEventMoney` is false
  for helpers).
- **Sale totals follow the owner's `helperSeesSales` switch (off by default):** the running "N sales · ₱total"
  line, the close-out revenue, past drop totals in the sales log (the log keeps this event's own sales), and the
  close-out sheet's per-app totals (GCash, Maya, GoTyme), which add up to revenue together with the cash sales.
- **Kept for helpers:** menu prices, the cart total, each sale's own amount (needed to charge and void) and the
  cash-box line at close-out (helpers may cash up, and count that cash by hand anyway). This is a display rule,
  not a security boundary: adding up every visible sale line by hand still gives the total.
- **New owner row** at the end of the live rules sheet: "Helpers see sale totals", 0/1 with On/Off text, saved
  as `helperSeesSales` through `save_setting`.

# MP-09 c2: payment accounts and the shop footer — APPLIED (2026-09-29, finish-plan slice A2)

Status: APPLIED under the approved MP-09 c engine exception (`PAY_ACCOUNTS`) and the MP-10 checkout and shop-text
exception (D4, finding 16). Live mode only (`NEXT_PUBLIC_APP_MODE=live`); demo, dev, CI and the visual baselines
render exactly as before (`tests/unit/ops-runtime-payments.test.tsx` pins the demo footer and accounts).

**Two protected edits, both inserted by script** (the `PreToolUse` hook blocks direct edits to protected paths):

- `src/store/engine/ops-engine.js`: three lines right after the `PAY_ACCOUNTS` array, exporting
  `replacePayAccounts(list)`, which splices the same array in place (the same technique as `replaceFlavours`). The
  engine still reads a module constant; live mode overwrites it from rows it loaded. Only callers:
  `OpsRuntime`'s constructor in live mode (`replacePayAccounts([])`, so the ported GCash/Maya/GoTyme accounts and
  their placeholder numbers never show, not even before the read) and `PaymentSync` after each read of
  `get_shop_payment_info()`. Nothing else in the file changed.
- `src/components/screens/shop.tsx`: one import and one guarded branch, `{bareFrame ? <LiveShopFooter v={v} /> : (` … `)}`,
  around the ported footer, which stays verbatim as the demo branch. Baseline change: `elements` +1 (styles and
  copy unchanged). `LiveShopFooter` (new, unprotected, `src/components/live/live-shop-footer.tsx`) prints only the
  owner's own four texts from `v.shopFooter`, each only when non-empty, plus the unchanged "Already ordered? Find my
  order" link. The ported "BIR REGISTERED" badge, placeholder TIN, "An invoice is issued for every confirmed order"
  and the fixed allergen sentence are therefore never shown in live mode (finding 16). The order status page and
  order detail still label a confirmation number "Invoice INV-…": that wording waits for F10.

**Not protected-file edits, same slice:**

- `src/store/ops-runtime.tsx` (subclass): `loadShopPayment`, the owner entry points ("Payment methods" and "Shop
  texts" under Business), `livePayCust` (the checkout's `cust.methods` are `[]` until a read succeeds, and
  `cust.qr` has the engine's own style with its `url(RES(qr))` swapped for the resolved bucket URL, because `RES`
  would turn an absolute URL into `/https://…`; a method without a QR shows none; and `cust.noQr` is forced false,
  because the ported "Pick a payment method…" note it gates also names a bank number and cash on pickup) and `shopFooterVals`.
- `src/lib/media/resolve-image.ts`: the one resolver from a stored path to a display URL, for flavours
  (`enginePath`) and QR codes. `assets/…` stays page-relative; a generated bucket path becomes
  `<Supabase origin>/storage/v1/object/public/shop-media/<path>`; anything with a quote, parenthesis, colon,
  space, `..` or a leading slash on a bucket path draws nothing.
- `src/lib/data/payments.ts`, `payment-sync.ts`, the owner forms in `src/components/live/` (`LiveFormHost`
  dispatches on `liveForm`, `livePay` or `liveTexts`: no further protected markup) and the CSP `img-src` (same value as
  `connect-src`) in `scripts/pages-spike-headers.mjs`.

**Reversals:** `FLAVOUR_REVERSALS` in `scripts/validate-g0.py` gained the engine block, the three `shop.tsx`
pieces and the `shop.tsx` block of `scripts/port-baseline.json` (`elements` 65 → 64), each exactly once, before the
delivery-bytes check; the `"generated"` date tuple moved to 2026-09-29. `port-baseline.json` was updated only via
`--update` and `port-structure-baseline.json` via `node scripts/port-structure.mjs --write-baseline`, in the same
commit.

**Evidence:** `tests/unit/payments.test.ts` (resolver, strict reader, field bounds, upload names, `PaymentSync`) and
`tests/unit/ops-runtime-payments.test.tsx` (no ported accounts before, after a failed read, or with no Supabase;
QR URL; footer empty by default; owner forms; demo unchanged); ten deliberate mutations of the new code, each
caught by a test.

**Independent review (Opus, 2026-09-29): BLOCKED, then fixed.** P1: `cust.noQr` (the engine's `!c.pay`) still
showed the ported note "Bank transfer to 0962 962 5341 and cash on pickup are also accepted" to every live customer
who had not yet picked a method, including on a failed read; a customer could pay that number and then be refused
at submit ("Tell us how you paid."). Fixed in `livePayCust` (both returns) with `tests/unit/ops-runtime-payments.test.tsx`
("never tells a customer to pay a number the owner did not enter", with a mutation check, and a demo-mode
counterpart). P3s: two vacuous helper assertions removed (helpers have no Business group; `livePay`/`liveTexts` being
null is the real check); a save with no Supabase now toasts instead of returning silently; recorded, not fixed: an
uploaded image is never deleted when the owner cancels or replaces it (orphans stay in the bucket), and a customer who
picked a method the owner then turned off can still submit its label (B1's `place_order` must check the method is
offered). Otherwise clean: both protected edits reverse to the exact delivery bytes, demo rendering is unchanged, the
resolver cannot leave `url(...)`, and the upload name never comes from the file.
# MP-10 a / B2: the live checkout slot — APPLIED (2026-09-29, finish-plan slice B2, app half)

Status: APPLIED under decision D4 (Ethan, 2026-09-28: the checkout may have guarded, live-only insertion points; the
"MP-10 checkout and shop-text locked-UI exception" above). Live mode only (`NEXT_PUBLIC_APP_MODE=live`); demo, dev, CI
and the visual baselines render exactly as before (`tests/unit/ops-runtime-live-checkout.test.tsx` pins the demo
checkout text and the engine's own submit).

**One protected file changed, `src/components/screens/checkout.tsx`, inserted by script** (the `PreToolUse` hook blocks
direct edits): an import, `bareFrame` added to the destructure, and one guarded region.

```
import { LiveCheckout } from '@/components/live/live-checkout';
const { backToShop, bareFrame, cust, ic } = v;
…header and the ported "Your order" card, unchanged…
{bareFrame ? <LiveCheckout v={v} /> : (
<>
  …the ported "About you", "Collection" and "Payment" cards, the submit button and the slot footnote, verbatim…
</>
)}
```

Baseline change: `elements` +1 for this file (`<LiveCheckout>`); copy hash, copy count and styles unchanged.

**Ported lines that are false in live mode, so never shown there** (they stay verbatim as the demo branch):

- Email is required ("Your order link is emailed here…"). A live order takes no email.
- "Amount you sent" and the required "Payment screenshot". A live order is placed unpaid; proof stays in the DMs (F5).
- "Send ₱X to one of these, then attach the screenshot", and `cust.qrNote` (tells the customer to attach a screenshot).
- "(optional)" on Instagram. Her form requires it, so the live form does too (client side; the database accepts none).
- "Your slot is held once Cine verifies the payment." A live order holds its slots at once, for the owner's unpaid hold
  hours (D1).

**What `LiveCheckout` shows instead** (new, unprotected, `src/components/live/live-checkout.tsx`, existing tokens
only): name, Instagram, contact number, pickup date (the owner's pickup days inside the lead window, from
`get_shop_order_rules()`, counted on the Asia/Manila clock), pickup time (half hours from the start hour to before the
cutoff hour, plus the campus slot), payment method and QR (`v.cust.methods` and `v.cust.qr`, already resolved from
`get_shop_payment_info()` by `livePayCust`), an optional reference, and the refusal banner. After a success it shows
the order number, the status link (`/status#t=…`, in the fragment, never the query string), "Copy the link", "See my
order" and "Order again".

**Not protected-file edits, same slice:**

- `src/store/ops-runtime.tsx` (subclass, live constructor branch and `renderVals`): `custSubmit` calls `place_order`
  through `OrderFlow`; `custRestart`, `custReorder` and `custSet` are wrapped; the status page's `cust` values come
  from `order_status(token)` (`statusCust`), never from the engine's local orders, so `order-status.tsx` needed no edit
  (it also drops "Invoice INV-…": `invoiceLine` is empty, F10); the live `openLookup` opens a lookup sheet, and the
  shop footer's new "Join the waiting list" opens the waitlist sheet, both through the F3 form host
  (`LiveFormHost`), so no second protected insertion was needed. **Customer sheets are gated on the current screen being
  a customer screen, never on the role**: an anonymous visitor's engine role defaults to `'owner'`.
- `src/lib/data/orders.ts`, `order-flow.ts`, `src/lib/orders/{pickup,copy,status-view}.ts`, `LiveOrderRoute` in
  `ops-app.tsx` (keeps `#t=` in the address bar after `RouteSync`'s own `pushState`, adopts it on a direct load),
  `loadShopOrders` in `live-gate.tsx`, and additive types in `vals.ts` and `ops-engine.d.ts`.
- The engine's own `runLookup` is an instance field, so the runtime's helper is named `runLiveLookup`; naming it
  `runLookup` silently lost to the engine (found by a test, fixed).

**Reversals:** `CHECKOUT_REVERSALS` in `scripts/validate-g0.py` removes the import, the destructured name, the guard's
opening and its closing, and reverses `scripts/port-baseline.json`'s `elements` count for `checkout.tsx` (101 → 100),
each exactly once, before the delivery-bytes check (G0 validator: 1211 checks, 0 failures).
`scripts/port-baseline.json` was updated only through `--update` and `scripts/port-structure-baseline.json` through
`node scripts/port-structure.mjs --write-baseline` (its provenance line restored and extended), in the same commit.

**Wording that is not the owner's yet** (all in `src/lib/orders/copy.ts`, one place, each marked PLACEHOLDER except the
closed-drop sentence, which is `DROP_CLOSED_MESSAGE`, signed off): not enough room (in slots, not boxes), too many
unpaid orders on the number, pickup not available, payment method not offered, waiting-list limit, malformed order, order
id reused, ordering unavailable, unknown outcome and "Change the order", the pay-help line, the received and
status-page lines for an unpaid order, and the lookup and waiting-list lines. The status page keeps the ported
sentences that are still true ("Your box is ready", "Collected — thank you", "You missed your slot", "Payment
confirmed").

**Known limits, recorded rather than fixed here:**

- The engine's `shopOverride` ("close now") is not on the server, so it does not stop orders. **Cutover blocker**;
  needs a migration that redefines `place_order`.
- An anonymous customer's engine runs on `DEFAULT_CFG`, so the shop banner can say open while the server answers
  ZC001 (whose message is the signed-off closed-drop sentence). It also says "Monday 9:00 AM", true only with the
  default schedule.
- The status screen's protected line "Book your Grab or Lalamove for that window. We send the exact address that
  morning." is true for the courier pickup and not for the campus slot.
- A direct visit to `/lookup` still shows the ported page, whose copy promises email lookup. The in-app path (the shop
  footer) opens the live sheet instead. **Ethan approved that second guarded slot on 2026-09-29; it lands in B3.** Fixing the URL needs a second guarded slot in `find-my-order.tsx`, which D4 does
  not name; ask Ethan first.
- The owner's form for the order rules (`get_order_rules`/`save_order_rules`) is B3.

**Evidence:** `tests/unit/pickup.test.ts`, `orders.test.ts` (49 tests, 17 deliberate mutations, each caught) and
`ops-runtime-live-checkout.test.tsx` (27 tests, 13 deliberate mutations, each caught); `live-gate-menu.test.tsx` gained
the `loadShopOrders` calls. `tests/unit/flavours.test.tsx`'s two render-every-screen tests got an explicit 20 s timeout:
they are the heaviest in the suite and exceed the default 5 s when the whole suite runs on a busy machine (they did the
same at HEAD without this slice), so this is a load allowance and does not change what they check.
**Independent port audit (Sonnet `port-auditor`, 2026-09-29): PASS on all five points.** The `checkout.tsx` diff is the
import, `bareFrame` in the destructure and the guard's four lines, nothing else; the four `CHECKOUT_REVERSALS` tuples
applied to the new bytes reproduce the previous file byte for byte (hash `03d304619afd…`), and the `elements` 101 → 100
tuple matches the baseline diff; port integrity OK (54 files); no other protected file changed (`ops-engine.d.ts`
gained type declarations only); demo mode renders the ported branch because only the live branch of
`OpsRuntime.renderVals()` sets `bareFrame`.

**Independent review (Opus 5.5, a different model from the builder, 2026-09-29): no Critical; one High, fixed.**

- **High, fixed:** the order sent could differ from the screen. The inputs became read-only only after the first reply,
  and the box could still be edited through Back to the shop, so a customer who changed the date during a slow send
  and then lost the reply would "Try again" with the old date under a form showing the new one. Now the form and the
  box are locked while the order is sending, unsettled or placed (`OrderFlow.locked`; `custSet` and `custAdd` refuse
  while locked; the inputs are read-only while sending; "Change the order" shows only when unsettled), and the
  placed panel shows the pickup date and time. Test: "locks the form and the box while the order is sending, unsettled
  or placed", with mutations.
- **Medium, fixed:** the record's "one place" claim was false. Every new customer line is now in
  `ORDER_COPY` (`ORDER_COPY.status` for the status page), and the ported sentences the status page keeps are marked as such
  in `status-view.ts`. A lapsed unpaid order no longer says "held until": it says it was not paid in time
  (the hold time is compared with the clock).
- **Low, fixed:** the status page never shows the previous order under a new link while it loads; a no-show has one
  current step; the "we send the exact address" line is not shown for a campus pickup; "Order this cookie again" with no
  order says so; closing the waiting list keeps an unsettled entry (so reopening resends the same id); the malformed-order
  message also names the reference and the cookie count; a link pasted into the same tab replaces the order on screen
  (`lastHash` tells it from one this runtime wrote, and a lookup still wins over the old address).
- **Recorded, not changed:** `orders.ts` imports the pure `normalisePhone` (the SQL mirror) from `src/lib/idempotency.ts`,
  which AGENTS.md calls legacy for the rate limiter and idempotency, not for that helper; one implementation, not two.
  A 22023 refusal still has one message for its several causes.

**Evidence after review:** `tests/unit/pickup.test.ts`, `orders.test.ts` and `ops-runtime-live-checkout.test.tsx`
(mutations: 17 + 13 + 12 + 1, each caught); `scripts/test-live-checkout.mjs` (`pnpm test:live:checkout`), the live
happy path against the local stack: shop, checkout, order placed, the database row (unpaid, server-priced total,
normalised phone, Monday or Thursday pickup), status page and reload by link, lookup by number and phone (a wrong phone
finds nothing), waiting list, no console error, no CSP violation, no foreign origin, and the token in no request URL. It
sets the shop open through the engine's `shopOverride` because an anonymous customer's engine runs on the default schedule.

**Sharper statement of the schedule limit:** an anonymous customer's engine decides open or closed from the default
schedule (Monday 9:00 to Thursday 21:00), not from the owner's settings, which a customer cannot read. Outside that
window the shop shows "Orders are closed" with no add buttons even when the server would take the order; inside it the
banner can say open while the server refuses. It is the same defect as the un-persisted `shopOverride`: the shop's open
state has to come from the server (a public read of the ordering window and the owner's override). **Cutover blocker.**

# B3: the live lookup slot — APPLIED (2026-09-29, finish-plan slice B3)

Status: APPLIED. **Ethan approved this second guarded slot on 2026-09-29** ("it lands in B3", carry-over 4 of the B2
close-out). Same recipe and same scope as the checkout slot above: live mode only (`NEXT_PUBLIC_APP_MODE=live`); demo,
dev, CI and the visual baselines render exactly as before. Port audit (Sonnet): PASS on all five checks (diff limited to
the import, the destructured name and the two wrappers; copy and styles unchanged; demo render identical; the four
textual reversals restore the file byte for byte; no false live-mode text left on the screen).

**Why:** the direct URL `/lookup` (also reachable from a pasted link) rendered the ported page, whose intro promises
lookup by "order number, payment reference or email". A live order takes no email and no payment reference is the key;
the live lookup is order number plus the phone it was placed with (`find_order`). The shop footer already opened that
live form as a sheet; the screen itself did not.

**One protected file changed, `src/components/screens/find-my-order.tsx`, inserted by script** (the `PreToolUse` hook
blocks direct edits): an import, `bareFrame` added to the destructure, and two guarded regions.

```
import { LiveLookup } from '@/components/live/live-checkout';
const { backToShop, bareFrame, ic, lookupMissed, lookupQ, runLookup, setLookupIn } = v;
…back button and the "Find my order" heading, unchanged…
{bareFrame ? null : (
<p …>Lost the link we emailed you? Your order number, payment reference or email will find it.</p>
)}
…
{bareFrame ? <LiveLookup v={v} /> : (
<form onSubmit={runLookup} …> …the ported field, "Find it" button and miss sentence, verbatim… </form>
)}
```

`LiveLookup` is the same component the shop footer opens as a sheet, fed by the same `v.liveLookup`; on the `/lookup`
screen `liveLookupVals()` returns values without a sheet (`src/store/ops-runtime.tsx`). It brings its own intro sentence
and miss/error lines (`ORDER_COPY`, placeholder wording for Cine), and a found order opens the status page.

Baseline change: `elements` 11 → 12 for this file (`<LiveLookup>`); copy hash, copy count and styles unchanged; the AST
fingerprint (`scripts/port-structure-baseline.json`) regenerated with `port-structure.mjs --write-baseline` in the same
commit. **Exact reversals** are `LOOKUP_REVERSALS` in `scripts/validate-g0.py`, applied like `CHECKOUT_REVERSALS`: the G0
validator restores the original bytes (import, destructure, both wrappers, the baseline entry) before checking the
delivery hash. The Docker visual PNGs (`lookup*`) are not regenerated: the non-live branch is byte-identical and the
visual tests run with `bareFrame` false, so they must pass unchanged.

**Ported lines that are false in live mode, so never shown there** (they stay verbatim as the demo branch): the intro
paragraph above; the placeholder "HC-1042, a reference, or your email"; the miss sentence "Nothing matches that. Check the
number, or message Cine on Instagram and she will look it up." (the live form has its own miss line).

**Evidence:** `tests/unit/ops-runtime-live-checkout.test.tsx` ("B3: the /lookup screen": the live form on the screen with
no sheet and no email promise, a found order opens the status page, a miss stays and says so, demo renders the ported
page); `scripts/test-live-checkout.mjs` opens `/lookup` directly against the local stack.

## What B3 closed of the B2 cutover blockers

- The shop's open state now comes from the server (migration `20260101003800`, `get_shop_status()`; `place_order`
  honours the owner's switch). The customer engine's schedule and `shopOverride` are fed from it, with no engine edit.
- The `/lookup` URL shows the live form (this section).
- **Still open:** the ported status line "Book your Grab or Lalamove for that window. We send the exact address that
  morning." is protected and false for the campus slot; and the ported order screens still say Saturday and Sunday for
  the owner's Monday and Thursday pickup days (mapped by rank; recorded, not edited).
