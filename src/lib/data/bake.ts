import { z } from 'zod';
import type { ProductionClient, ProductionFields, ProductionResult } from './production';

const request = z
  .object({
    id: z.uuid().regex(/^[0-9a-f-]+$/),
    kind: z.literal('batch'),
    doughOnly: z.literal(true),
    productId: z.string().min(1).max(128),
    qty: z.number().int().min(1).max(10000),
    target: z.number().int().min(0).max(10000),
    rejects: z.number().int().min(0).max(10000),
    adj: z.record(z.string(), z.number()).refine((value) => Object.keys(value).length === 0),
    recipeVersion: z.number().int().min(1).max(2147483647),
    dropNo: z.number().int().min(0).max(100000),
    at: z.number().int().min(100_000_000_000).max(99_999_999_999_999)
  })
  .strict()
  .refine((f) => f.rejects <= f.qty);
const answer = z
  .array(
    z
      .object({
        record_id: z.uuid(),
        duplicate: z.boolean(),
        used_dough: z.number().int().min(1).max(10000),
        shortfall: z.array(z.never()).length(0)
      })
      .strict()
  )
  .length(1);
const failure = (
  outcome: 'refused' | 'stale' | 'offline',
  problem?: ProductionResult['problem']
): ProductionResult => ({
  outcome,
  duplicate: false,
  usedDough: 0,
  shortfall: [],
  ...(problem ? { problem } : {})
});

/** No fallback: a new bake can consume only previously recorded dough. */
export async function recordBake(
  client: ProductionClient,
  fields: ProductionFields
): Promise<ProductionResult> {
  const parsed = request.safeParse(fields);
  if (!parsed.success) return failure('refused');
  const f = parsed.data;
  try {
    const { data, error } = await client.rpc('record_bake', {
      p_rec: {
        id: f.id,
        product_id: f.productId,
        qty: f.qty,
        target: f.target,
        rejects: f.rejects,
        recipe_version: f.recipeVersion,
        drop_no: f.dropNo,
        at: f.at
      }
    });
    if (error) {
      if (['PGRST202', '42883'].includes(error.code ?? ''))
        return failure('refused', 'bake-update');
      if (error.code === 'ZD001') return failure('refused', 'dough-shortage');
      if (error.code === 'ZD002') return failure('refused', 'dough-chronology');
      return failure(
        error.code === 'P0002'
          ? 'stale'
          : ['22023', '23505', '42501', '23503'].includes(error.code ?? '')
            ? 'refused'
            : 'offline'
      );
    }
    const result = answer.safeParse(data);
    if (!result.success || result.data[0].record_id !== f.id || result.data[0].used_dough !== f.qty)
      return failure('offline');
    return {
      outcome: 'saved',
      duplicate: result.data[0].duplicate,
      usedDough: result.data[0].used_dough,
      shortfall: []
    };
  } catch {
    return failure('offline');
  }
}
