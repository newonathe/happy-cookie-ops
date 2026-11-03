import type { BatchRow } from '@/lib/data/production';

/** Unconfirmed counts travel with the open batch, including blank or invalid entries. */
export interface LiveBatchCounts {
  periodText: string;
  recipeVersion: number | null;
  stock: Array<{ name: string; balance: number; unit: string }>;
  actual: string;
  rejects: string;
  valid: boolean;
  saving: boolean;
  setActual: (value: string) => void;
  setRejects: (value: string) => void;
  review: () => void;
  confirm: () => void;
}

/** An unconfirmed plan; starting it never records production or changes stock. */
export interface LiveProductionStart {
  products: Array<{
    id: string;
    name: string;
    photo: string;
    yield: number;
    version: number;
    needed: number | null;
  }>;
  draft: { productId: string; quantity: string; version: number } | null;
  resume?: boolean;
  open: () => void;
  choose: (productId: string) => void;
  setQuantity: (value: string) => void;
  cancel: () => void;
  begin: () => boolean;
}

/** Saved owner production and an unconfirmed entry point; recording stays in the existing action. */
export interface LiveProductionVals {
  state: 'loading' | 'read' | 'failed';
  periodText: string;
  planReady: boolean;
  saving?: boolean;
  rows: Array<BatchRow & { name: string; photo: string }>;
  refresh: () => void;
  start?: LiveProductionStart;
}
