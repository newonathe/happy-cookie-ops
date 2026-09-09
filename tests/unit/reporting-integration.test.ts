// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { scrubReport } from '@/lib/observability/scrub';
import { onRequestError } from '../../instrumentation';

afterEach(async () => { await Sentry.close(1000); });

it('the actual request-error SDK pipeline removes canaries before transport', async () => {
  const envelopes: unknown[] = [];
  Sentry.init({
    dsn: 'https://synthetic@example.invalid/1',
    defaultIntegrations: false,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubReport(event),
    beforeBreadcrumb: (crumb) => scrubReport(crumb),
    transport: () => ({
      send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; },
      flush: async () => true
    })
  });
  const canary = 'SyntheticPrivatePerson-sk_test_request_canary';
  await onRequestError(new Error(canary),
    { path: `/orders/${canary}?phone=${canary}`, method: 'GET', headers: { authorization: canary } },
    { routerKind: 'App Router', routePath: `/orders/${canary}`, routeType: 'route' });
  await Sentry.flush(1000);
  expect(envelopes).toHaveLength(1);
  expect(JSON.stringify(envelopes)).toContain('[redacted]');
  expect(JSON.stringify(envelopes)).not.toContain(canary);
});
