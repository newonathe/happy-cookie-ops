import type { BatchRow, Shortfall } from '@/lib/data/production';
import type { ReactNode } from 'react';
import type { ProductionPlanChoice } from './plan';

export interface LiveProductionRecipeUpdate {
  previousVersion: number | null;
  version: number;
  previousYield: number | null;
  yield: number;
  rows: Array<{ name: string; previous: string; current: string }>;
  use: () => void;
}

export interface LiveDoughPreparation {
  id: string;
  name: string;
  photo: string;
  periodText: string;
  version: number | null;
  balls: number;
  reviewing: boolean;
  saving: boolean;
  uncertain: boolean;
  sourceChanged: boolean;
  validAmount?: boolean;
  sourceUnavailable?: boolean;
  retryRecipe?: () => void;
  readOnly?: boolean;
  connected?: boolean;
  copyReady?: boolean;
  retryCopy?: () => void;
  recipeUpdate?: LiveProductionRecipeUpdate | null;
  portions: Array<{ label: string; selected: boolean; choose: () => void }>;
  rows: Array<{ name: ReactNode; amountText: ReactNode; balanceText: string; short: boolean }>;
  review: () => void;
  back: () => void;
  confirm: () => void;
  discard: () => void;
  close: () => void;
}

/** Unconfirmed counts travel with the open batch, including blank or invalid entries. */
export interface LiveBatchCounts {
  periodText: string;
  recipeVersion: number | null;
  stock: Array<{ name: string; balance: number; unit: string }>;
  actual: string;
  rejects: string;
  valid: boolean;
  saving: boolean;
  uncertain?: boolean;
  sourceChanged?: boolean;
  sourceUnavailable?: boolean;
  retryRecipe?: () => void;
  readOnly?: boolean;
  connected?: boolean;
  copyReady?: boolean;
  retryCopy?: () => void;
  recipeUpdate?: LiveProductionRecipeUpdate | null;
  setActual: (value: string) => void;
  setRejects: (value: string) => void;
  review: () => void;
  confirm: () => void;
}

/** An unconfirmed plan; starting it never records production or changes stock. */
export interface LiveProductionStart {
  multi?: {
    choices: ProductionPlanChoice[];
    reviewing: boolean;
    toggle: (id: string) => void;
    setQuantity: (id: string, value: string) => void;
    setKind: (id: string, kind: 'batch' | 'dough') => void;
    useRecipe: (id: string) => void;
    review: () => boolean;
    edit: () => void;
    begin: () => boolean;
  };
  products: Array<{
    id: string;
    name: string;
    photo: string;
    yield: number;
    version: number;
    needed: number | null;
  }>;
  draft: { productId: string; quantity: string; version: number; kind?: 'batch' | 'dough' } | null;
  chooseKind?: (kind: 'batch' | 'dough') => void;
  resume?: boolean;
  open: () => void;
  choose: (productId: string) => void;
  setQuantity: (value: string) => void;
  cancel: () => void;
  begin: () => boolean;
}

/** Saved owner production and an unconfirmed entry point; recording stays in the existing action. */
export interface LiveProductionReceipt {
  number?: number;
  id: string;
  name: string;
  kind: 'batch' | 'dough';
  quantity: number;
  rejects: number;
  dropNo: number;
  version: number;
  at: number;
  usedDough: number;
  shortfall: Shortfall[];
  duplicate: boolean;
  stockState: 'unread' | 'loading' | 'read' | 'failed';
  inventoryReady: boolean;
  balance: number | null;
  checkedAt: number | null;
  retry: () => void;
}

export interface LiveProductionVals {
  recovery?: {
    status: import('./recovery-session').ProductionRecoveryStatus;
    retry: () => void;
    /** Present only for an unreadable copy: moves it aside so production can start again here. */
    setAside?: () => void;
    setupPeriod: string | null;
    resumeSetup: () => void;
  };
  completed?: LiveProductionReceipt[];
  inProgress?: Array<{
    id: string;
    label: string;
    productId: string;
    kind: 'batch' | 'dough';
    name: string;
    photo: string;
    quantityText: string;
    status: 'Count' | 'Review' | 'Mix' | 'Saving' | 'Check result';
    open: () => void;
  }>;
  state: 'loading' | 'read' | 'failed';
  periodText: string;
  planReady: boolean;
  saving?: boolean;
  rows: Array<BatchRow & { name: string; photo: string }>;
  refresh: () => void;
  start?: LiveProductionStart;
}
