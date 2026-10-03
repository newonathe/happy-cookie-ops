import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function ProfitAndLossScreen({ v }: { v: OpsVals }) {
  const {
      bareFrame, ic, openCategories, openExpense, pl, plCols, plExpenseDrill, plRevenueDrill, plRows, plTrend
  } = v;
  return (
    <>
      <div data-screen-label="P and L" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '13px', color: '#6E574B' }}>{bareFrame ? 'Profit · ' + pl.periodText : 'Profit · August 2026'}</span>
          <span style={{ fontSize: '38px', fontWeight: '600', letterSpacing: '-1.3px', lineHeight: '1' }}>{pl.profitNum}</span>
          <span style={{ fontSize: '13px', color: '#66524A' }}>{pl.note}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Pressable as="button" onClick={plRevenueDrill} style={{ textAlign: 'left', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '14px', padding: '13px', display: 'flex', flexDirection: 'column', gap: '4px', transition: 'border-color .2s ease' }} hoverStyle={{ borderColor: '#E2DAD4' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6E574B' }}>
              Revenue
              {' '}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#BCA595" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d={ic.right} />
              </svg>
            </span>
            <span style={{ fontSize: '19px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.4px' }}>
              {pl.revenueText}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
              <span>Drops {pl.drops}</span>
              <span>Bazaar {pl.bazaar}</span>
            </span>
          </Pressable>
          <Pressable as="button" onClick={plExpenseDrill} style={{ textAlign: 'left', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '14px', padding: '13px', display: 'flex', flexDirection: 'column', gap: '4px', transition: 'border-color .2s ease' }} hoverStyle={{ borderColor: '#E2DAD4' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6E574B' }}>
              Expenses
              {' '}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#BCA595" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d={ic.right} />
              </svg>
            </span>
            <span style={{ fontSize: '19px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.4px' }}>
              {pl.expenseText}
            </span>
            <span style={{ fontSize: '11px', color: '#66524A' }}>{pl.marginText}</span>
          </Pressable>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', border: '1px solid #EDE8E4', borderRadius: '14px', padding: '12px 14px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '11px', color: '#6E574B' }}>Set aside for tax</span>
            <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{pl.taxText}</span>
          </span>
          {pl.hasDraw ? (
            <>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', color: '#6E574B' }}>Taken out by you</span>
                <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{pl.drawText}</span>
              </span>
            </>
          ) : null}
          {pl.hasRefunds ? (
            <>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', color: '#6E574B' }}>Refunded</span>
                <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#A8231B' }}>
                  {pl.refundedText}
                </span>
              </span>
            </>
          ) : null}
          <Pressable as="button" onClick={pl.openDraw} style={{ marginLeft: 'auto', minHeight: '40px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
            Take money out
          </Pressable>
        </div>
        <span style={{ fontSize: '11px', color: '#66524A', lineHeight: '1.5' }}>Set aside {pl.taxPctText} of takings.</span>
        <div style={s(`display: grid; grid-template-columns: ${plCols}; gap: 18px; align-items: start`)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '0' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Profit, last four months</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '92px' }}>
              {(plTrend ?? []).map((tr, $index) => (
                <Fragment key={$index}>
                  <span style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                      {tr.amount}
                    </span>
                    {tr.now ? (
                      <>
                        <span style={s(`width: 100%; max-width: 46px; border-radius: 8px 8px 3px 3px; background: #E75F23; height: ${tr.v}%; transition: height .45s cubic-bezier(.2,.8,.2,1)`)} />
                      </>
                    ) : null}
                    {tr.past ? (
                      <>
                        <span style={s(`width: 100%; max-width: 46px; border-radius: 8px 8px 3px 3px; background: #F0E4DC; height: ${tr.v}%; transition: height .45s cubic-bezier(.2,.8,.2,1)`)} />
                      </>
                    ) : null}
                    <span style={{ fontSize: '11px', color: '#66524A' }}>{tr.label}</span>
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ marginRight: 'auto', fontSize: '13px', fontWeight: '600', color: '#6E574B', whiteSpace: 'nowrap' }}>
                Where the money went
              </span>
              <Pressable as="button" onClick={openExpense} style={{ minHeight: '40px', padding: '0 14px', border: '0', borderRadius: '11px', background: '#C24A15', color: '#FFFFFF', fontSize: '13px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.98)' }}>
                Record expense
              </Pressable>
              <Pressable as="button" onClick={openCategories} style={{ minHeight: '40px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                Categories
              </Pressable>
            </div>
            <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', overflow: 'hidden' }}>
              {(plRows ?? []).map((pr, $index) => (
                <Fragment key={$index}>
                  <Pressable as="button" onClick={pr.go} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', background: 'transparent', border: '0', borderBottom: '1px solid #F2EEEB', padding: '12px 14px', minHeight: '58px', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>{pr.cat}</span>
                        <span style={{ fontSize: '11px', color: '#66524A' }}>{pr.n}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                          {pr.amountText}
                        </span>
                      </span>
                      <span style={{ height: '4px', borderRadius: '999px', background: '#F1EDEA', display: 'block' }}>
                        <span style={s(`display: block; height: 100%; border-radius: 999px; background: #C6AC9B; ${pr.barStyle}; transition: width .4s cubic-bezier(.2,.8,.2,1)`)} />
                      </span>
                    </span>
                  </Pressable>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
        {pl.hasMargins ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>What each flavour earns you</span>
              <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', overflow: 'hidden' }}>
                {(pl.marginRows ?? []).map((mr, $index) => (
                  <Fragment key={$index}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 13px', borderBottom: '1px solid #F2EEEB' }}>
                      <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600' }}>{mr.name}</span>
                          <span style={{ fontSize: '11px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
                            {mr.soldText}
                          </span>
                        </span>
                        <span style={{ height: '4px', borderRadius: '999px', background: '#F1EDEA', display: 'block', maxWidth: '220px' }}>
                          <span style={s(`display: block; height: 100%; border-radius: 999px; background: #C6AC9B; ${mr.barStyle}; transition: width .4s cubic-bezier(.2,.8,.2,1)`)} />
                        </span>
                      </span>
                      <span style={{ minWidth: '52px', textAlign: 'right', fontSize: '12px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                        {mr.eachText}
                      </span>
                      <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                        {mr.pctText}
                      </span>
                      <span style={{ minWidth: '68px', textAlign: 'right', fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {mr.madeText}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <span style={{ fontSize: '11px', color: '#66524A' }}>Per cookie, margin, and what it has brought in this month.</span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
