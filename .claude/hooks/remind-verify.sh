#!/usr/bin/env bash
# Stop — the last thing the agent sees. Checks whether the tree is actually green rather
# than asking politely.
set -uo pipefail

cat >/dev/null  # the Stop payload is not needed

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  if ! node scripts/check-port-integrity.mjs >/dev/null 2>&1; then
    echo 'There are uncommitted changes AND the port-integrity check is failing.' >&2
    echo 'Run: node scripts/check-port-integrity.mjs' >&2
    exit 2
  fi
fi

# Typecheck once per turn, only when TypeScript changed (moved here from the PostToolUse hook,
# F6). Blocks the stop so type errors are fixed in the same turn, but at most once for the
# same set of errors: a deliberate stop with a half-finished change is then allowed through.
changed_ts=$( { git diff --name-only; git diff --cached --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
state="${TMPDIR:-${TEMP:-/tmp}}/hc-stop-tsc-$(pwd | cksum | cut -d' ' -f1)"
if [ -n "$changed_ts" ]; then
  if ! out=$(pnpm exec tsc --noEmit 2>&1); then
    errs=$(printf '%s\n' "$out" | grep -E 'error TS' | head -20)
    sig=$(printf '%s' "$errs" | cksum | cut -d' ' -f1)
    if [ -f "$state" ] && [ "$(cat "$state" 2>/dev/null)" = "$sig" ]; then
      exit 0
    fi
    printf '%s' "$sig" > "$state" 2>/dev/null || true
    echo 'Type errors in the uncommitted TypeScript changes (tsc --noEmit):' >&2
    printf '%s\n' "$errs" >&2
    exit 2
  fi
fi
rm -f "$state" 2>/dev/null || true
exit 0
