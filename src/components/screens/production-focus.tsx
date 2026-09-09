import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function ProductionFocusScreen({ v }: { v: OpsVals }) {
  const {
      bakeFlavours, bakeRejects, batch, goodCount, hasRejects, ic, rejectsMinus, rejectsPlus
  } = v;
  return (
    <>
      {batch ? (
        <>
          <div data-screen-label="Production focus" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', padding: '13px', display: 'flex', flexDirection: 'column', gap: '11px', background: '#FFFFFF' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                <span style={s(batch.imgStyle)} />
                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{batch.name}</span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '20px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.4px' }}>
                    {batch.target}
                  </span>
                  <span style={{ fontSize: '10px', color: '#66524A' }}>{batch.targetWord}</span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                {batch.doughText ? (
                  <>
                    <span>{batch.doughText}</span>
                  </>
                ) : null}
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#6E574B' }}>Flavour</span>
                <select value={batch.pid} onChange={batch.setFlavour} style={{ height: '46px', border: '1px solid #E7E1DC', borderRadius: '11px', padding: '0 11px', fontSize: '14px', fontWeight: '600', background: '#FFFFFF', color: '#3A1F14' }}>
                  {(bakeFlavours ?? []).map((bf, $index) => (
                    <Fragment key={$index}>
                      <option value={bf.id}>{bf.label}</option>
                    </Fragment>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={batch.exit} style={{ flex: '1', minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
                  Leave for now
                </button>
                <button onClick={batch.discard} style={{ minHeight: '44px', padding: '0 14px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', color: '#A8231B' }}>
                  Discard
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ flex: '1', height: '4px', borderRadius: '999px', background: '#E75F23' }} />
              {batch.step2 ? (
                <>
                  <span style={{ flex: '1', height: '4px', borderRadius: '999px', background: '#E75F23' }} />
                </>
              ) : null}
              {batch.step1 ? (
                <>
                  <span style={{ flex: '1', height: '4px', borderRadius: '999px', background: '#F1EDEA' }} />
                </>
              ) : null}
              <span style={{ fontSize: '12px', color: '#66524A', paddingLeft: '6px' }}>
                Step
                {' '}
                {batch.step1 ? (
                  <>
                    1
                  </>
                ) : null}
                {batch.step2 ? (
                  <>
                    2
                  </>
                ) : null}
                {' '}
                of 2
              </span>
            </div>
            {batch.step1 ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', alignItems: 'center', padding: '10px 0 4px' }}>
                  <span style={{ fontSize: '15px', color: '#6E574B' }}>How many came out?</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <Pressable as="button" onClick={batch.minus} aria-label="Fewer" style={{ width: '64px', height: '64px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '20px', display: 'grid', placeItems: 'center', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.94)' }}>
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#3A1F14" strokeWidth="2" strokeLinecap="round">
                        <path d={ic.minus} />
                      </svg>
                    </Pressable>
                    <span style={{ minWidth: '96px', textAlign: 'center', fontSize: '52px', fontWeight: '600', letterSpacing: '-1.6px', lineHeight: '1' }}>
                      {batch.actualNum}
                    </span>
                    <Pressable as="button" onClick={batch.plus} aria-label="More" style={{ width: '64px', height: '64px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '20px', display: 'grid', placeItems: 'center', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.94)' }}>
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#3A1F14" strokeWidth="2" strokeLinecap="round">
                        <path d={ic.plus} />
                      </svg>
                    </Pressable>
                  </div>
                  {batch.varianceOk ? (
                    <>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#1B7A4B' }}>{batch.varianceText}</span>
                    </>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #EDE8E4', borderRadius: '14px', padding: '10px 12px' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Rejects</span>
                      <span style={{ fontSize: '11px', color: '#66524A' }}>Burnt, broken, not good enough to sell</span>
                    </span>
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', border: '1px solid #E7E1DC', borderRadius: '12px', background: '#FFFFFF' }}>
                      <Pressable as="button" onClick={rejectsMinus} aria-label="Fewer rejects" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', borderRadius: '12px', display: 'grid', placeItems: 'center', transition: 'background-color .16s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                          <path d={ic.minus} />
                        </svg>
                      </Pressable>
                      <span style={{ minWidth: '34px', textAlign: 'center', fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {bakeRejects}
                      </span>
                      <Pressable as="button" onClick={rejectsPlus} aria-label="More rejects" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', borderRadius: '12px', display: 'grid', placeItems: 'center', transition: 'background-color .16s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                          <path d={ic.plus} />
                        </svg>
                      </Pressable>
                    </span>
                  </div>
                  {hasRejects ? (
                    <>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#95600A' }}>
                        {goodCount} good cookies go into stock
                      </span>
                    </>
                  ) : null}
                  <input value={batch.note} onChange={batch.setNote} placeholder="Anything worth noting? (optional)" style={{ width: '100%', maxWidth: '420px', height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 14px', fontSize: '14px', background: '#FFFFFF' }} />
                  <Pressable as="button" onClick={batch.toStep2} style={{ width: '100%', maxWidth: '420px', minHeight: '52px', border: '0', borderRadius: '13px', background: '#C24A15', color: '#FFFFFF', fontSize: '15px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.985)' }}>
                    Next: what it used
                  </Pressable>
                </div>
              </>
            ) : null}
            {batch.step2 ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#EEF4FE', border: '1px solid #CFE0FB', borderRadius: '14px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '13px', lineHeight: '1.5', color: '#24487F' }}>{batch.doughLine}</span>
                  </div>
                  {batch.anyShort ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#FCECEA', border: '1px solid #F2CFCB', borderRadius: '12px', padding: '11px 12px' }}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#A8231B" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
                          <path d={ic.alert} />
                        </svg>
                        <span style={{ fontSize: '12px', color: '#8E1F18', lineHeight: '1.45' }}>
                          Some amounts are more than your records show. Confirming will take stock to zero, not negative — correct it in the weekly count.
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={batch.toStep1} style={{ minHeight: '52px', padding: '0 16px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '13px', fontSize: '14px', fontWeight: '600' }}>
                      Back
                    </button>
                    <Pressable as="button" onClick={batch.confirm} style={{ flex: '1', minHeight: '52px', border: '0', borderRadius: '13px', background: '#1B7A4B', color: '#FFFFFF', fontSize: '15px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#16663F' }} activeStyle={{ transform: 'scale(.985)' }}>
                      Confirm production
                    </Pressable>
                  </div>
                  <span style={{ fontSize: '12px', color: '#66524A', textAlign: 'center' }}>
                    Ingredients only come off stock when you confirm.
                  </span>
                  <Pressable as="button" onClick={batch.toggleUsed} style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left', minHeight: '46px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', padding: '0 13px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                    <span style={{ flex: '1', minWidth: '0' }}>{batch.usedLabel}</span>
                    <span style={s(batch.usedCaret)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8A7062" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={ic.down} />
                      </svg>
                    </span>
                  </Pressable>
                  {batch.showUsed ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Ingredients coming off stock</span>
                        <span style={{ fontSize: '12px', color: '#66524A' }}>
                          Nudge anything you actually used more or less of.
                        </span>
                      </div>
                      {(batch.rows ?? []).map((ir, $index) => (
                        <Fragment key={$index}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid #F2EEEB' }}>
                            <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '500' }}>{ir.name}</span>
                              <span style={{ fontSize: '11px', color: '#66524A' }}>{ir.onHandText}</span>
                            </span>
                            {ir.short ? (
                              <>
                                <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#A8231B' }}>
                                  {ir.amountText}
                                </span>
                              </>
                            ) : null}
                            {ir.ok ? (
                              <>
                                <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                  {ir.amountText}
                                </span>
                              </>
                            ) : null}
                            {ir.deltaText ? (
                              <>
                                <span style={{ fontSize: '11px', fontWeight: '600', color: '#95600A', fontVariantNumeric: 'tabular-nums' }}>
                                  {ir.deltaText}
                                </span>
                              </>
                            ) : null}
                            <span style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #E7E1DC', borderRadius: '11px', background: '#FFFFFF', flexShrink: '0' }}>
                              <Pressable as="button" onClick={ir.minus} aria-label="Less" style={{ width: '44px', height: '42px', border: '0', background: 'transparent', borderRadius: '10px', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                                  <path d={ic.minus} />
                                </svg>
                              </Pressable>
                              <Pressable as="button" onClick={ir.plus} aria-label="More" style={{ width: '44px', height: '42px', border: '0', background: 'transparent', borderRadius: '10px', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                                  <path d={ic.plus} />
                                </svg>
                              </Pressable>
                            </span>
                          </div>
                        </Fragment>
                      ))}
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
