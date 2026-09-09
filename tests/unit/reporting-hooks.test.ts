import { afterEach, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/nextjs';
vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureRouterTransitionStart: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.resetModules(); });
const loaders = [
  ['browser', () => import('../../instrumentation-client')],
  ['server', () => import('../../sentry.server.config')],
  ['edge', () => import('../../sentry.edge.config')]
] as const;
it.each(loaders)('%s reporter applies privacy boundaries', async (_name, load) => {
  vi.stubEnv('SENTRY_DSN', 'https://synthetic@example.invalid/1');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://synthetic@example.invalid/1');
  await load();
  const options = vi.mocked(Sentry.init).mock.calls.at(-1)?.[0];
  expect(options).toBeDefined();
  if (!options?.beforeSend || !options.beforeBreadcrumb) throw new Error('Missing privacy hooks');
  const canary = 'Synthetic Private Name sk_test_canary';
  expect(JSON.stringify(await options.beforeSend({ type: undefined, message: canary, extra: { [canary]: canary } }, {}))).not.toContain(canary);
  expect(JSON.stringify(options.beforeBreadcrumb({ message: canary, data: { name: canary } }, {}))).not.toContain(canary);
  expect(options.sendDefaultPii).toBe(false);
  expect(options.tracesSampleRate).toBe(0);
});
