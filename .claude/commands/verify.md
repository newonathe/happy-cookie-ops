---
description: Run the full gate and report honestly
---

Run `pnpm verify`, then `pnpm test:e2e`.

Report the result exactly as it happened. If something fails:
- quote the actual error, not a paraphrase;
- say which change caused it;
- propose the smallest fix.

Do not fix a failing test by weakening the assertion, skipping it, or adding a
try/catch around the thing under test. If a test is genuinely wrong, say why and wait.
