# What happens next

> **Current sequence:** [MASTER-PLAN.md](MASTER-PLAN.md) and [the audited backlog](docs/master-plan/07-build-backlog.md) supersede the sequence below. Current data is fabricated demo data; there is no live-book migration requirement.

One page, in order. `docs/TASKS.md` is the full board with dependencies and acceptance
criteria; this is the sequence and the reason for it.

Status: `○` not started · `◐` built, needs switching on or verifying · `●` done

---

## Right now — you, about 90 minutes total

Do these before an agent touches anything. Each one is a prerequisite for work that comes
later, and each is faster than explaining it to an agent.

| | Task | Time | Why now |
| --- | --- | --- | --- |
| 1 | `git init`, commit, push to a **private** repo | 5 min | Nothing an agent does is revertable until this exists |
| 2 | `pnpm install` → `pnpm verify` | 10 min | **The one thing nothing has verified.** Six audit passes found everything reading can find; this finds the rest |
| 3 | Deploy to Vercel — `docs/DEPLOY.md` §1 | 10 min | 24 of 25 screens work with no backend. A real URL you can watch |
| 3b | **Fill in `docs/ENVIRONMENTS.md`** | 5 min | Every runbook command becomes copy-paste. Skip it and the first incident starts with a scavenger hunt |
| 4 | Sentry project + DSN, `PRODUCTION_URL` variable | 15 min | Reporting is written and switched off until you do |
| 5 | Visual baselines in Docker — `docs/TESTING.md` | 15 min | Until these exist, layout regressions are invisible |
| 6 | Second Supabase project for staging — `docs/STAGING.md` | 20 min | **Blocks T-14.** That migration can destroy a year of her books and has nowhere to fail safely |
| 7 | Enable Supabase backups, restore one into a scratch project | 15 min | An untested backup is a belief |

Step 2 is the one that matters. Everything below assumes it passed.

## Then — the agents, in this order

Dependencies are real. Two tasks touching `ops-engine.js` or the same migration are
sequential no matter how much you want them not to be.

### Phase 0 — make the gate work
| | Task | Who |
| --- | --- | --- |
| T-01 ○ | Get it running, prove the port | Claude Code |
| T-01b ○ | Local Supabase, verify RLS by querying | Claude Code |
| T-02 ○ | Generated database types, remove every `any` | Codex |

### Phase 1 — identity, before money moves
| | Task | Who |
| --- | --- | --- |
| T-04 ○ | Staff accounts, real role gate from `profiles` | Claude Code |
| T-05 ◐ | Harden `/api/sync` — the limiter exists; add the size cap, logging and `/status` | Claude Code |
| T-06 ○ | Cross-model review of the phase | Codex, read-only |
| T-16b ◐ | Observability — switch it on | you |
| T-17 ◐ | Verify reporting scrubs PII. Do not rebuild it | Codex |

### Phase 2 — the test net, before the migration
| | Task | Who |
| --- | --- | --- |
| T-07 ○ | Money and rounding, every path in the rules spec | Codex |
| T-08 ○ | The six untested engine rules, one commit each | Codex |
| T-09 ○ | Offline queue under real failure, seven cases | Claude Code |
| T-18b ◐ | Generate visual baselines | Codex |

**Do not skip to phase 3.** This net is the only thing that will tell you the migration
broke a rule she depends on.

### Phase 3 — the actual remaining build
| | Task | Who |
| --- | --- | --- |
| T-10 ○ | Catalogue and prices. Use `src/lib/money.ts` | Claude Code |
| T-11 ○ | Orders — the big one, two sessions | Claude Code |
| T-12 ○ | Ledger, append-only | Claude Code |
| T-13 ○ | Stock, recipes, suppliers | Codex |
| T-14 ○ | **Retire localStorage. Supervised.** | Claude Code **+ you** |

### Phase 4 — quality
T-15 (accessibility, the only task allowed to edit ported markup), T-16 (realtime),
T-18 (performance, measure first), T-19 (the pre-bazaar ritual on her actual phone).

## The dangerous one

**T-14 can destroy a year of her bookkeeping.** Three commits, a mandatory dry run against
her real exported payload reviewed by a human, and it does not start until T-11, T-12,
T-13 are green and staging exists. Do not let an agent run it unattended.

## What is still genuinely missing

Not defects — decisions and unbuilt work. `docs/GAPS.md` has the full register.

**Needs her, not code**
- The **SMS bill** (§2.1). The only paid dependency. The code ships with an honest stub.
- **`taxRate` is 3 and nothing consumes it** (§1.4). Whether it applies to gross or margin
  is a question for her bookkeeper. Her P&L is currently pre-tax and does not say so.
- **The partial-capacity refusal sentence.** The prototype never needed one, because its
  shop clamps the quantity picker. `POST /api/orders` does. It ships as a marked
  placeholder rather than an invention.
- **Which of the half-built screens she actually wants** (§5) — form queue, notifications,
  recipe editing all have UI and no path behind them.

**Needs a decision from you**
- **Vercel Hobby prohibits commercial use** and this app takes money. Deploy on Hobby now;
  decide before it is her only till. The `Dockerfile` is the exit.
- **Supabase free projects pause after 7 days idle** and her business is weekly. The hourly
  health check keeps it warm — so do not disable that workflow to save Actions minutes.
- **Public or private repo.** Public means unlimited Actions minutes. There are no secrets
  in the code, so the question is whether her prices and business logic being public is
  acceptable. Hers to answer.

**Known unbuilt, ranked**
1. The books are not in Postgres (§1.1). Everything else is downstream.
2. ~80 engine methods have no unit test (§3.5). T-07 and T-08.
3. No transactional messaging (§2.1). One SMS template is worth it; an email system is not.
4. No payment verification (§2.2). Reference matching is worth building; a GCash webhook
   needs a merchant account she may not clear.
5. Two devices offline at one bazaar will oversell stock (§4.3). A market stall's real
   answer is to accept it and reconcile at closeout — document the choice rather than
   engineer around it.

## What not to build

`docs/TASKS.md` ends with the full table and the reason each destroys paid-for work. The
short version: no React Native, no design system, no microservices, no GraphQL, no state
library, no analytics dashboard, no i18n, no CMS. One baker, forty orders a week.

And the standing rule, now in `AGENTS.md`: **check whether it already exists first.**
Building a second rate limiter, scrubber, error boundary or money conversion is worse than
doing nothing.
