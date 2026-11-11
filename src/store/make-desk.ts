export interface MakeDeskDeps {
  /** Opens production entry, from either Make page. */
  startProduction: () => void;
  openDrafts: () => void;
  addProduct: () => void;
  /** True once the shop's baked counts have been read; until then a count is not shown, not even zero. */
  bakedRead: () => boolean;
  baked: (productId: string) => number;
  /** Null until the recipes have been read: "needs a recipe" is never guessed. */
  hasRecipe: (productId: string) => boolean | null;
  photo: (productId: string) => string;
}

export interface LiveMake {
  startProduction: () => void;
  openDrafts: () => void;
  addProduct: () => void;
}

export interface MakeProductFields {
  photo: string;
  /** "24 baked cookies in stock", or null until the baked counts are read. */
  bakedText: string | null;
  hasRecipe: boolean | null;
}

/** What the Make pages need beyond the engine's rows: the section's actions and each product's stock line. */
export class MakeDesk {
  constructor(private readonly deps: MakeDeskDeps) {}

  vals(): LiveMake {
    return {
      startProduction: this.deps.startProduction,
      openDrafts: this.deps.openDrafts,
      addProduct: this.deps.addProduct
    };
  }

  productFields(productId: string): MakeProductFields {
    const read = this.deps.bakedRead();
    const count = this.deps.baked(productId);
    return {
      photo: this.deps.photo(productId),
      bakedText: read ? `${count} baked ${count === 1 ? 'cookie' : 'cookies'} in stock` : null,
      hasRecipe: this.deps.hasRecipe(productId)
    };
  }
}
