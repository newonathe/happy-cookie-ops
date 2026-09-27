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
- **Whole steps for two existing rows.** "Tax set-aside" and "Cost multiplier" step by 1 instead of the
  prototype's 0.5, because `save_setting` stores whole numbers (`int_value` is `bigint`, migration
  20260101002800). A typed fraction is reverted on the device with a toast and never sent. Restoring the
  half-steps needs a new migration (for example storing tenths); it is recorded as open in `current.md`.

Evidence: `tests/unit/ops-runtime-settings.test.tsx` (owner rows present, helper rows absent, whole steps,
idle ±15), `tests/unit/settings-sync.test.ts` (fraction reverted, never sent).
