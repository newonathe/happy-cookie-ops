// Sentry, browser side. The filename is a Next.js convention (it replaced
// sentry.client.config.ts) — do not rename it.
//
// The SDK loads after the page has painted, not with it: on the phone profile it was about
// 90 KB gzipped on the critical path of every cold open (docs/ARCHITECTURE.md, T-18). Errors
// thrown before it arrives are held in a small buffer and reported once it has started, through
// the same scrubReport hooks as everything else.
import { scrubReport } from '@/lib/observability/scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** At most this many early errors are held; a render loop must not queue thousands. */
export const EARLY_ERROR_LIMIT = 20;

function startSentry(): Promise<void> {
  const early: unknown[] = [];
  const hold = (error: unknown) => {
    if (early.length < EARLY_ERROR_LIMIT) early.push(error);
  };
  const onError = (event: ErrorEvent) => hold(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => hold(event.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const afterLoad = new Promise<void>((resolve) => {
    const next = () => setTimeout(resolve, 0);
    if (document.readyState === 'complete') next();
    else window.addEventListener('load', next, { once: true });
  });

  return (
    afterLoad
      .then(() => import('@sentry/nextjs'))
      .then((Sentry) => {
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
        // Sentry's own handlers are installed now; report what arrived before them, once.
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        for (const error of early.splice(0)) Sentry.captureException(error);
      })
      // Offline before the SDK was ever cached: reporting is best effort, the app is not.
      .catch(() => undefined)
  );
}

/** Settles once Sentry has started (immediately when there is no DSN). For tests. */
export const sentryReady: Promise<void> =
  dsn && typeof window !== 'undefined' ? startSentry() : Promise.resolve();

// App Router navigation spans need tracing, which is tree-shaken out (next.config.ts), so the
// hook Next calls has nothing to do.
export function onRouterTransitionStart(): void {}
