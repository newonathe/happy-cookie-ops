import type { BatchRow } from '@/lib/data/production';

/** Saved production reads for the owner view; no recording or stock calculation lives here. */
export interface LiveProductionVals {
  state: 'loading' | 'read' | 'failed';
  periodText: string;
  planReady: boolean;
  rows: Array<BatchRow & { name: string; photo: string }>;
  refresh: () => void;
}
