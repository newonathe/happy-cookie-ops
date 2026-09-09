# Verify the exact candidate

Task: `{{id}}` · Environment: `{{explicit_local_or_staging}}` · Candidate hash: `{{sha}}`

Confirm code/schema/config/dependency versions match the evidence target. Refuse production database resets/load tests and any unallowlisted environment. Inspect package.json to confirm commands exist; proposed command names in a plan are not runnable proof.

Run pnpm verify and production build for application changes, plus the task's meaningful tests. For security/money/offline use actual local Supabase/IDB/browser integration and negative/race cases. For UI use CLI Playwright on this Windows installation; do not start the prohibited browser plugins. Do not regenerate visual baselines outside the approved Docker environment or to hide a failure.

Record expected/actual values, command, exit code, environment fingerprint, timestamp, artifact path/hash and unresolved failures. Check that tests execute nonzero assertions and cannot silently skip a missing control. Distinguish PASS, FAIL, BLOCKED_ENVIRONMENT and NOT_RUN. Do not modify product behavior to make verification appear successful unless separately assigned a fix.
