import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const before = JSON.parse(await readFile(resolve(here, 'MP-06c5-schema-inventory.json'), 'utf8'));
const after = JSON.parse(await readFile(resolve(here, 'MP-06d-schema-inventory.json'), 'utf8'));
const targets = ['sync_event_sale', 'update_order_state'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const properties = Object.keys(before);
const nonFunctionFieldsIdentical = properties.filter((key) => key !== 'functions').every((key) => same(before[key], after[key]));
const unchangedFunctions = before.functions.filter(({ name }) => !targets.includes(name));
const afterUnchangedFunctions = after.functions.filter(({ name }) => !targets.includes(name));
const beforeTargets = before.functions.filter(({ name }) => targets.includes(name));
const afterTargets = after.functions.filter(({ name }) => targets.includes(name));
const changes = targets.map((name) => {
  const prior = before.functions.find((entry) => entry.name === name);
  const current = after.functions.find((entry) => entry.name === name);
  const allowed = ['acl', 'execute_anon', 'execute_authenticated'];
  const otherFieldsIdentical = same(Object.fromEntries(Object.entries(prior).filter(([key]) => !allowed.includes(key))), Object.fromEntries(Object.entries(current).filter(([key]) => !allowed.includes(key))));
  return { name, changed_fields: allowed.filter((key) => !same(prior[key], current[key])), before: Object.fromEntries(allowed.map((key) => [key, prior[key]])), after: Object.fromEntries(allowed.map((key) => [key, current[key]])), service_role_retained: current.execute_service_role === true, other_fields_identical: otherFieldsIdentical };
});
const exactlyTwoTargets = beforeTargets.length === targets.length && afterTargets.length === targets.length && targets.every((name) => beforeTargets.filter((entry) => entry.name === name).length === 1 && afterTargets.filter((entry) => entry.name === name).length === 1);
const pass = same(properties, Object.keys(after)) && exactlyTwoTargets && nonFunctionFieldsIdentical && same(unchangedFunctions, afterUnchangedFunctions) && changes.every((change) => same(change.changed_fields, ['acl', 'execute_anon', 'execute_authenticated']) && change.after.execute_anon === false && change.after.execute_authenticated === false && change.service_role_retained && change.other_fields_identical);
const evidence = { status: pass ? 'PASS' : 'FAIL', before: 'MP-06c5-schema-inventory.json', after: 'MP-06d-schema-inventory.json', exactly_one_entry_per_target_in_each_catalog: exactlyTwoTargets, top_level_sha256: Object.fromEntries(properties.map((key) => [key, { before: hash(before[key]), after: hash(after[key]), identical: same(before[key], after[key]) }])), expected_function_delta_only: pass, changes };
await writeFile(resolve(here, 'MP-06d-catalog-delta.json'), `${JSON.stringify(evidence, null, 2)}\n`);
if (!pass) process.exitCode = 1;
