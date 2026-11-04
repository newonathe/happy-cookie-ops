import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { orderActionWord, orderStatusWord, orderStepWords } from '@/lib/orders/owner-words';

/**
 * The word list in docs/design/ui-review-standard.md, enforced. A word the owner rejected must not come back on a new page.
 * Only what reaches the screen is checked: strings in the live pages, not comments or the locked prototype.
 */
const ROOT = join(process.cwd(), 'src/components/live');

const REJECTED: ReadonlyArray<readonly [RegExp, string]> = [
  [/hand over/i, 'customers pick up: say "Ready for customer pickup"'],
  [/mark collected/i, 'say "Mark picked up"'],
  [/>\s*open order\s*</i, 'the order row itself opens the order']
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Comments go: they may quote a rejected word to explain why it went. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the words on the owner pages', () => {
  it.each(REJECTED.map(([word, why]) => [String(word), word, why] as const))(
    'never says %s',
    (_name, word, why) => {
      const hits = files(ROOT).filter((path) =>
        word.test(withoutComments(readFileSync(path, 'utf8')))
      );
      expect(
        hits.map((path) => relative(process.cwd(), path)),
        why
      ).toEqual([]);
    }
  );
});

describe('an order in her words', () => {
  it('names the pickup stages, and leaves other words alone', () => {
    expect(orderStatusWord('Ready')).toBe('Ready for customer pickup');
    expect(orderStatusWord('Collected')).toBe('Completed');
    expect(orderStatusWord('Paid')).toBe('Paid');
    expect(orderStatusWord(undefined)).toBe('');
  });

  it('names the next action', () => {
    expect(orderActionWord('Mark ready')).toBe('Mark packed');
    expect(orderActionWord('Mark collected')).toBe('Mark picked up');
    expect(orderActionWord('Reopen')).toBe('Reopen');
  });

  it('rewrites the progress steps', () => {
    expect(orderStepWords('Ready for pickup')).toBe('Ready for customer pickup');
    expect(orderStepWords('Collected by the customer')).toBe('Picked up by the customer');
    expect(orderStepWords('Baked')).toBe('Baked');
  });
});
