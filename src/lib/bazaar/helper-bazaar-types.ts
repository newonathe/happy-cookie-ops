/**
 * S3: what a helper's Bazaar screen needs from the runtime (`liveHelperBazaar` in the view-model). Never present for the owner.
 */
export interface HelperBazaarVals {
  /** `selling`: the phone holds the day. The rest are what to say while it holds none. */
  phase: 'selling' | 'idle' | 'loading' | 'none' | 'error' | 'unavailable' | 'refused';
  online: boolean;
  dayName: string;
  join: () => void;
  close: {
    flavours: Array<{ id: string; name: string; onTable: number }>;
    submit: (input: {
      left: Record<string, number>;
      countedPesos: number | null;
    }) => Promise<string | null>;
    cancel: () => void;
  } | null;
}
