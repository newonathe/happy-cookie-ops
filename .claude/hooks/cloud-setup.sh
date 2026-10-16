#!/usr/bin/env bash
# SessionStart, cloud sessions only. The image ships Node 22; this repository pins Node 24.20.0
# (docs/state/toolchain.md) and pnpm refuses to run on anything else, the git hooks included.
# Exits non-zero when setup fails, so the failure shows at session start, not later in pnpm verify.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
v=24.20.0
case "$(uname -m)" in
  x86_64) arch=x64 sha=2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2 ;;
  aarch64 | arm64) arch=arm64 sha=5f4ddab610c1ab2016b3c227cebdbf6d9495161487e4739c7b90090595f465f7 ;;
  *) echo "cloud-setup: no pinned Node $v build for $(uname -m)" >&2; exit 1 ;;
esac
name="node-v$v-linux-$arch"
cache="$HOME/.cache"
dir="$cache/$name"
# Pinned SHA-256s from nodejs.org/dist/v$v/SHASUMS256.txt. The marker is written only after the
# verified tree is moved into place in one step, so a cut download never counts as installed.
if [ ! -f "$dir/.verified" ]; then
  mkdir -p "$cache"
  tmp="$(mktemp -d "$cache/.node-XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  curl -sSfL --retry 3 -o "$tmp/$name.tar.xz" "https://nodejs.org/dist/v$v/$name.tar.xz"
  echo "$sha  $tmp/$name.tar.xz" | sha256sum -c --status - ||
    { echo "cloud-setup: checksum mismatch for $name.tar.xz" >&2; exit 1; }
  tar -xJf "$tmp/$name.tar.xz" -C "$tmp"
  touch "$tmp/$name/.verified"
  rm -rf "$dir"
  mv "$tmp/$name" "$dir"
fi
export PATH="$dir/bin:$PATH"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then echo "export PATH=\"$dir/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"; fi
cd "$CLAUDE_PROJECT_DIR"
# Install only when the lockfile or Node changed since the last good install.
stamp="node_modules/.cloud-setup-stamp"
want="$(node -v) $(sha256sum pnpm-lock.yaml | cut -d' ' -f1)"
if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ]; then
  echo "cloud-setup: Node $(node -v), dependencies up to date"
  exit 0
fi
log="$cache/cloud-setup-install.log"
if timeout 600 pnpm install --frozen-lockfile > "$log" 2>&1; then
  echo "$want" > "$stamp"
  echo "cloud-setup: Node $(node -v), dependencies installed"
else
  echo "cloud-setup: pnpm install failed (full log: $log):" >&2
  tail -n 30 "$log" >&2
  exit 1
fi
