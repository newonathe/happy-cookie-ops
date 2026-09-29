import * as engine from '@/store/engine/ops-engine';
import {
  engineBestBuy,
  enginePackSizes,
  engineSuppliers,
  type EngineSupplier,
  type StockCatalogue
} from '@/lib/data/stock-catalogue';

/**
 * A3: the ported inventory, grocery, suppliers and cost screens read `SUPPLIERS`, `PACK_SIZE`, `BEST_BUY` and
 * `OPTIONS_FOR` as module constants inside the protected engine, so nothing a runtime can put in state reaches them.
 * The engine file stays byte-for-byte as it was: these exported objects are refilled in place instead (`OPTIONS_FOR`
 * reads `SUPPLIERS` when it is called, so it follows). Demo mode gets the prototype's own values back; live mode
 * shows only what the owner entered. This is shared module state, so exactly one runtime may drive it at a time,
 * which is how the app runs (one engine per page).
 */
interface EngineBook {
  SUPPLIERS: EngineSupplier[];
  PACK_SIZE: Record<string, number>;
  BEST_BUY: Record<string, { price: number; pack: string; supplier: string }>;
}
const book = engine as unknown as EngineBook;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Captured when this module first loads, before anything can refill the constants. */
const demo = {
  suppliers: clone(book.SUPPLIERS),
  packSize: clone(book.PACK_SIZE),
  bestBuy: clone(book.BEST_BUY)
};

/**
 * `adminVals` reads `SUPPLIERS[0].name` unconditionally, so the list is never empty: with no supplier entered yet
 * the suppliers screen shows this one tab, saying where to add one.
 */
export const NO_SUPPLIERS: EngineSupplier = {
  name: 'No suppliers yet',
  place: 'Add one under All tools › Suppliers & prices',
  items: []
};

function fill(
  suppliers: EngineSupplier[],
  packSize: Record<string, number>,
  bestBuy: EngineBook['BEST_BUY']
) {
  book.SUPPLIERS.length = 0;
  book.SUPPLIERS.push(...clone(suppliers));
  for (const k of Object.keys(book.PACK_SIZE)) delete book.PACK_SIZE[k];
  Object.assign(book.PACK_SIZE, packSize);
  for (const k of Object.keys(book.BEST_BUY)) delete book.BEST_BUY[k];
  Object.assign(book.BEST_BUY, bestBuy);
}

/** The prototype's own suppliers, pack sizes and best buys (demo mode). */
export function fillDemoCatalogue(): void {
  fill(demo.suppliers, demo.packSize, demo.bestBuy);
}

/** Live mode: the owner's catalogue, or nothing yet (null) until it has been read. */
export function fillLiveCatalogue(c: StockCatalogue | null): void {
  const suppliers = c ? engineSuppliers(c) : [];
  fill(
    suppliers.length ? suppliers : [NO_SUPPLIERS],
    c ? enginePackSizes(c) : {},
    engineBestBuy(suppliers)
  );
}

/** The name of the tab the suppliers screen should open on. */
export function firstSupplierName(): string {
  return book.SUPPLIERS[0]?.name ?? NO_SUPPLIERS.name;
}

/** The suppliers now in the engine, for tests. */
export function currentSuppliers(): readonly EngineSupplier[] {
  return book.SUPPLIERS;
}
