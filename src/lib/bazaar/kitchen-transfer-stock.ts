import type { BazaarDay } from '@/lib/data/bazaar-days';

/** Update only the cumulative incoming delta. Never overwrite locally queued
 * sales with the server's remaining count, or apply an old receipt's quantity. */
export function kitchenTransferStock(
  day: BazaarDay,
  loaded: Readonly<Record<string, number>>,
  stock: Readonly<Record<string, number>>
): { eventLoaded: Record<string, number>; eventStock: Record<string, number> } | null {
  const nextLoaded = { ...loaded },
    nextStock = { ...stock };
  for (const line of day.lines) {
    const before = loaded[line.productId],
      remaining = stock[line.productId];
    const incoming = line.made + line.carried;
    if (
      !Number.isSafeInteger(before) ||
      !Number.isSafeInteger(remaining) ||
      before < 0 ||
      remaining < 0 ||
      !Number.isSafeInteger(incoming) ||
      incoming < before
    )
      return null;
    nextLoaded[line.productId] = incoming;
    nextStock[line.productId] = remaining + incoming - before;
  }
  return { eventLoaded: nextLoaded, eventStock: nextStock };
}
