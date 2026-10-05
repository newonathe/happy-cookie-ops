// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  assertSameOriginMutation,
  assertSessionCsrf,
  readBoundedJson,
  SessionRequestError
} from '@/lib/auth/request-policy';

const origin = 'https://ops.example.test';
const schema = z.object({ name: z.string().min(1) }).strict();
function mutation(
  url = origin + '/api/v1/session/login',
  headers: Record<string, string> = {},
  method = 'POST'
) {
  return new Request(url, { method, headers: { Origin: origin, 'X-HC-Request': '1', ...headers } });
}
function json(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request(origin + '/api/v1/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    ...{ duplex: 'half' }
  });
}
const rejected = (code: string, status: number) =>
  expect.objectContaining({ code, status, message: code });

describe('session mutation origin boundary', () => {
  it('accepts same-origin browser requests with or without fetch metadata', () => {
    expect(() => assertSameOriginMutation(mutation(), origin)).not.toThrow();
    expect(() =>
      assertSameOriginMutation(mutation(undefined, { 'Sec-Fetch-Site': 'same-origin' }), origin)
    ).not.toThrow();
  });
  it.each(['http://localhost:8788', 'http://127.0.0.1:8788', 'http://[::1]:8788'])(
    'permits explicit local testing at %s',
    (local) => {
      expect(() =>
        assertSameOriginMutation(mutation(local + '/api', { Origin: local }), local)
      ).not.toThrow();
    }
  );
  it.each([
    '',
    'null',
    'https://evil.test',
    origin + '.evil.test',
    origin + '/',
    'https://ops.example.test:444'
  ])('denies hostile Origin %s', (value) => {
    expect(() => assertSameOriginMutation(mutation(undefined, { Origin: value }), origin)).toThrow(
      rejected('forbidden', 403)
    );
  });
  it('rejects missing origin and custom header', () => {
    for (const header of ['origin', 'x-hc-request']) {
      const request = mutation();
      request.headers.delete(header);
      expect(() => assertSameOriginMutation(request, origin)).toThrow(rejected('forbidden', 403));
    }
  });
  it.each(['same-site', 'cross-site', 'none', 'garbage'])(
    'denies fetch-site %s even with a forged origin',
    (site) => {
      expect(() =>
        assertSameOriginMutation(mutation(undefined, { 'Sec-Fetch-Site': site }), origin)
      ).toThrow(rejected('forbidden', 403));
    }
  );
  it('rejects hostile target URL and ignores forwarded host', () => {
    expect(() =>
      assertSameOriginMutation(
        mutation('https://evil.test/api', {
          Host: 'ops.example.test',
          'X-Forwarded-Host': 'ops.example.test'
        }),
        origin
      )
    ).toThrow(rejected('forbidden', 403));
  });
  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS'])('rejects %s mutations', (method) => {
    expect(() => assertSameOriginMutation(mutation(undefined, {}, method), origin)).toThrow(
      rejected('method_not_allowed', 405)
    );
  });
  it.each([
    'http://ops.example.test',
    origin + '/',
    origin + '/path',
    origin + '?x=1',
    origin + '#fragment',
    'https://user:pass@ops.example.test',
    'not a URL',
    'https://ops.example.test:443'
  ])('fails closed for invalid trusted config %s', (configured) => {
    expect(() => assertSameOriginMutation(mutation(), configured)).toThrow(
      rejected('invalid_configuration', 503)
    );
  });
});

describe('bounded session JSON boundary', () => {
  it('returns parsed strict-schema data, with accepted UTF-8 media parameter', async () => {
    await expect(
      readBoundedJson(
        json('{"name":"safe"}', {
          'content-type': 'Application/JSON; charset=UTF-8',
          'content-encoding': 'identity'
        }),
        schema
      )
    ).resolves.toEqual({ name: 'safe' });
  });
  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/json; charset=latin1',
    'application/json; boundary=x'
  ])('rejects media %s', async (media) => {
    await expect(
      readBoundedJson(json('{"name":"safe"}', { 'content-type': media }), schema)
    ).rejects.toEqual(rejected('unsupported_media_type', 415));
  });
  it('rejects missing content type and compressed bodies', async () => {
    const request = json('{}');
    request.headers.delete('content-type');
    await expect(readBoundedJson(request, schema)).rejects.toEqual(
      rejected('unsupported_media_type', 415)
    );
    await expect(
      readBoundedJson(json('{}', { 'content-encoding': 'gzip' }), schema)
    ).rejects.toEqual(rejected('unsupported_media_type', 415));
  });
  it.each(['-1', '1e3', '1.5', 'wat', '9007199254740992'])(
    'rejects malformed length %s',
    async (length) => {
      await expect(
        readBoundedJson(json('{}', { 'content-length': length }), schema)
      ).rejects.toEqual(rejected('bad_request', 400));
    }
  );
  it('rejects declared oversize before reading the body', async () => {
    const request = json('{}', { 'content-length': '4097' });
    const spy = vi.spyOn(request.body as ReadableStream<Uint8Array>, 'getReader');
    await expect(readBoundedJson(request, schema)).rejects.toEqual(
      rejected('payload_too_large', 413)
    );
    expect(spy).not.toHaveBeenCalled();
  });
  it('uses UTF-8 bytes and accepts the exact limit', async () => {
    const payload = '{"name":"é"}';
    const size = new TextEncoder().encode(payload).length;
    await expect(readBoundedJson(json(payload), schema, size)).resolves.toEqual({ name: 'é' });
    await expect(
      readBoundedJson(json(payload, { 'content-length': '1' }), schema, size - 1)
    ).rejects.toEqual(rejected('payload_too_large', 413));
  });
  it('cancels overflow without waiting for a stalled cancellation callback', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(3));
        c.enqueue(new Uint8Array(3));
      },
      cancel
    });
    await expect(readBoundedJson(json(stream), schema, 5)).rejects.toEqual(
      rejected('payload_too_large', 413)
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(['', 'not json SECRET', '{"name":0}', '{"name":"ok","password":"SECRET"}', 'null'])(
    'returns only a safe error for invalid payload %#',
    async (payload) => {
      await expect(readBoundedJson(json(payload), schema)).rejects.toEqual(
        rejected('bad_request', 400)
      );
    }
  );
  it('rejects malformed UTF-8 and stream failures without exposing details', async () => {
    const invalid = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([0xff]));
        c.close();
      }
    });
    const failed = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error('SECRET'));
      }
    });
    for (const body of [invalid, failed])
      await expect(readBoundedJson(json(body), schema)).rejects.toEqual(
        rejected('bad_request', 400)
      );
  });
  it('rejects consumed and absent bodies', async () => {
    const request = json('{"name":"ok"}');
    await request.text();
    await expect(readBoundedJson(request, schema)).rejects.toEqual(rejected('bad_request', 400));
    await expect(
      readBoundedJson(
        new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' } }),
        schema
      )
    ).rejects.toEqual(rejected('bad_request', 400));
  });
  it.each([0, -1, 1.5, NaN, Infinity, 65537])(
    'rejects unbounded or invalid byte limit %s',
    async (limit) => {
      await expect(readBoundedJson(json('{}'), schema, limit)).rejects.toEqual(
        rejected('invalid_configuration', 503)
      );
    }
  );
  it('uses a recognizable safe error class', () => {
    const error = new SessionRequestError('forbidden', 403);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('forbidden');
  });
});

describe('session-bound CSRF comparison', () => {
  const token = 'a'.repeat(43);
  it('accepts only the verified session token', () => {
    expect(() =>
      assertSessionCsrf(mutation(undefined, { 'X-HC-CSRF': token }), token)
    ).not.toThrow();
    expect(() =>
      assertSessionCsrf(mutation(undefined, { 'X-HC-CSRF': 'b'.repeat(43) }), token)
    ).toThrow(rejected('forbidden', 403));
  });
  it.each(['', '1', 'a'.repeat(42), 'a'.repeat(44), '!'.repeat(43)])(
    'denies malformed token %#',
    (value) => {
      expect(() => assertSessionCsrf(mutation(undefined, { 'X-HC-CSRF': value }), token)).toThrow(
        rejected('forbidden', 403)
      );
    }
  );
  it('rejects missing token and invalid server session configuration', () => {
    expect(() => assertSessionCsrf(mutation(), token)).toThrow(rejected('forbidden', 403));
    expect(() => assertSessionCsrf(mutation(), '')).toThrow(rejected('invalid_configuration', 503));
  });
});

it('sanitizes a locked body and a throwing schema', async () => {
  const request = json('{}');
  const reader = request.body?.getReader();
  try {
    await expect(readBoundedJson(request, schema)).rejects.toEqual(rejected('bad_request', 400));
  } finally {
    reader?.releaseLock();
  }
  const throwing = z.string().transform(() => {
    throw new Error('SECRET');
  });
  await expect(readBoundedJson(json('"safe"'), throwing)).rejects.toEqual(
    rejected('bad_request', 400)
  );
});
