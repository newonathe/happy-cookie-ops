import type { OpsVals } from '@/view-models/vals';

export function NoShowSheet({ v }: { v: OpsVals }) {
  const { closeSheet, confirmNoShow, sheetName } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
          {sheetName} stays marked as paid — you keep the money. The cookies go back into baked stock so you can sell them at the next bazaar.
        </span>
        <button onClick={confirmNoShow} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#3A1F14', color: '#FFF5E5', fontSize: '14px', fontWeight: '600' }}>
          Mark as no-show
        </button>
        <button onClick={closeSheet} style={{ minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
          Still waiting
        </button>
      </div>
    </>
  );
}
