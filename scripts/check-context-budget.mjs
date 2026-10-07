#!/usr/bin/env node
/**
 * Context budget: what every agent session loads must stay small, or each session pays for it.
 * Runs inside `pnpm verify` (pre-commit and CI). Raise a limit only on purpose, in the same commit
 * as the growth, and say why in the message; the better fix is to move history to a history file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';

const bytes = (p) => statSync(p).size;
const count = (dir) => readdirSync(dir).length;

// Loaded by every Claude Code session (CLAUDE.md imports AGENTS.md) and read first by every goal.
const FILE_LIMITS = {
  'AGENTS.md + CLAUDE.md': [['AGENTS.md', 'CLAUDE.md'], 20_500],
  'docs/state/current.md': [['docs/state/current.md'], 14_000],
  'docs/state/next-goal.md': [['docs/state/next-goal.md'], 6_000]
};
// Receipts are frozen: the lean plan records results in commits, not new evidence files.
const DIR_LIMITS = { 'docs/state/evidence': 936, 'docs/master-plan/evidence': 54 };

const failures = [];
for (const [name, [files, limit]] of Object.entries(FILE_LIMITS)) {
  const size = files.reduce((sum, f) => sum + bytes(f), 0);
  if (size > limit)
    failures.push(`${name} is ${size} bytes; the budget is ${limit}. Move finished history out.`);
}
for (const [dir, limit] of Object.entries(DIR_LIMITS)) {
  const n = count(dir);
  if (n > limit)
    failures.push(
      `${dir} has ${n} files; frozen at ${limit}. Record results in the commit instead.`
    );
}
// A subagent without a model inherits the parent's, the most expensive one.
for (const f of readdirSync('.claude/agents').filter((f) => f.endsWith('.md'))) {
  const head = readFileSync(`.claude/agents/${f}`, 'utf8').split('---')[1] ?? '';
  if (!/^model:\s*\S+/m.test(head)) failures.push(`.claude/agents/${f} has no pinned model.`);
}

if (failures.length) {
  console.error('Context budget exceeded:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Context budget: ok');
