import { afterEach, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/nextjs';
vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureException: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

it('errors thrown before Sentry starts are reported once it has, at most 20', async () => {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://synthetic@example.invalid/1');
  const { sentryReady, EARLY_ERROR_LIMIT } = await import('../../instrumentation-client');
  const early = new Error('before load');
  window.dispatchEvent(new ErrorEvent('error', { error: early }));
  for (let i = 0; i < 30; i++) window.dispatchEvent(new ErrorEvent('error', { message: 'loop' }));
  expect(Sentry.init).not.toHaveBeenCalled();
  await sentryReady;
  expect(Sentry.init).toHaveBeenCalledOnce();
  expect(Sentry.captureException).toHaveBeenCalledTimes(EARLY_ERROR_LIMIT);
  expect(vi.mocked(Sentry.captureException).mock.calls[0][0]).toBe(early);
  // Once started, Sentry's own handlers take over: nothing more goes through the buffer.
  window.dispatchEvent(new ErrorEvent('error', { message: 'after' }));
  expect(Sentry.captureException).toHaveBeenCalledTimes(EARLY_ERROR_LIMIT);
});

it('without a DSN nothing is loaded or started', async () => {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
  const { sentryReady } = await import('../../instrumentation-client');
  await sentryReady;
  expect(Sentry.init).not.toHaveBeenCalled();
});
