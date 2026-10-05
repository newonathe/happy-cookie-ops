import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function HomeScreen({ v }: { v: OpsVals }) {
  const {
      buy, cols4, drop, goPnl, greetSub, greeting, hasResume, helperCookies, helperStock,
      helperView, heroImg, heroShow, homeCols, ic, launcher, lowStock, money, offTilt, onTilt,
      ownerView, prep, resume, showMoney, statusStrip, system, tiltRef, todayDate
  } = v;
  return (
    <>
      <div data-screen-label="Home" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '500', color: '#8A7062' }}>{todayDate}</span>
          <h1 style={{ margin: '0', fontSize: '30px', fontWeight: '600', letterSpacing: '-.7px', lineHeight: '1.12' }}>
            {greeting}
          </h1>
          <p style={{ margin: '0', maxWidth: '44ch', fontSize: '15px', lineHeight: '1.45', color: '#6E574B', textWrap: 'pretty' }}>
            {greetSub}
          </p>
        </div>
        {helperView ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700' }}>Cookies left</span>
                {(helperCookies ?? []).map((hc, $index) => (
                  <Fragment key={$index}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minHeight: '48px', borderBottom: '1px solid #F5F2F0' }}>
                      <span style={s(hc.imgStyle)} />
                      <span style={{ flex: '1', minWidth: '0', fontSize: '14px', fontWeight: '500' }}>{hc.name}</span>
                      <span style={{ fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{hc.qty}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700' }}>Stock left</span>
                {(helperStock ?? []).map((hs, $index) => (
                  <Fragment key={$index}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', borderBottom: '1px solid #F5F2F0' }}>
                      <span style={{ flex: '1', minWidth: '0', fontSize: '14px' }}>{hs.name}</span>
                      {hs.low ? (
                        <>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#A8231B', flexShrink: '0' }}>Low</span>
                        </>
                      ) : null}
                      <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', flexShrink: '0' }}>
                        {hs.qtyText}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {hasResume ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#6E574B' }}>Continue where you left off</span>
              {(resume ?? []).map((r, $index) => (
                <Fragment key={$index}>
                  <Pressable as="button" onClick={r.go} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', border: '1px solid #CFE0FB', background: '#EEF4FE', borderRadius: '14px', padding: '12px 14px', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.995)' }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#24487F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                      <path d={r.icon} />
                    </svg>
                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#1F3D6E' }}>{r.label}</span>
                      <span style={{ fontSize: '12px', color: '#3C5B8C' }}>{r.detail}</span>
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#24487F' }}>{r.cta}</span>
                  </Pressable>
                </Fragment>
              ))}
            </div>
          </>
        ) : null}
        {ownerView ? (
          <>
            <div style={s(`display: grid; grid-template-columns: ${homeCols}; gap: 16px; align-items: start`)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '0' }}>
                <Pressable as="button" onClick={drop.go} style={{ width: '100%', textAlign: 'left', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'border-color .2s ease' }} hoverStyle={{ borderColor: '#E2DAD4' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', letterSpacing: '-.1px' }}>{drop.no}</span>
                    {drop.open ? (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#E8F5EE', color: '#1B7A4B', border: '1px solid #C6E5D5', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: '600' }}>
                          Open
                        </span>
                      </>
                    ) : null}
                    {drop.closed ? (
                      <>
                        <span style={{ background: '#F4F1EE', color: '#5D4B41', border: '1px solid #E4DDD8', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: '600' }}>
                          Closed
                        </span>
                      </>
                    ) : null}
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#66524A' }}>{drop.closes}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '26px', fontWeight: '600', letterSpacing: '-.6px' }}>{drop.confirmedNum}</span>
                    <span style={{ fontSize: '14px', color: '#6E574B' }}>of {drop.capNum} cookies confirmed</span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '999px', background: '#F1EDEA', display: 'flex', overflow: 'hidden' }}>
                    <span style={s(`${drop.barConfirmed}; transition: width .42s cubic-bezier(.2,.8,.2,1)`)} />
                    <span style={s(`${drop.barPending}; transition: width .42s cubic-bezier(.2,.8,.2,1)`)} />
                  </div>
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px', color: '#6E574B' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#E75F23' }} />
                      {drop.capText}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#B0CEFE' }} />
                      {drop.pendingText}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>{drop.leftText}</span>
                  </div>
                </Pressable>
                <div onMouseMove={onTilt} onMouseLeave={offTilt} style={{ border: '1px solid #EDE8E4', borderRadius: '18px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    <span style={{ width: '4px', background: '#E75F23', flexShrink: '0' }} />
                    <div style={{ flex: '1', minWidth: '0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#A63C0E' }}>Prepare</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '40px', fontWeight: '600', letterSpacing: '-1.4px', lineHeight: '1' }}>
                          {prep.num}
                        </span>
                        <span style={{ fontSize: '15px', color: '#6E574B' }}>{prep.unit}</span>
                      </div>
                      <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.5', color: '#6E574B' }}>{prep.detail}</p>
                      {prep.n ? (
                        <>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(prep.thumbs ?? []).map((th, $index) => (
                              <Fragment key={$index}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: '#FFF5E5', borderRadius: '999px', padding: '4px 10px 4px 4px' }}>
                                  <span style={s(th.style)} />
                                  <span style={{ fontSize: '12px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                    {th.n}
                                  </span>
                                </span>
                              </Fragment>
                            ))}
                          </div>
                        </>
                      ) : null}
                      <Pressable as="button" onClick={prep.go} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '8px', height: '46px', padding: '0 18px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600', boxShadow: '0 2px 10px -3px rgba(231,95,35,.55)', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.978)' }}>
                        Start baking
                        {' '}
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d={ic.right} />
                        </svg>
                      </Pressable>
                    </div>
                    {heroShow ? (
                      <>
                        <div style={{ width: '172px', flexShrink: '0', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 14px 14px 0' }}>
                          <span style={{ position: 'absolute', bottom: '30px', left: '50%', width: '74px', height: '8px', marginLeft: '-37px', borderRadius: '999px', background: 'rgba(58,31,20,.14)', filter: 'blur(6px)' }} />
                          <span ref={tiltRef} style={{ position: 'relative', width: '132px', height: '132px', transform: 'perspective(680px) rotateY(0deg) rotateX(0deg)', transition: 'transform .35s cubic-bezier(.2,.8,.2,1)', willChange: 'transform' }}>
                            <span style={s(`${heroImg.style}; display: block`)} />
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '0' }}>
                <div style={{ border: '1px solid #EDE8E4', borderRadius: '18px', display: 'flex', flexDirection: 'column' }}>
                  {buy.visible ? (
                    <>
                      <Pressable as="button" onClick={buy.go} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', background: 'transparent', border: '0', borderBottom: '1px solid #F2EEEB', padding: '15px 16px', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                        <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EEF4FE', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#24487F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d={ic.grocery} />
                          </svg>
                        </span>
                        <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                            <span style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-.4px' }}>{buy.num}</span>
                            <span style={{ fontSize: '13px', color: '#6E574B' }}>{buy.unit}</span>
                            {buy.costText ? (
                              <>
                                <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: '600', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                                  {buy.costText}
                                </span>
                              </>
                            ) : null}
                          </span>
                          <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.4' }}>{buy.names}</span>
                        </span>
                      </Pressable>
                    </>
                  ) : null}
                  <Pressable as="button" onClick={lowStock.go} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', background: 'transparent', border: '0', borderBottom: '1px solid #F2EEEB', padding: '15px 16px', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                    <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#FDF3E2', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#95600A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={ic.inventory} />
                      </svg>
                    </span>
                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                        <span style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-.4px' }}>{lowStock.num}</span>
                        <span style={{ fontSize: '13px', color: '#6E574B' }}>below your level</span>
                      </span>
                      <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.4' }}>{lowStock.detail}</span>
                    </span>
                  </Pressable>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
                    {system.ok ? (
                      <>
                        <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#E8F5EE', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1B7A4B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d={ic.check} />
                          </svg>
                        </span>
                      </>
                    ) : null}
                    {system.ok ? (
                      <>
                        <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600' }}>System all good</span>
                          <span style={{ fontSize: '12px', color: '#66524A' }}>{system.detail}</span>
                        </span>
                      </>
                    ) : null}
                    {system.bad ? (
                      <>
                        <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#FCECEA', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#A8231B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d={ic.alert} />
                          </svg>
                        </span>
                      </>
                    ) : null}
                    {system.bad ? (
                      <>
                        <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600' }}>{system.label}</span>
                          <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.4' }}>{system.detail}</span>
                        </span>
                      </>
                    ) : null}
                    {system.pending ? (
                      <>
                        <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#F3EFEC', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6E574B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d={ic.info} />
                          </svg>
                        </span>
                        <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600' }}>{system.label}</span>
                          <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.4' }}>{system.detail}</span>
                        </span>
                      </>
                    ) : null}
                    <Pressable as="button" onClick={system.go} style={{ flexShrink: '0', height: '38px', padding: '0 14px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.97)' }}>
                      Review
                    </Pressable>
                  </div>
                </div>
                {showMoney ? (
                  <>
                    <Pressable as="button" onClick={goPnl} style={{ width: '100%', textAlign: 'left', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', transition: 'border-color .2s ease' }} hoverStyle={{ borderColor: '#E2DAD4' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#6E574B' }}>Profit this month</span>
                      <span style={{ fontSize: '30px', fontWeight: '600', letterSpacing: '-.9px', lineHeight: '1' }}>
                        {money.profitNum}
                      </span>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                        <span>Revenue {money.revenueText}</span>
                        <span>Expenses {money.expenseText}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#66524A' }} />
                    </Pressable>
                  </>
                ) : null}
                <div style={{ display: 'flex', border: '1px solid #EDE8E4', borderRadius: '14px', overflow: 'hidden' }}>
                  {(statusStrip ?? []).map((ss, $index) => (
                    <Fragment key={$index}>
                      <Pressable as="button" onClick={ss.go} style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', background: 'transparent', border: '0', borderRight: '1px solid #F2EEEB', padding: '11px 10px', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                        <span style={{ fontSize: '18px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.3px' }}>
                          {ss.value}
                        </span>
                        <span style={{ maxWidth: '100%', fontSize: '11px', color: '#66524A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ss.label}
                        </span>
                      </Pressable>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}
        {ownerView ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Your business</span>
              {(launcher ?? []).map((lg, $index) => (
                <Fragment key={$index}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#6B564C' }}>{lg.title}</span>
                    <div style={s(`display: grid; grid-template-columns: ${cols4}; gap: 8px`)}>
                      {(lg.items ?? []).map((li, $index) => (
                        <Fragment key={$index}>
                          <Pressable as="button" onClick={li.go} style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', minHeight: '52px', border: '0', background: '#FAF8F7', borderRadius: '12px', padding: '10px 12px', transition: 'background-color .2s ease, transform .16s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#F3EFEC' }} activeStyle={{ transform: 'scale(.99)' }}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6E574B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                              <path d={li.icon} />
                            </svg>
                            <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600' }}>{li.label}</span>
                              {li.sub ? (
                                <>
                                  <span style={{ fontSize: '11px', color: '#66524A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {li.sub}
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </Pressable>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
