import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HCB-033: WCAG 2.5.8 asks for a 24 px target. Every visible checkbox in the live owner pages is
 * at least 24 px (size-6). Invisible overlay inputs (switches, day chips) carry their own large box.
 * Protected demo paths (screens, sheets, shell) are out of scope.
 */
const root = join(process.cwd(), 'src/components/live');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
// These two size their checkbox in a CSS module; the second test checks that.
const styledInCss = /(recipe-reader|production-plan-entry)\.tsx$/;

describe('live checkboxes meet the 24 px target', () => {
  it('every visible checkbox input has size-6 or larger', () => {
    const bad: string[] = [];
    for (const f of files(root).filter((x) => x.endsWith('.tsx') && !styledInCss.test(x))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<input\b[^>]*?\/>/g)) {
        if (/type="checkbox"/.test(m[0]) && !/opacity-0|role="switch"|size-(6|7|8)\b/.test(m[0]))
          bad.push(f);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
  it('styled checkboxes in CSS modules are 24 px', () => {
    for (const f of ['recipes/recipe-reader.module.css', 'production/plan-entry.module.css']) {
      const css = readFileSync(join(root, f), 'utf8');
      const block = css.match(/\.(line|identity) input \{[^}]*\}/)?.[0] ?? '';
      expect(block).toContain('width: 24px');
      expect(block).toContain('height: 24px');
    }
  });
});
