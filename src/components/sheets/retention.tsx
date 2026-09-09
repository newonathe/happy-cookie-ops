import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function RetentionSheet({ v }: { v: OpsVals }) {
  const { retentionOptions } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B' }}>Only contact details. Sales records are always kept.</span>
        {(retentionOptions ?? []).map((ro, $index) => (
          <Fragment key={$index}>
            <button onClick={ro.pick} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', minHeight: '52px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontWeight: '500' }}>
              {ro.on ? (
                <>
                  <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '12px' }} />
                </>
              ) : null}
              <span style={{ position: 'relative' }}>{ro.label}</span>
            </button>
          </Fragment>
        ))}
      </div>
    </>
  );
}
