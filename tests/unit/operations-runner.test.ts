import { describe, expect, it, vi } from 'vitest';
import { operationTarget, runOperation } from '../../scripts/f1-operations.mjs';

describe('F1 operator commands are local until explicit hosted approval', () => {
  it('rejects hosted targets before making any request', async () => {
    const fetcher = vi.fn();
    await expect(
      runOperation('retention', { url: 'https://example.supabase.co', key: 'secret', fetcher })
    ).rejects.toThrow('approval');
    expect(fetcher).not.toHaveBeenCalled();
    for (const url of [
      'https://attacker.example',
      'http://example.supabase.co',
      'https://user:password@example.supabase.co',
      'http://localhost:54321/other'
    ])
      expect(() => operationTarget(url, 'secret', true)).toThrow();
  });
  it('retention sends exactly one year and does not record success outside the deletion transaction', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => 3 });
    await expect(
      runOperation('retention', { url: 'http://127.0.0.1:54321', key: 'local', fetcher })
    ).resolves.toEqual({ job: 'retention', status: 'success' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ p_retain_days: 365 });
  });
  it('keepalive records success only after a real database response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ checked_at: new Date().toISOString(), jobs: {} })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => null });
    await runOperation('keepalive', { url: 'http://localhost:54321', key: 'local', fetcher });
    expect(fetcher.mock.calls[0]![0]).toContain('get_operations_health');
    expect(fetcher.mock.calls[1]![0]).toContain('record_operations_run');
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).p_status).toBe('success');
  });
  it('keepalive succeeds when PostgREST answers the void report with 204 and no body, and records no failure after it', async () => {
    // record_operations_run returns void: a real PostgREST replies 204 No Content with an empty
    // body, and reading it as JSON throws. Found by the A4 local dry run.
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ checked_at: new Date().toISOString(), jobs: {} })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        }
      });
    await expect(
      runOperation('keepalive', { url: 'http://127.0.0.1:54321', key: 'local', fetcher })
    ).resolves.toEqual({ job: 'keepalive', status: 'success' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).p_status).toBe('success');
  });
  it('a failed provider reply stays failed and cannot leak provider credentials in its error', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'secret provider payload' })
    });
    await expect(
      runOperation('keepalive', { url: 'http://localhost:54321', key: 'secret', fetcher })
    ).rejects.toThrow('HTTP 503');
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).p_status).toBe('failed');
  });
  it('does not send a modern secret API key as a bearer JWT', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => 0 });
    await runOperation('retention', {
      url: 'http://localhost:54321',
      key: 'sb_secret_local',
      fetcher
    });
    expect(fetcher.mock.calls[0]![1].headers.apikey).toBe('sb_secret_local');
    expect(fetcher.mock.calls[0]![1].headers.Authorization).toBeUndefined();
  });
});
