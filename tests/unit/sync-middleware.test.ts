// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: null } })));
const createServerClient = vi.hoisted(() => vi.fn(() => ({ auth: { getUser } })));
vi.mock('@supabase/ssr', () => ({ createServerClient }));
import { middleware } from '@/middleware';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('the retired /api/sync path', () => {
  it('has no carve-out any more: an unsigned POST goes through the sign-in check', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://invalid.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'synthetic-key');
    const response = await middleware(
      new NextRequest('http://localhost/api/sync', { method: 'POST' })
    );
    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/sign-in');
  });

  it('still runs the app with no backend configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const response = await middleware(new NextRequest('http://localhost/orders'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
