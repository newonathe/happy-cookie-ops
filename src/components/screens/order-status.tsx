import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

export function OrderStatusScreen({ v }: { v: OpsVals }) {
  const { backToShop, cust, goBackOwner, ic } = v;
  return (
    <>
      <div data-screen-label="Customer order status" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 14px 32px', background: '#FFF5E5', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Pressable as="button" onClick={backToShop} aria-label="Back to the cookies" style={{ width: '42px', height: '42px', flexShrink: '0', border: '1px solid #EADCC4', background: '#FFFFFF', borderRadius: '11px', display: 'grid', placeItems: 'center', transition: 'background-color .18s ease, transform .15s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#FFF8ED' }} activeStyle={{ transform: 'scale(.94)' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3A1F14" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={ic.back} />
            </svg>
          </Pressable>
          <span style={{ marginRight: 'auto', fontSize: '11px', color: '#66524A' }}>Preview · customer view</span>
          <Pressable as="button" onClick={goBackOwner} style={{ flexShrink: '0', minHeight: '42px', padding: '0 11px', border: '1px solid #EADCC4', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', color: '#6E574B', whiteSpace: 'nowrap', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF8ED' }}>
            Back to ops
          </Pressable>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center', animation: 'hcRise .3s ease-out' }}>
          <img src="/assets/mark-solid.png" alt="" style={{ height: '78px', width: 'auto' }} />
          <span style={{ fontSize: '26px', fontWeight: '700', letterSpacing: '-.6px', textWrap: 'balance' }}>{cust.heroTitle}</span>
          <p style={{ margin: '0', maxWidth: '32ch', fontSize: '14px', lineHeight: '1.55', color: '#6E574B', textWrap: 'pretty' }}>
            {cust.heroBody}
          </p>
          <span style={{ fontSize: '13px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '999px', padding: '7px 15px' }}>
            {cust.orderNo}
          </span>
          {cust.invoiceLine ? (
            <>
              <span style={{ fontSize: '11px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>{cust.invoiceLine}</span>
            </>
          ) : null}
          {cust.showRetry ? (
            <>
              <Pressable as="button" onClick={cust.restart} style={{ minHeight: '50px', padding: '0 20px', border: '0', borderRadius: '14px', background: '#C24A15', color: '#FFFFFF', fontSize: '15px', fontWeight: '700', transition: 'background-color .2s ease, transform .16s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.98)' }}>
                Send payment again
              </Pressable>
            </>
          ) : null}
        </div>
        {cust.showCode ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#3A1F14', color: '#FFF5E5', borderRadius: '18px', padding: '15px 16px' }}>
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: '#C6AC9B' }}>
                  Pickup code
                </span>
                <span style={{ fontSize: '12px', color: '#E4D2C5', lineHeight: '1.4' }}>
                  Show this at collection so we hand the right box over.
                </span>
              </span>
              <span style={{ fontSize: '24px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>
                {cust.pickupCode}
              </span>
            </div>
          </>
        ) : null}
        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {(cust.timeline ?? []).map((ct, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
                {ct.done ? (
                  <>
                    <span style={{ width: '13px', height: '13px', borderRadius: '999px', background: '#22945B', marginTop: '3px', flexShrink: '0' }} />
                  </>
                ) : null}
                {ct.now ? (
                  <>
                    <span style={{ width: '13px', height: '13px', borderRadius: '999px', background: '#E75F23', marginTop: '3px', flexShrink: '0', animation: 'hcBreathe 2s infinite' }} />
                  </>
                ) : null}
                {ct.todo ? (
                  <>
                    <span style={{ width: '13px', height: '13px', borderRadius: '999px', background: '#EADCC4', marginTop: '3px', flexShrink: '0' }} />
                  </>
                ) : null}
                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700' }}>{ct.what}</span>
                  <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.45' }}>{ct.sub}</span>
                </span>
              </div>
            </Fragment>
          ))}
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>Collection</span>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>{cust.windowText}</span>
          <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.5' }}>
            Book your Grab or Lalamove for that window. We send the exact address that morning.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Pressable as="button" onClick={cust.reorder} style={{ flex: '1', minWidth: '130px', minHeight: '48px', border: '1px solid #EADCC4', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF8ED' }}>
            Order this cookie again
          </Pressable>
        </div>
        <span style={{ fontSize: '11px', lineHeight: '1.5', color: '#8A7062', textWrap: 'pretty' }}>{cust.allergenNote}</span>
      </div>
    </>
  );
}
