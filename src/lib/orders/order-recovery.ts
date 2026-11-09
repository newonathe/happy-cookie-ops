import { z } from 'zod';
import { ORDER_NO, STATUS_TOKEN, type Attempt, type PlacedOrder } from '@/lib/data/orders';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type OrderRecoveryValue = { attempt: Attempt; placed?: PlacedOrder };
const placed = z
  .object({
    orderNo: z.string().regex(ORDER_NO),
    token: z.string().regex(STATUS_TOKEN),
    totalCents: z.number().int().nonnegative(),
    pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pickupWindow: z.string().max(80),
    replayed: z.boolean()
  })
  .strict();
const body = z
  .object({
    client_id: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            product_id: z.string().min(1).max(128),
            qty: z.number().int().min(1).max(100000)
          })
          .strict()
      )
      .min(1)
      .max(80),
    name: z.string().min(1).max(80),
    ig: z.string().min(1).max(80),
    mobile: z.string().min(1),
    pay_method: z.string().min(1).max(100),
    pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pickup_window: z.string().min(1).max(80),
    pay_ref: z.string().max(200).optional(),
    add_ons: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            qty: z.number().int().min(1).max(100),
            variant: z.string().max(100).optional(),
            text: z.string().max(500).optional()
          })
          .strict()
      )
      .max(40)
      .optional(),
    boxes: z
      .array(
        z
          .object({
            size: z.number().int().positive().max(100),
            qty: z.number().int().min(1).max(100)
          })
          .strict()
      )
      .max(20)
      .optional()
  })
  .strict();
const envelope = z
  .object({
    version: z.literal(1),
    backend: z.string(),
    value: z
      .object({
        attempt: z.object({ id: z.string().uuid(), body }).strict(),
        placed: placed.optional()
      })
      .strict()
  })
  .strict();

export class OrderRecovery {
  private backend: string | null;
  constructor(
    backend: string | null,
    private storage: () => Store | null
  ) {
    try {
      const u = backend ? new URL(backend) : null;
      this.backend =
        u &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        (u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
          ? u.origin + u.pathname.replace(/\/+$/, '')
          : null;
    } catch {
      this.backend = null;
    }
  }
  private key() {
    return this.backend ? `hc-order-recovery-v1:${encodeURIComponent(this.backend)}` : null;
  }
  read(): {
    phase: 'empty' | 'ready' | 'invalid' | 'unavailable' | 'unscoped';
    value: OrderRecoveryValue | null;
  } {
    if (!this.key()) return { phase: 'unscoped', value: null };
    try {
      return this.readStorage(this.storage());
    } catch {
      return { phase: 'unavailable', value: null };
    }
  }
  private readStorage(storage: Store | null): ReturnType<OrderRecovery['read']> {
    const key = this.key();
    if (!key) return { phase: 'unscoped', value: null };
    try {
      if (!storage) return { phase: 'unavailable', value: null };
      const raw = storage.getItem(key);
      if (raw === null) return { phase: 'empty', value: null };
      if (typeof raw !== 'string') return { phase: 'unavailable', value: null };
      if (raw.length > 65536) return { phase: 'invalid', value: null };
      const parsed = envelope.safeParse(JSON.parse(raw));
      if (
        !parsed.success ||
        parsed.data.backend !== this.backend ||
        parsed.data.value.attempt.id !== parsed.data.value.attempt.body.client_id
      )
        return { phase: 'invalid', value: null };
      return { phase: 'ready', value: parsed.data.value };
    } catch (error) {
      return { phase: error instanceof SyntaxError ? 'invalid' : 'unavailable', value: null };
    }
  }
  write(value: OrderRecoveryValue): boolean {
    const key = this.key();
    if (!key) return false;
    try {
      const storage = this.storage();
      if (!storage) return false;
      const before = this.readStorage(storage);
      if (!['empty', 'ready'].includes(before.phase)) return false;
      const parsed = envelope.safeParse({ version: 1, backend: this.backend, value });
      if (!parsed.success || value.attempt.id !== value.attempt.body.client_id) return false;
      const raw = JSON.stringify(parsed.data);
      if (raw.length > 65536) return false;
      if (
        before.value &&
        JSON.stringify(before.value.attempt) !== JSON.stringify(parsed.data.value.attempt)
      )
        return false;
      if (before.value?.placed) {
        const incoming = parsed.data.value.placed;
        if (!incoming) return true; // A pending writer cannot erase an acknowledged receipt.
        if (
          incoming.orderNo !== before.value.placed.orderNo ||
          incoming.token !== before.value.placed.token
        )
          return false;
      }
      storage.setItem(key, raw);
      return storage.getItem(key) === raw;
    } catch {
      return false;
    }
  }
  clear(expected: Attempt): boolean {
    const key = this.key();
    if (!key) return false;
    try {
      const storage = this.storage();
      if (!storage) return false;
      const before = this.readStorage(storage);
      if (!['empty', 'ready'].includes(before.phase)) return false;
      if (before.phase === 'empty') return true;
      const parsed = envelope.safeParse({
        version: 1,
        backend: this.backend,
        value: { attempt: expected }
      });
      if (
        !parsed.success ||
        parsed.data.value.attempt.id !== parsed.data.value.attempt.body.client_id ||
        JSON.stringify(before.value?.attempt) !== JSON.stringify(parsed.data.value.attempt)
      )
        return false;
      storage.removeItem(key);
      return this.readStorage(storage).phase === 'empty';
    } catch {
      return false;
    }
  }
}
