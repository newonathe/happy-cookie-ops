type ProductLabel = { short: string };

/**
 * The locked view requires a name for every sale item, even while the live catalogue loads.
 * Supply missing names for this synchronous read only. Never add a sellable product or price,
 * alter a sale, or leave a fallback in the shared catalogue lookup after rendering.
 */
export function renderWithSaleLabels<T>(
  sales: ReadonlyArray<{ items: Readonly<Record<string, unknown>> }>,
  lookup: Record<string, ProductLabel | undefined>,
  render: () => T
): T {
  const restore = new Map<string, PropertyDescriptor | undefined>();
  try {
    for (const sale of sales) {
      for (const id of Object.keys(sale.items)) {
        if (Object.hasOwn(lookup, id) && typeof lookup[id]?.short === 'string') continue;
        if (!restore.has(id)) restore.set(id, Object.getOwnPropertyDescriptor(lookup, id));
        Object.defineProperty(lookup, id, {
          value: { short: 'Product unavailable' },
          configurable: true,
          enumerable: true,
          writable: true
        });
      }
    }
    return render();
  } finally {
    for (const [id, descriptor] of restore) {
      if (descriptor) Object.defineProperty(lookup, id, descriptor);
      else delete lookup[id];
    }
  }
}
