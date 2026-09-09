import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function BazaarModeScreen({ v }: { v: OpsVals }) {
  const {
      askClose, bzCartCount, bzCartTotalNum, bzCloseout, bzNoEvent, bzRevenue, bzSales,
      bzSalesCount, bzSell, bzStock, bzStockEmpty, bzStockTotal, cols3, event, eventExpenses,
      events, ic, openEventExpense, openPay, openSelling, recordFreebie, reopenEvent, syncBanner,
      syncDone, syncNow, syncPartial, syncText, syncing, unsynced
  } = v;
  return (
    <>
      <div data-screen-label="Bazaar Mode" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {syncBanner ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #E4DDD8', background: '#F8F6F4', borderRadius: '13px', padding: '11px 13px' }}>
              {syncing ? (
                <>
                  <span style={{ width: '17px', height: '17px', borderRadius: '999px', border: '2px solid #E4DDD8', borderTopColor: '#E75F23', animation: 'hcSpin .8s linear infinite', flexShrink: '0' }} />
                </>
              ) : null}
              {syncDone ? (
                <>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#1B7A4B" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: '0' }}>
                    <path d={ic.check} />
                  </svg>
                </>
              ) : null}
              {syncPartial ? (
                <>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#A8231B" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0' }}>
                    <path d={ic.alert} />
                  </svg>
                </>
              ) : null}
              <span style={{ flex: '1', fontSize: '13px', fontWeight: '500' }}>{syncText}</span>
              {unsynced ? (
                <>
                  <button onClick={syncNow} style={{ minHeight: '42px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                    Sync now
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
        {bzNoEvent ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '22px', fontWeight: '600', letterSpacing: '-.5px' }}>Start an event</span>
                <span style={{ fontSize: '13px', color: '#6E574B' }}>Sell fast. Works with no signal.</span>
              </div>
              {(events ?? []).map((ev, $index) => (
                <Fragment key={$index}>
                  <Pressable as="button" onClick={ev.go} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '16px', padding: '14px', transition: 'border-color .2s ease' }} hoverStyle={{ borderColor: '#E2DAD4' }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C24A15" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                      <path d={ic.bazaar} />
                    </svg>
                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '15px', fontWeight: '600' }}>{ev.name}</span>
                      <span style={{ fontSize: '12px', color: '#66524A' }}>{ev.date} · {ev.place}</span>
                    </span>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#66524A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ic.right} />
                    </svg>
                  </Pressable>
                </Fragment>
              ))}
            </div>
          </>
        ) : null}
        {event ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-.3px' }}>{event.name}</span>
                  <span style={{ fontSize: '12px', color: '#66524A' }}>{event.date}</span>
                </span>
                <button onClick={event.reset} style={{ minHeight: '42px', padding: '0 12px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                  Leave
                </button>
              </div>
              {event.stage1 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#6E574B' }}>Load the table from baked stock.</span>
                    {bzStockEmpty ? (
                      <>
                        <div style={{ border: '1px solid #EFDCB5', background: '#FDF3E2', borderRadius: '12px', padding: '12px', fontSize: '13px', color: '#7A4E08' }}>
                          Nothing is baked yet. Bake a batch first, then load the table.
                        </div>
                      </>
                    ) : null}
                    {(bzStock ?? []).map((bs, $index) => (
                      <Fragment key={$index}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 11px', padding: '11px 0', borderBottom: '1px solid #F2EEEB' }}>
                          <span style={{ flex: '1 1 100%', minWidth: '0', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '15px', fontWeight: '600', letterSpacing: '-.1px' }}>{bs.name}</span>
                            <span style={{ fontSize: '12px', color: '#66524A', whiteSpace: 'nowrap' }}>{bs.availText}</span>
                          </span>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', flexShrink: '0' }}>
                            <span style={{ fontSize: '12px', color: '#6E574B' }}>Price</span>
                            <input value={bs.priceValue} onChange={bs.onPrice} inputMode="numeric" aria-label={`Event price for ${bs.name}`} style={{ width: '74px', height: '44px', border: '1px solid #E7E1DC', borderRadius: '11px', textAlign: 'center', fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
                          </label>
                          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6E574B' }}>On the table</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #E7E1DC', borderRadius: '11px', background: '#FFFFFF', flexShrink: '0' }}>
                            <Pressable as="button" onClick={bs.minus} aria-label="Fewer" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                                <path d={ic.minus} />
                              </svg>
                            </Pressable>
                            <input value={bs.qty} onChange={bs.onQty} inputMode="numeric" aria-label={`Cookies on the table for ${bs.name}`} style={{ width: '52px', height: '44px', border: '0', borderLeft: '1px solid #F2EEEB', borderRight: '1px solid #F2EEEB', background: 'transparent', textAlign: 'center', fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
                            <Pressable as="button" onClick={bs.plus} aria-label="More" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                                <path d={ic.plus} />
                              </svg>
                            </Pressable>
                          </span>
                        </div>
                      </Fragment>
                    ))}
                    <Pressable as="button" onClick={openSelling} style={{ minHeight: '52px', border: '0', borderRadius: '13px', background: '#C24A15', color: '#FFFFFF', fontSize: '15px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.985)' }}>
                      Open the table · {bzStockTotal} cookies
                    </Pressable>
                  </div>
                </>
              ) : null}
              {event.stage2 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={s(`display: grid; grid-template-columns: ${cols3}; gap: 8px`)}>
                      {(bzSell ?? []).map((p, $index) => (
                        <Fragment key={$index}>
                          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '16px', padding: '11px 10px 10px' }}>
                            {p.inCart ? (
                              <>
                                <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '16px', pointerEvents: 'none' }} />
                              </>
                            ) : null}
                            <Pressable as="button" onClick={p.tap} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', border: '0', background: 'transparent', padding: '0', width: '100%', transition: 'transform .14s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.97)' }}>
                              <span style={s(p.imgStyle)} />
                              <span style={{ fontSize: '13px', fontWeight: '600', textAlign: 'center', lineHeight: '1.3', letterSpacing: '-.1px', overflowWrap: 'anywhere', textWrap: 'pretty' }}>
                                {p.name}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                  {p.priceText}
                                </span>
                                <span style={{ fontSize: '11px', color: '#66524A', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                  {p.left} left
                                </span>
                              </span>
                            </Pressable>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button onClick={p.minus} aria-label="One less" style={{ width: '44px', height: '44px', flexShrink: '0', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '19px', fontWeight: '600', color: '#3A1F14', display: 'grid', placeItems: 'center' }}>
                                −
                              </button>
                              <span style={{ flex: '1', minWidth: '0', textAlign: 'center', fontSize: '16px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                                {p.qtyText}
                              </span>
                              <button onClick={p.tap} aria-label="One more" style={{ width: '44px', height: '44px', flexShrink: '0', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '19px', fontWeight: '600', color: '#3A1F14', display: 'grid', placeItems: 'center' }}>
                                +
                              </button>
                            </div>
                            {p.soldOut ? (
                              <>
                                <span style={{ position: 'absolute', inset: '0', background: 'rgba(255,255,255,.8)', borderRadius: '16px', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>
                                  Sold out
                                </span>
                              </>
                            ) : null}
                          </div>
                        </Fragment>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderRadius: '18px', padding: '12px 14px', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(58,31,20,.09)', boxShadow: '0 10px 26px -12px rgba(58,31,20,.28)' }}>
                      <span style={{ flex: '1 1 120px', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', color: '#6E574B' }}>{bzCartCount} in this sale</span>
                        <span style={{ fontSize: '22px', fontWeight: '600', letterSpacing: '-.5px' }}>{bzCartTotalNum}</span>
                      </span>
                      <button onClick={recordFreebie} style={{ minHeight: '46px', padding: '0 14px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                        Freebie
                      </button>
                      <Pressable as="button" onClick={openPay} style={{ flex: '1 1 110px', minHeight: '46px', padding: '0 20px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.97)' }}>
                        Charge
                      </Pressable>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#6E574B' }}>{bzSalesCount} · {bzRevenue}</span>
                      <button onClick={askClose} style={{ marginLeft: 'auto', minHeight: '42px', padding: '0 14px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
                        Close out
                      </button>
                    </div>
                    {(bzSales ?? []).map((sl, $index) => (
                      <Fragment key={$index}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid #F2EEEB' }}>
                          <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '500', lineHeight: '1.35', overflowWrap: 'anywhere', textWrap: 'pretty' }}>
                              {sl.summary}
                            </span>
                            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 6px', fontSize: '11px', color: '#66524A' }}>
                              <span>{sl.pay}</span>
                              {sl.refText ? (
                                <>
                                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>· {sl.refText}</span>
                                </>
                              ) : null}
                              {sl.clerk ? (
                                <>
                                  <span>· {sl.clerk}</span>
                                </>
                              ) : null}
                            </span>
                          </span>
                          <span style={{ fontSize: '15px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                            {sl.totalText}
                          </span>
                          {sl.bad ? (
                            <>
                              <button onClick={sl.retry} style={{ minHeight: '40px', padding: '0 11px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', color: '#A8231B' }}>
                                Send again
                              </button>
                            </>
                          ) : null}
                          {sl.ok ? (
                            <>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: '#1B7A4B' }}>{sl.stateText}</span>
                            </>
                          ) : null}
                          <Pressable as="button" onClick={sl.void} style={{ minHeight: '40px', padding: '0 11px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', color: '#6E574B', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                            Void
                          </Pressable>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </>
              ) : null}
              {event.stage3 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Pressable as="button" onClick={reopenEvent} style={{ alignSelf: 'flex-start', minHeight: '40px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                      Reopen the table
                    </Pressable>
                    <div style={{ border: '1px solid #EDE8E4', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#6E574B' }}>Event closed · {bzCloseout.salesCount}</span>
                      {bzCloseout.profitOk ? (
                        <>
                          <span style={{ fontSize: '32px', fontWeight: '600', letterSpacing: '-1px' }}>{bzCloseout.profit}</span>
                        </>
                      ) : null}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '11px', color: '#66524A' }}>Revenue</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                            {bzCloseout.revenue}
                          </span>
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '11px', color: '#66524A' }}>Cookie cost</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                            {bzCloseout.cogs}
                          </span>
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '11px', color: '#66524A' }}>Event expenses</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                            {bzCloseout.expenses}
                          </span>
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '11px', color: '#66524A' }}>Returned</span>
                          <span style={{ fontSize: '14px', fontWeight: '600' }}>{bzCloseout.returned}</span>
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#66524A' }}>
                        {bzCloseout.samples}. Unsold cookies went back into baked stock.
                      </span>
                    </div>
                    <button onClick={event.reset} style={{ minHeight: '48px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '14px', fontWeight: '600' }}>
                      Back to events
                    </button>
                  </div>
                </>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Event expenses</span>
                  <button onClick={openEventExpense} style={{ marginLeft: 'auto', minHeight: '42px', padding: '0 12px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                    Add
                  </button>
                </div>
                {(eventExpenses ?? []).map((ex, $index) => (
                  <Fragment key={$index}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid #F2EEEB' }}>
                      <span style={{ flex: '1', fontSize: '13px' }}>{ex.label}</span>
                      <span style={{ fontSize: '11px', color: '#66524A' }}>{ex.cat}</span>
                      <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {ex.amountText}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
