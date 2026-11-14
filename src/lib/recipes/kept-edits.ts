import { z } from 'zod';
import { parseProductionScope, type ProductionRecoveryScope } from '@/lib/production/recovery';

/**
 * HCB-038: an unsaved recipe edit, kept in this browser so a reload does not lose it. Kept per verified owner and
 * business (the same scope the production recovery uses), and only ever offered back: see `OpsRuntime`.
 */
export type KeptRecipeLine = [string, unknown, string, ('ingredient' | 'packaging' | null)?];
export interface KeptRecipeValue {
  yield: number;
  ing: KeptRecipeLine[];
}
export interface KeptRecipeEdit {
  productId: string;
  value: KeptRecipeValue;
  /** The saved version's `updated_at` the edit started from; null when there was no saved recipe. */
  stamp: string | null;
  at: number;
}
type KeptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const MAX_BYTES = 262144;
const line = z.union([
  z.tuple([z.string().max(500), z.union([z.number(), z.null()]), z.string().max(32)]),
  z.tuple([
    z.string().max(500),
    z.union([z.number(), z.null()]),
    z.string().max(32),
    z.union([z.literal('ingredient'), z.literal('packaging'), z.null()])
  ])
]);
const stored = z
  .object({
    version: z.literal(1),
    scope: z.object({ userId: z.string(), business: z.string() }).strict(),
    edits: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(128),
            value: z.object({ yield: z.number(), ing: z.array(line).max(300) }).strict(),
            stamp: z.string().max(64).nullable(),
            at: z.number()
          })
          .strict()
      )
      .max(100)
  })
  .strict();

export const keptRecipeKey = (scope: ProductionRecoveryScope) =>
  'hc-recipe-edits-v1:' + encodeURIComponent(scope.business) + ':' + scope.userId;

/** JSON turns NaN into null and keeps an absent line kind absent only if it is left off: both are normalised here. */
function forStorage(value: KeptRecipeValue): unknown {
  return {
    yield: value.yield,
    ing: value.ing.map(([name, qty, unit, kind]) => {
      const n = typeof qty === 'number' && Number.isFinite(qty) ? qty : null;
      return kind === undefined ? [name, n, unit] : [name, n, unit, kind];
    })
  };
}

export function readKeptRecipeEdits(
  scope: ProductionRecoveryScope,
  storage?: KeptStorage
): { status: 'stored' | 'empty' | 'invalid' | 'unavailable'; edits: KeptRecipeEdit[] } {
  try {
    if (!parseProductionScope(scope)) return { status: 'invalid', edits: [] };
    const raw = (storage ?? localStorage).getItem(keptRecipeKey(scope));
    if (raw === null) return { status: 'empty', edits: [] };
    if (raw.length > MAX_BYTES) return { status: 'invalid', edits: [] };
    const parsed = stored.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.scope.userId !== scope.userId ||
      parsed.data.scope.business !== scope.business
    )
      return { status: 'invalid', edits: [] };
    return {
      status: 'stored',
      edits: parsed.data.edits.map((edit) => ({
        ...edit,
        // A blank or unreadable quantity was kept as null: it comes back as it was typed, not a number.
        value: {
          yield: edit.value.yield,
          ing: edit.value.ing.map(([name, qty, unit, ...kind]) =>
            kind.length ? [name, qty ?? NaN, unit, kind[0]] : [name, qty ?? NaN, unit]
          )
        }
      }))
    };
  } catch {
    return { status: 'unavailable', edits: [] };
  }
}

/** Replaces what is kept for this scope; an empty list removes the entry. Returns whether storage holds what was asked. */
export function writeKeptRecipeEdits(
  scope: ProductionRecoveryScope,
  edits: readonly KeptRecipeEdit[],
  storage?: KeptStorage
): boolean {
  try {
    if (!parseProductionScope(scope)) return false;
    const use = storage ?? localStorage;
    if (!edits.length) {
      use.removeItem(keptRecipeKey(scope));
      return use.getItem(keptRecipeKey(scope)) === null;
    }
    const parsed = stored.safeParse({
      version: 1,
      scope: { userId: scope.userId, business: scope.business },
      edits: edits.map((edit) => ({ ...edit, value: forStorage(edit.value) }))
    });
    if (!parsed.success) return false;
    const raw = JSON.stringify(parsed.data);
    if (raw.length > MAX_BYTES) return false;
    use.setItem(keptRecipeKey(scope), raw);
    return use.getItem(keptRecipeKey(scope)) === raw;
  } catch {
    return false;
  }
}

/** The shape two edits are compared by: never the time they were written. */
export const keptRecipeFacts = (edit: Pick<KeptRecipeEdit, 'value' | 'stamp'>): string =>
  JSON.stringify([forStorage(edit.value), edit.stamp]);
