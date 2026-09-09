import type { OpsVals } from '@/view-models/vals';

export function CloseDropSheet({ v }: { v: OpsVals }) {
  const { closeDropConfirm, closeSheet } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>Stops new orders. You can reopen it.</span>
        <button onClick={closeDropConfirm} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#A8231B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Close Drop 32 now
        </button>
        <button onClick={closeSheet} style={{ minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
          Keep it open
        </button>
      </div>
    </>
  );
}
