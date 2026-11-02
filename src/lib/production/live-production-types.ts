import type { BatchRow } from '@/lib/data/production';

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
  rows: Array<BatchRow & { name: string; photo: string }>;
  refresh: () => void;
  start?: LiveProductionStart;
}
