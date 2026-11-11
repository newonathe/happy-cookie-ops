#!/usr/bin/env bash
# PostToolUse — format the file that was just written. The typecheck runs once per turn in
# the Stop hook (remind-verify.sh), not after every edit: a full `tsc --noEmit` takes ~8 s
# here, and mid-change type errors in files not yet updated were repeated noise (F6,
# docs/state/finish-plan.md, approved 2026-09-28).
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -z "$file" ] && exit 0

# Only format files inside this repository. Sessions started here also edit files in other folders, and
# prettier reflowed plain-text prompt files there (merged indented lists into paragraphs, 2026-10-22).
# Normalise both paths: JSON-escaped or single backslashes to '/', Git Bash '/c/' to 'c:/', lower case.
norm() { printf '%s' "$1" | sed -e 's#\\\\#/#g' -e 's#\\#/#g' -e 's#^/\([a-zA-Z]\)/#\1:/#' | tr '[:upper:]' '[:lower:]'; }
root=$(norm "${CLAUDE_PROJECT_DIR:-$(pwd)}")
case "$(norm "$file")" in
  "${root%/}"/*) ;;
  *) exit 0 ;;
esac

case "$file" in
  *.ts|*.tsx|*.mjs|*.css|*.json|*.md)
    pnpm exec prettier --write "$file" >/dev/null 2>&1 || true
    ;;
esac
exit 0
