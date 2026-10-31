# Refined workflows: implementation scope

Ethan authorized implementing the completed v4 mockup in the actual application on
1 November 2026, then testing the integrated application. This supersedes the earlier
mockup-only scope and the historical calendar order in `docs/state/next-goal.md`.
It does not authorize deployment, hosted writes, migrations applied to a hosted database,
cost cutover, test reversal, release settings, or merging to main.

## Reference and boundaries

- Approved local fragment: `happy-cookie-workflows-refined.html`, SHA-256
  `fad61841ac098a9cb5431e382b9703589b8fc9947fe29ee0eef0476e80646aae`.
- The private thread visualization folder holds the fragment, editable template,
  `gap-refinement/README.md`, original-reference checks, and v4 screenshot walkthrough.
  Keep real business data, private comparison evidence and screenshots outside Git.
- Preserve Onest, existing design tokens, supplied assets and the six destinations:
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

1. Navigation foundation: direct Bazaar, Customers/Waitlist, correct active destinations,
   and no lost routes, role restrictions or demo changes.
2. Inventory count repair: render the real count task, retain the navigation shell and
   selected item, preserve blank versus zero, review actual counts and return safely.
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

- Match the v4 jobs and visual language using actual application data. Cover all 57
  comparison findings; the 13 earlier Mockup gap findings are design coverage only.
- Test the changed path first, then the pinned `pnpm verify` gate. Use headless
  command-line Playwright for browser verification; no browser-control plugins.
- Independently review auth, RLS, SQL, money and offline changes under the shared
  worker policy. Protected exceptions require their existing approval procedure.
- Demo/port integrity remains green. Do not regenerate laptop visual baselines.
- Local fixtures and emulation do not constitute hosted or physical-phone acceptance.
  After implementation, run the selling-phone rehearsal and approved closed-shop week.

## Progress

- Direct Bazaar and Customers/Waitlist are implemented on `codex/refined-workflows`.
  The full pinned gate passed: 143 test files, 2,611 tests; port integrity unchanged.
  Other navigation consolidation and durable record routes remain pending.
- All other slices remain pending. Passing mockup tests does not mark them implemented.
