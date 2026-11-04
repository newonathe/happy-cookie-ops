import { z } from 'zod';
import {
  productionError,
  type ProductionFields,
  type ProductionResult
} from '@/lib/data/production';
import type { ProductionWork } from './workspace';
import type { ProductionPlanChoice } from './plan';
import { holdCountLock } from '@/lib/stock/count-lock';

export interface ProductionRecoveryScope {
  userId: string;
  business: string;
}
export interface ProductionRecoveryEntry {
  dropNo: number;
  productId: string;
  version: number;
  quantity: string;
  kind?: 'batch' | 'dough';
  batchQuantity?: string;
  choices?: ProductionPlanChoice[];
  reviewing?: boolean;
}
export interface ProductionRecovery {
  version: 1;
  scope: ProductionRecoveryScope;
  sequence: number;
  selectedId: string | null;
  works: ProductionWork[];
  requests: Array<{ workId: string; fields: ProductionFields }>;
  saved: Array<{
    workId: string;
    name: string;
    number?: number;
    fields: ProductionFields;
    result: ProductionResult;
  }>;
  entry?: ProductionRecoveryEntry | null;
}
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>;
const id = z.uuid();
const text = z.string().max(10000);
const countText = z.string().max(32);
const scopeSchema = z
  .object({
    userId: id,
    business: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
        } catch {
          return false;
        }
      })
  })
  .strict();
const fields = z
  .object({
    id,
    kind: z.enum(['batch', 'dough']),
    productId: z.string().min(1).max(128),
    qty: z.number(),
    target: z.number().nullable(),
    rejects: z.number(),
    adj: z.record(z.string(), z.number()),
    recipeVersion: z.number(),
    dropNo: z.number(),
    at: z.number()
  })
  .strict()
  .refine((value) => productionError(value) === null);
const line = z
  .object({
    name: text,
    qty: z.number().finite().nonnegative(),
    unit: z.string().max(64),
    kind: z.enum(['ingredient', 'packaging']).nullable()
  })
  .strict();
const recipe = z
  .object({
    version: z.number().int().positive(),
    yield: z.number().int().positive(),
    lines: z.array(line).max(500)
  })
  .strict();
const common = { note: text, step: z.number().int().min(0).max(10).optional() };
const draft = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('batch'),
      target: z.number().int().nonnegative(),
      actual: countText,
      rejects: countText,
      adj: z.record(z.string(), z.number().finite()),
      step: z.number().int().min(0).max(10),
      showUsed: z.boolean().optional()
    })
    .strict(),
  z.object({ ...common, kind: z.literal('dough'), balls: countText }).strict()
]);
const work = z
  .object({
    id,
    number: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    product: z
      .object({ id: z.string().min(1).max(128), name: text, photo: z.string().max(2048) })
      .strict(),
    recipe: recipe.nullable(),
    dropNo: z.number().int().min(0).max(100000),
    draft
  })
  .strict();
const saved = z
  .object({
    workId: id,
    name: text,
    number: z.number().int().positive().optional(),
    fields,
    result: z
      .object({
        outcome: z.literal('saved'),
        duplicate: z.boolean(),
        usedDough: z.number().finite().nonnegative(),
        shortfall: z
          .array(
            z
              .object({
                name: text,
                by: z.number().finite().nonnegative(),
                unit: z.string().max(64)
              })
              .strict()
          )
          .max(500)
      })
      .strict()
  })
  .strict();
const recovery = z
  .object({
    version: z.literal(1),
    scope: scopeSchema,
    sequence: z.number().int().nonnegative(),
    selectedId: id.nullable(),
    works: z.array(work).max(200),
    requests: z.array(z.object({ workId: id, fields }).strict()).max(200),
    saved: z.array(saved).max(50),
    entry: z
      .object({
        dropNo: z.number().int().min(0).max(100000),
        productId: z.string().max(128),
        version: z.number().int().nonnegative(),
        quantity: countText,
        kind: z.enum(['batch', 'dough']).optional(),
        batchQuantity: countText.optional(),
        reviewing: z.boolean().optional(),
        choices: z
          .array(
            z
              .object({
                productId: z.string().min(1).max(128),
                name: text.optional(),
                photo: z.string().max(2048).optional(),
                quantity: countText,
                version: z.number().int().positive(),
                kind: z.enum(['batch', 'dough']),
                batchQuantity: countText.optional()
              })
              .strict()
          )
          .max(80)
          .refine((rows) => new Set(rows.map((row) => row.productId)).size === rows.length)
          .optional()
      })
      .strict()
      .nullable()
      .optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.works.map((row) => row.id),
      numbers = value.works.map((row) => row.number);
    const requestIds = [...value.requests, ...value.saved].map((row) => row.fields.id);
    const requestWorkIds = value.requests.map((row) => row.workId),
      savedIds = value.saved.map((row) => row.workId);
    const unique = (rows: Array<string | number>) => new Set(rows).size === rows.length;
    const bad =
      !unique(ids) ||
      !unique(numbers) ||
      !unique(requestIds) ||
      !unique(requestWorkIds) ||
      !unique(savedIds) ||
      numbers.some((n) => n > value.sequence) ||
      (value.selectedId !== null && !ids.includes(value.selectedId)) ||
      savedIds.some((id) => ids.includes(id)) ||
      value.requests.some((request) => {
        const item = value.works.find((row) => row.id === request.workId),
          f = request.fields;
        return (
          !item ||
          item.product.id !== f.productId ||
          item.dropNo !== f.dropNo ||
          item.draft.kind !== f.kind ||
          (item.recipe !== null && item.recipe.version !== f.recipeVersion) ||
          (item.draft.kind === 'batch'
            ? !/^\d+$/.test(item.draft.actual) ||
              !/^\d+$/.test(item.draft.rejects) ||
              Number(item.draft.actual) !== f.qty ||
              Number(item.draft.rejects) !== f.rejects ||
              item.draft.target !== f.target ||
              JSON.stringify(
                Object.entries(item.draft.adj)
                  .filter(([, qty]) => qty !== 0)
                  .sort()
              ) !==
                JSON.stringify(
                  Object.entries(f.adj)
                    .filter(([, qty]) => qty !== 0)
                    .sort()
                )
            : Number(item.draft.balls) !== f.qty)
        );
      });
    if (bad)
      ctx.addIssue({ code: 'custom', message: 'Production identities or frozen facts disagree.' });
  });

export function parseProductionScope(value: unknown): ProductionRecoveryScope | null {
  const parsed = scopeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
const key = (scope: ProductionRecoveryScope) =>
  'hc-production-recovery-v1:' + encodeURIComponent(scope.business) + ':' + scope.userId;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function sameProductionRequest(a: ProductionFields, b: ProductionFields): boolean {
  const facts = (f: ProductionFields) => [
    f.id,
    f.kind,
    f.productId,
    f.qty,
    f.target,
    f.rejects,
    f.recipeVersion,
    f.dropNo,
    f.at,
    Object.entries(f.adj).sort()
  ];
  return same(facts(a), facts(b));
}
const sameScope = (a: ProductionRecoveryScope, b: ProductionRecoveryScope) =>
  a.userId === b.userId && a.business === b.business;
export function emptyProductionRecovery(scope: ProductionRecoveryScope): ProductionRecovery {
  return {
    version: 1,
    scope,
    sequence: 0,
    selectedId: null,
    works: [],
    requests: [],
    saved: [],
    entry: null
  };
}
export function readProductionRecovery(
  scope: ProductionRecoveryScope,
  storage?: RecoveryStorage
): {
  status: 'stored' | 'empty' | 'invalid' | 'unavailable';
  value: ProductionRecovery | null;
} {
  try {
    if (!parseProductionScope(scope)) return { status: 'invalid', value: null };
    const raw = (storage ?? localStorage).getItem(key(scope));
    if (raw === null) return { status: 'empty', value: null };
    if (raw.length > 1048576) return { status: 'invalid', value: null };
    const parsed = recovery.safeParse(JSON.parse(raw));
    return parsed.success && sameScope(parsed.data.scope, scope)
      ? { status: 'stored', value: parsed.data }
      : { status: 'invalid', value: null };
  } catch {
    return { status: 'unavailable', value: null };
  }
}

/**
 * The owner's explicit way out of an unreadable copy, which would otherwise block production on this
 * device for good. The bytes move to one side key, never deleted; a readable copy is refused here.
 */
export function setAsideProductionRecovery(
  scope: ProductionRecoveryScope,
  storage?: RecoveryStorage & { removeItem: (name: string) => void }
): boolean {
  try {
    const use = storage ?? localStorage;
    if (readProductionRecovery(scope, use).status !== 'invalid') return false;
    const raw = use.getItem(key(scope));
    if (raw === null) return false;
    use.removeItem(key(scope));
    use.setItem(key(scope) + ':set-aside', raw);
    return use.getItem(key(scope)) === null;
  } catch {
    return false;
  }
}

/** No deletion API. Retire only an answered request or a request proven never submitted. */
export function writeProductionRecovery(
  scope: ProductionRecoveryScope,
  value: ProductionRecovery,
  options: {
    storage?: RecoveryStorage;
    resolvedRequests?: readonly string[];
  } = {}
): boolean {
  try {
    const parsed = recovery.safeParse(value);
    if (!parsed.success || !sameScope(parsed.data.scope, scope)) return false;
    const use = options.storage ?? localStorage,
      before = readProductionRecovery(scope, use);
    if (before.status === 'invalid' || before.status === 'unavailable') return false;
    for (const old of before.value?.requests ?? []) {
      const current = parsed.data.requests.find((row) => row.workId === old.workId);
      if (current && sameProductionRequest(current.fields, old.fields)) continue;
      const acknowledged = parsed.data.saved.some(
        (row) => row.workId === old.workId && sameProductionRequest(row.fields, old.fields)
      );
      if (!acknowledged && !options.resolvedRequests?.includes(old.fields.id)) return false;
    }
    const raw = JSON.stringify(parsed.data);
    if (raw.length > 1048576) return false;
    use.setItem(key(scope), raw);
    return use.getItem(key(scope)) === raw;
  } catch {
    return false;
  }
}

/** Reuse the established Web Lock implementation with a distinct identity-scoped namespace. */
export function holdProductionLock(scope: ProductionRecoveryScope): Promise<(() => void) | null> {
  return parseProductionScope(scope)
    ? holdCountLock('production-work:' + key(scope))
    : Promise.resolve(null);
}
