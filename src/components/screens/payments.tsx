import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function PaymentsScreen({ v }: { v: OpsVals }) {
  const {
      cols3, ic, recAllDone, recClear, recLeftText, recMethods, recRows, recTickAll, recTotalText
  } = v;
  return (
    <>
      <div data-screen-label="Payments" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ flex: '1', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '12px', color: '#6E574B' }}>
              Open your GCash and Maya activity, then tick each reference you can see landing.
            </span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#95600A' }}>{recLeftText}</span>
          </span>
          <Pressable as="button" onClick={recTickAll} style={{ minHeight: '42px', padding: '0 14px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
            Tick all
          </Pressable>
          <Pressable as="button" onClick={recClear} style={{ minHeight: '42px', padding: '0 14px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600', color: '#6E574B', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
            Start over
          </Pressable>
        </div>
        <div style={s(`display: grid; grid-template-columns: ${cols3}; gap: 10px`)}>
          {(recMethods ?? []).map((rm, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', border: '1px solid #EDE8E4', borderRadius: '14px', padding: '12px 13px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#6E574B' }}>{rm.pay}</span>
                <span style={{ fontSize: '19px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.4px' }}>
                  {rm.totalText}
                </span>
                {rm.done ? (
                  <>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#1B7A4B' }}>All matched · {rm.n}</span>
                  </>
                ) : null}
                {rm.leftText ? (
                  <>
                    <span style={{ fontSize: '11px', color: '#95600A', fontVariantNumeric: 'tabular-nums' }}>
                      {rm.leftText} unticked
                    </span>
                  </>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
        <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', overflow: 'hidden' }}>
          {(recRows ?? []).map((rr, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 13px', borderBottom: '1px solid #F2EEEB' }}>
                <Pressable as="button" onClick={rr.toggle} aria-label={`Tick ${rr.ref}`} style={{ width: '26px', height: '26px', flexShrink: '0', borderRadius: '8px', display: 'grid', placeItems: 'center', transition: 'background-color .16s ease, border-color .16s ease', border: '1px solid #DCD5CF', background: '#FFFFFF' }} hoverStyle={{ borderColor: '#C24A15' }}>
                  {rr.ticked ? (
                    <>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#1B7A4B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={ic.check} />
                      </svg>
                    </>
                  ) : null}
                </Pressable>
                <button onClick={rr.open} style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', border: '0', background: 'transparent', textAlign: 'left' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{rr.ref}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 6px', fontSize: '11px', color: '#66524A' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>{rr.id}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>· {rr.name}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>· {rr.pay}</span>
                  </span>
                </button>
                {rr.pending ? (
                  <>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#95600A', whiteSpace: 'nowrap' }}>
                      Not confirmed
                    </span>
                  </>
                ) : null}
                {rr.flagged ? (
                  <>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#A8231B', whiteSpace: 'nowrap' }}>
                      {rr.flagText}
                    </span>
                  </>
                ) : null}
                <span style={{ minWidth: '74px', textAlign: 'right', fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                  {rr.amountText}
                </span>
              </div>
            </Fragment>
          ))}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', padding: '12px 13px', background: '#FCFBFA' }}>
            <span style={{ fontSize: '12px', color: '#6E574B' }}>Total in the book</span>
            <span style={{ marginLeft: 'auto', fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
              {recTotalText}
            </span>
          </div>
        </div>
        {recAllDone ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #C6E5D5', background: '#E8F5EE', borderRadius: '14px', padding: '12px 13px' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1B7A4B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                <path d={ic.check} />
              </svg>
              <span style={{ fontSize: '13px', color: '#14603A', lineHeight: '1.45' }}>
                Every reference is accounted for. Do this the same day — GCash only keeps the last 15 transactions on screen.
              </span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
