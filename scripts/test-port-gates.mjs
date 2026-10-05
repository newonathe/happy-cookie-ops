import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStructure, protectedDirs, structuralHash } from './port-structure.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'happy-cookie-port-probes-'));
for (const dir of protectedDirs) cpSync(join(root, dir), join(scratch, dir), { recursive: true });
mkdirSync(join(scratch, 'scripts'));
cpSync(
  join(root, 'scripts/port-structure-baseline.json'),
  join(scratch, 'scripts/port-structure-baseline.json')
);
assert.deepEqual(checkStructure(scratch), []);
const rel = 'src/components/sheets/add-inv.tsx';
const file = join(scratch, rel);
const source = readFileSync(file, 'utf8');
const probes = [
  ['style value', "height: '48px'", "height: '49px'"],
  ['handler', 'onSubmit={saveAddInv}', 'onSubmit={askReset}'],
  ['copy', 'Item name', 'Different item'],
  ['structure', '<form ', '<section '],
  ['relationship', 'name="iname"', 'name="wrong"']
];
for (const [name, before, after] of probes) {
  assert(source.includes(before));
  let mutated = source.replace(before, after);
  if (name === 'structure') mutated = mutated.replace('</form>', '</section>');
  writeFileSync(file, mutated);
  assert(
    checkStructure(scratch).some((problem) => problem.startsWith(rel)),
    name + ' mutation escaped'
  );
  writeFileSync(file, source);
  console.log('PASS detected ' + name);
}
assert.equal(
  structuralHash('const a = { x: "hello" };'),
  structuralHash("// comment\nconst a={x:'hello'};")
);
assert.notEqual(structuralHash('const a = 1;'), structuralHash('let a = 1;'));
assert.throws(() => structuralHash('const a = ;'), /invalid syntax/);
console.log('PASS declaration mutability and invalid-syntax probes');
assert.deepEqual(checkStructure(scratch), []);
console.log(
  'PASS formatting-only change; authoritative source never mutated. Disposable probes: ' + scratch
);
