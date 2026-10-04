# F2 owner-trial target setup — 4 October 2026

## Current approval and execution

Ethan approved online test setup, then reuse of **keth-ai's Project**
(`enftprwcsrdbnlplfrwk`) after read-only checks found zero app tables/users/objects.
The free organisation already had two active projects: none was created, paused,
deleted or upgraded. The older preview database remains untouched.

All 52 migrations apply on PG17.6 after the explicitly approved three-place 029
quotation correction and additive 051 maintenance hardening. Owner Auth/profile
access and six unpublished catalogue/allergen definitions are provisioned. The shop
is closed; no full seed, stock, orders, expenses or payment accounts were imported.
Automated owner sign-in/refresh and hosted-target local-browser P&L pass. Credentials
are owner-only DPAPI outside Git; private handoff/change and Cine's sign-in remain open.

Latest static Worker version `3188360e-008e-4772-a3e8-fc3eff5fd5af` contains accepted
frontend `be1e115`, zero routes and both canonical/version URLs disabled (404). The
saved scoped credential now passes token and Access application/organization/IdP
GETs200. The exact-owner email-code gate is created and passes fresh readback;
pre-enable browser login ends404 and remains unverified, so both Worker URL types
stay disabled. The build contains only publishable configuration; actual privileged
key bytes and working payment QR bytes are absent. No usable link yet.

Planning assumes iPhone 14 or newer and a MacBook, using Safari and Chrome; exact
devices and results remain unconfirmed. Real-data/payment/customer/shop-opening
scope, encrypted off-device custody/target recovery, seven dates and Cine acceptance
remain separate gates. Jobs/imports/merge/runner stay off. The original proposal below
is history; this section supersedes its unapproved/create-new-project wording.

**Selected setup:** a dedicated Supabase trial database and fresh Workers static origin,
using architecture A and the reviewed working-branch release. Keep the public shop closed
initially. Cine uses an owner account for preparation and synthetic rehearsal; expenses
may be recorded only within Ethan's approved data scope. This closed-shop stage cannot
complete the real week of orders. For that week, Cine places business orders through the
shop (including orders for DM customers), using the approved customer/data/payment scope
and validated account details. There is no owner-side manual order-entry feature.
Opening the shop for that scoped real trial needs separate explicit approval; production
cutover, imports and legal/accounting decisions remain separate. Preparation does not
complete F2 or authorize F3.

## Why the existing previews cannot be used as-is

- Read-only Wrangler deployment listing identifies the latest Workers version as
  `2697ca3e-0680-4448-afd5-3c8500ff3461`, uploaded 27 September at 10:32:48 UTC.
  It predates accepted product slices through F1 and the now locally accepted rolling-period caption patch.
- Fresh HTTP GET probes extracted only the public client configuration from that release.
  Its database origin is `https://xyfnkanixderzbfngdah.supabase.co`. Auth reports
  `disable_signup:true`, `mailer_autoconfirm:false`; the September record saying signup
  was enabled is stale. No hosted login or account mutation was performed.
- `get_books`, `get_staff_orders`, `get_stock_catalogue`, `get_production`,
  `get_operations_health` and `shop_state` probes return `404/PGRST202`.
  Anonymous discovery is not a privileged schema inventory, but this is sufficient to
  reject compatibility. Full migrated schema/roles still need privileged read-only
  verification after target approval. The historical preview had 28 migrations and PG17;
  current local acceptance uses 51 migrations through `20260101005000` and PG15.8.
- No current Cine owner account/profile or signed-in session is evidenced. Signup being
  disabled does not establish account access. The protected Vercel URL remains a manually
  deployed demo, with no business database suitability established.

## Prepared local work and exact hosted approval boundary

`spikes/owner-trial/wrangler.jsonc` is a static-assets-only candidate configuration named
`happy-cookie-owner-trial`. It has no script, secret, job or binding. The existing reviewed
`scripts/build-pages-spike.mjs` builds current live code and derives CSP from the chosen
Supabase origin. No resource has been created and the candidate has not been deployed.
Current local builds, workflow results and reviews are recorded in [checkpoint](F2-checkpoint.md)
and [receipt](evidence/F2-trial.json); the [existing checklist](F2-owner-trial.md) is reused.

After approval, technical execution will be:

1. Create the isolated trial project in the existing owner-controlled organisation on the
   approved free plan. Do not upgrade a plan. Verify current service limits and PG version
   before creation; the local PG15 result does not certify a PG17 target. Replay the current
   migration history in order without modifying applied SQL. Seed only reviewed catalogue
   definitions/ported flavour IDs; do not import fabricated orders, sales or books. Check
   schema/function/grant/RLS equivalence, including PG17 `MAINTAIN`, before acceptance.
2. Disable public signup, set the documented 30-minute JWT expiry, and provision Cine's
   individual owner account securely through the dashboard/operator. Assign an active
   owner profile. Credentials go directly to her password manager, never Git or chat.
   Provision helper/support only if the trial needs them; test their denied money access,
   inactive-user denial, refresh, local sign-out and owner-assisted recovery.
3. Configure reviewed business rules/menu and opening balances with Cine. Begin with the
   shop closed; use synthetic checkout data for pay-now/pay-later rehearsals. No real-data
   import is included. Before the actual week, approve the invited customer/data/payment
   scope and permit opening the trial shop. This is a separate decision from hosted
   preparation; keeping it closed would leave the real-order trial incomplete.
4. Build with `NEXT_PUBLIC_APP_MODE=live`, the new project URL and publishable key only;
   deploy the accepted release to the fresh origin using the prepared config. Record source
   commit, migration count, asset manifest and deployed version. Probe the new target
   signed in and anonymously, enforce CSP, confirm no service key is in the assets, and
   run representative target checks before Cine starts the week.
5. Establish manual encrypted backup/off-device custody and a target restore drill before
   storing real owner records. A synthetic health-green fixture is not this proof. F1
   hosted timers, keep-alive, retention, health writes and the automatic runner remain off;
   any hosted operation needs explicit approval, including any manual backup-health write.

Approval needed: create/configure this isolated trial database, apply the accepted schema
and reviewed catalogue, provision owner access, and deploy this release to the fresh trial
origin, with the exact permitted real-data scope recorded. These are hosted actions and
are expressly withheld by the current goal. Approving the proposal does not by itself
approve jobs, production opening, imports, purchases or legal/accounting treatment.

## Owner evidence and bazaar gate

Cine records all seven dates and feedback in the existing checklist, including quiet days.
Physical Safari/PWA testing must use her actual phone model and include airplane mode,
reload/reopen, stable queued identities, reconnect/replay, void and close-out reconciliation.
Headless phone-sized screenshots and AI sign-off cannot replace those records.

By **20 October 2026**, both OFFLINE-01 and her actual-phone rehearsal must pass for the
24–25 October app pilot. The original WebKit test remains failing; its browser-emulation
diagnosis is not a waiver. Without both results, use the current selling/paper process in
October and move the app pilot to 12–13 December. D3 early hosted setup requires explicit
approval. F2 remains in progress and F3 remains closed until real-week acceptance.

Local continuation from bdd83f6: targeted fresh live customer/owner workflows, CSV/P&L reconciliation, corrected phone/desktop caption captures, independent acceptance and pinned verification are now complete for this slice. The technicalContinuation receipt records exact scope and cleanup metadata drift; the existing checklist is unchanged. This supplies a concrete release candidate for the approval above, not hosted or owner-week acceptance.

Independent review found verify warning10002: token is not usable until 4 October
00:00 UTC / 08:00 Manila despite active200. Fix Start Date (no new secret needed)
or wait until that UTC time, then recheck scoped Access APIs. The user separately
reports an initial Zero Trust setup screen; that is not the proven cause of401. No
Access, paid-plan or billing mutation occurred. Corrected before publication.

## Latest continuation — 4 October, resumed at user request

The scheduled current-chat follow-up was deleted; no automatic product runner is active.
The saved replacement token is now usable: token, scoped Access applications, organization
and identity-provider GETs all return200. The initial future-token warning10002/401
diagnosis is historical and preserved, not a current credential blocker.

An independently reviewed exact-hostname private gate is created: one approved owner
email, one-time PIN only, one reusable Allow policy, eight-hour sessions; no wildcard,
bypass or service-token access. Fresh application/policy/IdP GETs match. The owner
identity and temporary password remain outside Git; a clipboard handoff helper is prepared
privately but has not run. No authentication email was sent.

The Worker remains disabled, including preview URLs: pre-enable browser login did not
reach an email field (initial direct redirect400; relative redirect ends404). A local
null-array check was corrected without duplicate resource creation; installed Playwright
import was corrected. These are verification-harness setup failures, not app repairs.
No Enable stage ran; explicit disabled readback passes after the failed preflight.
Activation, live anonymous/static/owner-route proof and Cine sign-in remain unverified.
No further login repair is attempted in this checkpoint. Reuse accepted be1e115,
caption85f6bc6, uploaded3188360e and all existing local financial/visual evidence.

Next goal: resolve the private-login preflight from its retained HTTP redirect evidence,
obtain independent activation acceptance, then verify the private origin and hand over
owner credentials securely. Real-week/customer/payment/shop-opening and custody/recovery
permissions remain separate. F2 incomplete, F3 closed; actual-phone rehearsal and the
unchanged failing OFFLINE-01 both must pass by20October. Jobs/imports/merge remain off.
