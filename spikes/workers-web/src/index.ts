import { handleApiRequest } from '../../pages/functions/api/[[path]]';

interface Env extends Record<string, unknown> {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface ExecutionContext {
  waitUntil(task: Promise<unknown>): void;
}

const worker = {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApiRequest(request, { env, waitUntil: task => context.waitUntil(task) });
    }
    return env.ASSETS.fetch(request);
  }
};

export default worker;
