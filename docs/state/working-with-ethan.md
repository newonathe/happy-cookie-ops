# Working with Ethan

Rules he has given across many sessions, for any agent on any machine: Codex, Claude Code, local or cloud. These used to live
only in one computer's memory. Read this with `AGENTS.md`. Where this file and `AGENTS.md` disagree, ask him.

## Starting in the cloud

- **Use the branch `codex/refined-workflows`.** `main` is far behind it. Starting from `main` means working on old code with old
  instructions.
- Read in this order: `AGENTS.md`, `docs/state/current.md`, `docs/state/next-goal.md`, then
  [the client review](../design/client-meeting-2026-11-04.md) and [the review standard](../design/ui-review-standard.md).
- Claude cloud installs the pinned toolchain itself (`.claude/hooks/cloud-setup.sh`). Elsewhere, install Node 24.20.0 and pnpm 9.12.3
  first ([toolchain](toolchain.md)). A newer pnpm silently ignores the overrides.
- See the real app with fake data: `pnpm preview:owner`, then open `http://localhost:4186/`. `window.__hcOps` is the running app, so
  `window.__hcOps.go('orders')` opens a page. `tools/owner-preview/walk.mjs` screenshots every page.
- Cloud sessions cannot reach Ethan's computer. The recording, her workbook and recipes, credentials and hosted access are not
  available and must not be requested into the repo. If a task needs them, stop and ask him.
- **The repository is public.** No customer data, recipes, costs, sales figures, payment details, email addresses, credentials or recordings.
  Scan before every push.

## How he wants to work

- **Proven facts only.** Everything stated as fact comes from a file or a command run this session. Label the rest as unverified.
- **Attack your own plan** before showing it. He has rejected plans for being slow or unchallenged.
- **One recommendation per decision,** phrased so "yes" approves it. Never an either/or. If he does not understand a question, decide it
  for him in plain words and make the value editable.
- **He is not technical.** Anything he must do by hand gets exact numbered steps: which site, which button as it is labelled, what to type,
  what he should see, and what to reply. Plain words always.
- **Act, then report.** Keep replies short when he is frustrated. Show, do not describe. When something fails that you cannot reproduce,
  get the real error instead of repeating advice.
- **Finish fast and complete.** No extra audit or research rounds unless asked. Order work by value and rework avoided, not by a calendar.
  Every slice ends committed, pushed and verified, so a usage limit strands nothing.
- **Leave only what is needed.** Prune and consolidate documents instead of accumulating them.

## Closing every task

End with: the next goal ready to paste in a fenced `text` block, then a small table of model, reasoning effort, plan mode and new or same
conversation, then token tips specific to that goal, then one recommendation for the next decision.

## What he wants from the product

- Finished, functional, secure, fast, easy to navigate, accurate and good-looking, but not over-built.
- Nothing hard-coded. Every business value she sets is editable in the app.
- **Lossless:** consolidating is welcome, but every control, figure, action, record and safeguard stays reachable and working. Drop something
  only if it is truly useless or redundant, and list each drop with its reason for his sign-off in `docs/design/capability-ledger.md`. A hidden
  field the backend needs keeps its saved value on submit.
- **The look:** the approved mockup's structure and the neutral theme. Consolidated: tiles and grids, every control for an item inside its card,
  one primary action per screen. Fix a screen as a whole, not piece by piece: repeated figures, comma lists and floating bits are what he
  rejected.
- Every visible change gets a real visual check at phone and wide desktop, with the screenshots looked at, before calling it done.
- Messages drafted for a client open with a two to four line recap of what was last decided.

## Standing permissions and limits

- May commit each accepted slice and push the working branch after a secret scan.
- Never merge to `main`, deploy, create hosted resources, apply hosted migrations, change hosted records, or read `.env` files without him
  saying so for that action. Approval for one thing does not carry over.
- `localhost:3000`, on his computer, uses real hosted data: look only.
- Newest dated owner statement wins. A conflict becomes a question, never a silent pick (`docs/state/decision-register.md`).
- Two agents may share a checkout. Run `git status` and check recent commits first, stage by exact path, and never overwrite another's work.

## What bites in practice

**Tests and commits**

- Every commit runs the full `pnpm verify`. Run ESLint and the affected tests first. Under load, tests can time out at random: rerun alone
  before believing a failure, and report it if it repeats.
- `pnpm format:check` runs in CI but not in `pnpm verify`. Run it before pushing.
- A test that works out "today" must pin the clock.
- `pnpm test:e2e` drives the demo build, which has the old till and not the live screens. Check live screens on the preview.
- Never run e2e after a build with hosted settings: `.next` keeps them. Build in a separate copy with no settings.
- Never leave a `node_modules` junction in a worktree and remove it with `git worktree remove --force`. Remove the junction first. This deleted
  the real `node_modules` once.
- The database suite (`python scripts/test-db-security.py`) and `python scripts/validate-g0.py` rewrite receipts in `docs/state/evidence/`. Restore
  them with `git checkout` afterwards.
- A new migration needs its pin in `tests/fixtures/mp08g-source-pins.json` and an entry in `tests/fixtures/function-authority.json`.

**Scripts**

- Never run a bare `python -`. It waits for input and hangs the shell.
- On Windows, open text files with `newline=""` so line endings do not churn. Run Prettier on files a script changed.
- A locked file needs Ethan's explicit yes and the steps in `docs/state/protected-exception.md`. Live words can be mapped outside the engine
  instead, as `src/lib/orders/owner-words.ts` does.

**The preview**

- A selling till needs injected state: `stage: 'selling'` and a `dayId`. Events need the `/bazaar` path.
- `go()` keeps an open form, so load the page fresh for each flow.
- Animated counters read low for a moment. Wait before reading a total.

**Hosted database**

Supabase pauses a free project after about a week of low activity. `.github/workflows/keep-alive.yml` reads the shop status once a day to prevent it, and runs only from `main`. It makes a pause unlikely, not impossible, and GitHub can switch off schedules in a quiet repository, so do not ignore Supabase's warning emails.

**Who decides what**

Business rules: `docs/state/decision-register.md`. What to build next: `docs/state/next-goal.md`. What exists and what is missing:
`docs/design/reference-v4/coverage.md`. What was kept when pages changed: `docs/design/capability-ledger.md`.
