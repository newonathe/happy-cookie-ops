import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';
import { LiveLookup } from '@/components/live/live-checkout';

export function FindMyOrderScreen({ v }: { v: OpsVals }) {
  const { backToShop, bareFrame, ic, lookupMissed, lookupQ, runLookup, setLookupIn } = v;
  return (
    <>
      <div data-screen-label="Find my order" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '16px 14px 32px', background: '#FFF5E5', minHeight: '100%' }}>
        <Pressable as="button" onClick={backToShop} aria-label="Back" style={{ alignSelf: 'flex-start', width: '42px', height: '42px', border: '1px solid #EADCC4', background: '#FFFFFF', borderRadius: '11px', display: 'grid', placeItems: 'center', transition: 'background-color .18s ease, transform .15s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#FFF8ED' }} activeStyle={{ transform: 'scale(.94)' }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#6E574B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={ic.back} />
          </svg>
        </Pressable>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <h1 style={{ margin: '0', fontSize: '26px', fontWeight: '700', letterSpacing: '-.7px', lineHeight: '1.12' }}>
            Find my order
          </h1>
          {bareFrame ? null : (
          <p style={{ margin: '0', maxWidth: '34ch', fontSize: '14px', lineHeight: '1.5', color: '#6E574B', textWrap: 'pretty' }}>
            Lost the link we emailed you? Your order number, payment reference or email will find it.
          </p>
          )}
        </div>
        {bareFrame ? <LiveLookup v={v} /> : (
        <form onSubmit={runLookup} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '15px' }}>
          <input value={lookupQ} onChange={setLookupIn} placeholder="HC-1042, a reference, or your email" style={{ height: '52px', border: '1px solid #EADCC4', borderRadius: '12px', padding: '0 13px', fontSize: '15px', background: '#FFFDF9' }} />
          <Pressable as="button" type="submit" style={{ minHeight: '52px', border: '0', borderRadius: '14px', background: '#C24A15', color: '#FFFFFF', fontSize: '15px', fontWeight: '700', transition: 'background-color .2s ease, transform .16s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.98)' }}>
            Find it
          </Pressable>
          {lookupMissed ? (
            <>
              <span style={{ fontSize: '12px', color: '#A8231B', lineHeight: '1.45' }}>
                Nothing matches that. Check the number, or message Cine on Instagram and she will look it up.
              </span>
            </>
          ) : null}
        </form>
        )}
      </div>
    </>
  );
}
