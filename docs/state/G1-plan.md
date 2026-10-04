# G1 execution plan

## Current checkpoint — 2026-09-26

> **Superseded for process and remaining scope** by the [lean plan](lean-plan.md), approved 2026-09-26 under architecture A. The rest of G1 is a single goal in [next-goal.md](next-goal.md). The text below is history.

Claude executes all lanes while Codex is unavailable (Ethan, 2026-09-26; see [agent-orchestration](agent-orchestration.md)). MP-08n.2/.3, MP-08o.1–.4, MP-06l and MP-04d are accepted **locally**. The pinned `pnpm verify` passes 28 files / 410 tests (re-run by Claude on 2026-09-26). Exact receipts and limits are in [current state](current.md). Next, in order:

1. [MP-06m](MP-06m-plan.md): the probe is done (2026-09-26); a global-only revoke is insufficient. Next is a reviewed 28th-migration hardening plan.
2. MP-08 closure:
   - `/sign-in` through the BFF;
   - DP-15 idle timeout;
   - provisioning after DP-05.
3. Hosted spikes on Pages and Workers ([decision register](decision-register.md) DP-14). Needs Ethan's approval.
4. MP-07 real bootstrap.

G1 and release acceptance remain red. No commit, push, merge, deployment or automatic runner activation has occurred.

## Checkpoint history (newest first; verbatim)

> **Codex-only checkpoint — 2026-09-25:** MP-08o.2–o.4 are accepted on pinned **local** private-provider/database fixtures, including the bounded scheduled cleanup caller. [MP-04d](MP-04d-plan.md) accepts the local Pages/Workers static comparator; [MP-06l](MP-06l-plan.md) accepts the local erasure digest/execute repair on 27-migration disposable fixtures. The latest pinned `pnpm verify` passes 28 files/410 tests. See [current state](current.md) for exact receipts and limits. Hosted Cloudflare Pages/Workers comparison, MP-06 remaining function defaults/assigned-event authority/API matrix, MP-07 real bootstrap/browser/offline acceptance, MP-08 hosted scheduling/provisioning and physical Apple checks remain open. G1 and release acceptance remain red. Ethan has no Claude subscription; use Codex-only workers under the shared two-worker ceiling. No commit, push, merge, deployment or automatic runner activation occurred. The older checkpoints below are historical.

> **Codex-only continuation — 2026-09-24:** Ethan reports that Claude is no longer available; use the [Codex-only allocation](agent-orchestration.md) with one independent Codex reviewer for security-sensitive work. MP-08n.2 passes its two-run local injected-bridge criterion with real private GoTrue/PostgREST/PostgreSQL, 24 migrations and zero owned residue; the earlier 503 cause remains unknown. [MP-08n.3](MP-08n3-plan.md) is **unaccepted**: three fresh actual Workerd attempts returned login HTTP 503, and the latest count-only diagnostic saw zero TLS-gateway/provider calls. Do not weaken HTTPS validation or count injected-bridge evidence as runtime networking. A Sol/high read-only review found an open P2: `claimCleanup()` has no runtime caller. The next local bounded slice is the [MP-08o.1 expired-token provider probe](MP-08o-plan.md); fair retries and a scheduled caller depend on its result. No hosted or production acceptance is implied. The historical checkpoint below remains as originally recorded.

> **Checkpoint — 2026-09-24:** MP-08m (local Pages session route composition) is complete. MP-08n is in progress: the private PostgREST smoke passes, and the composed GoTrue/PostgREST lifecycle is flaky (see [MP-08n](MP-08n-plan.md) "Interim results"). Full `pnpm verify` passes 387 tests. The next steps are unchanged, in order:
>
> 1. Accept MP-08n.2 on two clean repeats after explaining the flake, then MP-08n.3.
> 2. MP-06 remaining authority.
> 3. Hosted spikes on Pages and Workers ([decision register](decision-register.md) DP-14).
> 4. MP-08 closure.
> 5. MP-07 real bootstrap.
>
> G1 is not release-ready.

> **Latest local checkpoint — 2026-09-24:** [MP-08m](MP-08m-plan.md) joins the session handler, persistent authority, Auth transport, crypto and durable repository at the Pages route. Full `pnpm verify` passes 387 tests, the 26-page build and local emulator pass, and a synthetic configured Workerd boot confirms fail-closed route dispatch. Independent review found no actionable P0–P2 issue. The next MP-08 step is a real isolated composed GoTrue/PostgREST lifecycle, then UI bootstrap and hosted checks. MP-06 remaining authorization, MP-07 real role/data routing, offline queue, hosted/physical-device acceptance and G1 remain open.

> **Latest local checkpoint — 2026-09-22:** [MP-08k](MP-08k-plan.md) completes the unwired persistent `SessionAuthority` adapter, and [MP-08l](MP-08l-plan.md) verifies the exact duplicate local-logout response on two fresh private provider/database pairs. Eighty focused tests, 33 fixture guards and full `pnpm verify` (24 files, 363 tests) pass; final independent review found no P0–P2 issue, and zero owned Docker residue remains. The next dependency is server-only route/service composition with trusted caller identity and `ctx.waitUntil`, followed by integrated local lifecycle evidence. Real bootstrap, offline persistence, hosted Cloudflare and physical Apple acceptance remain open.

> **Latest local checkpoint — 2026-09-22:** [MP-08j](MP-08j-plan.md) implements the private durable BFF session repository. Two fresh pinned GoTrue/PostgreSQL pairs pass 11 repository/concurrency scenario groups with 24 exact migrations, zero demo transactions and zero owned residue; 26 focused guards and two resets of 462 SQL security cases pass. Generated types and the function manifest include all seven service-only RPCs. Independent review found no P0/P1 issue and one disclosed P2 clock-equality evidence limit. The TypeScript authority adapter, route wiring, real bootstrap, offline queue, hosted acceptance and physical Apple checks remain open, so G1 is still active.

> **Latest local checkpoint — 2026-09-21:** Docker Desktop's engine recovered without reset or cleanup. [MP-08i](MP-08i-plan.md) now verifies the actual pinned GoTrue HTTP signup, password login, `/user`, refresh and local logout path on two fresh private database/Auth pairs. After logout, the owned `auth.sessions` row is absent and `/user` returns the measured 403 `session_not_found`; the app transport recognizes that exact denial. [MP-04c local repair](MP-04c-plan.md) includes untracked nonignored source in the isolated export and invalidates stale artifacts on failed builds. `pnpm verify` passes 336 tests, 21 Python fixture guards pass, the Pages export and emulator pass, and fixture cleanup finds zero owned resources. There is still no durable BFF session authority, hosted Pages proof, real app bootstrap or completed G1 acceptance.

> **Prior MP-08h checkpoint — 2026-09-21:** [MP-08h](MP-08h-plan.md) adds an Auth `/user`-checked provider-session binding prerequisite and prevents routine refresh from changing the cookie ID, CSRF token or absolute expiry. Focused 97 tests and full `pnpm verify` (336 tests) pass; independent security review found no issue in this bounded scope. The binding remains unwired. At that checkpoint Docker Desktop was unresponsive, so provider HTTP acceptance had not run; the newer MP-08i checkpoint above supersedes that environment limit.

> **Latest local Auth-schema checkpoint — 2026-09-21:** [MP-08g](MP-08g-plan.md) passes a pinned managed-schema preflight on two fresh GoTrue/PostgreSQL pairs on internal networks with no published ports; 23 pinned migrations, three PK/column contracts, Auth schema preservation, empty demo transactions and exact cleanup are evidenced in the [final receipt](evidence/MP-08g-live-final.txt). The earlier [MP-08e](MP-08e-plan.md) bare-Postgres preflight failure remains historical fixture evidence. No persistent session table, real Auth HTTP lifecycle or G1 acceptance is claimed.

> **Prior local SQL checkpoint — 2026-09-20:** [MP-06k](MP-06k-plan.md) passes local role/projection acceptance on two clean resets (924 role cases total, 60 red probes and guarded cleanup) after correcting a stale pre-MP-06k profile test expectation. G1 remains incomplete.

> **Latest G1 checkpoint — 2026-09-20:** [MP-07a](MP-07a-plan.md) repairs local demo direct-route adoption, stocktake alias, clock-drift hydration and mixed browser/app history, including bake navigation without a tick, without protected UI/engine edits. `pnpm verify` passes 323 tests. Full CLI Playwright: 87 passed, 3 failed on absent durable bazaar sale queue, 30 skipped SQL cases. The public screen HTML is temporarily blank until JavaScript; deterministic real bootstrap and final MP-07 acceptance remain open. MP-06k SQL, MP-08 real session authority and MP-04 hosted acceptance also remain incomplete.

> **Latest G1 checkpoint — 2026-09-20:** [MP-08f](MP-08f-plan.md). MP-08f safe sign-in return paths complete locally:38 focused cases and pnpm verify323 tests pass. Existing form only changes helper import/next computation; original form-tail hash restored after Claude formatter drift. Sol/high review no findings; Claude review unavailable due expired OAuth. Real BFF persistence, Docker SQL and G1 acceptance remain incomplete.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08e](MP-08e-plan.md). MP-08e provider-schema preflight prepared and statically reviewed:3 runner guard tests and pnpm verify285 tests pass. Actual managed-schema SQL is NOT_RUN/BLOCKED_ENVIRONMENT; outer Docker check stopped before fixture creation. Explicit not_after expiry and durable repository/race requirements documented. No persistence migration, real Auth or G1 completion claimed.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08d](MP-08d-plan.md). MP-08d encrypted session-token envelope complete locally:21 crypto/interoperability tests and full pnpm verify285 tests pass; Sol/high review has no remaining findings. Claude timed out without writes; one Terra/medium fallback implemented the module and unit tests, root independently verified Node AES-GCM interoperability. Persistent session store/provider races/Pages and MP06k SQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08c](MP-08c-plan.md). MP-08c Auth transport complete locally: Claude Sonnet/medium implementation, independent root tests and Sol/high review; 43 transport tests and full pnpm verify264 tests pass. Includes real loopback HTTP gzip decoding evidence. Persistent SessionAuthority, real provider acceptance, Pages/UI integration and MP06k SQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08b](MP-08b-plan.md). MP-08b HTTP session handler and independent verification packets complete with injected test authority:41handler+65requestpolicychecks, full pnpmverify221tests, final Sol/highreview no remainingfindings. Claude coded the handler; root integrated and fixed reviewfindings. Real persistent Auth/session authority, Pages/UI wiring, revocation/refresh concurrency and MP06kSQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-13:** [MP-08a](MP-08a-plan.md). MP-08a request-policy prerequisite complete locally:65 new real Request/stream security tests, full pnpmverify180tests, independent Sol/high review no findings. Origin/customheader, session CSRF comparison and boundedJSON validation implemented; no actual login/cookies/JWT/session binding or revocation yet. MP06k SQL behavior remains blocked by Docker startup; G1 incomplete.

> **Latest G1 checkpoint — 2026-09-13:** [MP-06k](MP-06k-plan.md). MP-06k implemented; acceptance incomplete. Explicit unpublished-by-default catalog and fixed-field read-only views generated consistently across two23migration resets. Final pnpm verify passes115tests with two forks;22Python checks pass and the real Docker cleanup check is environment-blocked. New SQL role/projection suite is NOT_RUN because Docker startup fails at stale dockerInference socket. Claude supplied code and independent review. G1 remains active and incomplete.

> **Latest G1 checkpoint — 2026-09-13:** [MP-06j](MP-06j-plan.md). MP-06j private-table restrictions pass locally: 16 policies on 11 tables; 842 SQL checks, 56 regression probes, 4 live function guards, 10 sequence restorations and 2 profile upgrades. Unchanged types and all other catalog sections; 115 application tests and 23 Python guards pass. Claude review has no blocking findings. G1 remains incomplete; assigned-event projections, controlled commands, function defaults, sessions, routing and hosted acceptance remain open.

> **Latest G1 checkpoint — 2026-09-13:** [MP06i](MP-06i-plan.md) adds a verified local function drift guard and creator/extension audit:4liveboundaries/636SQL/52red/10seq/2upgrades,115tests/23guards pass. Actual legacy erasure fails42883 at unqualified digest; rollback preserves customerfixture. Globalfunctiondefaults/managedupgrade compatibility and erasure remediation remain open. G1 incomplete; no hosted/production change.

> **Latest G1 checkpoint — 2026-09-13:** [MP06h](MP-06h-plan.md) completes trusted function search paths locally.636SQL/52red/10seq/2upgrades,19guards/115tests/types/catalog/cleanup pass;17bodies/owners/grants unchanged,16configchanges. Claude no blockers. G1 remains incomplete: global function defaults/remaining capabilities/projections,real sessions,routing and hosted acceptance are open.

> **Latest G1 checkpoint — 2026-09-13:** [MP06g](MP-06g-plan.md) is complete locally: future public table/sequence defaults restricted; explicit existing grants preserve20migration reset parity.626SQL/46red/10sequence restores/2upgrades,19guards/115tests/types/catalog/cleanup pass. Claude regex finding rejected with source/execution proof; remaining review clear. G1 remains incomplete: function defaults/helper/capability security,real sessions,routing and hosted acceptance remain.

> **Latest G1 checkpoint:** [MP06f](MP-06f-plan.md) is complete locally: REFERENCES and audit-sequence permissions restricted;578SQL/42red/10sequence restorations/2upgrades,115tests/16guards/types/catalog/cleanup pass. Existing constraints and trusted inserts remain. Next: future-object defaults/helper security,then role/session/routing/hosting gates. G1 remains incomplete.

> **Latest G1 checkpoint:** MP-06e trigger containment is complete locally:486 SQL scenarios/34 regression probes/2 upgrades,36 actual table grant removals/two function ACL changes,unchanged types,16 guards/115 tests and bounded Claude review pass. Existing six triggers still fire. [Evidence and incident disclosure](MP-06e-plan.md). G1 remains incomplete; next auxiliary grants/defaults/helper security, then session/routing/hosting acceptance. UI/UX unchanged; no live deployment.

> **Latest G1 checkpoint - 2026-09-12:** MP-06.d is complete locally. Two unsafe legacy mutation RPCs deny application execution; POST /api/sync returns fixed503/no ACK/no-store before auth or body access. Two resets pass386 SQL scenarios,28 regression probes and2 profile upgrades; exact two-function catalog delta, unchanged types and cleanup pass. All16 Python guards,115 unit tests, production build and3 standalone HTTP probes pass. Claude Sonnet5/medium found no blocking issues; Terra supplied complementary SQL/HTTP evidence. See [MP-06d plan and evidence](MP-06d-plan.md). Docker recovered without data reset. G1 remains incomplete: broader roles/functions/default privileges, real sessions, routing/hydration, durable offline behavior and hosted acceptance remain open; latest broad E2E78failed/30skipped. UI/UX remains locked; no deployment or live database. Next audit: [MP06e](MP-06e-plan.md) reproduced unauthorized SQL-role trigger attachment on two disposable fixtures; remediation is specified and pending. [Full G1 completion matrix](G1-completion-matrix.md) keeps remaining requirements explicit. Earlier checkpoints are history.

> MP-05.a completion — 2026-09-10: approved baseline repair and safe local bootstrap acceptance PASS. Two real explicit-connection CLI resets passed with exact eight-version history, matching catalog/public schema, empty transactions and sentinel removal. Six identity/loopback-binding checks and cleanup passed. Eight fixture guard/failure tests passed, including preserving an unrelated container. The owner-authorized explicit-connection fixture replaces the blocked managed `--local` transport for this slice; the earlier failure remains historical evidence. See [MP-05a-plan.md](MP-05a-plan.md). One Terra/medium read-only reviewer confirmed the cleanup-ID fix; no Claude or extra worker was launched this continuation. Next is MP-05.b types/schema reconciliation; G1 remains incomplete.

## Plan detail and historical checkpoints

Docker startup recovered after preserving only the stale runtime socket folders as `C:/Users/ethan/AppData/Local/Docker/run.mp05a-20260910`, `run.mp05a-20260910-second`, and `C:/Users/ethan/AppData/Local/docker-secrets-engine.mp05a-20260910`. Images, volumes, WSL distributions and settings were not reset. Engine 29.5.3 responds. The backups remain. Similar socket failures are reported in [Docker issue 527](https://github.com/docker/desktop-feedback/issues/527); the exact local error was independently observed. Required test images are now cached. Final inspection found no remaining disposable containers or custom networks.

Authoritative root: `C:\Users\ethan\dev\happy-cookie-ops-g0`. Branch: `agent/codex/MP-04-g1-feasibility`, based on G0 `dc8c8a5`. G0 remains complete as a foundation; G1 is **in progress, not release-ready**. This conversation authorizes proceeding to the next goal and economical Codex/Claude work. Protected-path, business-decision and concrete implementation-plan gates still apply. No new deployment, production mutation or runner activation has occurred.

## Work allocation and persistence

Read [agent-orchestration.md](agent-orchestration.md) on every resume. Default one worker, maximum two across providers excluding root; a Claude coordinator and its one child use both slots. No full-history forks, recursive delegation or automatic expensive model escalation. Root's configured model is unchanged; cheaper explicit worker models handle bounded analysis/implementation. Keep actual task progress in [task-status.json](task-status.json), not generated historical catalog statuses.

| Assignment          | Model / effort           | Responsibility                                                                | State                                                       |
| ------------------- | ------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| G1-FEASIBILITY      | Codex Terra / medium     | Read-only Next static-export blockers and narrow spike boundary               | Report received; no source edits                            |
| G1-SCHEMA-PREFLIGHT | Claude Sonnet 5 / medium | Read-only migration-history decision tree and first local SQL checks          | Completed, root reviewed; one recommendation rejected below |
| Root integration    | Current session          | Research, account preflight, plan correction, diagnostic experiment, evidence | Active                                                      |

The Claude packet and manual one-shot invocation are in `evidence/G1-claude-schema-prompt.txt` and `evidence/run-G1-claude-review.py`. One-shot invocation is not the future automatic runner. Auth was verified as first-party Pro with no inspected billing/provider override present; this is not a guarantee of remaining quota. On auth/quota/unavailability, stop and transfer the compact packet to one suitable Codex worker after reconciling any effects; permission/safety denials are never bypassed through another provider.

Claude's new run completed with exit 0, 9 turns, no permission denials and zero children. Model metadata records Sonnet 5 plus the CLI's small Haiku auxiliary call; root did not spawn a second Claude agent. Its requested six-turn named-agent limit was not enforced on this top-level run, consistent with the amended policy. The reviewed delimiter finding is accepted. The proposed "later forward migration alone" remedy for an invalid initial file is **rejected**: a fresh bootstrap stops before the later file. Preserve deployed history, build a separately reviewed clean-bootstrap path, and forward-repair deployed systems as distinct procedures. The reviewer did not inspect the sync migration, so it remains unknown in that report; no duplicate broad review is commissioned.

## Verified starting point and earlier Claude output

Fresh [G1 preflight verify](evidence/G1-preflight-verify.txt): exit 0, all 103 tests in 13 files. This is foundation evidence, not a release pass. Existing routing/hydration, queue and skipped SQL integration findings remain open.

Prior Claude privacy review is in `evidence/claude-review-result.json`; its dynamic SDK-coverage concern is now covered by `tests/unit/reporting-integration.test.ts`, which passes in the fresh verification. Prior visual-gate review is in `evidence/claude-visual-gate-result.json`; docs/TESTING.md now distinguishes matching Playwright/Node/pnpm versions from reusing the exact local application image. Hosted CI pixel parity remains unverified. Those results need no duplicate broad review.

## Ready work and explicit boundaries

1. **MP-04.a, disposable static-export diagnostic — completed.** [Export result](evidence/G1-export-result.json) records exit 0, 26 application HTML pages plus two error pages, and 55 byte-identical protected source files. Only tracked application/config inputs were copied, with no environment files. The two Next APIs, middleware and Sentry config wrapper were deliberately absent in the copy; the authoritative app remains intact. Attempt 1 failed because Turbopack rejected an out-of-root dependency junction; attempt 2 declared a shared dev filesystem root and succeeded. Both results are retained. No hosting, session, RLS, signed files, sync correctness or hydrated-route acceptance is inferred.
2. **MP-04.b, local Pages adapter spike — owner approved and implemented; final verification below.** Files: conditional Next export packaging, explicit public host headers, pinned Wrangler configuration, a credential-free Pages liveness function and focused local integration test. Existing Next API/middleware must be excluded via an explicit isolated build input boundary, not silently left in export or permanently removed before replacements exist. Functions must set their own headers; a static `_headers` file is not authorization or API-cache enforcement. Review exact patch plan after the diagnostic. Keep default local/Vercel behavior intact.
3. **MP-04.c, hosted feasibility — account/setup and preview authorization.** Use synthetic data, free provider hostname and verified free entitlement. Measure actual hosted CPU and request outcomes. The target remains p99 CPU <=8ms with no 10ms cap failures under the declared workload; local elapsed time cannot prove this. No paid upgrade or framework swap on failure.
4. **MP-05.a, schema provenance/bootstrap — complete.** Owner confirmed no prior database or applied SQL and approved the exact baseline repair and subsequent safe fixture. Two genuine explicit-connection CLI reset/catalog cycles now pass locally. See the completion checkpoint above; managed `--local` service recreation, generated application types and RLS correctness are not included.
5. **MP-05/06/08, database and BFF contracts.** These require real isolated schema/RLS and auth evidence. Prepare minimal sessions/RPC/file fixtures for feasibility without pretending domain business commands are implemented. No production session, customer lookup or money writes before relevant task gates.
6. **MP-07, final integrated bootstrap/routing.** Requires the verified role/session contract. Restore direct-route, selected-record and viewport behavior through approved runtime/adapters. Any protected markup changes still require exact exceptions; G0's five approved null guards do not authorize new changes.

## Dependency clarification requiring tracked plan reconciliation

The original MP-04 completion wording requires all hydrated routes, while MP-07 owns those fixes and depends on platform/auth. MP-04 also asks for real session/RPC/private-file proof, while MP-08's full auth package depends on MP-04. Treat these as **slice-level dependencies**, not permission to claim the whole package complete early:

- MP-04 platform experiment establishes build/provider delivery capability.
- MP-05/06 supply an isolated safe schema/role boundary in parallel when provenance allows it.
- MP-08's bounded session slice and MP-04's BFF fixture proof can then be integrated under one explicit contract and exclusive file ownership.
- MP-07 integrates the actual application; only then can the full MP-04 all-route integration criterion and G1 close.

Until the generator/catalog dependency amendment and actual tests are reviewed, leave MP-04/08 package status incomplete. Do not simply delete hydration/auth acceptance to make a green gate. Static route delivery and correct hydrated application navigation are separately measured outcomes.

The exact proposed DAG is in [G1-slice-dependencies.json](G1-slice-dependencies.json). The original machine DAG has no literal cycle; its acceptance requirements create the practical ordering conflict. Replace MP-08's whole-MP-04 prerequisite with verified MP-04.b platform capability at slice level, then retain final MP-04 closure after MP-04.c hosted proof, MP-07 routing and MP-08 lifecycle. This refinement is proposed, not evidence of completed parent packages. No historical master-plan bytes or generated catalog were rewritten.

The current continuity validator now permits known later package IDs while retaining all G0 entries, status validation and protected hash checks. Set `CONTINUITY_REPORT_NAME=G1-continuity.json` to preserve the historical G0 report. G1 uses a separate evidence index; old G0 hashes remain auditable.

## Setup owned by Ethan

**Cloudflare:** Ethan created the account with GitHub sign-in. A separate `happy-cookie-ops` Wrangler profile is now authenticated and activated for this checkout; `whoami --json` matches the owner-reported email and shows one account, while the older default profile remains separate. [Read-only preflight](evidence/MP-04e-cloudflare-preflight.json) found no Pages project or target Worker name collision. Ethan reports the Workers & Pages dashboard displays Free; this is owner-observed rather than independently verified via billing API. Spend controls, an exact synthetic hosted configuration, secret bindings, hosted measurements and deployment remain unverified or unapproved. Do not store login details in the repo or ask Ethan to paste a password/token in chat.

**Database history:** answer the pending question whether any Happy Cookie Supabase database exists or SQL was run for it. “Not sure” preserves history as unknown; it does not block read-only/local diagnostic preparation. A hosted Supabase account is not required merely to investigate the local schema, but remote integration will need a separate approved synthetic environment.

**Claude:** Ethan reports that the subscription is no longer available. Use Codex-only coordination under [agent-orchestration.md](agent-orchestration.md); do not substitute a paid API key.

**Local adapter approval:** Ethan answered “Proceed with the local adapter.” MP-04.b is authorized for isolated packaging, host headers, liveness endpoint and emulator tests only. A Terra/medium worker owns the new scripts/spikes/pages/focused-test files; root owns pinned Wrangler 4.130.0 installation, package scripts, state and integration. No authoritative src/public/Next configuration change, deployment or live database access is included. Node 24 meets Wrangler's declared >=22 requirement; license MIT OR Apache-2.0. No global CLI/account setting changes are intended.

## Research checked September 9

- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): explicit/custom-agent model precedence and inherited permissions; inspect overrides before delegation.
- [Codex models](https://learn.chatgpt.com/docs/models): use Luna for clear repeatable work, Terra for routine tasks, Sol for difficult analysis; project policy chooses actual effort and concurrency.
- [Claude subagents](https://code.claude.com/docs/en/sub-agents), [headless](https://code.claude.com/docs/en/headless), [models](https://code.claude.com/docs/en/model-config): version-specific controls, model resolution, limited tools and failure semantics. Installed 2.1.250 lacks some current documented flags. Prior top-level review exceeded its requested maxTurns, so this is not treated as an enforced token cap.
- [Subscription notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): June 15 update pauses the change described lower on that page; headless still uses subscription limits. No monthly credit is assumed.
- [Cloudflare static Next](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): static Pages remains documented; full Next guidance also discusses alternatives. Existing port is preserved pending measured feasibility. CPU and network wait are different metrics.
- [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started): local Docker development is separate from a hosted project; never target a live reset.

## Resume and completion

Both delegated reports and the export diagnostic are finished. No worker should be restarted merely to repeat them. The [G1 evidence index](G1-evidence-index.json) retains hashes and the acyclic proposed slice order; continuity passes 1,181 checks. Application source, migrations, protected UI/engine and hosted preview are unchanged in this pass. Local plan/scripts/evidence are uncommitted on the named G1 branch; no remote publication or deployment has occurred.

Read this file, orchestration policy, current.md and task-status.json; verify branch/dirty state and actual evidence before reassigning. Do not repeat the completed local adapter or broad reviews. The new Cloudflare account and its separate, bound Wrangler profile have passed identity preflight; the owner reports Workers Free. Inspect spend settings and prepare a reviewed exact hosted-test package before any upload. Keep G1 active until its real acceptance is complete; checkpoint unresolved setup rather than repeating expensive research.

## MP-04.b implementation and review checkpoint — September 10

The authorized adapter is isolated in `spikes/pages` and two scripts, with two focused handler tests. Root commands are `pnpm build:pages:spike` and `pnpm test:pages:spike`. The build uses tracked allowlisted inputs, excludes Next APIs/middleware/environment files in the copy, verifies 55 protected-copy hashes, emits 26 application pages, and cleans its unique sibling stage. It leaves the application build configuration intact. The test runs the real local Pages emulator, checks GET/HEAD health, method rejection, unavailable sync without acknowledgement, shop and unknown-route status, and all five cache/security headers on every response. No browser plugin is used.

Integration corrections: a nested stage stalled compilation and was terminated; moving the stage to the previously proven sibling layout passed (the stall's cause remains inferred). Wrangler rejected `--config`; running from its standard configuration directory without that flag worked. Its workerd binary rejected a compatibility date newer than 2026-09-08, now pinned. Failed logs remain in evidence. Root type/lint config excludes generated build and Wrangler state; no protected source/default Next config was edited.

Claude Sonnet 5/medium reviewed the concrete adapter: 11 observed turns despite requested 6, no permission denials or child agents. Its environment-inheritance finding was fixed with a minimal OS-variable allowlist. A subsequent bounded Terra/medium security review found non-terminal timeout, emulator path containment and retained staging copies; root corrected each. Reviews supplement actual builds/HTTP tests. Claude used verified first-party Pro subscription auth; metadata list-price estimates are not proof of charges. No provider/safety denial was bypassed.

Toolchain: Wrangler 4.130.0, Node 24.20.0, pnpm 9.12.3. Initial installation disabled lifecycle scripts. Root reviewed workerd/esbuild install code (optional platform binaries, scoped fallback downloads, version/integrity checks), added only workerd to the existing build allowlist and ran selected rebuilds. Audit found sharp 0.35.2 through new Miniflare; scoped override `miniflare>sharp=0.35.4` uses the [upstream patched version](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). Final audit: zero production findings; 14 development findings (3 low, 5 moderate, 6 high) on existing LHCI/Storybook/Vitest paths, no remaining Wrangler advisory. The older 11-finding count is stale; newly published findings on unchanged Vitest/extract-zip paths also need a separate tooling remediation slice. Do not force major upgrades in this adapter slice.

Checkpoint is split into tooling (generated lockfile), adapter code, and evidence/policy documents. No commit/push/deployment/database change/protected UI edit was made. Historical evidence remains preserved. Full MP-04/G1 remain incomplete: hosted CPU/session/RLS/private-file tests and integrated routing/offline/auth gates still apply. Earlier diagnostic stages remain as evidence; current packaging removes its own stage after each attempt.

### Final local evidence

- `evidence/MP-04b-verify-final.txt`: exit 0; port/engine/types/E2E-types/lint and 105 unit tests in 14 files pass.
- `evidence/MP-04b-build-final.txt` and `MP-04b-manifest.json`: exit 0; 26 emitted application pages, no missing pages, 55 protected source/copy hashes.
- `evidence/MP-04b-emulator-final.txt` and `MP-04b-emulator-result.json`: exit 0; health GET/HEAD 200, mutation 405, sync 503 without ACK, shop 200 and unknown route 404; all cache/security header assertions pass.
- `evidence/MP-04b-app-build.txt`: ordinary Next build exit 0 with original application config.
- `evidence/MP-04b-audit-final.json` and `MP-04b-audit-production.json`: zero production findings; 14 inherited-path development findings remain open.

These checks prove this local adapter only. No hosted measurement, real Mac/iPhone test, new visual baseline, auth/database/offline production acceptance, CI publication or deployment occurred. Keep the existing release failures open. Read task-status.json for slice completion, not historical catalog planned statuses.

## Owner setup update — September 10

Owner confirms Cloudflare signup is complete and no Happy Cookie Supabase database exists / no SQL has been run. Prior pending-history statements above are superseded. DP-09 provenance is owner-confirmed unapplied; the explicit baseline-repair approval remains pending. The [MP-05.a plan](MP-05a-plan.md) and exact two-line proposed patch are ready for that approval. No SQL or database reset has been run in this continuation.

Wrangler secure storage initially lacked its Windows binding. Its own pinned @napi-rs/keyring 1.3.0 was installed in Wrangler's user-scoped native directory. Keyring storage is forced; plaintext fallback is disabled. The OAuth attempt requests account/user read plus Pages write; offline refresh is added by Wrangler itself (it is not a valid explicit --scopes option). Browser automation is disabled. The owner completed ordinary-browser consent and Wrangler reported successful login. No token or OAuth code is recorded in project evidence.

Docker Desktop was stopped and has been launched hidden for local preparation. Confirm server readiness again before starting disposable database resources.

## Current continuation checkpoint — 2026-09-24

The earlier September 10 setup and Claude-login statements above are historical. Ethan has since reported no Claude subscription; do not invoke Claude, a paid API or an upgrade fallback. One bounded Luna worker was attempted for the MP-08n.3 network probe but hit the Codex usage limit before writing a file; root completed the local work. Keep at most two concurrent Codex workers including root and do not spawn on the same exhausted quota merely to retry.

[MP-08n.3b](MP-08n3-plan.md) now has three fresh **functional** actual Workerd/private-provider lifecycle passes, two consecutive. The fixes are a standard test-only HTTPS gateway, a local-function `fetch` call in the service RPC, and manual redirect handling in both server-only provider transports. The old wrapper's zero-all-Auth-sessions assertion was corrected to preserve the exact signup-session baseline. One long generic fixture failure and an earlier test-only network scratch directory remain disclosed; zero total residue and n.3 closure are not claimed. The full G1 objective remains open on MP-06 authority, MP-04 hosted Pages and Workers comparison, MP-07 product bootstrap/browser/offline route acceptance, MP-08 scheduled cleanup/provisioning/recovery and owner/hosted gates. No commit, push, merge or deploy occurred; the owner's later explicit approval boundary controls those actions despite the older objective's "commit often" wording.

Setup evidence: `evidence/MP-05a-setup.json` records successful OAuth and the latest Docker readiness result without credentials. No deployment or database command was performed.

> **Current environment note:** Docker became unavailable after the successful c5 test/cleanup run. A normal hidden Desktop start exited without restoring the daemon. Recover Docker before the next SQL fixture; current container inventory could not be checked. Saved test inputs/results remain hash-verified. See [environment evidence](evidence/MP-06c5-environment.json). No data reset or deletion was performed.
