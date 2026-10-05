import { describe, expect, it } from 'vitest';
import { scrubReport, scrubText, scrubValue } from '@/lib/observability/scrub';

/**
 * The scrubber is the only thing standing between a thrown error and a customer's
 * mobile number appearing in a third-party dashboard. These tests are the reason to
 * believe it works.
 */
describe('scrubText', () => {
  it('redacts the entire text for every phone-number spelling', () => {
    for (const number of ['09171234567', '+639171234567', '0917 123 4567', '0917-123-4567']) {
      expect(scrubText(`order for ${number}`)).toBe('[redacted]');
    }
  });

  it('redacts the entire error message, not selected substrings', () => {
    const message = 'insert failed: duplicate key (phone)=(09171234567) already exists';
    expect(scrubText(message)).toBe('[redacted]');
  });

  it('redacts the entire text containing an email address', () => {
    expect(scrubText('failed for cine@happycookie.ph')).toBe('[redacted]');
  });

  it('redacts all free text, including payment references and amounts', () => {
    expect(scrubText('ref 9012345678901 for 1200')).toBe('[redacted]');
  });
});

describe('scrubValue', () => {
  it('keeps the keys that help you fix the bug', () => {
    expect(scrubValue({ screen: 'bazaar', role: 'owner', count: 3 })).toEqual({
      screen: 'bazaar',
      role: 'owner',
      count: 3
    });
  });

  it('redacts a key it has never seen, rather than passing it through', () => {
    expect(scrubValue({ somethingNew: 'unexpected' })).toEqual({ _redacted: 1 });
  });

  it('redacts a denied key even when its name is buried', () => {
    const scrubbed = scrubValue({ customerPhone: '09171234567', orderNotes: 'no nuts' }) as Record<
      string,
      unknown
    >;
    expect(scrubbed).toEqual({ _redacted: 2 });
  });

  it('keeps an array length but not its contents', () => {
    expect(scrubValue([1, 2, 3])).toEqual({ length: 3, items: '[redacted]' });
  });
});

describe('scrubReport', () => {
  it('strips a lookup query string, which is where the phone number is', () => {
    const report = scrubReport({
      request: { url: '/api/orders/lookup?id=HC-1042&phone=09171234567' }
    });
    expect(report.request?.url).toBe('/api/orders/lookup');
  });

  it('drops request headers and cookies entirely', () => {
    const report = scrubReport({
      request: {
        url: '/orders',
        headers: { cookie: 'sb-access-token=abc' },
        cookies: { a: 'b' },
        data: { phone: '09171234567' }
      }
    });
    expect(report.request?.headers).toBeUndefined();
    expect(report.request?.cookies).toBeUndefined();
    expect(report.request?.data).toBeUndefined();
  });

  it('leaves nothing of a fixture customer anywhere in the payload', () => {
    const report = scrubReport({
      message: 'failed to save order for Maria Santos 09171234567',
      user: { email: 'maria@example.com', id: 'u1' },
      extra: { customerName: 'Maria Santos', phone: '09171234567', items: { dcf: 2 } },
      breadcrumbs: [
        { message: 'POST /api/orders?phone=09171234567', data: { phone: '09171234567' } }
      ],
      exception: { values: [{ value: 'duplicate phone 09171234567' }] }
    });
    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain('09171234567');
    expect(serialised).not.toContain('maria@example.com');
    expect(serialised).not.toContain('Maria Santos');
  });
});

describe('reporting-path privacy canaries', () => {
  const canary = 'Synthetic Canary Person sk_test_private_canary_7a9e';
  it('drops unstructured content in reports and standalone breadcrumbs', () => {
    const payload = {
      message: canary,
      name: canary,
      tags: { safe: canary },
      transaction: canary,
      request: { url: '/orders/' + canary, headers: { authorization: canary } },
      extra: { screen: canary, route: canary, code: canary, name: canary, stack: canary },
      data: { url: canary, message: canary },
      exception: {
        values: [{ value: canary, stacktrace: { frames: [{ vars: { value: canary } }] } }]
      },
      breadcrumbs: [{ message: canary, category: canary, data: { message: canary } }]
    };
    expect(JSON.stringify(scrubValue({ [canary]: canary, constructor: canary }))).not.toContain(
      canary
    );
    expect(JSON.stringify(scrubReport(payload))).not.toContain(canary);
    expect(
      JSON.stringify(scrubReport({ message: canary, data: { name: canary }, category: canary }))
    ).not.toContain(canary);
  });
  it('keeps only validated metadata and rejects secret-shaped diagnostic values', () => {
    expect(scrubValue({ screen: 'bazaar', role: 'owner', count: 2, online: false })).toEqual({
      screen: 'bazaar',
      role: 'owner',
      count: 2,
      online: false
    });
    expect(scrubValue({ role: canary, count: canary, code: canary })).toEqual({
      role: '[redacted]',
      count: '[redacted]',
      _redacted: 1
    });
    expect(
      scrubReport({ message: canary, timestamp: 123, event_id: 'a'.repeat(32), type: 'error' })
    ).toEqual({
      message: '[redacted]',
      timestamp: 123,
      event_id: 'a'.repeat(32),
      type: 'error'
    });
  });
});
