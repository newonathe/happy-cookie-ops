import type { OpsVals } from '@/view-models/vals';

export function ProofSheet({ v }: { v: OpsVals }) {
  const { ic, od } = v;
  if (!od) throw new Error('proof sheet requires active order data.');
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ height: '220px', borderRadius: '14px', background: '#F4F1EE', border: '1px solid #E7E1DC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#66524A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={ic.doc} />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Customer's payment screenshot</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 6px', fontSize: '11px', color: '#66524A' }}>
            <span style={{ whiteSpace: 'nowrap' }}>{od.pay}</span>
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>· {od.ref}</span>
          </span>
        </div>
        {od.warn ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#FCECEA', border: '1px solid #F2CFCB', borderRadius: '12px', padding: '11px' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#A8231B" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
                <path d={ic.alert} />
              </svg>
              <span style={{ fontSize: '12px', color: '#8E1F18', lineHeight: '1.45' }}>{od.warn}</span>
            </div>
          </>
        ) : null}
        <button onClick={od.confirm} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#1B7A4B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Confirm payment
        </button>
        <button onClick={od.askClearer} style={{ minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
          Ask for a clearer one
        </button>
      </div>
    </>
  );
}
