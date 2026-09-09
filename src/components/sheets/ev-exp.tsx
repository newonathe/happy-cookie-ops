import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function EvExpSheet({ v }: { v: OpsVals }) {
  const { catOptions, saveEvExp } = v;
  return (
    <>
      <form onSubmit={saveEvExp} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input name="xlabel" placeholder="What was it?" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
        <input name="xamount" placeholder="Amount" inputMode="decimal" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
        <select name="xcat" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 11px', fontSize: '14px', background: '#FFFFFF' }}>
          {(catOptions ?? []).map((co2, $index) => (
            <Fragment key={$index}>
              <option value={co2}>{co2}</option>
            </Fragment>
          ))}
        </select>
        <button type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Add expense
        </button>
      </form>
    </>
  );
}
