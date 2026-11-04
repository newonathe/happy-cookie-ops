import { z } from 'zod';
import { movementError } from '@/lib/data/stock-ledger';

// One device's business count, isolated by backend project. Only the verified owner
// interface restores it; this record confers no permission and never sends itself.
const name = z.string().min(1).max(80);
const task = z
  .object({
    i: z.number().int().nonnegative(),
    items: z.array(name).min(1).max(1000),
    counts: z.record(name, z.string().max(48))
  })
  .strict()
  .refine((v) => v.i < v.items.length && new Set(v.items).size === v.items.length);
const fields = z
  .object({
    id: z.string().uuid(),
    itemId: z.string().min(1).max(160),
    kind: z.literal('count'),
    qty: z.number().finite().nonnegative(),
    costCents: z.null(),
    supplier: z.literal(''),
    reason: z.literal(''),
    at: z.number().int().positive()
  })
  .strict()
  .refine((value) => movementError(value) === null);
const recovery = z
  .object({
    version: z.literal(1),
    scope: z.string().min(1).max(2048),
    task: task.nullable(),
    countedAt: z.record(name, z.number().int().positive()),
    itemIds: z.record(name, z.string().min(1).max(160)),
    openItem: z.string().max(160).nullable(),
    pending: z.array(z.object({ name, fields }).strict()).max(1000)
  })
  .strict()
  .refine((value) =>
    Object.entries(value.task?.counts ?? {}).every(
      ([key, count]) => count.trim() === '' || Object.hasOwn(value.itemIds, key)
    )
  );

export type CountRecovery = z.infer<typeof recovery>;
export type CountRecoveryRead = {
  status: 'stored' | 'empty' | 'invalid' | 'unavailable';
  value: CountRecovery | null;
};
const key = (scope: string) => 'hc-count-recovery-v1:' + encodeURIComponent(scope);

/** Never restores an unvalidated copy or takes a different backend's operations. */
export function readCountRecovery(scope: string): CountRecoveryRead {
  try {
    const text = localStorage.getItem(key(scope));
    if (text === null) return { status: 'empty', value: null };
    if (text.length > 262144) return { status: 'invalid', value: null };
    const parsed = recovery.safeParse(JSON.parse(text));
    return parsed.success && parsed.data.scope === scope
      ? { status: 'stored', value: parsed.data }
      : { status: 'invalid', value: null };
  } catch {
    return { status: 'unavailable', value: null };
  }
}

/** Synchronous before a count request: no confirmed local copy means no request. */
export function writeCountRecovery(scope: string, value: CountRecovery | null): boolean {
  try {
    if (value === null) {
      localStorage.removeItem(key(scope));
      return true;
    }
    const parsed = recovery.safeParse(value);
    if (!parsed.success || parsed.data.scope !== scope) return false;
    const text = JSON.stringify(parsed.data);
    if (text.length > 262144) return false;
    localStorage.setItem(key(scope), text);
    return true;
  } catch {
    return false;
  }
}
