import { z } from 'zod';
import type { ProductionClient, ProductionFields, ProductionResult } from './production';

const preparation = z
  .object({
    id: z.uuid().regex(/^[0-9a-f-]+$/),
    kind: z.literal('dough'),
    productId: z.string().min(1).max(128),
    qty: z.number().int().min(1).max(10000),
    recipeAmount: z.union([z.literal(0.5), z.literal(1)]),
    target: z.null(),
    rejects: z.literal(0),
    adj: z.record(z.string(), z.number()).refine((value) => Object.keys(value).length === 0),
    recipeVersion: z.number().int().min(1).max(2147483647),
    dropNo: z.number().int().min(0).max(100000),
    at: z.number().int().min(100_000_000_000).max(99_999_999_999_999)
  })
  .strict();
const answer = z
  .array(
    z
      .object({
        record_id: z.uuid(),
        duplicate: z.boolean(),
        shortfall: z
          .array(
            z
              .object({
                name: z.string().min(1).max(10000),
                by: z.number().finite().positive(),
                unit: z.string().min(1).max(64),
                why: z.string().max(128).optional()
              })
              .strict()
          )
          .max(500)
      })
      .strict()
  )
  .length(1);
const failure = (outcome: 'refused' | 'stale' | 'offline'): ProductionResult => ({
  outcome,
  duplicate: false,
  usedDough: 0,
  shortfall: []
});

/** Only explicitly versioned preparations use SQL71. Legacy unanswered requests keep their RPC. */
export async function recordDoughPreparation(
  client: ProductionClient,
  fields: ProductionFields
): Promise<ProductionResult> {
  const parsed = preparation.safeParse(fields);
  if (!parsed.success) return failure('refused');
  const f = parsed.data;
  try {
    const { data, error } = await client.rpc('record_dough_preparation', {
      p_rec: {
        id: f.id,
        product_id: f.productId,
        recipe_version: f.recipeVersion,
        recipe_amount: f.recipeAmount,
        balls: f.qty,
        drop_no: f.dropNo,
        at: f.at
      }
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883')
        return { ...failure('refused'), problem: 'preparation-update' };
      return failure(
        error.code === 'P0002'
          ? 'stale'
          : ['22023', '23505', '42501', '23503'].includes(error.code ?? '')
            ? 'refused'
            : 'offline'
      );
    }
    const result = answer.safeParse(data);
    if (!result.success || result.data[0].record_id !== f.id) return failure('offline');
    return {
      outcome: 'saved',
      duplicate: result.data[0].duplicate,
      usedDough: 0,
      shortfall: result.data[0].shortfall
    };
  } catch {
    return failure('offline');
  }
}
