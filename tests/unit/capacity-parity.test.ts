import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DROP_CLOSED_MESSAGE, capacityRefusal, decideCapacity } from '@/lib/rules/capacity';

interface Case {
  name: string;
  capacity: number;
  committed: number;
  requested: number;
  ok: boolean;
  remaining: number;
}

const { cases } = JSON.parse(readFileSync('tests/fixtures/capacity-cases.json', 'utf8')) as { cases: Case[] };

/**
 * Capacity is enforced twice — in the engine so the UI can refuse instantly, and in
 * Postgres inside the insert transaction so two checkouts cannot both take the last box.
 * These cases are the contract between them.
 *
 * The SQL half runs in tests/e2e/capacity-parity.spec.ts against a live database, over
 * this same fixture. Both must pass. If you are changing the rule and only one of these
 * files is in your diff, you are creating the bug this fixture exists to prevent.
 */
describe('capacity rule (TypeScript side)', () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      const decision = decideCapacity(testCase);
      expect(decision.ok).toBe(testCase.ok);
      expect(decision.remaining).toBe(testCase.remaining);
    });
  }
});

describe('capacity refusal copy', () => {
  /**
   * Only the closed-drop string is asserted verbatim, because it is the only one that
   * exists in the prototype. Asserting the placeholder would freeze an invention into
   * the test suite and make the missing decision look settled.
   */
  it('uses the prototype wording when the drop has closed', () => {
    expect(capacityRefusal(0)).toBe(DROP_CLOSED_MESSAGE);
  });

  it('reassures the customer that nothing was charged, which is their first fear', () => {
    expect(capacityRefusal(0)).toContain('Nothing was charged');
  });

  it('names when to come back rather than just refusing', () => {
    expect(capacityRefusal(0)).toContain('Monday');
  });

  it('says box, not boxes, when one is left', () => {
    expect(capacityRefusal(1)).toContain('1 box left');
    expect(capacityRefusal(1)).not.toContain('boxes');
  });

  it('names the number so the customer can adjust without guessing', () => {
    expect(capacityRefusal(4)).toContain('4 boxes left');
  });
});
