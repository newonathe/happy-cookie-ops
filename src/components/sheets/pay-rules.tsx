import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function PayRulesSheet({ v }: { v: OpsVals }) {
  const { ic, payChannels } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#E8F5EE', border: '1px solid #C6E5D5', borderRadius: '12px', padding: '11px 12px' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#1B7A4B" strokeWidth="1.9" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
            <path d={ic.check} />
          </svg>
          <span style={{ fontSize: '12px', color: '#14603A', lineHeight: '1.45' }}>
            Proof is required before a customer can submit, and you confirm every payment by hand. Nothing reserves capacity until you do.
          </span>
        </div>
        {(payChannels ?? []).map((pc, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid #F2EEEB' }}>
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{pc.label}</span>
                <span style={{ fontSize: '12px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                  {pc.num} · {pc.holder}
                </span>
              </span>
            </div>
          </Fragment>
        ))}
        <span style={{ fontSize: '11px', color: '#66524A' }}>These are the numbers customers see at checkout.</span>
      </div>
    </>
  );
}
