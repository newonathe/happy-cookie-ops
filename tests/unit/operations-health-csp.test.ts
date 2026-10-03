import { expect, it, vi } from 'vitest';

it('constructs and validates the health schema without probing dynamic evaluation', async () => {
  const { z } = await import('zod');
  const previous = z.config().jitless;
  z.config({ jitless: false });
  vi.resetModules();
  const blocked = vi.fn(() => {
    throw new EvalError('Strict CSP blocks dynamic code');
  });
  vi.stubGlobal('Function', blocked);
  try {
    const { parseOperationsHealth } = await import('@/lib/data/operations-health');
    const missing = { last_run: null, last_success: null };
    expect(
      parseOperationsHealth({
        checked_at: new Date().toISOString(),
        jobs: { backup: missing, restore: missing, retention: missing, keepalive: missing }
      })
    ).not.toBeNull();
    expect(parseOperationsHealth({ jobs: {} })).toBeNull();
    expect(blocked).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    z.config({ jitless: previous });
    vi.resetModules();
  }
});
