import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';
import { LiveCheckout } from '@/components/live/live-checkout';

export function CheckoutScreen({ v }: { v: OpsVals }) {
  const { backToShop, bareFrame, cust, ic } = v;
  return (
    <>
      <div data-screen-label="Customer checkout" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 14px 32px', background: '#FFF5E5', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Pressable as="button" onClick={backToShop} aria-label="Back" style={{ width: '42px', height: '42px', border: '1px solid #EADCC4', background: '#FFFFFF', borderRadius: '11px', display: 'grid', placeItems: 'center', transition: 'background-color .18s ease, transform .15s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#FFF8ED' }} activeStyle={{ transform: 'scale(.94)' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3A1F14" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={ic.back} />
            </svg>
          </Pressable>
          <span style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-.4px' }}>Almost yours</span>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>Your order</span>
          {(cust.lines ?? []).map((cl, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={s(cl.imgStyle)} />
                <span style={{ flex: '1', minWidth: '0', fontSize: '13px', fontWeight: '500' }}>{cl.name}</span>
                <span style={{ fontSize: '12px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>{cl.qty}</span>
                <span style={{ fontSize: '13px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{cl.line}</span>
              </div>
            </Fragment>
          ))}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', paddingTop: '9px', borderTop: '1px solid #F5EEE2' }}>
            <span style={{ fontSize: '12px', color: '#6E574B' }}>{cust.countText}</span>
            <span style={{ marginLeft: 'auto', fontSize: '20px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
              {cust.totalText}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#66524A' }}>{cust.priceNote}</span>
        </div>
        {bareFrame ? <LiveCheckout v={v} /> : (
        <>
        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '11px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>About you</span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Name</span>
            <input value={cust.name} onChange={cust.setName} placeholder="Who is this box for?" style={{ height: '48px', border: '1px solid #EADCC4', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFDF9' }} />
            {cust.errName ? (
              <>
                <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errName}</span>
              </>
            ) : null}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Mobile number</span>
            <input value={cust.mobile} onChange={cust.setMobile} inputMode="tel" placeholder="What's your mobile number?" style={{ height: '48px', border: '1px solid #EADCC4', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFDF9' }} />
            {cust.errMobile ? (
              <>
                <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errMobile}</span>
              </>
            ) : null}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Email</span>
            <input value={cust.email} onChange={cust.setEmail} inputMode="email" placeholder="you@email.com" style={{ height: '48px', border: '1px solid #EADCC4', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFDF9' }} />
            {cust.errEmail ? (
              <>
                <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errEmail}</span>
              </>
            ) : null}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>
              Instagram handle
              {' '}
              <span style={{ color: '#66524A', fontWeight: '400' }}>(optional)</span>
            </span>
            <input value={cust.ig} onChange={cust.setIg} placeholder="@yourhandle" style={{ height: '48px', border: '1px solid #EADCC4', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFDF9' }} />
          </label>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>Collection</span>
          <span style={{ fontSize: '11px', color: '#66524A' }}>Book your own Grab or Lalamove.</span>
          {(cust.windows ?? []).map((cw, $index) => (
            <Fragment key={$index}>
              <Pressable as="button" onClick={cw.pick} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', minHeight: '60px', border: '1px solid #EADCC4', background: '#FFFDF9', borderRadius: '12px', padding: '11px 13px', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF8ED' }}>
                {cw.on ? (
                  <>
                    <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '12px', animation: 'hcFade .18s ease-out' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative', width: '20px', height: '20px', borderRadius: '999px', border: '2px solid #DCC9AE', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                  {cw.on ? (
                    <>
                      <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: '#E75F23' }} />
                    </>
                  ) : null}
                </span>
                <span style={{ position: 'relative', flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700' }}>{cw.label}</span>
                  <span style={{ fontSize: '12px', color: '#6E574B' }}>{cw.time} · {cw.left}</span>
                </span>
              </Pressable>
            </Fragment>
          ))}
          {cust.errWindow ? (
            <>
              <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errWindow}</span>
            </>
          ) : null}
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>Payment</span>
          <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
            Send
            {' '}
            <strong style={{ fontWeight: '700', color: '#3A1F14', fontVariantNumeric: 'tabular-nums' }}>{cust.totalText}</strong>
            {' '}
            to one of these, then attach the screenshot.
          </span>
          {(cust.methods ?? []).map((cm, $index) => (
            <Fragment key={$index}>
              <Pressable as="button" onClick={cm.pick} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '11px', width: '100%', textAlign: 'left', minHeight: '58px', border: '1px solid #EADCC4', background: '#FFFDF9', borderRadius: '12px', padding: '11px 13px', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF8ED' }}>
                {cm.on ? (
                  <>
                    <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '12px', animation: 'hcFade .18s ease-out' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative', width: '20px', height: '20px', borderRadius: '999px', border: '2px solid #DCC9AE', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                  {cm.on ? (
                    <>
                      <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: '#E75F23' }} />
                    </>
                  ) : null}
                </span>
                <span style={{ position: 'relative', flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700' }}>{cm.label}</span>
                  <span style={{ fontSize: '12px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
                    {cm.num} · {cm.holder}
                  </span>
                </span>
              </Pressable>
            </Fragment>
          ))}
          {cust.errPay ? (
            <>
              <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errPay}</span>
            </>
          ) : null}
          {cust.qr ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px', background: '#FFFBF3', border: '1px solid #F0E2CB', borderRadius: '14px', padding: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>{cust.qrTitle}</span>
                <span style={s(cust.qr)} />
                <span style={{ maxWidth: '34ch', fontSize: '11px', color: '#8A7062', textAlign: 'center', lineHeight: '1.5', textWrap: 'pretty' }}>
                  {cust.qrNote}
                </span>
              </div>
            </>
          ) : null}
          {cust.noQr ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', background: '#FFFBF3', border: '1px dashed #EADCC4', borderRadius: '14px', padding: '13px' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#B08A56" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
                  <path d={ic.info} />
                </svg>
                <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.5', textWrap: 'pretty' }}>
                  Pick a payment method above and the QR to scan appears here. Bank transfer to 0962 962 5341 and cash on pickup are also accepted — message Cine to arrange either.
                </span>
              </div>
            </>
          ) : null}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Reference number</span>
            <input value={cust.ref} onChange={cust.setRef} placeholder="From your receipt" style={{ height: '48px', border: '1px solid #EADCC4', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontVariantNumeric: 'tabular-nums', background: '#FFFDF9' }} />
            {cust.errRef ? (
              <>
                <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errRef}</span>
              </>
            ) : null}
            {cust.refHint ? (
              <>
                <span style={{ fontSize: '11px', color: '#8A7062' }}>{cust.refHint}</span>
              </>
            ) : null}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '0' }}>
              <span style={{ fontSize: '12px', fontWeight: '600' }}>Amount you sent</span>
              <input value={cust.amount} onChange={cust.setAmount} inputMode="decimal" placeholder="0" style={{ height: '48px', minWidth: '0', border: '1px solid #EADCC4', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontVariantNumeric: 'tabular-nums', background: '#FFFDF9' }} />
              {cust.errAmount ? (
                <>
                  <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errAmount}</span>
                </>
              ) : null}
              {cust.amountHint ? (
                <>
                  <span style={{ fontSize: '11px', color: '#8A7062' }}>{cust.amountHint}</span>
                </>
              ) : null}
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>Payment screenshot</span>
            {cust.proofNone ? (
              <>
                <Pressable as="button" onClick={cust.upload} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '96px', border: '1px dashed #DCC9AE', background: '#FFFDF9', borderRadius: '12px', padding: '14px', transition: 'background-color .18s ease, border-color .18s ease' }} hoverStyle={{ background: '#FFF8ED', borderColor: '#C9AE8A' }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#C24A15" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ic.export} />
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>Attach your screenshot</span>
                  <span style={{ fontSize: '11px', color: '#66524A' }}>Required before you can submit</span>
                </Pressable>
              </>
            ) : null}
            {cust.proofUploading ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px', border: '1px solid #EADCC4', background: '#FFFDF9', borderRadius: '14px', padding: '18px' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '999px', border: '2px solid #F0E2CB', borderTopColor: '#E75F23', animation: 'hcSpin .8s linear infinite' }} />
                  <span style={{ fontSize: '13px', color: '#6E574B' }}>Uploading…</span>
                </div>
              </>
            ) : null}
            {cust.proofDone ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px', border: '1px solid #C6E5D5', background: '#E8F5EE', borderRadius: '14px', padding: '13px', animation: 'hcRise .22s ease-out' }}>
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#1B7A4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                    <path d={ic.check} />
                  </svg>
                  <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#14603A' }}>Screenshot attached</span>
                    <span style={{ fontSize: '11px', color: '#1B7A4B' }}>gcash-receipt.jpg · 412 KB</span>
                  </span>
                  <Pressable as="button" onClick={cust.removeProof} style={{ minHeight: '42px', padding: '0 11px', border: '1px solid #C6E5D5', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#F3FAF6' }}>
                    Replace
                  </Pressable>
                </div>
              </>
            ) : null}
            {cust.errProof ? (
              <>
                <span style={{ fontSize: '11px', color: '#A8231B' }}>{cust.errProof}</span>
              </>
            ) : null}
          </div>
        </div>
        <Pressable as="button" onClick={cust.submit} style={{ minHeight: '56px', border: '0', borderRadius: '14px', background: '#C24A15', color: '#FFFFFF', fontSize: '16px', fontWeight: '700', boxShadow: '0 4px 16px -5px rgba(231,95,35,.6)', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.985)' }}>
          Submit order
        </Pressable>
        <span style={{ maxWidth: '40ch', alignSelf: 'center', fontSize: '11px', color: '#66524A', textAlign: 'center', lineHeight: '1.5', textWrap: 'pretty' }}>
          Your slot is held once Cine verifies the payment.
        </span>
        </>
        )}
      </div>
    </>
  );
}
