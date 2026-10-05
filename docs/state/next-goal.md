# Next goal — re-research and one final plan

One goal per package, in a fresh conversation opened in the repository root. Paste the
block below. Where things stand: [current.md](current.md). Earlier goals are in
[current-history.md](current-history.md).

| Setting     | Value                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Coordinator | Claude Opus                                                                              |
| Workers     | At most two, pinned to Sonnet, read-only for research and audit                          |
| Tools       | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; headless command-line Playwright |
| Output      | One plan document. No product code in this goal                                          |
| Stop        | When the plan is written and Ethan has it; 25 turns                                      |

```text
/goal Re-research and write the one final plan for The Happy Cookie Ops in
C:\Users\ethan\dev\happy-cookie-ops-g0. Ethan asked for this on 5 October 2026 after
approving the rework ("yes to all, do what u recommend") and adding "nothing must be
hardcoded". Plan only: change no product code, import nothing, touch no hosted system.

Read first, in this order: AGENTS.md, docs/state/current.md,
docs/state/decision-register.md (the 5 October section), docs/state/product-research.md,
docs/state/sot-consolidation.md, docs/state/system-audit.md, docs/state/ux-audit.md.
Private inputs outside Git, under
C:\Users\ethan\.codex\visualizations\2026\10\03\01a101cc-ce31-7cd1-be5b-65218afaa853\claude-20261005\:
sot-sources\ (Cine's workbook, recipe document, photos), sot-audit\ (two audit JSON
files), rework\ (wireframes). Cine's 115 comments are in the "[THC COPY]" walkthrough
document in C:\Users\ethan\dev\Happy Cookie Ops - Business Files\03 Walkthroughs &
Spreadsheets. Print counts only for customer sheets; keep recipes, customer rows and
emails out of Git.

1. Rule conflict to settle first. AGENTS.md and CLAUDE.md both say "UI/UX remains
   locked". Ethan's decision R1 ends that for the live app only. Ask Ethan to approve
   replacing, in both files, byte for byte the same, the words
   "UI/UX remains locked;" with
   "the ported screens, sheets, shell and engine remain locked as the demo build, and
   since 2026-10-05 the live app's interface is rebuilt beside them
   (docs/state/product-research.md);"
   and do not edit either file without his yes (scripts/validate-g0.py compares them).
2. Research again, wider and hands-on where possible: sign-up-free demos, help centres,
   documentation and engineering posts for the tools named in product-research.md and
   any better comparators; verify each claim against a primary source; mark the rest.
   Cover what the first pass did not: multi-day stall selling, customer records and
   privacy in the Philippines (confirm the registration question with a primary
   source), recipe costing with packaging, offline app updates, and accessibility.
3. Close the audit's open questions by reading code: system-audit.md items marked
   Unverified or Likely (C3, C5, C9, C10) and the hard-coded sweep (section 2) for
   anything missed. "Nothing hardcoded" is a requirement of the plan.
4. Write one plan that replaces finish-plan.md from here on: the data model (one record
   of each thing: flavour, recipe, ingredient, supplier price, customer, order, sale,
   bazaar and its days), the five-tab interface with every screen, the order of slices
   with sizes, what is fixed in the data layer before any new screen, tests and evidence
   per slice, dates (the 24 to 25 October bazaar on today's Bazaar Mode with the phone
   rehearsal by 20 October; Cine's trial after the rework), and what stays out.
5. End with a single decision list for Ethan, each item with one recommendation phrased
   so "yes" approves it, and what he must do himself: add Cine's two emails to
   Cloudflare Access and invite her (the release check must first accept more than two
   addresses), decide backup custody and switch the jobs on, run the phone rehearsal.
No new resources, shop opening, real customers, production launch, merge or automatic
runner without explicit approval. Finish with actual gaps and the first build goal.
```
