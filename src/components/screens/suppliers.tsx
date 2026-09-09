import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';

export function SuppliersScreen({ v }: { v: OpsVals }) {
  const { clearSupQ, cols2, hasSupQ, ic, setSupQ, supQ, supplier, supplierTabs } = v;
  return (
    <>
      <div data-screen-label="Suppliers" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B' }}>Prices you have actually paid.</span>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {(supplierTabs ?? []).map((st, $index) => (
            <Fragment key={$index}>
              <button onClick={st.go} style={{ position: 'relative', minHeight: '44px', padding: '0 13px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: '0' }}>
                {st.active ? (
                  <>
                    <span style={{ position: 'absolute', inset: '-1px', border: '1.5px solid #E75F23', background: '#FDEDE5', borderRadius: '10px', animation: 'hcFade .18s ease-out' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative' }}>{st.label}</span>
              </button>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ flex: '1', minWidth: '0', display: 'flex', alignItems: 'center', gap: '8px', height: '44px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '12px', padding: '0 12px' }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8A7062" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
              <path d={ic.search} />
            </svg>
            <input value={supQ} onChange={setSupQ} placeholder="Search items at this supplier" style={{ flex: '1', minWidth: '0', height: '100%', border: '0', background: 'transparent', fontSize: '13px', outline: 'none' }} />
          </span>
          {hasSupQ ? (
            <>
              <button onClick={clearSupQ} style={{ minHeight: '44px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', flexShrink: '0' }}>
                Clear
              </button>
            </>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-.3px' }}>{supplier.name}</span>
          <span style={{ fontSize: '12px', color: '#66524A' }}>{supplier.place} · {supplier.countText}</span>
        </div>
        <div style={s(`display: grid; grid-template-columns: ${cols2}; gap: 10px`)}>
          {(supplier.items ?? []).map((si, $index) => (
            <Fragment key={$index}>
              <div style={{ border: '1px solid #EDE8E4', borderRadius: '14px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ flex: '1', minWidth: '0', fontSize: '14px', fontWeight: '600' }}>{si.item}</span>
                  {si.best ? (
                    <>
                      <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#1B7A4B' }}>
                        {si.priceText}
                      </span>
                    </>
                  ) : null}
                  {si.notBest ? (
                    <>
                      <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {si.priceText}
                      </span>
                    </>
                  ) : null}
                </div>
                <span style={{ fontSize: '12px', color: '#6E574B' }}>{si.pack} · {si.last}</span>
                <span style={{ fontSize: '11px', color: '#66524A' }}>{si.prevText}</span>
                {si.best ? (
                  <>
                    <span style={{ alignSelf: 'flex-start', background: '#E8F5EE', color: '#1B7A4B', border: '1px solid #C6E5D5', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', fontWeight: '600' }}>
                      Cheapest you have paid
                    </span>
                  </>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
