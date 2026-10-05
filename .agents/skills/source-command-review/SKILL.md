---
name: 'source-command-review'
description: 'Review the working diff as a hostile senior engineer'
---

# source-command-review

Use this skill when the user asks to run the migrated source command `review`.

## Command Template

Review `git diff` (and `git diff --cached`) as if you were the engineer who has to
maintain this after the author leaves. You did not write it. Be specific and be hard.

Check, in this order:

1. **Correctness** — does it do what the task said? Edge cases: empty, zero, offline,
   two devices, a slow network, a rejected sync.
2. **The port rules** — any ported markup touched? Any copy changed? Any inline style
   removed? Run `node scripts/check-port-integrity.mjs`.
3. **Money** — pesos vs centavos, rounding, float arithmetic anywhere near the ledger.
4. **Security** — unvalidated input, a role trusted from the client, a service-role key
   reachable from a `'use client'` file, an RLS policy that a new table forgot.
5. **Offline** — could this drop a queued sale, or clear one the server never acknowledged?
6. **Tests** — is the new behaviour actually covered, or is the test asserting the mock?
7. **Size** — is this diff doing more than one thing?

Output: a numbered list of findings, each tagged `blocker`, `should-fix` or `nit`, each
with the file and line. If you find nothing, say "no findings" — do not invent nits to
look thorough.
