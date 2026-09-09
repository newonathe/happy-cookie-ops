import type { OpsVals } from '@/view-models/vals';

export function DrawSheet({ v }: { v: OpsVals }) {
  const { saveDraw } = v;
  return (
    <>
      <form onSubmit={saveDraw} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
          Money you take out for yourself is not a business expense. Recording it here keeps your profit figure true and still shows you what you have drawn.
        </span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Amount</span>
          <input name="damount" inputMode="decimal" placeholder="0" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontVariantNumeric: 'tabular-nums' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Note</span>
          <input name="dnote" placeholder="Personal transfer" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '14px' }} />
        </label>
        <button type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#3A1F14', color: '#FFF5E5', fontSize: '14px', fontWeight: '600' }}>
          Record the draw
        </button>
      </form>
    </>
  );
}
