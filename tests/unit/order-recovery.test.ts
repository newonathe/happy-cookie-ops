import { describe, expect, it, vi } from 'vitest';
import { OrderRecovery } from '@/lib/orders/order-recovery';
const uuid = '123e4567-e89b-42d3-a456-426614174000';
const value = {
  attempt: {
    id: uuid,
    body: {
      client_id: uuid,
      items: [{ product_id: 'cookie', qty: 2 }],
      name: 'A Customer',
      ig: 'customer',
      mobile: '09123456789',
      pay_method: 'Cash',
      pickup_date: '2026-11-06',
      pickup_window: 'campus'
    }
  }
};
const acknowledged = {
  ...value,
  placed: {
    orderNo: 'HC-1234',
    token: 'a'.repeat(64),
    totalCents: 2500,
    pickupDate: '2026-11-06',
    pickupWindow: 'campus',
    replayed: false
  }
};
const otherId = '223e4567-e89b-42d3-a456-426614174000';
const other = { attempt: { id: otherId, body: { ...value.attempt.body, client_id: otherId } } };
function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    }
  };
}
describe('OrderRecovery', () => {
  it('round-trips exact pending body and validated acknowledgement by backend origin', () => {
    const s = memory(),
      r = new OrderRecovery('https://shop.example/path', () => s);
    expect(r.read().phase).toBe('empty');
    expect(r.write(value)).toBe(true);
    expect(r.read()).toEqual({ phase: 'ready', value });
    const ack = acknowledged;
    expect(r.write(ack)).toBe(true);
    expect(r.read()).toEqual({ phase: 'ready', value: ack });
    expect(new OrderRecovery('https://other.example', () => s).read().phase).toBe('empty');
    expect(r.clear(value.attempt)).toBe(true);
  });
  it('rejects mismatched identity and preserves damaged copies without overwrite', () => {
    const s = memory(),
      r = new OrderRecovery('https://shop.example', () => s);
    expect(
      r.write({
        ...value,
        attempt: { ...value.attempt, id: '223e4567-e89b-42d3-a456-426614174000' }
      })
    ).toBe(false);
    const key = 'hc-order-recovery-v1:https%3A%2F%2Fshop.example';
    s.setItem(key, '{broken');
    expect(r.read().phase).toBe('invalid');
    expect(r.write(value)).toBe(false);
    expect(s.getItem(key)).toBe('{broken');
  });
  it('reports unavailable or unscoped without clearing storage', () => {
    const s = memory();
    expect(new OrderRecovery(null, () => s).read().phase).toBe('unscoped');
    const r = new OrderRecovery('https://shop.example', () => {
      throw Error('blocked');
    });
    expect(r.read().phase).toBe('unavailable');
    expect(r.write(value)).toBe(false);
    expect(new OrderRecovery('https://shop.example', () => null).read().phase).toBe('unavailable');
    expect(new OrderRecovery('ftp://localhost', () => s).read().phase).toBe('unscoped');
    expect(new OrderRecovery('https://user:pass@shop.example', () => s).read().phase).toBe(
      'unscoped'
    );
    expect(new OrderRecovery('http://localhost:54321', () => s).read().phase).toBe('empty');
  });
  it('does not replace another pending attempt and rejects oversized copies', () => {
    const s = memory(),
      r = new OrderRecovery('https://shop.example', () => s);
    expect(r.write(value)).toBe(true);
    const key = 'hc-order-recovery-v1:https%3A%2F%2Fshop.example',
      before = s.getItem(key);
    const otherId = '223e4567-e89b-42d3-a456-426614174000';
    const other = {
      ...value,
      attempt: { id: otherId, body: { ...value.attempt.body, client_id: otherId } }
    };
    expect(r.write(other)).toBe(false);
    expect(s.getItem(key)).toBe(before);
    expect(
      r.write({
        ...value,
        attempt: {
          ...value.attempt,
          body: { ...value.attempt.body, name: 'x'.repeat(80) },
          id: uuid
        }
      })
    ).toBe(false);
  });
  it('keeps different backend paths separate and normalizes only trailing slashes', () => {
    const store = memory(),
      a = new OrderRecovery('https://shop.example/project-a/', () => store);
    expect(a.write(value)).toBe(true);
    expect(new OrderRecovery('https://shop.example/project-b', () => store).read().phase).toBe(
      'empty'
    );
    expect(new OrderRecovery('https://shop.example/project-a', () => store).read().value).toEqual(
      value
    );
  });
  it('does not let an old response clear another pending request', () => {
    const store = memory(),
      scoped = new OrderRecovery('https://shop.example', () => store);
    expect(scoped.write(other)).toBe(true);
    expect(scoped.clear(value.attempt)).toBe(false);
    expect(scoped.read().value).toEqual(other);
    expect(scoped.clear(other.attempt)).toBe(true);
    expect(scoped.read().phase).toBe('empty');
    const original = memory(),
      replacement = memory();
    new OrderRecovery('https://shop.example', () => original).write(value);
    const next = new OrderRecovery('https://shop.example', () => replacement);
    next.write(other);
    let lookups = 0;
    const changing = new OrderRecovery('https://shop.example', () =>
      lookups++ === 0 ? original : replacement
    );
    expect(changing.clear(value.attempt)).toBe(true);
    expect(next.read().value).toEqual(other);
  });
  it('never downgrades a retained acknowledgement to pending', () => {
    const store = memory(),
      r = new OrderRecovery('https://shop.example', () => store);
    expect(r.write(acknowledged)).toBe(true);
    expect(r.write(value)).toBe(true);
    expect(r.read().value).toEqual(acknowledged);
  });
  it('refuses a different acknowledgement identity for the same attempt', () => {
    const store = memory(),
      r = new OrderRecovery('https://shop.example', () => store);
    expect(r.write(acknowledged)).toBe(true);
    expect(
      r.write({ ...acknowledged, placed: { ...acknowledged.placed, token: 'b'.repeat(64) } })
    ).toBe(false);
    expect(r.read().value).toEqual(acknowledged);
    const latest = {
      ...acknowledged,
      placed: { ...acknowledged.placed, totalCents: 5000, replayed: true }
    };
    expect(r.write(latest)).toBe(true);
    expect(r.read().value).toEqual(latest);
  });
  it('does not treat an unreadable storage return as an empty store', () => {
    const setItem = vi.fn(),
      store = { ...memory(), setItem, getItem: () => undefined as unknown as string | null };
    const r = new OrderRecovery('https://shop.example', () => store);
    expect(r.read().phase).toBe('unavailable');
    expect(r.write(value)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
  it('retains valid formatted phone input exactly and refuses oversized writes without touching storage', () => {
    const store = memory(),
      r = new OrderRecovery('https://shop.example', () => store);
    const formatted = {
      attempt: {
        ...value.attempt,
        body: { ...value.attempt.body, mobile: '0912' + ' '.repeat(80) + '3456789' }
      }
    };
    expect(r.write(formatted)).toBe(true);
    expect(r.read().value).toEqual(formatted);
    const fresh = memory(),
      limited = new OrderRecovery('https://shop.example', () => fresh);
    expect(
      limited.write({
        attempt: {
          ...value.attempt,
          body: { ...value.attempt.body, mobile: '0912' + ' '.repeat(70000) + '3456789' }
        }
      })
    ).toBe(false);
    expect(fresh.m.size).toBe(0);
  });
});
