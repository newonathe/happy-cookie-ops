import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchReportingRejection, SESSION_REJECTED_EVENT } from '@/lib/auth/session-rejected';

/** HCB-030: only a real 401 from the data API is reported to the gate. */
describe('fetchReportingRejection', () => {
  const heard = vi.fn();
  window.addEventListener(SESSION_REJECTED_EVENT, heard);
  afterEach(() => heard.mockClear());

  const call = async (url: string, answer: () => Promise<Response>) => {
    const base = vi.fn(answer);
    return fetchReportingRejection(base as unknown as typeof fetch)(url);
  };

  it('reports a 401 from a data request and returns the response untouched', async () => {
    const res = await call(
      'https://x.supabase.co/rest/v1/rpc/save',
      async () => new Response('{}', { status: 401 })
    );
    expect(res.status).toBe(401);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it.each([200, 403, 409, 500])('says nothing for a %i', async (status) => {
    await call(
      'https://x.supabase.co/rest/v1/rpc/save',
      async () => new Response('{}', { status })
    );
    expect(heard).not.toHaveBeenCalled();
  });

  it('says nothing for the auth endpoints: the gate asks getUser itself', async () => {
    await call(
      'https://x.supabase.co/auth/v1/user',
      async () => new Response('{}', { status: 401 })
    );
    expect(heard).not.toHaveBeenCalled();
  });

  it('says nothing when the connection fails, and the failure still reaches the caller', async () => {
    await expect(
      call('https://x.supabase.co/rest/v1/rpc/save', async () => {
        throw new TypeError('Failed to fetch');
      })
    ).rejects.toThrow('Failed to fetch');
    expect(heard).not.toHaveBeenCalled();
  });
});
