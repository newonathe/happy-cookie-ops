#!/usr/bin/env node
// Runs tests/integration/scenarios/scenario-a.sql against a disposable local Postgres container and prints PASS or FAIL.
// Usage: node scripts/test-scenario-a.mjs [container-name]   (default hc-scenario-a, or $SCENARIO_A_DB)
// Setup of the container is described in the header of the SQL file. Local containers only: the name is checked.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const container = process.argv[2] ?? process.env.SCENARIO_A_DB ?? 'hc-scenario-a';
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container)) {
  console.error('FAIL: container name must be a plain local docker container name');
  process.exit(2);
}
const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../tests/integration/scenarios/scenario-a.sql'),
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
const done = lines.find((line) => line.startsWith('SCENARIO_A|passed|'));
if (run.status === 0 && done) {
  console.log(`PASS scenario A: ${done.split('|')[2]} checks, transaction rolled back`);
} else {
  const err = (run.stderr ?? '')
    .split(/\r?\n/)
    .filter((l) => /ERROR|scenario A failed|FATAL|No such container/.test(l));
  console.error(
    `FAIL scenario A: ${err.slice(0, 4).join(' | ') || (run.error?.message ?? `exit ${run.status}`)}`
  );
  process.exit(1);
}
