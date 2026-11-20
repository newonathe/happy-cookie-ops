'use client';

import type { OpsVals } from '@/view-models/vals';
import { CafePage } from './cafe-page';

/** The live Café screen: the page, with no ported screen behind it (there is none in the demo). */
export function CafeScreen({ v }: { v: OpsVals }) {
  void v;
  return <CafePage />;
}
