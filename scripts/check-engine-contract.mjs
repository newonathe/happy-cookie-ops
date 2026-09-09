#!/usr/bin/env node
/**
 * Verifies that everything the repository CLAIMS about the engine is true.
 *
 * Five audit passes over this repository found the same class of defect five times, one
 * layer deeper each time: data, a schema, an enum, and finally a string of copy carrying
 * a comment that falsely claimed the owner had approved it. Every instance was plausible,
 * and every instance was written from a design note instead of from
 * src/store/engine/ops-engine.js.
 *
 * The lesson is not "read more carefully". It is that a claim about the engine must be
 * checkable by a machine, because a plausible claim is exactly what a careful reader
 * accepts. This script is those five passes, made repeatable.
 *
 * Run:  node scripts/check-engine-contract.mjs        (inside `pnpm verify`)
 *
 * If it fails, the code is wrong about the engine — not the other way round. The engine
 * is a verbatim port of a signed-off prototype. It is the answer key.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const problems = [];
const fail = (check, message) => problems.push({ check, message });

const engine = read('src/store/engine/ops-engine.js');
const prototype = existsSync(join(ROOT, 'docs/reference/prototype.dc.html'))
  ? read('docs/reference/prototype.dc.html')
  : null;

/* ------------------------------------------------------------------ 1. exports
 * An `export { X }` for an undeclared X is a SyntaxError: the whole engine module
 * fails to load and the app does not boot. Worth checking mechanically because the
 * declarations are spread over 4,000 lines and some are multi-name
 * (`const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;`).
 */
/**
 * Collects declared names. Two things make this fiddly, and getting either wrong makes
 * the check weaker than it looks — which is worse than not having it:
 *
 *   1. A declaration body can contain semicolons (`const f = x => { ...; return y; };`),
 *      so the pattern must not be anchored to the end of the line.
 *   2. Declarations can be multi-name (`const MINUTE = 60000, HOUR = 3600000;`), so the
 *      first identifier after the keyword is not the only one.
 *
 * Both of those produced false failures while this script was being written.
 */
const declared = new Set();
for (const match of engine.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)/g)) {
  declared.add(match[1]);
}
for (const match of engine.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+[^\n]*/g)) {
  for (const extra of match[0].matchAll(/,\s*([\w$]+)\s*=/g)) declared.add(extra[1]);
}
for (const match of engine.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:function|class)\s+([\w$]+)/g)) {
  declared.add(match[1]);
}

const exportBlock = engine.slice(engine.lastIndexOf('export {'), engine.lastIndexOf('};') + 2);
const exported = [...exportBlock.matchAll(/[\w$]+/g)].map((m) => m[0]).filter((n) => n !== 'export');
for (const name of exported) {
  if (!declared.has(name)) {
    fail('exports', `${name} is exported but never declared — this is a SyntaxError and the app will not boot`);
  }
}

/* -------------------------------------------------------------- 2. declarations
 * A .d.ts that declares an export the engine does not provide is a typed lie: the
 * compiler blesses an import that is undefined at runtime, which is worse than no
 * types at all.
 */
const dts = read('src/store/engine/ops-engine.d.ts');
const exportedSet = new Set(exported);
for (const match of dts.matchAll(/^export (?:declare )?(?:const|function|class)\s+([\w$]+)/gm)) {
  const name = match[1];
  if (!exportedSet.has(name) && !declared.has(name)) {
    fail('declarations', `ops-engine.d.ts declares ${name}, which the engine does not export`);
  }
}

/* ------------------------------------------------------------------ 3. provenance
 * The defect that prompted this script. A comment saying "verbatim from the prototype"
 * or "signed off" is a claim about the OWNER's approval, and a false one removes
 * everyone's permission to fix the string. So: any string literal sitting near such a
 * claim must actually appear in the prototype.
 */
const PROVENANCE = /(verbatim from the prototype|quoted from the prototype|the prototype's own string|signed off by the owner|the signed-off wording)/i;
if (prototype) {
  for (const file of walk('src')) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const source = read(file);
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!PROVENANCE.test(line)) return;
      // Look at the next 12 lines for a long string literal making the claim.
      const window = lines.slice(index, index + 12).join('\n');
      for (const literal of window.matchAll(/'([^'\n]{25,})'|"([^"\n]{25,})"/g)) {
        const text = (literal[1] ?? literal[2]).replace(/\\'/g, "'");
        // Skip paths, identifiers and anything with template syntax.
        if (/^[\w./@-]+$/.test(text) || text.includes('${')) continue;
        if (!prototype.includes(text)) {
          fail(
            'provenance',
            `${file}:${index + 1} claims prototype provenance for a string that is NOT in the prototype:\n      "${text.slice(0, 90)}"`
          );
        }
      }
    });
  }
}

/* ---------------------------------------------------------------- 4. order states
 * The enum was invented once. Any state literal in SQL or TypeScript must be one the
 * engine actually uses.
 */
const VALID_STATES = ['Payment review', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'No-show'];
const INVENTED = ['new', 'baking', 'collected', 'cancelled', 'no_show', 'placed', 'noshow', 'ready', 'confirmed'];
for (const file of [...walk('supabase'), ...walk('src/lib'), ...walk('src/app')]) {
  if (!/\.(sql|ts|tsx)$/.test(file)) continue;
  const source = read(file);
  source.split('\n').forEach((line, index) => {
    if (!/\b(state|status)\b/i.test(line)) return;
    for (const invented of INVENTED) {
      if (new RegExp(`'${invented}'`).test(line) && !VALID_STATES.includes(invented)) {
        fail('order-states', `${file}:${index + 1} uses '${invented}', which is not an order_state. Valid: ${VALID_STATES.join(', ')}`);
      }
    }
  });
}

/* -------------------------------------------------------------------- 5. settings
 * Every key in DEFAULT_CFG must be reachable through settings_effective(), or a setting
 * the owner can edit has nowhere to persist and silently reverts on a new device.
 */
const cfgStart = engine.indexOf('const DEFAULT_CFG');
const cfgSource = engine.slice(cfgStart, engine.indexOf('\n};', cfgStart) + 3);
// Several keys share a line in DEFAULT_CFG (`openDow: 1, openH: 9, openM: 0`), so a
// line-anchored pattern silently finds 17 of the 21 and the check passes while four
// settings have nowhere to persist.
const cfgKeys = [...cfgSource.matchAll(/[{,]\s*(\w+)\s*:/g)].map((m) => m[1]);
const settingsSql = existsSync(join(ROOT, 'supabase/migrations/20260101000700_settings.sql'))
  ? read('supabase/migrations/20260101000700_settings.sql')
  : '';
for (const key of cfgKeys) {
  if (!settingsSql.includes(`'${key}'`)) {
    fail('settings', `DEFAULT_CFG.${key} has no row in settings_effective() — it cannot be persisted`);
  }
}

/* --------------------------------------------------------------- 6. documented schema
 * Every table in a migration must appear in docs/DATA.md.
 *
 * This is not bookkeeping. The security-reviewer subagent is explicitly told that "a
 * table in the schema but absent from docs/DATA.md is a table nobody reviewed" — so an
 * undocumented table defeats the review that is supposed to catch a missing RLS policy.
 * Three tables (settings, rate_limits, erasure_requests) were absent before this check
 * existed, which is how the guardrail was found pointing at nothing.
 */
const dataDoc = existsSync(join(ROOT, 'docs/DATA.md')) ? read('docs/DATA.md') : '';
const tables = [];
for (const file of walk('supabase/migrations')) {
  if (!file.endsWith('.sql')) continue;
  for (const match of read(file).matchAll(/create table (?:if not exists )?(\w+)/g)) {
    tables.push(match[1]);
  }
}
for (const table of tables) {
  if (!dataDoc.includes(table)) {
    fail(
      'documented-schema',
      `table \`${table}\` is created by a migration but never mentioned in docs/DATA.md — ` +
        'the security review treats an undocumented table as unreviewed'
    );
  }
}

/* ------------------------------------------------------------------ 7. seed arity
 * The seed is generated, but a hand-edit would break silently until `pnpm db:reset`.
 */
if (existsSync(join(ROOT, 'supabase/seed.sql'))) {
  const seed = read('supabase/seed.sql');
  for (const block of seed.matchAll(/insert into (\w+) \(([^)]+)\) values\n([\s\S]*?)(?:\non conflict|;\n)/g)) {
    const columns = block[2].split(',').length;
    const rows = block[3].split('\n').filter((l) => l.trim().startsWith('('));
    for (const [offset, row] of rows.entries()) {
      const values = splitTopLevel(row);
      if (values.length !== columns) {
        fail('seed', `${block[1]} row ${offset + 1}: ${values.length} values for ${columns} columns`);
      }
    }
  }
}

/* ------------------------------------------------------------------- 8. weak tests
 * A test that cannot fail is worse than no test: it costs maintenance and buys false
 * confidence. One tautology (`expect(amt(1.5,'kg')).toBe(amt(1.5,'kg'))`) shipped before
 * this check existed.
 */
for (const file of walk('tests')) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  read(file).split('\n').forEach((line, index) => {
    const compare = line.match(/expect\((.+?)\)\.(?:toBe|toEqual)\((.+?)\)/);
    if (compare && compare[1].replace(/\s/g, '') === compare[2].replace(/\s/g, '')) {
      fail('weak-tests', `${file}:${index + 1} tautology — both sides are the same expression`);
    }
    if (/\.(toBeTruthy|toBeDefined)\(\)/.test(line) && /\b(amt|PESO|total|price|cents|qty)\b/.test(line)) {
      fail('weak-tests', `${file}:${index + 1} weak assertion on a money or quantity value — assert the exact string`);
    }
  });
}

/* ---------------------------------------------------------------------- helpers */
function walk(dir) {
  const out = [];
  const full = join(ROOT, dir);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

function splitTopLevel(row) {
  const inner = row.trim().replace(/^\(/, '').replace(/\)[,;]?$/, '');
  const out = [];
  let current = '';
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === "'" && inner[i + 1] === "'" && quoted) {
      current += "''";
      i++;
      continue;
    }
    if (char === "'") quoted = !quoted;
    else if (!quoted && (char === '(' || char === '{')) depth++;
    else if (!quoted && (char === ')' || char === '}')) depth--;
    else if (!quoted && depth === 0 && char === ',') {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

/* ------------------------------------------------------------------------ report */
if (problems.length) {
  console.error('\nEngine contract check failed.\n');
  const grouped = new Map();
  for (const { check, message } of problems) {
    if (!grouped.has(check)) grouped.set(check, []);
    grouped.get(check).push(message);
  }
  for (const [check, messages] of grouped) {
    console.error(`  ${check}`);
    for (const message of messages) console.error(`    ✗ ${message}`);
    console.error('');
  }
  console.error(
    `${problems.length} problem(s). The engine is a verbatim port of a signed-off\n` +
      'prototype — it is the answer key. If this fails, the code is wrong about the\n' +
      'engine, not the other way round. See docs/BUILD-LOG.md.\n'
  );
  process.exit(1);
}

console.log(
  `Engine contract OK — ${exported.length} exports, ${cfgKeys.length} settings keys, ` +
    `${tables.length} tables documented, provenance claims verified against the prototype.`
);
