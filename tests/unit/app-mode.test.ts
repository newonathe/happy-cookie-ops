import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLiveMode } from '@/lib/config/app-mode';

describe('isLiveMode', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to demo (false) so every existing E2E/visual/unit fixture is unaffected', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', undefined);
    expect(isLiveMode()).toBe(false);
  });

  it('is false for any value other than the exact string "live"', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'demo');
    expect(isLiveMode()).toBe(false);
  });

  it('is true only when set to "live" — the static-export build only', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'live');
    expect(isLiveMode()).toBe(true);
  });
});
