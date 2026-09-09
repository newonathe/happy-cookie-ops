import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function InventoryScreen({ v }: { v: OpsVals }) {
  const {
      clearInvQ, hasInvQ, ic, invCountLabel, invEditable, invEmpty, invEmptyText, invLowCount, invQ,
      invRows, invTabPill, invTabs, openAddInv, segMax, setInvQ, stock
  } = v;
  return (
    <>
      <div data-screen-label="Inventory" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {stock ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'hcRise .24s ease-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#3A1F14', color: '#FFF5E5', borderRadius: '18px', padding: '13px 14px' }}>
                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '600' }}>Weekly count</span>
                  <span style={{ fontSize: '12px', color: '#C6AC9B', fontVariantNumeric: 'tabular-nums' }}>{stock.pos}</span>
                </span>
                <button onClick={stock.pause} style={{ minHeight: '40px', padding: '0 13px', border: '1px solid rgba(255,245,229,.25)', background: 'rgba(255,245,229,.12)', color: '#FFF5E5', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                  Pause
                </button>
                <button onClick={stock.cancel} aria-label="Stop counting" style={{ width: '44px', height: '44px', border: '1px solid rgba(255,245,229,.25)', background: 'transparent', color: '#FFF5E5', borderRadius: '10px', display: 'grid', placeItems: 'center' }}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d={ic.close} />
                  </svg>
                </button>
              </div>
              <div style={{ height: '5px', borderRadius: '999px', background: '#F1EDEA', overflow: 'hidden' }}>
                <span style={s(`display: block; height: 100%; background: #E75F23; ${stock.progress}; transition: width .35s cubic-bezier(.2,.8,.2,1)`)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '6px 0' }}>
                <span style={{ fontSize: '22px', fontWeight: '600', letterSpacing: '-.4px' }}>{stock.name}</span>
                <span style={{ fontSize: '13px', color: '#66524A' }}>Records say {stock.expected}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Pressable as="button" onClick={stock.down} aria-label="Less" style={{ width: '60px', height: '60px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '18px', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3A1F14" strokeWidth="2" strokeLinecap="round">
                      <path d={ic.minus} />
                    </svg>
                  </Pressable>
                  <input value={stock.value} onChange={stock.onInput} inputMode="decimal" placeholder="0" style={{ width: '130px', height: '66px', border: '1px solid #E7E1DC', borderRadius: '16px', textAlign: 'center', fontSize: '30px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
                  <Pressable as="button" onClick={stock.up} aria-label="More" style={{ width: '60px', height: '60px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '18px', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3A1F14" strokeWidth="2" strokeLinecap="round">
                      <path d={ic.plus} />
                    </svg>
                  </Pressable>
                </div>
                <span style={{ fontSize: '12px', color: '#66524A' }}>{stock.unit}</span>
                {stock.varianceOk ? (
                  <>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#1B7A4B' }}>{stock.varianceText}</span>
                  </>
                ) : null}
                {stock.varianceNone ? (
                  <>
                    <span style={{ fontSize: '13px', color: '#66524A' }}>{stock.varianceText}</span>
                  </>
                ) : null}
                {stock.varianceWarn ? (
                  <>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#95600A' }}>{stock.varianceText}</span>
                  </>
                ) : null}
                {stock.varianceWarn ? (
                  <>
                    <input value={stock.reason} onChange={stock.setReason} placeholder="Why the difference? (optional)" style={{ width: '100%', maxWidth: '360px', height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF', animation: 'hcRise .22s ease-out' }} />
                  </>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={stock.prev} style={{ minHeight: '50px', padding: '0 16px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '13px', fontSize: '14px', fontWeight: '600' }}>
                  Back
                </button>
                <button onClick={stock.next} style={{ flex: '1', minHeight: '50px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '13px', fontSize: '14px', fontWeight: '600' }}>
                  Save & next
                </button>
                <button onClick={stock.done} style={{ flex: '1', minHeight: '50px', border: '0', borderRadius: '13px', background: '#1B7A4B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
                  Finish count
                </button>
              </div>
            </div>
          </>
        ) : null}
        {invTabs ? (
          <>
            <div style={s(`position: relative; display: flex; width: 100%; max-width: ${segMax}; background: #F4F1EE; border-radius: 12px; padding: 3px`)}>
              <span style={s(invTabPill)} />
              {(invTabs ?? []).map((it, $index) => (
                <Fragment key={$index}>
                  <button onClick={it.go} style={{ position: 'relative', flex: '1', minWidth: '0', minHeight: '40px', border: '0', background: 'transparent', borderRadius: '9px', fontSize: '12px', fontWeight: '600', color: '#4A342A', transition: 'color .2s ease' }}>
                    <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>{it.label}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          </>
        ) : null}
        {invEditable ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ flex: '1', minWidth: '0', display: 'flex', alignItems: 'center', gap: '8px', height: '44px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '12px', padding: '0 12px' }}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8A7062" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                  <path d={ic.search} />
                </svg>
                <input value={invQ} onChange={setInvQ} placeholder="Search this list" style={{ flex: '1', minWidth: '0', height: '100%', border: '0', background: 'transparent', fontSize: '13px', outline: 'none' }} />
              </span>
              {hasInvQ ? (
                <>
                  <button onClick={clearInvQ} style={{ minHeight: '44px', padding: '0 13px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', flexShrink: '0' }}>
                    Clear
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#6E574B' }}>
            {invCountLabel}
            {invLowCount ? (
              <>
                {' '}
                · {invLowCount} need attention
              </>
            ) : null}
          </span>
          {invEditable ? (
            <>
              <Pressable as="button" onClick={openAddInv} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 15px', border: '0', borderRadius: '11px', background: '#C24A15', color: '#FFFFFF', fontSize: '13px', fontWeight: '600', boxShadow: '0 2px 10px -3px rgba(231,95,35,.55)', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.98)' }}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d={ic.plus} />
                </svg>
                Add stock
                {' '}
              </Pressable>
            </>
          ) : null}
        </div>
        <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', overflow: 'hidden' }}>
          {(invRows ?? []).map((iv, $index) => (
            <Fragment key={$index}>
              <Pressable as="button" onClick={iv.go} style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', background: 'transparent', border: '0', borderBottom: '1px solid #F2EEEB', padding: '12px 14px', minHeight: '60px', transition: 'background-color .2s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{iv.name}</span>
                  <span style={{ fontSize: '11px', color: '#66524A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {iv.sub}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: '0' }}>
                  {iv.expiring ? (
                    <>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#95600A', whiteSpace: 'nowrap' }}>
                        {iv.useBy}
                      </span>
                    </>
                  ) : null}
                  {iv.low ? (
                    <>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#A8231B' }}>Out of stock</span>
                    </>
                  ) : null}
                  {iv.warn ? (
                    <>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#95600A' }}>Low</span>
                    </>
                  ) : null}
                  <span style={{ minWidth: '78px', textAlign: 'right', fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                    {iv.qtyText}
                  </span>
                </span>
              </Pressable>
            </Fragment>
          ))}
        </div>
        {invEmpty ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '24px 0' }}>
              <span style={{ fontSize: '15px', fontWeight: '600' }}>Nothing here yet</span>
              <span style={{ fontSize: '13px', color: '#6E574B', textAlign: 'center' }}>{invEmptyText}</span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
