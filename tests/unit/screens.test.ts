import { describe, expect, it } from 'vitest';
import { SCREEN_KEYS, isScreenKey, pathForScreen, screenForPath } from '@/lib/screens';
import { SCREENS } from '@/store/engine/ops-engine';

/**
 * The engine and the router each hold a list of screens. They must be the same list,
 * or a URL will exist that the engine cannot render.
 */
describe('screen keys', () => {
  it('match the engine exactly', () => {
    expect([...SCREEN_KEYS].sort()).toEqual([...SCREENS].sort());
  });

  it('round-trip through paths', () => {
    for (const key of SCREEN_KEYS) {
      expect(screenForPath(pathForScreen(key))).toBe(key);
    }
  });

  it('sends the home screen to the root', () => {
    expect(pathForScreen('today')).toBe('/');
    expect(screenForPath('/')).toBe('today');
    expect(screenForPath('/nonsense')).toBe('today');
  });

  it('rejects anything that is not a screen', () => {
    expect(isScreenKey('orders')).toBe(true);
    expect(isScreenKey('admin')).toBe(false);
  });
});
