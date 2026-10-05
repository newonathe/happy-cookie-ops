import { z } from 'zod';
import type { RecipeClient } from '@/lib/data/recipes';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';

export interface RecipeDraft {
  productId: string;
  yield: number;
  sourceText: string;
  updatedAt: string;
}

const draftSchema = z
  .object({
    product_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    yield: z.number().int().min(1).max(10000),
    source_text: z
      .string()
      .max(16000)
      .refine((value) => value.trim().length > 0 && !value.includes('\0')),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict();

const saveSchema = z
  .object({
    productId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    yield: z.number().int().min(1).max(10000),
    sourceText: z
      .string()
      .max(16000)
      .refine((value) => value.trim().length > 0 && !value.includes('\0')),
    expectedUpdatedAt: z.string().min(1).nullable()
  })
  .strict();

/** Reject the whole answer if any row is malformed or names a product outside this menu. */
export function parseRecipeDrafts(
  value: unknown,
  productIds: readonly string[]
): RecipeDraft[] | null {
  if (!Array.isArray(value)) return null;
  const allowed = new Set(productIds);
  const rows: RecipeDraft[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const parsed = draftSchema.safeParse(item);
    if (!parsed.success || !allowed.has(parsed.data.product_id) || seen.has(parsed.data.product_id))
      return null;
    seen.add(parsed.data.product_id);
    rows.push({
      productId: parsed.data.product_id,
      yield: parsed.data.yield,
      sourceText: parsed.data.source_text,
      updatedAt: parsed.data.updated_at
    });
  }
  return rows;
}

export async function fetchRecipeDrafts(
  client: RecipeClient,
  productIds: readonly string[]
): Promise<RecipeDraft[]> {
  const { data, error } = await client.rpc('get_recipe_drafts');
  if (error) throw new Error('Recipe drafts could not be read.');
  const rows = parseRecipeDrafts(data, productIds);
  if (!rows) throw new Error('Recipe drafts response was not understood.');
  return rows;
}

export async function saveRecipeDraft(
  client: RecipeClient,
  productIds: readonly string[],
  input: unknown
): Promise<{ outcome: SaveOutcome; updatedAt: string | null; error?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success || !productIds.includes(parsed.data.productId))
    return { outcome: 'refused', updatedAt: null, error: 'Check the batch size and recipe text.' };
  try {
    const fields = parsed.data;
    const { data, error } = await client.rpc('save_recipe_draft', {
      p_product_id: fields.productId,
      p_yield: fields.yield,
      p_source_text: fields.sourceText,
      p_expected_updated_at: fields.expectedUpdatedAt as string
    });
    const outcome = classifySaveError(error);
    const row = Array.isArray(data) ? data[0] : null;
    if (
      outcome === 'saved' &&
      row &&
      z.string().datetime({ offset: true }).safeParse(row.updated_at).success
    )
      return { outcome, updatedAt: row.updated_at };
    if (outcome === 'saved')
      return {
        outcome: 'offline',
        updatedAt: null,
        error: 'The save answer was incomplete. Your draft is still open.'
      };
    return { outcome, updatedAt: null };
  } catch {
    return { outcome: 'offline', updatedAt: null };
  }
}
