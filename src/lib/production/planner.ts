import type { LiveProductionStart } from './live-production-types';
import type { ProductionRecoveryEntry } from './recovery';
import { validProductionChoice, type ProductionPlanChoice } from './plan';

type Context = { products: LiveProductionStart['products']; entry: ProductionRecoveryEntry };
const choicesOf = (entry: ProductionRecoveryEntry): ProductionPlanChoice[] =>
  entry.choices ??
  (entry.productId
    ? [
        {
          productId: entry.productId,
          quantity: entry.quantity,
          version: entry.version,
          kind: entry.kind ?? 'batch'
        }
      ]
    : []);

/** All callbacks recheck the actor/period/entry lifetime through get(); this module never posts. */
export function productionPlanner(
  entry: ProductionRecoveryEntry | null,
  ports: {
    get: () => Context | null;
    set: (entry: ProductionRecoveryEntry) => void;
    begin: (choices: ProductionPlanChoice[]) => boolean;
  }
): NonNullable<LiveProductionStart['multi']> {
  const change = (
    edit: (rows: ProductionPlanChoice[], context: Context) => ProductionPlanChoice[]
  ) => {
    const context = ports.get();
    if (!context) return;
    ports.set({
      ...context.entry,
      choices: edit(choicesOf(context.entry), context).map((row) => {
        const product = context.products.find((p) => p.id === row.productId);
        return { ...row, name: row.name ?? product?.name, photo: row.photo ?? product?.photo };
      }),
      reviewing: false
    });
  };
  const valid = (context: Context) => {
    const rows = choicesOf(context.entry);
    return (
      rows.length > 0 &&
      new Set(rows.map((row) => row.productId)).size === rows.length &&
      rows.every((row) =>
        validProductionChoice(
          row,
          context.products.find((p) => p.id === row.productId)
        )
      )
    );
  };
  return {
    choices: entry ? choicesOf(entry) : [],
    reviewing: entry?.reviewing ?? false,
    toggle: (id) =>
      change((rows, context) => {
        if (rows.some((row) => row.productId === id))
          return rows.filter((row) => row.productId !== id);
        const product = context.products.find((p) => p.id === id);
        return product
          ? [
              ...rows,
              product.doughBalls
                ? {
                    productId: id,
                    quantity: String(product.needed || product.yield),
                    version: product.version,
                    kind: 'batch'
                  }
                : {
                    productId: id,
                    quantity: String(product.yield),
                    version: product.version,
                    kind: 'dough'
                  }
            ]
          : rows;
      }),
    setQuantity: (id, value) => {
      if (value.length <= 32)
        change((rows) =>
          rows.map((row) => (row.productId === id ? { ...row, quantity: value } : row))
        );
    },
    setKind: (id, kind) =>
      change((rows, context) =>
        rows.map((row) => {
          const product = context.products.find((p) => p.id === id);
          if (row.productId !== id || !product || row.kind === kind) return row;
          return {
            ...row,
            kind,
            batchQuantity: kind === 'dough' ? row.quantity : row.batchQuantity,
            quantity: kind === 'dough' ? String(product.yield) : (row.batchQuantity ?? '')
          };
        })
      ),
    useRecipe: (id) =>
      change((rows, context) =>
        rows.map((row) => {
          const product = context.products.find((p) => p.id === id);
          return row.productId === id && product ? { ...row, version: product.version } : row;
        })
      ),
    review: () => {
      const context = ports.get();
      if (!context || !valid(context)) return false;
      ports.set({ ...context.entry, reviewing: true });
      return true;
    },
    edit: () => {
      const context = ports.get();
      if (context) ports.set({ ...context.entry, reviewing: false });
    },
    begin: () => {
      const context = ports.get();
      return !!context?.entry.reviewing && valid(context) && ports.begin(choicesOf(context.entry));
    }
  };
}
