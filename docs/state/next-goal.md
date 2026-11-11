# Next goal — Claude Code continuation

Continue the active [full application goal](full-goal.md) from Git without repeating completed audits. Current branch: `claude/dreamy-faraday-74rshc` at `ced7b82` (equal to `main`). See [current state](current.md). The list of accepted slices is in [history](current-history.md).

1. **First open item (C4/C11):** reproduce staff-name profile-read timing across batched role changes. `loadStaffName` is at `src/store/ops-runtime.tsx:2445`, called from `src/components/app/live-gate.tsx:503-504`; guards at `ops-runtime.tsx:2450-2469`; caches at `ops-runtime.tsx:2339` and `src/lib/auth/staff-name.ts:20`. The caller of `bindStaffIdentity` (`ops-runtime.tsx:2347`) is not yet traced. No existing test drives an A to B to A role sequence on the staff name. First step: write that test; change code only if it shows a wrong name.
2. **Release: blocked on Ethan.** `main` is `ced7b82` and CI passed. The private-trial run 42952255396 failed at the read-only schema check because `OPS_SUPABASE_ACCESS_TOKEN` is empty. Nothing is deployed; deployed source is still `ed64a515`. Needed: the secret (or a narrower credential, see `docs/state/F1-operations.md:112`), then a deploy re-run; hosted migrations 71-82 need his authorization if missing. Do not push to the trial branch until then.
3. HCB-083 stays open: `/bazaar` blocking time sits at the 800 ms limit. Proposed C14 items are in `docs/audits/remediation-backlog-2026-11-06.md`; budgeting the live export is Ethan's decision. Shop accessibility (10 px low-contrast text, `maximum-scale=1`) is also recorded there.
4. Bounded slices need focused tests, independent review where required (a Sonnet `security-reviewer` while Codex review is on hold), full `pnpm verify`, formatting, Live build and connected local browser checks. Keep original tests and protected prototype bytes.
5. Then continue the highest-priority unblocked full-goal slice (remaining read/recovery defects, post-submission payment/status, the public journey). Check 320/390/768/1024/1440/1920/2560 px without claiming iPhone/Mac device acceptance. Keep owner, hosted and device gates pending until separately evidenced. OD-12 wording is pending.

Use pinned Node 24.20.0 / pnpm 9.12.3. Never raise test timeouts or weaken assertions. No concurrent database or browser load during a full gate. Do not count route smoke as the original 7v2/15v3 business journeys. No arbitrary data edits, unapproved financial-policy changes, rebase/force-push or protected-file rewrites. The full objective remains incomplete.

## Ready-to-paste goal

```
/goal Staff-name role-change slice (C4/C11). Builder: Sonnet; search: Haiku (bounded, <=200 words). Read only docs/state/current.md, docs/state/next-goal.md, then src/store/ops-runtime.tsx (lines 2330-2480), src/components/app/live-gate.tsx (495-510), src/lib/auth/staff-name.ts and the existing staff-name tests. Trace the caller of bindStaffIdentity (ops-runtime.tsx:2347). Write a test that drives an A to B to A role sequence with delayed profile reads. Change code only if it shows a wrong staff name. Finish with pnpm verify output, Token notes and Next.
```
