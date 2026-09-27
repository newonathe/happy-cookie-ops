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

