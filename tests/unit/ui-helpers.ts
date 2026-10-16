import axe from 'axe-core';
import { vi } from 'vitest';

/**
 * axe on the rendered DOM. `color-contrast` is off because jsdom has no layout or computed colours to measure; the
 * contrast of the new tokens is checked in the browser pane (Storybook, 375 px).
 */
export async function violations(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
  );
}

/** Makes `matchMedia('(prefers-reduced-motion: reduce)')` answer `reduce`; every other query is false. */
export function setReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null
      }) as MediaQueryList
  );
}
