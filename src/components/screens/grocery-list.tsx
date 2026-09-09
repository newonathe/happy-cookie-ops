import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function GroceryListScreen({ v }: { v: OpsVals }) {
  const {
      attachReceipt, cols2, drop, groceryAllDone, groceryCountText, groceryLeftText,
      groceryOverBudget, groceryRows, groceryShortCount, groceryTotalNum, groceryUnderBudget, ic,
      receiptDone, receiptNone, receiptUploading
  } = v;
  return (
    <>
      <div data-screen-label="Grocery list" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {groceryAllDone ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '26px 0' }}>
              <span style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#E8F5EE', display: 'grid', placeItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1B7A4B" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ic.check} />
                </svg>
              </span>
              <span style={{ fontSize: '18px', fontWeight: '600' }}>You have what you need</span>
              <span style={{ fontSize: '13px', color: '#6E574B', textAlign: 'center', maxWidth: '300px' }}>
                Nothing is short for the confirmed orders in {drop.no}.
              </span>
            </div>
          </>
        ) : null}
        {groceryShortCount ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '28px', fontWeight: '600', letterSpacing: '-.7px' }}>{groceryTotalNum}</span>
                  <span style={{ fontSize: '14px', color: '#6E574B' }}>estimate</span>
                </span>
                {groceryOverBudget ? (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#A8231B' }}>{groceryLeftText}</span>
                  </>
                ) : null}
                {groceryUnderBudget ? (
                  <>
                    <span style={{ fontSize: '12px', color: '#6E574B' }}>{groceryLeftText}</span>
                  </>
                ) : null}
                <span style={{ fontSize: '13px', color: '#66524A' }}>{groceryCountText} for this drop.</span>
              </div>
              {receiptNone ? (
                <>
                  <Pressable as="button" onClick={attachReceipt} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 14px', border: '1px dashed #DCD5CF', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease, border-color .18s ease' }} hoverStyle={{ background: '#FBFAF9', borderColor: '#C6BCB4' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8A7062" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ic.camera} />
                    </svg>
                    Attach the receipt
                    {' '}
                  </Pressable>
                </>
              ) : null}
              {receiptUploading ? (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '0 14px', border: '1px solid #EDE8E4', borderRadius: '12px', fontSize: '13px', color: '#6E574B' }}>
                    Attaching…
                  </span>
                </>
              ) : null}
              {receiptDone ? (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 14px', border: '1px solid #C6E5D5', background: '#E8F5EE', borderRadius: '12px', fontSize: '13px', fontWeight: '600', color: '#14603A' }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#1B7A4B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ic.check} />
                    </svg>
                    Receipt attached
                    {' '}
                  </span>
                </>
              ) : null}
            </div>
          </>
        ) : null}
        <div style={s(`display: grid; grid-template-columns: ${cols2}; gap: 10px`)}>
          {(groceryRows ?? []).map((g, $index) => (
            <Fragment key={$index}>
              <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', padding: '13px', display: 'flex', flexDirection: 'column', gap: '11px', background: '#FFFFFF' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '600' }}>{g.name}</span>
                    <span style={{ fontSize: '12px', color: '#66524A' }}>{g.reason}</span>
                    {g.subbed ? (
                      <>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#95600A' }}>Bought {g.sub} instead</span>
                      </>
                    ) : null}
                  </span>
                  {g.received ? (
                    <>
                      <span style={{ background: '#E8F5EE', color: '#1B7A4B', border: '1px solid #C6E5D5', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600', flexShrink: '0' }}>
                        Received
                      </span>
                    </>
                  ) : null}
                  {g.partial ? (
                    <>
                      <span style={{ background: '#FDF3E2', color: '#7A4E08', border: '1px solid #EFDCB5', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                        {g.partText}
                      </span>
                    </>
                  ) : null}
                  {g.bought ? (
                    <>
                      <span style={{ background: '#EEF4FE', color: '#24487F', border: '1px solid #CFE0FB', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600', flexShrink: '0' }}>
                        Bought
                      </span>
                    </>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '17px', fontWeight: '600', letterSpacing: '-.2px' }}>{g.buyText}</span>
                  <span style={{ fontSize: '13px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>{g.costText}</span>
                  <button onClick={g.supplierSheet} style={{ marginLeft: 'auto', minHeight: '42px', padding: '0 11px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '9px', fontSize: '12px', fontWeight: '600' }}>
                    {g.supplier}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', background: '#F8F6F4', borderRadius: '11px', padding: '10px 11px' }}>
                  {(g.cells ?? []).map((c, $index) => (
                    <Fragment key={$index}>
                      <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#66524A' }}>{c.label}</span>
                        {c.red ? (
                          <>
                            <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#A8231B' }}>
                              {c.value}
                            </span>
                          </>
                        ) : null}
                        {c.plain ? (
                          <>
                            <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                              {c.value}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </Fragment>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Pressable as="button" onClick={g.receive} style={{ flex: '1', minHeight: '44px', border: '0', borderRadius: '11px', background: '#FDEDE5', color: '#A63C0E', fontSize: '13px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.985)' }}>
                    {g.actionLabel}
                  </Pressable>
                  <Pressable as="button" onClick={g.why} style={{ minHeight: '44px', padding: '0 10px', border: '0', background: 'transparent', fontSize: '13px', fontWeight: '500', color: '#6E574B', transition: 'color .18s ease' }} hoverStyle={{ color: '#3A1F14' }}>
                    Why?
                  </Pressable>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
