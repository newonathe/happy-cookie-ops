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

# MP-09 c engine exception — APPROVED, not yet applied (2026-09-27)

Ethan approved the smallest edit to the protected engine (`src/store/engine/ops-engine.js`) that lets the flavour
list (`PRODUCTS`: name, description, photo, allergens, permanent/rotating) and the payment accounts
(`PAY_ACCOUNTS`) come from state loaded from the database instead of module constants (configurability audit
B1, B2). No visible change to any screen. The slice that applies it must keep the change minimal, record the
exact edit here, register it as exact reversals in `scripts/validate-g0.py`, and pass an independent port audit.

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
