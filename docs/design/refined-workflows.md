# Refined workflows: implementation scope

Ethan authorized implementing the completed v4 mockup in the actual application on
1 November 2026, then testing the integrated application. This supersedes the earlier
mockup-only scope and the historical calendar order in `docs/state/next-goal.md`.
It does not authorize deployment, hosted writes, migrations applied to a hosted database,
cost cutover, test reversal, release settings, or merging to main.

## Theme direction — Ethan, 2 November 2026

Neutral light with Happy Cookie character replaces the cream theme: white/cool gray surfaces,
charcoal type, original logo/cookie images and restrained existing brand orange. Scope the new
palette to the rebuilt live owner UI; preserve locked demo tokens/markup. Use glass for navigation,
headers and popovers; keep inventory, recipe and money content clear and readable.
Use 140 ms control feedback and a 220 ms fade/6 px rise with decelerating easing; reserve
280 ms for larger entering surfaces. These timings are design choices informed by
[Fluent motion](https://fluent2.microsoft.design/motion) and
[Apple material hierarchy](https://developer.apple.com/design/human-interface-guidelines/materials).
Animate opacity/transform, honor reduced motion and provide solid reduced-transparency/unsupported
blur fallbacks. Existing operations, draft retention and acknowledgement safeguards take precedence
over animation. Older fallback pages remain pending migration; this is not a completed all-page theme.

## Reference and boundaries

- Workflow reference preserved as `happy-cookie-workflows-refined.v4.html`, SHA-256
  `fad61841ac098a9cb5431e382b9703589b8fc9947fe29ee0eef0476e80646aae`.
- Current neutral-glass theme: `happy-cookie-workflows-refined.html`, SHA-256
  `ef1d069bfbd30e5dde4d750cd6315a97c3d270512e55889e9697e0e768aac51f`.
- The private thread visualization folder holds the fragment, editable template,
  `gap-refinement/README.md`, original-reference checks, and v4 screenshot walkthrough.
  Keep real business data, private comparison evidence and screenshots outside Git.
- Preserve Onest, supplied assets and the six destinations; use the scoped neutral owner tokens:
  Home / Bazaar / Sell / Make / Stock / Money. No global search or mandatory tutorial.
- Implement through the existing live screen/form slots and runtime. Locked demo
  screens, sheets, shell, engine and visual baselines remain protected.
- Reuse real domain operations, identifiers, versions, permissions, cost provenance,
  queue acknowledgements and exports. Never ship the mockup's sample engine, fixtures,
  simulated recovery controls, password handling or local JSON restore as real services.
- A UI save means the real operation acknowledged it. Unknown, waiting, failed and
  conflicted states remain distinguishable. Do not invent stock, prices or results.

## Ordered implementation slices

Keep each logical slice reviewable, tested and committed separately. If a listed area
needs more than approximately 400 changed lines, split it into complete smaller paths.

1. Live frame and navigation: reproduce the approved structure with the current theme beside the locked demo,
   with direct Bazaar, Customers/Waitlist, one navigation group, contextual settings,
   correct active destinations and no lost routes, role restrictions or demo changes.
2. Complete Stock list/item/count/review/save/return to visual and functional parity:
   retain the selected item and origin, blank versus zero, real cost provenance and durable recovery.
3. Make: product-centered library and exact recipe links; read/scaled ingredient and
   packaging views; kind-preserving version saves; drafts; costs/history; production
   entry/review/result with authoritative resulting stock and shortage handling.
4. Stock: visible Add to inventory; ingredients/packaging/dough/baked categories;
   unknown counts; item definitions versus quantity movements; delivery conversion
   and multi-line failure behavior; shopping demand; vertical supplier directory.
5. Bazaar: focused plans, event list/details/settings/activity; separate day close and
   event finalization; actual counts; stock/losses/fees; existing till and receipts;
   safe waiting-sale and other-device recovery; preserve classic till fallback.
6. Sell and Shop: orders/payment review/exceptions/refunds; Customers/Waitlist;
   contextual settings and child-page Back; sampler flavour choices, fixed box sizes,
   optional add-on choices, payment methods, schedules and customer previews.
7. Money and Account: shared periods, signed amounts, transaction sources/export;
   contextual book settings; people/access, sign-out, connection/backup truth.
8. Integration: useful fact-driven Home; origin-aware Back and refresh/draft recovery;
   accessible responsive states, meaningful errors/retry/conflicts, performance.

## Acceptance

- Match the v4 jobs with the 2 November neutral-glass theme using actual application data. Cover all 57
  comparison findings; the 13 earlier Mockup gap findings are design coverage only.
- Test the changed path first, then the pinned `pnpm verify` gate. Use headless
  command-line Playwright for browser verification; no browser-control plugins.
- Independently review auth, RLS, SQL, money and offline changes under the shared
  worker policy. Protected exceptions require their existing approval procedure.
- Demo/port integrity remains green. Do not regenerate laptop visual baselines.
- Local fixtures and emulation do not constitute hosted or physical-phone acceptance.
  After implementation, run the selling-phone rehearsal and approved closed-shop week.

## Progress

- The private `happy-cookie-page-by-page-plan.md`, HTML reader and JSON cover 59 pages/child
  flows, all 25 route keys, 33 tool entries, 36 tracked owner requirements and 57 historical
  comparison findings, with 238 decision branches and 224 automation field groups. Research includes relevant supplied Template Pack
  sections and official POS/inventory/recipe/P&L sources with retrieval limits. These are plan
  coverage counts, not completion claims. The separate owner frame is implemented; the Stock body remains next.
- The new frame reuses real screens and sheets without remounting the domain runtime; its title,
  contextual Stock Back, original brand image and six destinations work at phone/tablet/desktop widths.
  Quick add remains as a compact compatibility entry until each existing job has its final contextual home.
  Public, helper, denied and focus/till modes keep the existing frame. Independent review found no remaining
  material issue in this scope. Fixture component checks are not database or selling-phone proof.

- Direct Bazaar and Customers/Waitlist are implemented on `codex/refined-workflows`.
  The full pinned gate passed: 143 test files, 2,611 tests; port integrity unchanged.
  Other navigation consolidation and durable record routes remain pending.
- Removed the duplicated second navigation row across the live owner sections. Payments
  and Products are direct section links; contextual setup/tools use a disclosure with
  keyboard support. Stock has one Inventory/Grocery/Suppliers row, visible Add to inventory,
  and item management under Inventory settings. Further product-centered consolidation remains pending.
- Inventory Count is connected to the real live operation: item entry, blank versus zero,
  review, safe Back/continue, multiple retained entries, unavailable-item recovery and
  explicit checking of unconfirmed saves. Durable requests keep their original IDs and
  item identities under one browser-tab lock. Independent review found no actionable issue;
  83 targeted tests pass. Actual components pass headless entry/review/save/return checks at
  320, 390, 768 and 1240 px using synthetic RPC data. This is not database, hosted or physical-phone proof.
- Count confirmation reuses the existing item-cost source: unpriced legacy items and failed/null
  reads remain pending, confirmed database zero remains zero, and a partially known adjustment
  is never shown as a complete total. No request or ledger-posting behavior changes.
- Make and all later workflow slices remain pending. Passing mockup tests does not mark them implemented.
- The ingredient/packaging list now uses the compact panel layout, saved pack details, one status
  selector and retained category/filter when returning from an item/count. Retired items are excluded
  from the working list. Its single Inventory/Shopping/Suppliers group follows the title and uses the
  approved quiet appearance. Item layout, production categories and unknown-stock provenance remain pending.
- Owner messages render separately from the sheet frame, fixing the opaque page covering a
  saved result. Existing toast lifetime and Undo are preserved; warning/status announcements are
  accessible. Actual screenshot pixels confirm headings remain painted at all four widths.
