#!/usr/bin/env bash
# SessionStart, cloud sessions only. The image ships Node 22; this repository pins Node 24.20.0
# (docs/state/toolchain.md) and pnpm refuses to run on anything else, the git hooks included.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
v=24.20.0
dir="$HOME/.cache/node-v$v-linux-x64"
if [ ! -x "$dir/bin/node" ]; then
  mkdir -p "$HOME/.cache"
  curl -sSfL "https://nodejs.org/dist/v$v/node-v$v-linux-x64.tar.xz" | tar -xJ -C "$HOME/.cache"
fi
export PATH="$dir/bin:$PATH"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then echo "export PATH=\"$dir/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"; fi
cd "$CLAUDE_PROJECT_DIR"
if pnpm install --frozen-lockfile --reporter=silent >/dev/null 2>&1; then
  echo "cloud-setup: Node $(node -v), dependencies installed"
else
  echo "cloud-setup: pnpm install failed; run it by hand"
fi
