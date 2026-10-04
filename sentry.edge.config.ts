// Sentry, Edge runtime — src/middleware.ts runs here. Loaded by instrumentation.ts.
import * as Sentry from '@sentry/nextjs';
import { scrubReport } from '@/lib/observability/scrub';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? 'development',
    release: process.env.NEXT_PUBLIC_RELEASE,
    sendDefaultPii: false,
    // Performance spans have a separate payload path; keep disabled until MP-24 has a safe projection.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubReport(event),
    beforeBreadcrumb: (crumb) => scrubReport(crumb)
  });
}
