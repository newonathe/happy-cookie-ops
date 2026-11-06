/** One product in an unsubmitted multi-product production plan. */
export interface ProductionPlanChoice {
  productId: string;
  name?: string;
  photo?: string;
  quantity: string;
  version: number;
  kind: 'batch' | 'dough' | 'choose';
  batchQuantity?: string;
}

export function validProductionChoice(
  choice: ProductionPlanChoice,
  product?: { version: number; yield: number }
): boolean {
  if (choice.kind !== 'batch' && choice.kind !== 'dough') return false;
  if (!product || choice.version !== product.version || !/^\d+$/.test(choice.quantity))
    return false;
  const quantity = Number(choice.quantity);
  return (
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 10000 &&
    (choice.kind === 'batch' ||
      quantity === product.yield ||
      quantity === Math.ceil(product.yield / 2))
  );
}
