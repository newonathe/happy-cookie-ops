import type { OpsVals } from '@/view-models/vals';

export function AddInvSheet({ v }: { v: OpsVals }) {
  const { saveAddInv, sheet } = v;
  if (!sheet) throw new Error('add-inv sheet requires active sheet data.');
  return (
    <>
      <form onSubmit={saveAddInv} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input name="iname" placeholder="Item name" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <input name="iqty" placeholder="Quantity" inputMode="decimal" style={{ flex: '1', height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
          <input name="iunit" placeholder="Unit" defaultValue="g" style={{ width: '86px', height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
        </div>
        <input name="ilevel" placeholder="Reorder level" inputMode="decimal" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
        <input name="isupplier" placeholder="Usual supplier" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
        <button type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Add to {sheet.cat}
        </button>
      </form>
    </>
  );
}
