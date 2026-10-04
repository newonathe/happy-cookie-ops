# F2 protected formatting proposal — 5 October 2026

Status: **awaiting specific approval; source is unchanged**.

First proposed protected slice: `src/components/screens/all-tools.tsx` only,
formatted with pinned Prettier 3.9.6 and the existing configuration. The proposed
diff has 77 changed lines. No other protected screen, sheet, shell, engine,
applied migration, visual baseline or formatter exclusion is included.

Private review artifacts, outside Git:
`C:/Users/ethan/.codex/visualizations/2026/10/03/01a101cc-ce31-7cd1-be5b-65218afaa853/`
contains `F2-all-tools-format.patch`, original/candidate TSX and
`F2-all-tools-format-proposal.json`.

| Evidence                              | SHA256                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| Original source, LF                   | `b7bf0f26c513d7d567b69ecf7b991281988208968a9493471dd53cbb0f535d91` |
| Candidate source, LF                  | `365b9d6fab3d537293f1ae85ad80faf9f694c876beaf5a739b9a897216760fc1` |
| Both existing structural fingerprints | `30f0aea3847cb5cb88cfe6043fac3aec7fd2c3c1148209bb540eb84c35c3448a` |

The existing AST check preserves JSX text, literal values, styles and handlers.
Both fingerprints match; visual proof for this candidate is still pending.

If approved, apply only these candidate bytes. Preserve the structural baseline;
retain the original delivery-byte gate through an exact, hash-guarded reversal in
`scripts/validate-g0.py`, limited to this file and candidate hash. Record the
approval in `docs/state/protected-exception.md`. Run the port/copy check first;
if its line-based copy fingerprint changes, prepare that exact baseline diff for
separate approval instead of automatically updating it. Keep all other paths and
assertions intact. Obtain independent port review, continuity proof and headless
phone/desktop All tools visual inspection, then full verify and secret scan before
commit/push. No protected edit is authorized by this proposal.

The formatter at proposal preparation reported 638 failing files, including the previously
identified 54 protected paths. This first candidate does not grant blanket
permission for the remainder. Unprotected formatting proceeds in small slices.
OFFLINE-01 and all release checks remain unchanged and required.
