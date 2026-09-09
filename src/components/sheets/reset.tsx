import type { OpsVals } from '@/view-models/vals';

export function ResetSheet({ v }: { v: OpsVals }) {
  const { closeSheet, confirmReset } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
          Everything on this device goes back to the sample books. No undo.
        </span>
        <button onClick={confirmReset} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#A8231B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Wipe and start over
        </button>
        <button onClick={closeSheet} style={{ minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
          Keep my data
        </button>
      </div>
    </>
  );
}
