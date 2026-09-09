#!/usr/bin/env node
/**
 * Makes the 1:1 rule machine-checkable.
 *
 * CLAUDE.md says "do not restyle the ported screens" and "do not rewrite copy". An
 * instruction is advisory; an agent under pressure will talk itself past one. This
 * script is not advisory — it runs in `pnpm verify` and in CI, and it fails the build.
 *
 * It compares the ported markup against scripts/port-baseline.json:
 *   - copy fingerprint   a rewritten label, toast or empty state changes the hash
 *   - style-object count a "cleanup" that converts inline styles to classes drops it
 *   - banned constructs  className, @apply, tailwind utilities in ported files
 *
 * Approved changes: make the change, run `node scripts/check-port-integrity.mjs --update`,
 * and commit the baseline diff in the same commit. The baseline diff is the review.
 */
import { checkStructure } from './port-structure.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: .pathname keeps percent-encoding and prefixes a slash
// onto Windows drive letters, so a repo in a path with a space silently fails to resolve.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts/port-baseline.json');
const DIRS = ['src/components/screens', 'src/components/sheets', 'src/components/shell'];
const UPDATE = process.argv.includes('--update');

const fnv = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

function fingerprint(source) {
  const body = source.slice(source.indexOf('return ('));
  const copy = [...body.matchAll(/^\s{4,}([A-Z0-9₱][^<>{}\n]{2,})$/gm)]
    .map((m) => m[1].trim())
    .filter((t) => !/^[\d.,\s%₱-]+$/.test(t));
  return {
    copy: fnv(copy.join('|')),
    copyCount: copy.length,
    styles: (body.match(/style=\{\{/g) || []).length,
    dynamicStyles: (body.match(/style=\{s\(/g) || []).length,
    elements: (body.match(/<[a-zA-Z]/g) || []).length
  };
}

const BANNED = [
  [/className=/, 'className in ported markup — the prototype used inline styles; see docs/PORTING.md'],
  [/@apply/, '@apply in ported markup'],
  [/from ['"]clsx['"]|from ['"]classnames['"]/, 'a class-name helper in ported markup']
];

const current = {};
for (const dir of DIRS) {
  for (const file of readdirSync(join(ROOT, dir))) {
    if (!file.endsWith('.tsx') || file.endsWith('.stories.tsx')) continue;
    const rel = `${dir}/${file}`;
    current[rel] = { source: readFileSync(join(ROOT, rel), 'utf8') };
    current[rel].print = fingerprint(current[rel].source);
  }
}

if (UPDATE) {
  const files = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v.print]));
  const previous = JSON.parse(readFileSync(BASELINE, 'utf8'));
  writeFileSync(BASELINE, JSON.stringify({ ...previous, generated: new Date().toISOString().slice(0, 10), files }, null, 2) + '\n');
  console.log(`Baseline updated for ${Object.keys(files).length} files. Commit it with the change it approves.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
const problems = checkStructure(ROOT);

for (const [rel, { source, print }] of Object.entries(current)) {
  for (const [pattern, message] of BANNED) {
    if (pattern.test(source)) problems.push(`${rel}: ${message}`);
  }
  const was = baseline[rel];
  if (!was) {
    problems.push(`${rel}: not in the baseline. A new ported file must be added with --update.`);
    continue;
  }
  if (print.copy !== was.copy) {
    problems.push(
      `${rel}: the copy changed (${was.copyCount} → ${print.copyCount} strings). Ported copy is signed off — ` +
        'if this was intentional, re-run with --update and say so in the commit message.'
    );
  }
  const styleDrop = was.styles + was.dynamicStyles - (print.styles + print.dynamicStyles);
  if (styleDrop > 0) {
    problems.push(
      `${rel}: ${styleDrop} inline style object(s) removed. That is what a restyle looks like. See docs/PORTING.md.`
    );
  }
}

for (const rel of Object.keys(baseline)) {
  if (!current[rel]) problems.push(`${rel}: ported file deleted.`);
}

if (problems.length) {
  console.error('\nPort integrity check failed:\n');
  for (const problem of problems) console.error('  ✗ ' + problem);
  console.error(`\n${problems.length} problem(s). Read docs/PORTING.md before overriding.\n`);
  process.exit(1);
}

console.log(`Port integrity OK — ${Object.keys(current).length} files match the copy/style and AST baselines.`);
