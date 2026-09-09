#!/usr/bin/env bash
# PreToolUse — refuses edits to ported markup and the engine unless the session has
# explicitly opted in. Instructions are advisory; this is not.
#
# To work on a ported file deliberately (an approved copy fix, the accessibility pass):
#   export HC_ALLOW_PORTED_EDITS=1
# and say so in the commit message. The port-integrity check still runs at verify time.
set -euo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -z "$file" ] && exit 0

case "$file" in
  *src/components/screens/*|*src/components/sheets/*|*src/components/shell/*)
    if [ "${HC_ALLOW_PORTED_EDITS:-0}" != "1" ]; then
      cat >&2 <<'MSG'
BLOCKED: that file is ported markup.

Its inline styles and copy were signed off against docs/reference/prototype.dc.html and
are enforced by scripts/check-port-integrity.mjs. Read docs/PORTING.md.

If this edit is genuinely required, tell the human what you want to change and why, and
have them re-run you with HC_ALLOW_PORTED_EDITS=1.
MSG
      exit 2
    fi
    ;;
  *src/store/engine/ops-engine.js)
    cat >&2 <<'MSG'
BLOCKED: ops-engine.js is a verbatim port of the prototype's logic.

Behaviour changes go in a subclass — see src/store/ops-runtime.tsx for the pattern.
If the change truly belongs in the engine, say so and wait for a human decision.
MSG
    exit 2
    ;;
  *supabase/migrations/*)
    if [ -f "$file" ]; then
      echo "BLOCKED: $file is an applied migration. Create a new one instead." >&2
      exit 2
    fi
    ;;
esac
exit 0
