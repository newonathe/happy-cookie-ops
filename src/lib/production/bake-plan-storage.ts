import { z } from 'zod';
import { parseProductionScope, type ProductionRecoveryScope } from './recovery';

export type BakePlanNote = Array<{ productId: string; cookies: number }>;
export type BakePlanRetention =
  'stored' | 'empty' | 'invalid' | 'unavailable' | 'unverified' | 'legacy' | 'visit';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const rows = z
  .array(
    z
      .object({
        productId: z.string().min(1).max(128),
        cookies: z.number().int().min(1).max(100000)
      })
      .strict()
  )
  .max(80)
  .refine((value) => new Set(value.map((row) => row.productId)).size === value.length);
const envelope = z
  .object({
    version: z.literal(2),
    scope: z.object({ userId: z.string(), business: z.string() }).strict(),
    rows
  })
  .strict();
export const bakePlanKey = (scope: ProductionRecoveryScope) =>
  'hc-planned-bake-v2:' + encodeURIComponent(scope.business) + ':' + scope.userId;

export function readBakePlan(
  scope: ProductionRecoveryScope | null,
  storage: Store | null
): { status: BakePlanRetention; value: BakePlanNote | null } {
  if (!parseProductionScope(scope)) return { status: 'unverified', value: null };
  if (!storage || !scope) return { status: 'unavailable', value: null };
  try {
    const raw = storage.getItem(bakePlanKey(scope));
    if (raw === null)
      return {
        status: storage.getItem('hc-planned-bake-v1') === null ? 'empty' : 'legacy',
        value: null
      };
    if (raw.length > 100000) return { status: 'invalid', value: null };
    const parsed = envelope.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.scope.userId !== scope.userId ||
      parsed.data.scope.business !== scope.business
    )
      return { status: 'invalid', value: null };
    return { status: 'stored', value: parsed.data.rows };
  } catch (error) {
    return { status: error instanceof SyntaxError ? 'invalid' : 'unavailable', value: null };
  }
}

/** A damaged copy stays untouched. An old unscoped note is never silently adopted or deleted. */
export function writeBakePlan(
  scope: ProductionRecoveryScope | null,
  value: BakePlanNote,
  storage: Store | null
): boolean {
  if (!scope || !parseProductionScope(scope) || !storage || !rows.safeParse(value).success)
    return false;
  const before = readBakePlan(scope, storage);
  if (before.status === 'invalid' || before.status === 'unavailable') return false;
  try {
    const raw = JSON.stringify({ version: 2, scope, rows: value });
    storage.setItem(bakePlanKey(scope), raw);
    return storage.getItem(bakePlanKey(scope)) === raw;
  } catch {
    return false;
  }
}

export const BAKE_PLAN_RETENTION: Record<BakePlanRetention, string> = {
  stored:
    'Saved on this device for this account and business. This is a plan; it records no stock.',
  empty: 'Plans are saved on this device for this account and business.',
  invalid:
    'Your saved plan cannot be read. It has not been overwritten. New planning can continue for this visit.',
  unavailable:
    'The saved plan is unavailable. Storage may be blocked. New planning can continue for this visit.',
  unverified: 'This plan is visit-only until your account and business are verified.',
  legacy:
    'An older note is kept on this device without an account attached. It has not been loaded or overwritten.',
  visit: 'This plan is kept for this visit only. The saved copy could not be updated.'
};
