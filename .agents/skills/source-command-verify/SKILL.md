---
name: 'source-command-verify'
description: 'Run the full gate and report honestly'
---

# source-command-verify

Use this skill when the user asks to run the migrated source command `verify`.

## Command Template

Run `pnpm verify`, then `pnpm test:e2e`.

Report the result exactly as it happened. If something fails:

- quote the actual error, not a paraphrase;
- say which change caused it;
- propose the smallest fix.

Do not fix a failing test by weakening the assertion, skipping it, or adding a
try/catch around the thing under test. If a test is genuinely wrong, say why and wait.
