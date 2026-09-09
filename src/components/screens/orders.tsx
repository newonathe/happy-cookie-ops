import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function OrdersScreen({ v }: { v: OpsVals }) {
  const {
      clearOrderQ, flavourTally, flavourTallyTotal, hasOrderQ, ic, od, orderEmpty, orderFilters,
      orderList, orderQ, reviewCountText, reviewDetail, reviewHasWork, setOrderQ, split, splitCols
  } = v;
  return (
    <>
      <div data-screen-label="Orders" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {reviewHasWork ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', border: '1px solid #EFDCB5', background: '#FDF3E2', borderRadius: '14px', padding: '12px 14px' }}>
              <span style={{ width: '7px', height: '7px', marginTop: '6px', borderRadius: '999px', background: '#C98A12', flexShrink: '0' }} />
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#7A4E08' }}>{reviewCountText}</span>
                <span style={{ fontSize: '12px', color: '#8A5B10', lineHeight: '1.45', textWrap: 'pretty' }}>{reviewDetail}</span>
              </span>
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ flex: '1', minWidth: '0', display: 'flex', alignItems: 'center', gap: '8px', height: '44px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '12px', padding: '0 12px' }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8A7062" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
              <path d={ic.search} />
            </svg>
            <input value={orderQ} onChange={setOrderQ} placeholder="Search name, order number or reference" style={{ flex: '1', minWidth: '0', height: '100%', border: '0', background: 'transparent', fontSize: '13px', outline: 'none' }} />
          </span>
          {hasOrderQ ? (
            <>
              <button onClick={clearOrderQ} style={{ minHeight: '44px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', flexShrink: '0' }}>
                Clear
              </button>
            </>
          ) : null}
        </div>
        {flavourTally ? (
          <>
            <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Ordered this drop, all customers</span>
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
                  {flavourTallyTotal}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {(flavourTally ?? []).map((ft, $index) => (
                  <Fragment key={$index}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={s(ft.imgStyle)} />
                      <span style={{ minWidth: '44px', fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.3px' }}>
                        {ft.qtyText}
                      </span>
                      <span style={{ flex: '1', minWidth: '0', fontSize: '13px' }}>{ft.name}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(orderFilters ?? []).map((fl, $index) => (
            <Fragment key={$index}>
              <button onClick={fl.go} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '42px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '10px', padding: '0 12px', fontSize: '13px', fontWeight: '500', transition: 'border-color .2s ease' }}>
                {fl.active ? (
                  <>
                    <span style={{ position: 'absolute', inset: '-1px', border: '1.5px solid #E75F23', background: '#FDEDE5', borderRadius: '10px', animation: 'hcFade .18s ease-out' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative' }}>{fl.label}</span>
                <span style={{ position: 'relative', fontSize: '12px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
                  {fl.n}
                </span>
              </button>
            </Fragment>
          ))}
        </div>
        {orderEmpty ? (
          <>
            <div style={{ padding: '26px 0 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15px', fontWeight: '600' }}>No orders match this filter</span>
              <span style={{ fontSize: '13px', color: '#6E574B' }}>Try another filter, or clear the search.</span>
            </div>
          </>
        ) : null}
        <div style={s(`display: grid; grid-template-columns: ${splitCols}; gap: 16px; align-items: start`)}>
          <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', overflow: 'hidden', minWidth: '0' }}>
            {(orderList ?? []).map((o, $index) => (
              <Fragment key={$index}>
                <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #F2EEEB', background: '#FFFFFF' }}>
                  <Pressable as="button" onClick={o.select} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', width: '100%', textAlign: 'left', background: 'transparent', border: '0', padding: '13px 14px', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                    {o.selected ? (
                      <>
                        <span style={{ width: '3px', alignSelf: 'stretch', borderRadius: '999px', background: '#E75F23', flexShrink: '0' }} />
                      </>
                    ) : null}
                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.name}
                        </span>
                        <span style={{ fontSize: '11px', color: '#6B564C', fontVariantNumeric: 'tabular-nums' }}>{o.id}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                          {o.totalText}
                        </span>
                      </span>
                      <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.summary}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={s(`display: inline-flex; align-items: center; gap: 5px; border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 600; background: ${o.bg}; color: ${o.fg}; border: 1px solid ${o.br}`)}>
                          {o.label}
                        </span>
                        <span style={{ fontSize: '11px', color: '#66524A' }}>{o.pickup} · {o.count}</span>
                      </span>
                      {o.warn ? (
                        <>
                          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: '#A8231B', lineHeight: '1.4' }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '2px' }}>
                              <path d={ic.alert} />
                            </svg>
                            {o.warn}
                            {' '}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </Pressable>
                  {o.action ? (
                    <>
                      <div style={{ display: 'flex', padding: '0 14px 13px' }}>
                        <Pressable as="button" onClick={o.act} style={{ minHeight: '42px', padding: '0 16px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '13px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }} activeStyle={{ transform: 'scale(.98)' }}>
                          {o.action}
                        </Pressable>
                      </div>
                    </>
                  ) : null}
                </div>
              </Fragment>
            ))}
          </div>
          {split ? (
            <>
              {od ? (
                <>
                  <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '0', animation: 'hcFade .2s ease-out' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-.3px' }}>{od.name}</span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 6px', fontSize: '12px', color: '#66524A' }}>
                          {(od.metaBits ?? []).map((mb, $index) => (
                            <Fragment key={$index}>
                              <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{mb.text}</span>
                            </Fragment>
                          ))}
                        </span>
                      </span>
                      <span style={s(`border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 600; background: ${od.bg}; color: ${od.fg}; border: 1px solid ${od.br}`)}>
                        {od.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(od.lines ?? []).map((l, $index) => (
                        <Fragment key={$index}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={s(l.imgStyle)} />
                            <span style={{ flex: '1', minWidth: '0', fontSize: '13px', fontWeight: '500' }}>{l.name}</span>
                            <span style={{ fontSize: '12px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>{l.qty}</span>
                            <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', width: '62px', textAlign: 'right' }}>
                              {l.line}
                            </span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', paddingTop: '12px', borderTop: '1px solid #F2EEEB' }}>
                      <span style={{ fontSize: '13px', color: '#6E574B' }}>Order total</span>
                      <span style={{ marginLeft: 'auto', fontSize: '20px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {od.totalText}
                      </span>
                    </div>
                    {od.needsReview ? (
                      <>
                        <Pressable as="button" onClick={od.confirm} style={{ minHeight: '48px', border: '0', borderRadius: '12px', background: '#1B7A4B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.98)' }}>
                          Confirm payment
                        </Pressable>
                      </>
                    ) : null}
                    <button onClick={od.go} style={{ minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
                      Open full order
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
