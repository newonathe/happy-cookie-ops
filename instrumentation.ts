/**
 * Server instrumentation. Next.js calls register() once per runtime before anything
 * else runs, which is why Sentry is initialised here and not from whichever module a
 * route happens to import first.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

/**
 * Catches errors thrown inside server components and route handlers, which never reach
 * a React error boundary. Without this hook a failing server component is a 500 nobody
 * hears about: the owner sees a broken screen and you find out from her.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: unknown },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(
    error,
    // The path carries an order number and a phone number on the lookup route.
    { ...request, path: request.path.split('?')[0], headers: {} },
    context
  );
}
