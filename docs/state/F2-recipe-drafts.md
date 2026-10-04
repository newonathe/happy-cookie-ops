# F2 editable recipe drafts - 4 October 2026

Ethan requested that changing business values remain editable rather than needing
fixed recipe answers before preparation can continue. Existing owner menu/flavour,
price, production recipe/yield, stock item/supplier and stocktake controls are reused.
All tools -> Recipe drafts now adds/changes saved source text and cookies per batch
for any catalogue flavour, including products added through Menu & flavours.

All seven supplied October source recipes are imported exactly from the accepted
private plan. Spoon/pinch/piece measures, separate components, optional cinnamon,
extra PB & Miso sugar and topping/stuffing quantities are preserved. Six recipes
start at editable14 as requested, not an independently measured yield. Apple Pie14
is verified by the workbook and remains editable. Text drafts do not silently change
production, costs or stock deductions; the production Recipes editor remains separate.
Six production ingredient/weight mappings and cost links remain open for accurate
stock deductions and margins. Editing the original recipes is available immediately.

Migration052 adds one RLS table and two active-owner-only RPCs, empty search paths,
explicit grants, bounded inputs, per-product serialization, optimistic timestamps
and safe identical retry. Raw browser table access is denied. Existing applied SQL,
protected screens/engine and original OFFLINE-01 are unchanged. The existing approved
private trial received this bounded schema/data/frontend update; no new hosted
project/service, shop opening, real transactions, jobs, merge or runner was introduced.

Evidence: pinned verify and both full commit hooks79 files/1474 tests PASS.
Database role suite1945 cases/reset x2,684 existing mutations detected, cleanupPASS.
Generated types/schema inventory match on two clean resets. Independent Luna accepted
root backend and exact source plan; root reviewed Luna frontend, stale read/save and
close/reopen guards. Four final headless Chromium captures (390x844/1440x900) are
inspected. Both viewports saved batch14->16 and changed text, reloaded from the hosted
DB, then restored exact original14/text. Production, inventory, products, ledger,
orders and stock movements exactly match the encrypted pre-import snapshot. Draft
updated_at legitimately advanced; it was not reset. Only test-local sessions revoked.

Backend61d3e8e and frontend72d7d17 are secret-scanned, committed and pushed.
Clean accepted build72d7d17 publishes to existing private Worker version
b29a55bc-0f7e-4224-8576-453c60ac820f. Owner-only OTP8h gate GETs pass before/after;
canonical enabled, previews disabled, routes[]. Fresh anonymous login/P&L/emittedJS/
SW denied via Access302, version preview404; two Access login viewports inspected.
Human updated-app login and real iPhone Safari/Chrome remain separate evidence.

Private source/plans/screenshots/logs stay outside Git in the existing private
visualizations directory. Receipts: F2-recipe-drafts-{Apply,visual,browser-cleanup,
independent-acceptance,publication,access-post-browser,pg17-readback}.json and
F2-recipe-drafts-role-security-passed.json. Plan SHA256:
d6f89e44fe056328560ae41b789d9f23c370c0ce95222c3e210a55baed6474c9.

Setup failures retained: Docker pipe/AF_UNIX startup preceded product testing;
security truncate fixture omitted the new FK child (one harness repair PASS);
remote-history PowerShell array wrapping and PG17 quoted empty search-path readback
needed bounded harness corrections; schema applied once, then exact readback/import.
A font download URL triggered next/font parsing; clean retry passed unchanged source.
Headless selectors first assumed title case, then label text included textarea source;
case repair verified applied and accessible textbox-role selection passed. Product
and protected sources were not changed to satisfy these harness checks.

F2 remains incomplete/F3 closed: actual opening stock, six production/cost mappings,
allergens/cross-contact, custody/recovery, separately approved customer/payment/shop
scope, seven actual dates and Cine acceptance are required. Actual-phone evidence
and the unchanged failing OFFLINE-01 must both PASS by20October for the bazaar pilot.
