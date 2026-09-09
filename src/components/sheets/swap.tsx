import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';

export function SwapSheet({ v }: { v: OpsVals }) {
  const { swapIntro, swapOptions } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>{swapIntro}</span>
        {(swapOptions ?? []).map((so, $index) => (
          <Fragment key={$index}>
            <button onClick={so.go} style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', minHeight: '60px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '13px', padding: '9px 12px' }}>
              <span style={s(so.imgStyle)} />
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{so.name}</span>
                <span style={{ fontSize: '11px', color: '#66524A' }}>{so.stockText}</span>
              </span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                {so.deltaText}
              </span>
            </button>
          </Fragment>
        ))}
        <span style={{ fontSize: '11px', color: '#66524A', lineHeight: '1.5' }}>
          Agree it with the customer first. Any price difference shows as a balance.
        </span>
      </div>
    </>
  );
}
