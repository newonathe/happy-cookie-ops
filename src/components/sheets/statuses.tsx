import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function StatusesSheet({ v }: { v: OpsVals }) {
  const { statusList } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(statusList ?? []).map((sl2, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '9px', borderBottom: '1px solid #F2EEEB' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>{sl2.label}</span>
              <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.45' }}>{sl2.what}</span>
            </div>
          </Fragment>
        ))}
        <span style={{ fontSize: '11px', color: '#66524A' }}>
          Six statuses, matching what you confirmed. Nothing else is added behind your back.
        </span>
      </div>
    </>
  );
}
