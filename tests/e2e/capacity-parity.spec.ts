import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { decideCapacity } from '../../src/lib/rules/capacity';

interface Case {
  name: string;
  capacity: number;
  committed: number;
  requested: number;
  ok: boolean;
}

const { cases } = JSON.parse(readFileSync('tests/fixtures/capacity-cases.json', 'utf8')) as {
  cases: Case[];
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * The other half of the parity contract. Runs the SAME fixture against the SQL function
 * and asserts it agrees with the TypeScript implementation, case for case.
 *
 * This is the test that catches a well-meaning change to one side. Skipped without a
 * database rather than silently passing — a parity test that quietly does nothing is
 * worse than none, because it reads as coverage.
 */
test.describe('capacity rule parity: SQL vs TypeScript', () => {
  test.skip(!url || !key, 'needs a local Supabase (pnpm db:start)');

  for (const testCase of cases) {
    test(testCase.name, async () => {
      const supabase = createClient(url!, key!);
      const { data, error } = await supabase.rpc('capacity_allows', {
        p_capacity: testCase.capacity,
        p_committed: testCase.committed,
        p_requested: testCase.requested
      });
      expect(error, 'capacity_allows() should exist and be callable by anon').toBeNull();

      const fromTypeScript = decideCapacity(testCase).ok;
      expect(data, 'SQL must agree with the fixture').toBe(testCase.ok);
      expect(data, 'SQL must agree with TypeScript').toBe(fromTypeScript);
    });
  }
});
