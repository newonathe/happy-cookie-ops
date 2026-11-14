type ProductLabel = { short: string };

/**
 * The locked view requires a name for every id it looks up (each sale item, and each product a production variance
 * names), even while the live catalogue loads. Supply placeholder names for those ids for this synchronous read
 * only. Never add a sellable product or price, alter a sale or variance, or leave a fallback in the shared
 * catalogue lookup after rendering.
 */
export function renderWithSaleLabels<T>(
  sales: ReadonlyArray<{ items: Readonly<Record<string, unknown>> }>,
  lookup: Record<string, ProductLabel | undefined>,
  render: () => T,
  extraIds: ReadonlyArray<string> = []
): T {
  const restore = new Map<string, PropertyDescriptor | undefined>();
  const lend = (id: string) => {
    if (Object.hasOwn(lookup, id) && typeof lookup[id]?.short === 'string') return;
    if (!restore.has(id)) restore.set(id, Object.getOwnPropertyDescriptor(lookup, id));
    Object.defineProperty(lookup, id, {
      value: { short: 'Product unavailable' },
      configurable: true,
      enumerable: true,
      writable: true
    });
  };
  try {
    for (const sale of sales) for (const id of Object.keys(sale.items)) lend(id);
    for (const id of extraIds) lend(id);
    return render();
  } finally {
    for (const [id, descriptor] of restore) {
      if (descriptor) Object.defineProperty(lookup, id, descriptor);
      else delete lookup[id];
    }
  }
}
