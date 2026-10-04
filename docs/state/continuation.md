# Continuation handoff — 2026-09-09

G0 (MP-00–03) is complete as a reproducible foundation. Read [current.md](current.md), [task-status.json](task-status.json), [evidence index](evidence-index.json), [visual acceptance](visual-review.md) and [cloud preview](cloud-preview.md). The authoritative root is `C:\Users\ethan\dev\happy-cookie-ops-g0`; the original OneDrive delivery remains preserved.

The implementation checkpoint is `85aa1b1c2f9cdeac60a195ca7c5f25494a2d3797`, pushed to `agent/codex/MP-00-g0-foundation`. [Draft PR #5](https://github.com/newonathe/happy-cookie-ops/pull/5) targets `main`, which contains bootstrap `32e37da`. Follow-up documentation commits may be newer; verify `git status`, `git log -3` and remote refs before starting. Nothing has been merged from this PR. The Vercel demo is live and requires the owner's Vercel login.

Before assigning workers, read [agent-orchestration.md](agent-orchestration.md): default one worker, maximum two across both providers including Claude children. Use explicit economical models and bounded prompts. Claude Pro login was refreshed and a subsequent Sonnet 5/medium review succeeded. Reuse completed findings; no automatic runner, scheduler, extra usage or paid API fallback is active.

`pnpm verify` passes 103 tests; local standalone/Docker/Vercel builds pass; independent Docker comparison passes 75 snapshots with one worker; continuity validation passes 1,181 checks. Only the five owner-approved null guards differ in protected render-source files. Snapshots retain documented fixture/harness differences and clipping; they do not prove full prototype pixel equivalence.

The latest release suite has 78 failures and 30 database skips. Home hydration error 418 recurred after a fresh build; 24 other paths redirect Home on each of three browser profiles. A real synthetic sale never reaches the persistent queue; the actual empty-ack regression also remains. Owners: MP-07 and MP-18–21. SQL integration belongs to MP-05/06. GitHub CI stops at inherited formatting, so dependent hosted jobs did not run. No production-readiness claim.

Stop at G0 unless new work is authorized. The next gate-ordered package is MP-04, whose MP-02/03 prerequisites are complete; it must prove the planned zero-cost Cloudflare production architecture. MP-05 is also dependency-ready after MP-02. The temporary Vercel demo does not settle the production hosting decision. Preview updates are manual; Git integration/automatic deployment is not configured.

## Copy-ready next-conversation prompt

```text
Continue Happy Cookie Ops after G0 from C:\Users\ethan\dev\happy-cookie-ops-g0. Read MASTER-PLAN.md, AGENTS.md, CLAUDE.md, docs/state/current.md, continuation.md, task-status.json, evidence-index.json, visual-review.md, cloud-preview.md and agent-orchestration.md. Verify Git state first: implementation checkpoint 85aa1b1, branch agent/codex/MP-00-g0-foundation, private GitHub draft PR5; documentation may be newer. Preserve dirty work and do not infer that the PR was merged.

MP-00–03 are complete: verify103 tests, local/Docker/Vercel builds, Docker75 snapshots, continuity1181 checks. Protected source/reference evidence remains guarded with five owner-approved null checks. Known release defects remain: Home hydration418,24non-Home redirects per profile, missing durable sale queue, empty-ack sync bug,30skipped SQL checks and inherited CI formatting failure. No real backend or physical Apple acceptance.

Plan the next bounded MP-04 zero-cost deployment-architecture feasibility slice, reading its generated task/prompt and dependency/decision requirements. The protected Vercel demo is temporary development visibility, not approval of commercial production hosting. State exact scope/files/tests and required owner decisions before implementation. Do not start auth, SQL, money, offline rewrites, messaging or an automatic runner. Use the saved economical Codex/Claude worker policy; no paid fallback or excessive concurrency. Preserve locked UI/UX and original fixtures.
```
