import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';

export function ProductsScreen({ v }: { v: OpsVals }) {
  const { cols2, productRows } = v;
  return (
    <>
      <div data-screen-label="Products" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B' }}>New prices apply to new orders only.</span>
        <div style={s(`display: grid; grid-template-columns: ${cols2}; gap: 10px`)}>
          {(productRows ?? []).map((p, $index) => (
            <Fragment key={$index}>
              <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', padding: '13px', display: 'flex', flexDirection: 'column', gap: '11px', background: '#FFFFFF' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
                  <span style={s(p.imgStyle)} />
                  <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '600' }}>{p.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {p.rotating ? (
                        <>
                          <span style={{ background: '#EEF4FE', color: '#24487F', border: '1px solid #CFE0FB', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', fontWeight: '600' }}>
                            Rotating
                          </span>
                        </>
                      ) : null}
                      {p.tag ? (
                        <>
                          <span style={{ background: '#FFF5E5', color: '#95600A', border: '1px solid #F0E2CB', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', fontWeight: '600' }}>
                            {p.tag}
                          </span>
                        </>
                      ) : null}
                      {p.soldOut ? (
                        <>
                          <span style={{ background: '#F4F1EE', color: '#5D4B41', border: '1px solid #E4DDD8', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', fontWeight: '600' }}>
                            Sold out
                          </span>
                        </>
                      ) : null}
                      {p.offForm ? (
                        <>
                          <span style={{ background: '#FCECEA', color: '#A8231B', border: '1px solid #F2CFCB', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', fontWeight: '600' }}>
                            Off the order form
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '16px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{p.priceText}</span>
                    <span style={{ fontSize: '11px', color: '#66524A' }}>{p.costText}</span>
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.5' }}>{p.desc}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={p.edit} style={{ flex: '1', minHeight: '42px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600' }}>
                    Edit price
                  </button>
                  <button onClick={p.goRecipe} style={{ flex: '1', minHeight: '42px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600' }}>
                    Recipe
                  </button>
                  <button onClick={p.toggleOnForm} aria-label={p.formLabel} title={p.formLabel} style={s(p.formBtnStyle)}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={p.formIcon} />
                    </svg>
                  </button>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
