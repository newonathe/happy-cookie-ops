# F2 protected formatting proposal — 5 October 2026

Status: **two files await Ethan's specific approval; both sources are unchanged.**

## What changed since the first proposal

The first proposal covered `src/components/screens/all-tools.tsx` only. It was never
applied and is superseded: on 5 October Ethan approved excluding the byte-locked
delivery paths from Prettier instead (see
[protected-exception.md](protected-exception.md)). `all-tools.tsx` keeps its original
bytes, SHA256 `b7bf0f26c513d7d567b69ecf7b991281988208968a9493471dd53cbb0f535d91`.

## The two remaining files

After the 5 October formatting run, `pnpm format:check` fails on exactly two files.
Both are on the AGENTS.md do-not-touch list, so neither has been edited.

| File                             | Changed lines | Current SHA256                                                     | Candidate SHA256                                                   |
| -------------------------------- | ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `src/lib/observability/scrub.ts` | 108 + / 89 −  | `5002535d53a1a66b4f69454a5eaf506a4f9bfd0c10bca147180934151ef7539a` | `c66d870a5073a3e46bb7404acdfd3b6b04de340e7f2ac5363ffe4280d4abe6ca` |
| `tests/e2e/visual.spec.ts`       | 41 + / 16 −   | `a920b051111d80eb36e8e5843f8b97a6f9fbeaa5d25a752b883735093137cdb6` | `b5456c105e584e9fbfaf41909121e53b499a91f442b9086586d7a4083a7c9e26` |

Each candidate is Prettier 3.9.6 output with the existing configuration. For both, the
TypeScript syntax-tree fingerprint is exactly equal to the current file (no relaxation
needed), the comment list is equal and the esbuild minified output is byte-identical.
Candidates and the patch are outside Git in the private evidence directory under
`claude-20261005/protected-format-candidates/`.

Why they are protected, and why formatting does not touch that rule:

- `scrub.ts` is deny-by-default. The rule is that its allowlist is widened one key at a
  time with a test. The candidate changes no key, pattern or branch.
- `visual.spec.ts` guards the screenshot baselines, which may only be regenerated in
  Docker. The candidate changes no test, project, selector or snapshot name, and no
  baseline image is touched.

Neither file is in the byte-locked class of `scripts/validate-g0.py`, so no reversal
entry is needed. `tests/unit/scrub.test.ts` and the full `pnpm verify` would run in the
commit hook.

## Options

1. **Approve formatting both** with exactly the candidate bytes above. `format:check`
   then passes and GitHub CI runs its remaining jobs for the first time.
2. **Exclude both** in `.prettierignore`. No protected byte changes, but two live source
   files leave the formatting check.

Recommendation: option 1. No protected edit is authorized by this document.
