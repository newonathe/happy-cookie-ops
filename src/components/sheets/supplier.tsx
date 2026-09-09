import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function SupplierSheet({ v }: { v: OpsVals }) {
  const { canPickSupplier } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(canPickSupplier ?? []).map((cs, $index) => (
          <Fragment key={$index}>
            <button onClick={cs.pick} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', minHeight: '58px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '13px', padding: '11px 13px' }}>
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{cs.name}</span>
                <span style={{ fontSize: '12px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
                  {cs.price} · {cs.when}
                </span>
              </span>
              {cs.best ? (
                <>
                  <span style={{ background: '#E8F5EE', color: '#1B7A4B', border: '1px solid #C6E5D5', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600' }}>
                    Cheapest
                  </span>
                </>
              ) : null}
            </button>
          </Fragment>
        ))}
      </div>
    </>
  );
}
