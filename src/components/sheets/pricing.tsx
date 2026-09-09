import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function PricingSheet({ v }: { v: OpsVals }) {
  const { priceModePreview, priceModes, publishPriceMode } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
          This one is not settled yet, so nothing is hardcoded. Pick a rule, check the preview, then publish it.
        </span>
        {(priceModes ?? []).map((pmo, $index) => (
          <Fragment key={$index}>
            <button onClick={pmo.pick} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', minHeight: '52px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontWeight: '500' }}>
              {pmo.on ? (
                <>
                  <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '12px', animation: 'hcFade .18s ease-out' }} />
                </>
              ) : null}
              <span style={{ position: 'relative' }}>{pmo.label}</span>
            </button>
          </Fragment>
        ))}
        <div style={{ background: '#F8F6F4', borderRadius: '13px', padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#6E574B' }}>Preview · six cookies</span>
          <span style={{ fontSize: '12px', color: '#66524A' }}>{priceModePreview.items}</span>
          <span style={{ fontSize: '22px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.5px' }}>
            {priceModePreview.total}
          </span>
        </div>
        <button onClick={publishPriceMode} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Publish this rule
        </button>
        <span style={{ fontSize: '11px', color: '#66524A', textAlign: 'center' }}>
          Customers see the new total straight away. Past orders keep theirs.
        </span>
      </div>
    </>
  );
}
