#!/usr/bin/env bash
# The single gate. Agents run this before claiming a task is done; CI runs the same thing.
# Fail fast, and say which stage failed — an agent reading "verify failed" learns nothing.
set -euo pipefail

stage() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

stage 'Port integrity'
node scripts/check-port-integrity.mjs

stage 'Engine contract'
node scripts/check-engine-contract.mjs

stage 'Types'
pnpm typecheck

stage 'Lint'
pnpm lint

stage 'Unit tests'
pnpm test

printf '\n\033[32m✓ All gates passed.\033[0m Run `pnpm test:e2e` before opening a PR.\n'
