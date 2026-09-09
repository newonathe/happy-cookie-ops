# Decisions, unresolved facts and research sources

Baseline research: 7 September 2026; final consolidation continued 8 September 2026 (Asia/Manila). Provider facts below were read from official documentation. Architecture choices, operating targets and risk priorities are the audit's judgments. Account entitlements, real devices, live database history and owner business policy remain distinct unknowns.

## Decision register

These entries make missing information explicit and bounded. No response is required to finish the planning package. Resolve each before its dependent implementation/release step; do not invent an answer after a timeout. The selected recommendation is a proposal where it affects locked UX or business policy.

| ID | Decision / evidence | Recommended resolution and owner | Release block |
|---|---|---|---|
| DP-00 | Missing production/error/auth/accessibility states; review chrome persists; fixed canvas clips; empty stocktake/batch/order; labels/controls may need protected markup | Ethan reviews a narrow exception ledger: exact existing screenshot, failure trigger, proposed smallest change, copy, keyboard behavior and pixel diff. Reuse existing states first. No global redesign or baseline reset | Affected flow cannot ship with false success, inaccessible control or exposed preview controls |
| DP-01 | Actual lookup is one field accepting low-entropy identifiers; old two-factor prose is false | Use an opaque status/recovery code/link, with owner-assisted recovery. If existing field placeholder/copy cannot express it, approve only that change; alternative two-field challenge is a larger explicit UX decision | Public lookup/status recovery |
| DP-02 | Pending payment claim reserves nothing; confirmation may overfill through approved overage; closed-drop copy says nothing charged although customer may have already transferred | Preserve pending-vs-confirmed semantics and owner-only audited overage. Owner approves accurate capacity/payment-conflict wording and overpayment/underpayment resolution. No automatic reversal of wallet transfer | Checkout, confirmation and capacity-refusal cases |
| DP-03 | Packing currently logs shortages; strict no-negative inventory would change behavior; bazaar also consumes packaging | Owner chooses documented deficit/shortfall with explicit confirmation and reconciliation, or block until count/receipt corrected. Include offline packaging allocation and used-material void disposition. Never silently clamp or manufacture stock | Packing/bazaar/adjustment exceptions |
| DP-04 | Four pricing modes, latest-paid cost, fixed August display, rolling report and tax fixture conflict | Owner/bookkeeper validates sum-of-menu default, inactive alternatives, report calendar, drop-close recognition and tax assumptions. Bind date/amount data accurately; retain approved visual structure | Price settings and final financial reporting |
| DP-05 | Helper “no money” copy conflicts with tender/closeout needs; support can see excessive details; staff invite/recovery UI absent | Helper gets assigned sale/tender/change and close count, no costs/P&L/customer books. Support gets redacted diagnostics. Manual verified staff provisioning/recovery is free baseline; owner approves exact role capabilities | Staff/role/closeout operations |
| DP-06 | Privacy/retention and BIR intended use are business-specific | Owner/bookkeeper records statutory system of record, invoice/CAS/e-commerce applicability, contact/financial retention and legal holds; obtain specialist input if needed. No automatic claim that internal use is exempt | Real personal data and launch |
| DP-07 | Lot, allergen, shelf life, returned-food disposition and quality release lack complete approved inputs | Baker/owner provides verified SOP and opening lot evidence. Use linked manual worksheet where locked UI lacks fields; add minimal fields only after approval. Returned food defaults to held disposition pending review, not auto-resell | Production safety/traceability and food-return workflow |
| DP-08 | Actual provider accounts, traffic, developer/runtime license eligibility, Apple versions and limits unknown | Use free Cloudflare/Supabase design; measure spike and current quotas, record actual supported devices and expected peak volume. If free envelope fails, choose smaller scope/manual fallback or explicit revised budget | Hosting acceptance/performance/platform support |
| DP-09 | No `.git`; supplied migrations may or may not have been applied elsewhere | Recover provenance and migration history. If demonstrably unapplied, approve repair of broken baseline; if deployed elsewhere, preserve it and design clean bootstrap plus forward upgrade path | Reproducible database start |
| DP-10 | No verified independent backup destination/key custody/operator availability | Owner identifies existing storage and recovery-key custodian; maintainer proves encrypted restore and RPO/RTO. If absent, launch remains blocked | Production data readiness |

Resolved user facts: fixtures only, one offline sales device, UI/UX locked, Mac/iOS/web target, free services plus existing subscriptions, plan/templates now and runner later. These override older answers/documents.

## Critique of the chosen plan

| Challenge / competing approach | Finding and disposition |
|---|---|
| “Just deploy the current Next app on Vercel Hobby” | Rejected: commercial-use rule plus current build and durable-workflow failures. Low traffic is irrelevant to eligibility |
| “Static export makes authentication impossible” | False: static shell can use a same-origin BFF; private data must never be rendered into export. It does require moving Next request-time handlers/middleware and proving cookies/CSRF |
| “Full Next on Workers is less migration work” | Plausible alternative, but runtime CPU/adaptor compatibility must fit Free. Thin static+BFF selected to bound CPU and preserve React port; failed spike reopens this ADR |
| “Rebuild in .NET, Laravel or a full ERP” | No verified benefit sufficient to discard the approved port and existing TypeScript/domain work. Modular SQL authority supplies needed transactional guarantees without enterprise scope |
| “Use SQLite/localStorage for all books to stay free” | Single offline device does not remove multi-user online authority, backup, access control or concurrency needs. SQLite is suitable for local agent metadata, not an unplanned public cloud database |
| “Use one JSON blob in Postgres to preserve the engine exactly” | Reject as canonical records: difficult authorization/conflicts/reporting and retained engine bugs. Use aggregate projections into the same view model |
| “Queued sale UUID alone solves offline” | Insufficient: local transaction completion, immutable hash, allocation/fencing, exact ACK, void ordering, expired auth, closeout and recovery all matter |
| “Expired lease releases stock automatically” | Rejected: disconnected device may have sold it. Hold allocation until reconciliation; safety over availability |
| “Never exceed capacity” | Too absolute for locked owner overage sheet. Normal confirmation respects capacity; explicit owner override is separately authorized and audited |
| “Use standard weighted-average COGS because ERP guidance recommends it” | Conflicts with latest-paid management-cost design. Preserve current estimate policy; statutory valuation needs separate accountant decision |
| “Every received payment posts revenue immediately” | Would double count the prototype's drop-close posting. Separate payment facts from recognition, with explicit cash-to-revenue reconciliation |
| “All production behavior can be fixed without touching any markup” | Unproven. Missing lookup/error/zoom/chrome states may require narrow protected exceptions; no blanket UI/UX permission is inferred |
| “Backups on a free host are automatic” | Rejected. Free database tier needs independent export/restore and objects; local machine availability/key custody is a real dependency |
| “Automatic AI resumption can be continuous and perfect” | Rejected. Local machine/credentials/quota/model/permission limits remain; journal recovers durable facts and flags unknown outcomes. It cannot recover unrecorded actions or operate through unanswered permission gates |
| “Use the newest/best model automatically” | Rejected when account access/credit billing is unknown. Resolve allowed exact models/effort, record them, fail closed on paid fallback |

No independent review by Claude Code is claimed in this phase. The source audit included a separate port-focused review; these architecture objections were then reconciled during synthesis. Later deep implementation slices require independent evidence-based review and tests. Agreement between agents alone never passes a release gate.

## Source register

Each row states the narrow claim for which the page was consulted. Recheck cost/model/auth/deployment facts at setup and release, and after provider policy changes. Quarterly is the maximum normal interval for broader source review; legal applicability is checked before launch or new jurisdiction/intended use. URLs are direct sources, not search-result links.

| ID | Official source | Used for / boundary |
|---|---|---|
| R01 | [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines) | Hobby commercial exclusion |
| R02 | [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) | Free request/CPU envelope and static assets |
| R03 | [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) | Builds/files/asset limits |
| R04 | [Cloudflare static Next guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/) | Static export deployment path |
| R05 | [Next static exports](https://nextjs.org/docs/app/guides/static-exports) | Request-time feature limitations; moving API/auth responsibility |
| R06 | [Cloudflare Next framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) | Current alternative hosting/adaptor guidance; not automatic replatform permission |
| R07 | [Cloudflare terms](https://www.cloudflare.com/terms/) | Provider terms reviewed as setup dependency; no legal/commercial guarantee inferred from absence of a Hobby restriction |
| R08 | [Supabase pricing](https://supabase.com/pricing) | Free storage/database/auth/project/backup bounds |
| R09 | [Supabase billing guide](https://supabase.com/docs/guides/platform/billing-on-supabase) | Separate feature quotas such as Realtime; optional features not unlimited |
| R10 | [Supabase free pausing](https://supabase.com/docs/guides/platform/free-project-pausing) | Inactivity pause/recovery; no permanent uptime guarantee |
| R11 | [Supabase backups](https://supabase.com/docs/guides/platform/backups) | Independent free exports, object-backup distinction and restore planning |
| R12 | [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) | Production account/security/SMTP/recovery setup |
| R13 | [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) | Default mail limitations; custom SMTP prerequisite |
| R14 | [GitHub included usage](https://docs.github.com/en/billing/reference/product-usage-included) | Private Actions allowances and spending control |
| R15 | [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | Hosted versus self-hosted/standard runner distinctions |
| R16 | [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) | Persistence/eviction is conditional; IDB is not backup |
| R17 | [WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | Installed-app and user-permission conditions |
| R18 | [Apple web push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) | Web push capability separate from native distribution |
| R19 | [Apple web apps session](https://developer.apple.com/videos/play/wwdc2023/10120/) | Mac web-app installation context |
| R20 | [MDN Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) | Limited browser support; foreground recovery baseline |
| R21 | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Keyboard/zoom/focus/target/accessibility verification target |
| R22 | [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Requirement-based security verification framework |
| R23 | [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html) | Privileged function search path and default PUBLIC EXECUTE |
| R24 | [NPC Data Privacy Act](https://privacy.gov.ph/data-privacy-act/) | Philippine safeguard/privacy framework |
| R25 | [NPC implementing rules](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/) | Processing/retention/outsourcing responsibilities |
| R26 | [NPC breach reporting](https://privacy.gov.ph/pips-and-pics/breach-reporting/) | Qualifying breach notification process/window |
| R27 | [BIR registration](https://www.bir.gov.ph/registration-requirements-details) | CAS/CBA/component intended-use review |
| R28 | [BIR RR 11-2025](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2011-2025.pdf) | E-invoicing framework; applicability not decided by this audit |
| R29 | [BIR RR 26-2025](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025.pdf) | Later amendment must be considered, not only manual's original rule |
| R30 | [Brevo Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) | Optional mail candidate daily cap; not a guaranteed approved integration |
| R31 | [Brevo SMTP troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP) | Sender verification, activation and domain prerequisites |
| R32 | [Codex models](https://learn.chatgpt.com/docs/models) | Family/model/retirement and account-availability distinctions |
| R33 | [Codex noninteractive mode](https://learn.chatgpt.com/docs/non-interactive-mode) | Structured execution and explicit session resume |
| R34 | [Codex automations](https://learn.chatgpt.com/docs/automations?surface=app) | Local automation execution conditions |
| R35 | [Claude headless](https://code.claude.com/docs/en/headless) | Noninteractive outputs/session resumption |
| R36 | [Claude model configuration](https://code.claude.com/docs/en/model-config) | Aliases, effort, precedence and possible credit billing |
| R37 | [Claude SDK plan notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) | Paused June billing change; top notice overrides historical text |
| R38 | [Claude Code Pro/Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan) | Subscription auth versus API-key billing |
| R39 | [Claude Pro plan](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan) | Session/weekly limits; do not assume midnight daily reset |
| R40 | [Claude errors](https://code.claude.com/docs/en/errors) | Distinguish rate/quota/auth/provider failures |
| R41 | [Claude scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks) | Session task lifecycle differs from durable OS supervisor |

The uploaded manual's other vendor/industry references establish useful process vocabulary, not universal legal mandates or recommendations to buy those tools. Its full source map was considered; this audit independently refreshed the sources necessary for the actual selected architecture and major risk decisions. Untested live claims remain `unknown` even when an official page documents the feature.

## Remaining proof obligations

No active hosted projects, current account billing controls, production SMTP, real Apple hardware, applied migration history, measured production load or independent backup destination was established. These are intentionally gate inputs in the backlog. They do not prevent writing a complete plan, but they prevent declaring a secured working product. Implementation should resolve them in dependency order and append the actual evidence rather than resetting the plan's status optimistically.
