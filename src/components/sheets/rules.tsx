import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function RulesSheet({ v }: { v: OpsVals }) {
  const { rules, schedHours, schedRows } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>Change any of these and every screen follows.</span>
        {(rules ?? []).map((ru, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', paddingBottom: '12px', borderBottom: '1px solid #F2EEEB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ flex: '1', minWidth: '0', fontSize: '14px', fontWeight: '600' }}>{ru.label}</span>
                <button onClick={ru.down} style={{ width: '44px', height: '44px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '11px', fontSize: '18px', fontWeight: '600', color: '#3A1F14' }}>
                  −
                </button>
                <input value={ru.value} onChange={ru.set} inputMode="decimal" style={{ width: '84px', height: '44px', border: '1px solid #E4DDD8', borderRadius: '11px', padding: '0 10px', fontSize: '15px', fontWeight: '600', textAlign: 'center', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
                <button onClick={ru.up} style={{ width: '44px', height: '44px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '11px', fontSize: '18px', fontWeight: '600', color: '#3A1F14' }}>
                  +
                </button>
              </div>
              <span style={{ fontSize: '11px', color: '#66524A', lineHeight: '1.5' }}>
                {ru.note}
                {' '}
                <span style={{ fontWeight: '600', color: '#3A1F14' }}>Now: {ru.valueText}</span>
              </span>
            </div>
          </Fragment>
        ))}
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#6E574B' }}>Ordering week</span>
        {(schedRows ?? []).map((sr, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{sr.label}</span>
                <span style={{ fontSize: '12px', color: '#66524A' }}>{sr.value}</span>
              </span>
              <button onClick={sr.prev} style={{ width: '44px', height: '44px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '11px', fontSize: '15px', color: '#3A1F14' }}>
                ‹
              </button>
              <button onClick={sr.next} style={{ width: '44px', height: '44px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '11px', fontSize: '15px', color: '#3A1F14' }}>
                ›
              </button>
            </div>
          </Fragment>
        ))}
        {(schedHours ?? []).map((sh2, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ flex: '1', minWidth: '0', fontSize: '14px', fontWeight: '600' }}>{sh2.label}</span>
              <button onClick={sh2.down} style={{ width: '44px', height: '44px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '11px', fontSize: '18px', fontWeight: '600', color: '#3A1F14' }}>
                −
              </button>
              <span style={{ minWidth: '84px', textAlign: 'center', fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                {sh2.valueText}
              </span>
              <button onClick={sh2.up} style={{ width: '44px', height: '44px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '11px', fontSize: '18px', fontWeight: '600', color: '#3A1F14' }}>
                +
              </button>
            </div>
          </Fragment>
        ))}
      </div>
    </>
  );
}
