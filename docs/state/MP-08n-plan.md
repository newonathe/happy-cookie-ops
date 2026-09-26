# MP-08n — real local service boundary and composed lifecycle

Status: n.1 and n.2 locally accepted; n.3 functional local lifecycle passed but cleanup/stability follow-up remains, 2026-09-24. G1 remains in progress. This slice follows MP-08m's synthetic Workerd boot. It supplies a real, disposable PostgREST service for the pinned GoTrue/PostgreSQL fixture and then tests the Pages session composition against both real HTTP services. It does not touch the locked UI/UX or claim hosted acceptance.

## Bounded implementation order

1. **MP-08n.1, private service fixture.** Reuse `scripts/test-auth-fixture.py`'s owned pair and 24 pinned migrations. Add only an in-memory reference to its generated JWT secret for the local child fixture. Add `scripts/test-pages-provider-fixture.py` and focused guard tests. Start digest-pinned `postgrest/postgrest:v14.16` (`sha256:bea1c76a856fa39d1e542d25911cf95d02fe2bf971992d033044ff209f1504b8`) on the pair's internal network, with no published ports or host bind mounts. Use an ephemeral authenticator connection and the same generated JWT signing key as GoTrue. Prove HTTP service-role RPC success and anonymous denial through the private database-peer `curl`, exact 24-migration replay, empty commercial transactions, image identity and guarded resource cleanup. Capture only sanitized status/count/hash evidence. Remove the captured PostgREST container before the existing pair cleanup; never broaden that cleanup's ownership predicate.
2. **MP-08n.2, composed route integration.** Add one Vitest integration file that calls `handlePagesSessionRequest` with a fixed local origin and an injected test-only `fetch` bridge to the two private HTTP services. The bridge must map only the exact configured synthetic HTTPS provider origin and `/auth/v1/` or `/rest/v1/rpc/` paths; no production code may accept insecure HTTP. Keep tokens and keys in process memory/child environment, never logs or argv. Exercise real login, cookie/CSRF read, refresh, logout, role and revocation failure, exact private row state, response privacy and no-store. The existing configured Workerd boot remains separate runtime-dispatch evidence; this injected bridge does not prove Workerd-to-provider networking.
3. **MP-08n.3, actual runtime acceptance.** Once the service lifecycle is green, establish a verified private TLS trust route for local Workerd or the later authorized hosted synthetic preview. Do not weaken `SUPABASE_URL` HTTPS validation or publish database/Auth/PostgREST ports to the LAN. Record the exact runtime/provider boundary that was exercised.

## Ownership and acceptance

- One bounded Terra/medium worker owns only the MP-08n.1 fixture files. Root owns this plan, integration and evidence. No overlapping writers, UI/engine/migration edits, production account use, deployment, payment or background runner.
- Before any fixture run, verify the Docker default context and all three cached image IDs. Use generated synthetic `example.test` accounts, no demo transaction seed, and an internal Docker network. On ownership ambiguity, retain resources with an explicit receipt rather than deleting guessed targets.
- Run focused fixture guards, real PostgREST smoke twice if the first run reveals environment variance, `pnpm verify` after code changes, `git diff --check`, source/continuity gates and a zero-owned-resource check. Stop and diagnose a failed HTTP/status contract rather than relaxing production security checks.
- MP-08 and G1 remain open until real browser lifecycle, MP-06 authorization, MP-07 bootstrap and MP-04 hosted free-tier acceptance pass. The offline sales queue is a later G3 requirement and its known failures remain visible.

## Source contract

## Interim results (recorded by Claude, 2026-09-24)

Codex reached its usage limit mid-slice (last evidence 12:15). Nothing below was re-run by Claude except the full verify. Codex still owns the MP-08n code files, and Claude did not edit them.

- **MP-08n.1 PostgREST smoke: PASS.** Anonymous RPC is denied with 401 and 0 rows; the service RPC returns 200 with 1 row; 24 migrations; zero owned residue. Receipt: [MP-08n1-postgrest-smoke-attempt1](evidence/MP-08n1-postgrest-smoke-attempt1.txt).
- **MP-08n.2 composed lifecycle: FLAKY, not accepted.**
  - Attempts 1–6 FAIL: the test process did not finish, then `AssertionError` (×2), `fixture_stage_refresh`, `fixture_stage_login`, `fixture_stage_refresh_projection`.
  - Attempt 7 PASS.
  - The repeat FAIL with `fixture_login_http_503`.
  - `persistent-attempt1` and `persistent-repeat` PASS.
  - Receipts: `evidence/MP-08n2-*.txt`.
  - Hypothesis to test before acceptance, not proven: `DEADLINE_MS` (5 s) in `src/lib/auth/session-handler.ts` spans four sequential provider calls during login (rate RPC, GoTrue token, GoTrue `/user`, session create). Each call goes through the `docker exec` bridge, which allows 4.5 s per call in `tests/integration/auth/private-provider-fetch.ts`. Instrument per-call timings on a failing run before changing any production deadline.
- **Verify:** Codex's [MP-08n-verify-attempt1](evidence/MP-08n-verify-attempt1.txt) is truncated at ESLint, with no exit code. Claude's full run on the same tree, with the pinned Node 24.20.0 / pnpm 9.12.3, passed port, engine, both typechecks, ESLint and 26 files / 387 tests, exit 0: [MP-08n-verify-claude](evidence/MP-08n-verify-claude.txt).
- **Toolchain slip:** `MP-08n-types-attempt1` and `MP-08n-verify-attempt1` ran under global pnpm ≥10. That version ignores `pnpm.overrides` and `onlyBuiltDependencies`. `node_modules` is still from pnpm 9.12.3 (2026-09-10). Use the `happy-cookie-tools` PATH prefix.
- **`retain-resources`:** the repo-root file was test pollution from `tests/unit/test_auth_fixture.py`, which uses `workdir=ROOT`. It has been removed, and the test is fixed separately.

MP-08n stays **in progress**. Next: explain the flake, then take .2 acceptance on two clean repeats, then .3.

## Codex checkpoint after the interim record — 2026-09-24

- **MP-08n.2 local acceptance: PASS under the stated two-run criterion.** A test-only timing probe in the private transport and integration harness recorded two consecutive fresh-fixture lifecycle passes: [timed attempt 1](evidence/MP-08n2-timing-attempt1.txt) and [timed attempt 2](evidence/MP-08n2-timing-attempt2.txt). Both replayed exactly 24 migrations with GoTrue, PostgREST and PostgreSQL on a private network, no published host ports, and zero owned containers, networks or workdirs after cleanup. A separate [post-run residue check](evidence/MP-08n2-residue.json) confirms zero owned resources. Login took 390 ms and 353 ms; refresh took 257 ms and 321 ms. The four login provider HTTP calls took 104/164/72/16 ms and 31/195/83/16 ms respectively. The production 5-second handler deadline and HTTPS-only provider validation were unchanged.
- **Earlier 503 root cause: UNKNOWN.** The two timed runs did not reproduce it. The prior per-request Docker bridge is a plausible contributor, but the evidence does not establish that as the cause. The timing probe records only allowlisted operation names, millisecond durations and status classes, with no request bodies, credentials or provider tokens. A future failure should retain the sanitized timing receipt for diagnosis rather than relax the production deadline.
- **Verification:** focused Python fixture guards pass 20/20; TypeScript typecheck passes. Full pinned `pnpm verify` passes port/engine integrity, both typechecks, ESLint and 26 files/387 tests, exit 0 ([receipt](evidence/MP-08n2-verify-timed.txt)). Continuity passes 1,184 checks with no failures ([receipt](evidence/G1-continuity-MP08n2.txt)). `git -c core.whitespace=cr-at-eol diff --check` passes; the unqualified `git diff --check` reports CRLF on Claude-owned `AGENTS.md` and `MASTER-PLAN.md`, not this test-harness edit.
- **Cross-review:** a read-only GPT-6 Sol/high review of Claude-owned governance/config changes found two P2 items—routine security-review agent pinned to Opus despite the Sonnet/high policy, and a delete-order option that conflicts with retained order history. Claude owns those fixes; see [review receipt](evidence/MP-08n2-claude-config-review.json). This review did not inspect or sign off on the MP-08n auth implementation.
- **Next boundary:** MP-08n.3 must exercise an actual Workerd-to-provider route using private TLS or an authorized hosted synthetic preview. The injected local bridge proves composition against real services but not that runtime network path. Claude's read-only auth/SQL review remains queued. No commit, push, merge or deployment occurred.

PostgREST documents its [official container](https://docs.postgrest.org/en/v10/install.html#docker) and [environment configuration, JWT verification and role settings](https://docs.postgrest.org/en/v14/references/configuration.html). The [v14.16 release](https://github.com/PostgREST/postgrest/releases/tag/v14.16) is the pinned local fixture version. These sources establish configuration syntax; the application contract requires actual local HTTP and SQL evidence.

## MP-08n.3 checkpoint — 2026-09-24

The actual local Pages Workerd-to-private-provider TLS attempt is **unaccepted**. It returned login HTTP 503 on three fresh fixtures; the latest count-only diagnostic saw zero gateway requests and zero private-provider calls after the deliberate negative TLS control. See [n.3 plan and receipts](MP-08n3-plan.md). The result narrows the failure to before the gateway but does not prove its cause. MP-08n.2's injected-bridge acceptance remains valid only for that narrower boundary. No production auth/TLS behavior was relaxed, and MP-08/G1 remain open.

Later n.3b evidence supersedes that failed functional result: actual local Workerd-to-private-provider login through logout and final SQL passed on three fresh fixtures, including two consecutive passes. [n.3b details](MP-08n3-plan.md) record the Workerd redirect and fetch-receiver fixes, one unexplained generic fixture failure, and a prior test-only network scratch directory that could not be removed after command policy rejected cleanup. The functional route is proven locally; the total cleanup gate, hosted/browser acceptance and MP-08/G1 remain open.
