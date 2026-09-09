#!/usr/bin/env bash
# PostToolUse — format the file that was just written, and surface type errors while the
# agent still has the change in context. Cheap now, expensive at review time.
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -z "$file" ] && exit 0

case "$file" in
  *.ts|*.tsx|*.mjs|*.css|*.json|*.md)
    pnpm exec prettier --write "$file" >/dev/null 2>&1 || true
    ;;
esac

case "$file" in
  *.ts|*.tsx)
    if ! out=$(pnpm exec tsc --noEmit 2>&1); then
      echo "Type errors after editing $file:" >&2
      printf '%s\n' "$out" | grep -E 'error TS' | head -20 >&2
      exit 2   # non-blocking for the write, but Claude sees this and fixes it now
    fi
    ;;
esac
exit 0
