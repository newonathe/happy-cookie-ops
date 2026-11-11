import { z } from 'zod';
import { holdCountLock } from '@/lib/stock/count-lock';
import type { EventEntryScope } from './event-entry-recovery';
import {
  freezeKitchenTransfer,
  kitchenTransferRequestSchema as request,
  readKitchenTransferReceipt,
  type KitchenTransferReceipt,
  type KitchenTransferRequest
} from './kitchen-transfer';

const work = request
  .omit({ id: true, qty: true, at: true })
  .extend({
    work_id: request.shape.id,
    qty_text: z.string(),
    submitted: request.nullable(),
    receipt: z.unknown().optional()
  })
  .strict()
  .refine(
    (value) =>
      (!value.submitted ||
        (value.submitted.day_id === value.day_id &&
          value.submitted.product_id === value.product_id &&
          value.submitted.source_drop === value.source_drop &&
          /^[0-9]+$/.test(value.qty_text.trim()) &&
          Number(value.qty_text) === value.submitted.qty)) &&
      (value.receipt === undefined ||
        (!!value.submitted && readKitchenTransferReceipt(value.submitted, value.receipt) !== null))
  );
const envelope = z
  .object({
    version: z.literal(1),
    scope: z.object({ userId: z.string(), business: z.string() }).strict(),
    works: z.array(work)
  })
  .strict()
  .refine((value) => {
    const ids = value.works.flatMap((item) => (item.submitted ? [item.submitted.id] : []));
    return (
      new Set(ids).size === ids.length &&
      new Set(value.works.map((item) => item.work_id)).size === value.works.length
    );
  });

export type KitchenTransferWork = Omit<z.infer<typeof work>, 'submitted' | 'receipt'> & {
  submitted: KitchenTransferRequest | null;
  /** Last acknowledged recording; its balance snapshot is never a fresh stock read. */
  receipt?: KitchenTransferReceipt;
};
export type KitchenTransferRecovery = Omit<z.infer<typeof envelope>, 'works'> & {
  works: KitchenTransferWork[];
};
type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type KitchenTransferRead = {
  status: 'empty' | 'stored' | 'invalid' | 'unavailable';
  value: KitchenTransferRecovery | null;
};
const sameScope = (a: EventEntryScope, b: EventEntryScope) =>
  a.userId === b.userId && a.business === b.business;
const keyOf = (scope: EventEntryScope) =>
  'hc-kitchen-transfer-v1:' + encodeURIComponent(scope.business) + ':' + scope.userId;
function deviceStorage(): DeviceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Only the verified owner/backend gate supplies scope. Storage is never write authority. */
export function readKitchenTransferRecovery(
  scope: EventEntryScope,
  storage: DeviceStorage | null = deviceStorage()
): KitchenTransferRead {
  if (!storage) return { status: 'unavailable', value: null };
  let raw: string | null;
  try {
    raw = storage.getItem(keyOf(scope));
  } catch {
    return { status: 'unavailable', value: null };
  }
  if (raw === null) return { status: 'empty', value: null };
  try {
    const parsed = envelope.safeParse(JSON.parse(raw));
    if (!parsed.success || !sameScope(scope, parsed.data.scope))
      return { status: 'invalid', value: null };
    return {
      status: 'stored',
      value: {
        ...parsed.data,
        works: parsed.data.works.map(({ receipt: rawReceipt, ...item }) => {
          const receipt =
            item.submitted && rawReceipt !== undefined
              ? readKitchenTransferReceipt(item.submitted, rawReceipt)
              : null;
          return {
            ...item,
            submitted: item.submitted ? freezeKitchenTransfer(item.submitted) : null,
            ...(receipt ? { receipt } : {})
          };
        })
      }
    };
  } catch {
    return { status: 'invalid', value: null };
  }
}

/** Caller holds the scope lock. Unanswered requests cannot be overwritten or dropped implicitly. */
export function writeKitchenTransferRecovery(
  scope: EventEntryScope,
  value: KitchenTransferRecovery,
  resolved: readonly string[] = [],
  storage: DeviceStorage | null = deviceStorage()
): boolean {
  if (!storage) return false;
  const parsed = envelope.safeParse(value);
  if (!parsed.success || !sameScope(scope, parsed.data.scope)) return false;
  const previous = readKitchenTransferRecovery(scope, storage);
  if (previous.status === 'invalid' || previous.status === 'unavailable') return false;
  for (const old of previous.value?.works ?? []) {
    if (!old.submitted || resolved.includes(old.submitted.id)) continue;
    const item = parsed.data.works.find((item) => item.work_id === old.work_id);
    const next = item?.submitted;
    if (!next || JSON.stringify(next) !== JSON.stringify(old.submitted)) return false;
    if (old.receipt) {
      const receipt = readKitchenTransferReceipt(next, item?.receipt);
      // This bit describes the reply, not a changing stock effect: stored ACK
      // reads may say false after a retry said true. Every recorded fact is fixed.
      if (
        !receipt ||
        JSON.stringify({ ...receipt, duplicate: false }) !==
          JSON.stringify({ ...old.receipt, duplicate: false })
      )
        return false;
    }
  }
  try {
    const serialized = JSON.stringify(parsed.data);
    storage.setItem(keyOf(scope), serialized);
    return storage.getItem(keyOf(scope)) === serialized;
  } catch {
    return false;
  }
}

export const holdKitchenTransferRecoveryLock = (scope: EventEntryScope) =>
  holdCountLock('kitchen-transfer:' + keyOf(scope));
