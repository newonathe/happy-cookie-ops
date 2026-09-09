#!/usr/bin/env bash
# Stop — the last thing the agent sees. Checks whether the tree is actually green rather
# than asking politely.
set -uo pipefail

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  if ! node scripts/check-port-integrity.mjs >/dev/null 2>&1; then
    echo 'There are uncommitted changes AND the port-integrity check is failing.' >&2
    echo 'Run: node scripts/check-port-integrity.mjs' >&2
    exit 2
  fi
fi
exit 0
