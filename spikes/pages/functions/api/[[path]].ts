import { handlePagesSessionRequest, type PagesSessionContext } from '../lib/session-composition';

const securityHeaders: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

const sessionPaths = new Set([
  '/api/v1/session',
  '/api/v1/session/login',
  '/api/v1/session/refresh',
  '/api/v1/session/logout'
]);

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

function json(request: Request, status: number, payload: object): Response {
  const isHead = request.method === 'HEAD';
  return new Response(isHead ? null : JSON.stringify(payload), {
    status,
    headers: securityHeaders
  });
}

/**
 * This route retains the local liveness fixture and isolates the four session
 * endpoints. Other application APIs remain unavailable until their own gate.
 */
export async function handleApiRequest(
  request: Request,
  context?: Pick<PagesSessionContext, 'env' | 'waitUntil'>
): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  if (pathname === '/api/v1/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const response = json(request, 405, { error: 'method_not_allowed' });
      response.headers.set('Allow', 'GET, HEAD');
      return response;
    }

    return json(request, 200, {
      status: 'ok',
      scope: 'liveness-only',
      database: 'not-checked',
      auth: 'not-checked',
      readiness: false
    });
  }

  if (sessionPaths.has(pathname)) {
    const response = await handlePagesSessionRequest({
      request,
      env: context?.env ?? {},
      waitUntil: task => context?.waitUntil(task)
    });
    return withSecurityHeaders(response);
  }

  return json(request, 503, {
    error: 'api_unavailable',
    message: 'This demo-only Pages adapter has no application API configured.'
  });
}

export const onRequest = (context: PagesSessionContext): Promise<Response> =>
  handleApiRequest(context.request, context);
