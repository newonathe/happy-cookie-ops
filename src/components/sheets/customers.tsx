import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function CustomersSheet({ v }: { v: OpsVals }) {
  const { customers, waitlist } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700' }}>Ordering now</span>
          {(customers ?? []).map((cu, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '46px', borderBottom: '1px solid #F5F2F0' }}>
                <span style={{ flex: '1', minWidth: '0', fontSize: '14px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cu.name}
                </span>
                <span style={{ fontSize: '12px', color: '#8A7062', fontVariantNumeric: 'tabular-nums', flexShrink: '0' }}>
                  {cu.count}
                </span>
              </div>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700' }}>Waiting for the next drop</span>
          {(waitlist ?? []).map((wl, $index) => (
            <Fragment key={$index}>
              <button onClick={wl.go} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', minHeight: '46px', border: '0', borderBottom: '1px solid #F5F2F0', background: 'transparent', padding: '0' }}>
                <span style={{ flex: '1', minWidth: '0', fontSize: '14px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {wl.name}
                </span>
                {wl.contacted ? (
                  <>
                    <span style={{ fontSize: '12px', color: '#1B7A4B', fontWeight: '600', flexShrink: '0' }}>
                      Told · tap to clear
                    </span>
                  </>
                ) : null}
                {wl.notContacted ? (
                  <>
                    <span style={{ fontSize: '12px', color: '#C24A15', fontWeight: '600', flexShrink: '0' }}>Tell them</span>
                  </>
                ) : null}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
