import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function BakePlanScreen({ v }: { v: OpsVals }) {
  const { bakeAllDone, bakeRows, bakeTotals, cols2, ic, startFirst } = v;
  return (
    <>
      <div data-screen-label="Bake plan" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '30px', fontWeight: '600', letterSpacing: '-.8px' }}>{bakeTotals.toBakeNum}</span>
              <span style={{ fontSize: '15px', color: '#6E574B' }}>cookies still to bake</span>
            </span>
            <span style={{ fontSize: '13px', color: '#66524A' }}>{bakeTotals.summary}</span>
          </div>
          <Pressable as="button" onClick={startFirst} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '46px', padding: '0 18px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600', boxShadow: '0 2px 10px -3px rgba(231,95,35,.55)', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.978)' }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={ic.play} />
            </svg>
            Start production
            {' '}
          </Pressable>
        </div>
        <div style={s(`display: grid; grid-template-columns: ${cols2}; gap: 10px`)}>
          {(bakeRows ?? []).map((r, $index) => (
            <Fragment key={$index}>
              <div style={{ border: '1px solid #EDE8E4', borderRadius: '16px', padding: '13px', display: 'flex', flexDirection: 'column', gap: '11px', background: '#FFFFFF' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                  <span style={s(r.imgStyle)} />
                  <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>{r.name}</span>
                  </span>
                  {r.done ? (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#E8F5EE', color: '#1B7A4B', border: '1px solid #C6E5D5', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600' }}>
                        Done
                      </span>
                    </>
                  ) : null}
                  {r.hasWork ? (
                    <>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '20px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.4px' }}>
                          {r.actNum}
                        </span>
                        <span style={{ fontSize: '10px', color: '#66524A' }}>{r.actWord}</span>
                      </span>
                    </>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                  {r.hasDough ? (
                    <>
                      <Pressable as="button" onClick={r.openDough} style={{ minHeight: '32px', padding: '0 9px', margin: '-4px 0 -4px -9px', border: '0', background: 'transparent', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#6E574B', fontVariantNumeric: 'tabular-nums', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#F6F2EF' }}>
                        {r.doughText}
                      </Pressable>
                    </>
                  ) : null}
                  {r.noDough ? (
                    <>
                      <span>{r.doughText}</span>
                    </>
                  ) : null}
                </div>
                {r.hasWork ? (
                  <>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Pressable as="button" onClick={r.act} style={{ flex: '1', minHeight: '44px', border: '0', borderRadius: '11px', background: '#FDEDE5', color: '#A63C0E', fontSize: '13px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#FBE0D2' }} activeStyle={{ transform: 'scale(.985)' }}>
                        {r.actLabel}
                      </Pressable>
                      {r.canMixMore ? (
                        <>
                          <button onClick={r.mixAhead} style={{ minHeight: '44px', padding: '0 12px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '12px', fontWeight: '600' }}>
                            Mix
                          </button>
                        </>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
        {bakeAllDone ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '18px 0' }}>
              <span style={{ fontSize: '16px', fontWeight: '600' }}>Nothing left to bake</span>
              <span style={{ fontSize: '13px', color: '#6E574B' }}>Everything confirmed for this drop is already baked.</span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
