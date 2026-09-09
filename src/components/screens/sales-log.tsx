import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function SalesLogScreen({ v }: { v: OpsVals }) {
  const { salesLog } = v;
  return (
    <>
      <div data-screen-label="Sales log" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '30px', fontWeight: '600', letterSpacing: '-.8px' }}>{salesLog.countNum}</span>
          <span style={{ fontSize: '15px', color: '#6E574B' }}>{salesLog.unit}</span>
        </div>
        {salesLog.empty ? (
          <>
            <span style={{ fontSize: '14px', color: '#6E574B' }}>No sales recorded yet.</span>
          </>
        ) : null}
        {(salesLog.rows ?? []).map((sr, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '52px', borderBottom: '1px solid #F5F2F0' }}>
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', lineHeight: '1.35', overflowWrap: 'anywhere' }}>{sr.what}</span>
                <span style={{ fontSize: '11px', color: '#66524A' }}>{sr.when}</span>
              </span>
              <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', flexShrink: '0' }}>
                {sr.amount}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </>
  );
}
