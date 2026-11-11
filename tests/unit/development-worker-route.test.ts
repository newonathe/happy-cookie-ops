import { describe, expect, it } from 'vitest';
import { config } from '@/middleware';

const guarded = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
describe('development worker is a static asset, not a public route prefix', () => {
  it('serves the exact worker independently of a session', () => {
    expect(guarded('/dev-sw.js')).toBe(false);
  });
  it.each(['/dev-swXjs', '/dev-sw.js/extra', '/dev-sw.js-private', '/bazaar', '/pnl'])(
    'keeps %s inside the existing staff boundary',
    (path) => {
      expect(guarded(path)).toBe(true);
    }
  );
});
