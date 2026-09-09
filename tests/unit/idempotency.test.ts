import { describe, expect, it, vi } from 'vitest';
import { normalisePhone, orderKey } from '@/lib/idempotency';

vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1234' }));

describe('normalisePhone', () => {
  it('reads every way one person types their own number as the same number', () => {
    const forms = ['09171234567', '+639171234567', '0917 123 4567', '0917-123-4567', '639171234567', '9171234567'];
    const normalised = new Set(forms.map(normalisePhone));
    expect(normalised).toEqual(new Set(['09171234567']));
  });

  it('leaves a landline alone rather than mangling it', () => {
    expect(normalisePhone('(02) 8123 4567')).toBe('0281234567');
  });
});

describe('orderKey', () => {
  const base = { phone: '09171234567', dropId: 'd1', items: { dcf: 2, hc: 1 } };

  it('gives a double-tap the same key, so the second tap cannot create a second order', () => {
    expect(orderKey(base)).toBe(orderKey({ ...base }));
  });

  it('does not depend on the order the basket was built in', () => {
    expect(orderKey(base)).toBe(orderKey({ ...base, items: { hc: 1, dcf: 2 } }));
  });

  it('survives the customer retyping their number differently', () => {
    expect(orderKey(base)).toBe(orderKey({ ...base, phone: '+63 917 123 4567' }));
  });

  it('treats a changed quantity as a different order', () => {
    expect(orderKey(base)).not.toBe(orderKey({ ...base, items: { dcf: 3, hc: 1 } }));
  });

  it('treats the next drop as a different order', () => {
    expect(orderKey(base)).not.toBe(orderKey({ ...base, dropId: 'd2' }));
  });
});
