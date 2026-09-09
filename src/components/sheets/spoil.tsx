import type { OpsVals } from '@/view-models/vals';

export function SpoilSheet({ v }: { v: OpsVals }) {
  const { saveSpoil } = v;
  return (
    <>
      <form onSubmit={saveSpoil} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
          Write off what went bad. It comes off your stock and is booked as waste, so your cost per cookie stays honest.
        </span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>How much</span>
          <input name="sqty" inputMode="decimal" placeholder="0" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontVariantNumeric: 'tabular-nums' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>What happened</span>
          <input name="swhy" placeholder="Past its date, left out, dropped" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '14px' }} />
        </label>
        <button type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Write it off
        </button>
      </form>
    </>
  );
}
