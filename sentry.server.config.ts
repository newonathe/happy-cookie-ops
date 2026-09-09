// Sentry, Node runtime. Loaded by instrumentation.ts.
import * as Sentry from '@sentry/nextjs';
import { scrubReport } from '@/lib/observability/scrub';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? 'development',
    release: process.env.NEXT_PUBLIC_RELEASE,
    // False on purpose — see instrumentation-client.ts.
    sendDefaultPii: false,
    // Performance spans have a separate payload path; keep disabled until MP-24 has a safe projection.
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    beforeSend: (event) => scrubReport(event),
    beforeBreadcrumb: (crumb) => scrubReport(crumb)
  });
}
