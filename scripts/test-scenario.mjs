#!/usr/bin/env node
// Runs tests/integration/scenarios/scenario-<a|b|c>.sql against a disposable local Postgres container and prints PASS or FAIL.
// Usage: node scripts/test-scenario.mjs <a|b|c> [container-name]
//   container default: hc-scenario-<x>, or $SCENARIO_<X>_DB. Setup of the container is described in docs/TESTING.md.
// Each SQL file ends with `SCENARIO_<X>|passed|<checks>` and prints `STEP|n|label` lines; a failed check raises "scenario <X> failed: ...".
// Local containers only: the name is checked.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const key = (process.argv[2] ?? '').toLowerCase();
if (!/^[abc]$/.test(key)) {
  console.error('usage: node scripts/test-scenario.mjs <a|b|c> [container-name]');
  process.exit(2);
}
const upper = key.toUpperCase();
const container = process.argv[3] ?? process.env[`SCENARIO_${upper}_DB`] ?? `hc-scenario-${key}`;
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container)) {
  console.error('FAIL: container name must be a plain local docker container name');
  process.exit(2);
}
const sql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    `../tests/integration/scenarios/scenario-${key}.sql`
  ),
  'utf8'
);
const run = spawnSync(
  'docker',
  [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-A',
    '-t'
  ],
  { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
);
const lines = (run.stdout ?? '').split(/\r?\n/);
for (const line of lines) {
  const [tag, n, label] = line.split('|');
  if (tag === 'STEP') console.log(`  ok ${n}  ${label}`);
}
const done = lines.find((line) => line.startsWith(`SCENARIO_${upper}|passed|`));
if (run.status === 0 && done) {
  console.log(`PASS scenario ${upper}: ${done.split('|')[2]} checks, transaction rolled back`);
} else {
  const err = (run.stderr ?? '')
    .split(/\r?\n/)
    .filter((l) => new RegExp(`ERROR|scenario ${upper} failed|FATAL|No such container`).test(l));
  console.error(
    `FAIL scenario ${upper}: ${err.slice(0, 4).join(' | ') || (run.error?.message ?? `exit ${run.status}`)}`
  );
  process.exit(1);
}
