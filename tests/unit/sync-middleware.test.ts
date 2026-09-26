// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: null } })));
const createServerClient = vi.hoisted(() => vi.fn(() => ({ auth: { getUser } })));
vi.mock('@supabase/ssr', () => ({ createServerClient }));
import { middleware } from '@/middleware';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('sync quarantine middleware boundary', () => {
  it.each([false, true])('does not contact auth for exact sync path (configured=%s)', async (configured) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configured ? 'https://invalid.example' : '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', configured ? 'synthetic-key' : '');
    const response = await middleware(new NextRequest('http://localhost/api/sync', { method: 'POST' }));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(createServerClient).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each(['/api/sync-extra', '/api/sync/nested', '/orders'])('keeps authentication on %s', async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://invalid.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-key');
    const response = await middleware(new NextRequest('http://localhost' + path));
    expect(createServerClient).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    const redirect = new URL(response.headers.get('location') ?? 'http://missing.invalid');
    expect(redirect.pathname).toBe('/sign-in');
    expect(redirect.searchParams.get('next')).toBe(path);
  });
});
