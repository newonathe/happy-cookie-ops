import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function DropsScreen({ v }: { v: OpsVals }) {
  const { drop, drop2, dropProducts, ic, pastDrops } = v;
  return (
    <>
      <div data-screen-label="Drops" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ border: '1px solid #EDE8E4', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>{drop2.no}</span>
            {drop2.closed ? (
              <>
                <span style={{ background: '#F4F1EE', color: '#5D4B41', border: '1px solid #E4DDD8', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: '600' }}>
                  {drop2.stateText}
                </span>
              </>
            ) : null}
            {drop.open ? (
              <>
                <span style={{ background: '#E8F5EE', color: '#1B7A4B', border: '1px solid #C6E5D5', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: '600' }}>
                  {drop2.stateText}
                </span>
              </>
            ) : null}
            {drop2.extended ? (
              <>
                <span style={{ background: '#FDF3E2', color: '#95600A', border: '1px solid #EFDCB5', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: '600' }}>
                  Extended
                </span>
              </>
            ) : null}
          </div>
          <span style={{ fontSize: '13px', color: '#6E574B' }}>{drop2.scheduleLine}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '24px', fontWeight: '600', letterSpacing: '-.5px' }}>{drop2.capNum}</span>
              <span style={{ fontSize: '13px', color: '#6E574B' }}>of {drop2.capValue} cookies confirmed</span>
            </div>
            <span style={{ height: '8px', borderRadius: '999px', background: '#F1EDEA', display: 'block', overflow: 'hidden' }}>
              <span style={s(`display: block; height: 100%; background: #E75F23; ${drop2.capBar}; transition: width .45s cubic-bezier(.2,.8,.2,1)`)} />
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#6E574B' }}>Cookies per drop</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #E7E1DC', borderRadius: '12px', background: '#FFFFFF' }}>
                <Pressable as="button" onClick={drop2.capDown} aria-label="Lower capacity" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                    <path d={ic.minus} />
                  </svg>
                </Pressable>
                <input value={drop2.capInput} onChange={drop2.setCap} inputMode="numeric" aria-label="Weekly capacity in cookies" style={{ width: '66px', height: '44px', border: '0', borderLeft: '1px solid #F2EEEB', borderRight: '1px solid #F2EEEB', background: 'transparent', textAlign: 'center', fontSize: '16px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }} />
                <Pressable as="button" onClick={drop2.capUp} aria-label="Raise capacity" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                    <path d={ic.plus} />
                  </svg>
                </Pressable>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {drop.open ? (
              <>
                <button onClick={drop2.closeEarly} style={{ flex: '1', minWidth: '130px', minHeight: '46px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600', color: '#A8231B' }}>
                  Close ordering
                </button>
              </>
            ) : null}
            {drop2.closed ? (
              <>
                <button onClick={drop2.reopen} style={{ flex: '1', minWidth: '130px', minHeight: '46px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '13px', fontWeight: '600' }}>
                  Open ordering
                </button>
              </>
            ) : null}
            <button onClick={drop2.preview} style={{ minHeight: '46px', padding: '0 14px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
              See the shop
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>This drop's menu</span>
          {(dropProducts ?? []).map((dp, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 0', borderBottom: '1px solid #F2EEEB' }}>
                <span style={s(dp.imgStyle)} />
                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{dp.name}</span>
                  <span style={{ fontSize: '11px', color: '#66524A' }}>{dp.priceText}</span>
                </span>
                {dp.soldOut ? (
                  <>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#95600A', flexShrink: '0' }}>Sold out</span>
                  </>
                ) : null}
                <button onClick={dp.toggleSold} style={{ minHeight: '42px', padding: '0 12px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', flexShrink: '0' }}>
                  {dp.soldLabel}
                </button>
              </div>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Past drops</span>
          {(pastDrops ?? []).map((pd, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid #F2EEEB' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', width: '62px' }}>{pd.label}</span>
                <span style={{ fontSize: '12px', color: '#66524A', width: '96px' }}>{pd.when}</span>
                <span style={{ flex: '1', fontSize: '12px', color: '#6E574B', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {pd.detail}
                </span>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
