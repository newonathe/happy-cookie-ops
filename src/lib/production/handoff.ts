import { choicesOf } from './planner';
import { validProductionChoice } from './plan';
import type { ProductionRecoveryEntry } from './recovery';
import type { LiveProductionStart } from './live-production-types';

type Proposal = NonNullable<ProductionRecoveryEntry['handoff']>;
/** Transfer intentions only. Existing actual work and frozen writes are outside this operation. */
export function productionHandoff(
  entry: ProductionRecoveryEntry | null,
  proposal: Proposal,
  products: LiveProductionStart['products'],
  dropNo: number,
  replace = false
): { entry: ProductionRecoveryEntry | null; error: string | null } {
  if (entry && entry.dropNo !== dropNo)
    return {
      entry,
      error:
        'Another drop has an unfinished production plan. Resume it in Make before adding this plan.'
    };
  if (entry?.handoff && !replace)
    return {
      entry,
      error: 'Resolve the incoming plan already kept in Make before adding another.'
    };
  if (
    !proposal.rows.length ||
    proposal.rows.length > 80 ||
    new Set(proposal.rows.map((row) => row.productId)).size !== proposal.rows.length ||
    proposal.rows.some(
      (row) =>
        !validProductionChoice(
          { ...row, kind: 'batch' },
          products.find((product) => product.id === row.productId)
        )
    )
  )
    return {
      entry,
      error:
        'A product, quantity or saved recipe changed or is unavailable. Your existing work is kept; review the source before trying again.'
    };
  const before = entry ? choicesOf(entry) : [];
  const conflict = proposal.rows.some((row) =>
    before.some(
      (old) =>
        old.productId === row.productId &&
        (old.quantity !== row.quantity || old.version !== row.version)
    )
  );
  const base: ProductionRecoveryEntry = entry ?? {
    dropNo,
    productId: '',
    quantity: '',
    version: 0,
    kind: 'batch',
    choices: []
  };
  if (conflict && !replace)
    return { entry: { ...base, handoff: structuredClone(proposal) }, error: null };
  const incoming = proposal.rows.map((row) => {
    const old = before.find((old) => old.productId === row.productId);
    if (old && old.quantity === row.quantity && old.version === row.version) return old;
    const product = products.find((product) => product.id === row.productId);
    return {
      ...row,
      kind: 'choose' as const,
      batchQuantity: row.quantity,
      name: product?.name,
      photo: product?.photo
    };
  });
  const next = {
    ...base,
    reviewing: false,
    choices: [
      ...before.filter((old) => !incoming.some((row) => row.productId === old.productId)),
      ...incoming
    ]
  };
  delete next.handoff;
  return { entry: next, error: null };
}
