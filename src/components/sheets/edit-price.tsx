import type { OpsVals } from '@/view-models/vals';

export function EditPriceSheet({ v }: { v: OpsVals }) {
  const { savePrice, sheet } = v;
  if (!sheet) throw new Error('edit-price sheet requires active sheet data.');
  return (
    <>
      <form onSubmit={savePrice} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>New price</span>
          <input name="pval" defaultValue={sheet.qty} inputMode="decimal" style={{ height: '52px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
        </label>
        <span style={{ fontSize: '12px', color: '#66524A' }}>Applies to new orders only.</span>
        <button type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Save price
        </button>
      </form>
    </>
  );
}
