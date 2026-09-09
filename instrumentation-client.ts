// Sentry, browser side. The filename is a Next.js convention (it replaced
// sentry.client.config.ts) — do not rename it.
import * as Sentry from '@sentry/nextjs';
import { scrubReport } from '@/lib/observability/scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? 'development',
    release: process.env.NEXT_PUBLIC_RELEASE,

    // FALSE on purpose. Sentry's own guide recommends true; it attaches request headers
    // and the client IP, and this app holds a small business's private books.
    // docs/OBSERVABILITY.md explains the reasoning.
    sendDefaultPii: false,

    // Performance spans have a separate payload path; keep disabled until MP-24 has a safe projection.
    tracesSampleRate: 0,

    // No session replay, at any rate. It records the DOM, and the DOM is the customer list.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // A render loop must not exhaust a month's quota in a minute.
    maxBreadcrumbs: 20,

    ignoreErrors: [
      // Thrown when the app is closed mid-navigation. Not a bug, and common on a phone
      // that keeps going to sleep in an apron pocket.
      'AbortError',
      'NetworkError when attempting to fetch resource',
      'Failed to fetch',
      // Browser extensions, which we cannot fix.
      /^chrome-extension:/,
      /^moz-extension:/
    ],

    beforeSend: (event) => scrubReport(event),
    beforeBreadcrumb: (crumb) => scrubReport(crumb)
  });
}

// Instruments App Router navigations. Needs @sentry/nextjs >= 9.12.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
