import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';
import { LiveShopFooter } from '@/components/live/live-shop-footer';

export function ShopScreen({ v }: { v: OpsVals }) {
  const {
      boxCount, boxCountText, boxCta, boxProgressText, boxReady, boxTitle, boxTotalText, cols2,
      custToCheckout, dropBannerBg, dropBannerBr, dropBannerFg, dropBannerSub, dropBannerTitle,
      bareFrame, dropStates, goBackOwner, ic, openLookup, pickedItems, priceNote, shopFlavours
  } = v;
  return (
    <>
      <div data-screen-label="Customer shop" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 14px 32px', background: '#FFF5E5', minHeight: '100%' }}>
        {bareFrame ? null : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Pressable as="button" onClick={goBackOwner} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', minHeight: '42px', padding: '0 11px', border: '1px solid #EADCC4', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF8ED' }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#6E574B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={ic.back} />
            </svg>
            Back to ops
            {' '}
          </Pressable>
          <span style={{ marginRight: 'auto', fontSize: '11px', color: '#66524A' }}>Preview · customer view</span>
          <div style={{ display: 'flex', gap: '3px', background: 'rgba(58,31,20,.06)', borderRadius: '9px', padding: '3px' }}>
            {(dropStates ?? []).map((dst, $index) => (
              <Fragment key={$index}>
                <Pressable as="button" onClick={dst.go} style={{ position: 'relative', border: '0', background: 'transparent', borderRadius: '7px', padding: '5px 9px', fontSize: '11px', fontWeight: '600', color: '#4A342A', transition: 'color .18s ease' }} hoverStyle={{ color: '#3A1F14' }}>
                  {dst.on ? (
                    <>
                      <span style={{ position: 'absolute', inset: '0', background: '#FFFFFF', borderRadius: '7px', animation: 'hcFade .18s ease-out' }} />
                    </>
                  ) : null}
                  <span style={{ position: 'relative' }}>{dst.label}</span>
                </Pressable>
              </Fragment>
            ))}
          </div>
        </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '2px' }}>
          <img src="/assets/logo-full.png" alt="The Happy Cookie" style={{ height: '56px', width: 'auto', alignSelf: 'flex-start', margin: '-4px 0 -2px -6px' }} />
          <h1 style={{ margin: '0', fontSize: '28px', fontWeight: '700', letterSpacing: '-.8px', lineHeight: '1.1' }}>
            This week's drop
          </h1>
          <span style={{ maxWidth: '34ch', fontSize: '14px', lineHeight: '1.45', color: '#6E574B', textWrap: 'pretty' }}>
            4 classics + 2 rotating flavours, baked fresh this weekend.
          </span>
        </div>
        <div style={s(`display: flex; flex-direction: column; gap: 3px; border-radius: 14px; padding: 12px 14px; background: ${dropBannerBg}; border: 1px solid ${dropBannerBr}`)}>
          <span style={s(`font-size: 14px; font-weight: 700; color: ${dropBannerFg}`)}>{dropBannerTitle}</span>
          <span style={s(`font-size: 12px; color: ${dropBannerFg}`)}>{dropBannerSub}</span>
        </div>
        <div style={s(`display: grid; grid-template-columns: ${cols2}; gap: 10px`)}>
          {(shopFlavours ?? []).map((sf, $index) => (
            <Fragment key={$index}>
              <Pressable as="div" style={{ position: 'relative', display: 'flex', gap: '12px', background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '12px', transition: 'transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .2s ease' }} hoverStyle={{ transform: 'translateY(-2px)', boxShadow: '0 10px 22px -14px rgba(58,31,20,.4)' }}>
                {sf.picked ? (
                  <>
                    <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '18px', animation: 'hcFade .2s ease-out' }} />
                  </>
                ) : null}
                <span style={s(sf.imgStyle)} />
                <span style={{ position: 'relative', flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ minWidth: '0', fontSize: '14px', fontWeight: '700', letterSpacing: '-.1px' }}>{sf.name}</span>
                    {sf.kind ? (
                      <>
                        <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '.05em', textTransform: 'uppercase', color: '#A98A5F', whiteSpace: 'nowrap' }}>
                          {sf.kind}
                        </span>
                      </>
                    ) : null}
                    <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                      {sf.priceText}
                    </span>
                  </span>
                  <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.45', textWrap: 'pretty' }}>{sf.desc}</span>
                  <span style={{ fontSize: '10px', color: '#A98A5F' }}>{sf.allergens}</span>
                  {sf.available ? (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', border: '1px solid #EADCC4', borderRadius: '12px', background: '#FFFFFF', marginTop: '2px' }}>
                        <Pressable as="button" onClick={sf.minus} aria-label="Remove one" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', borderRadius: '12px', display: 'grid', placeItems: 'center', transition: 'background-color .16s ease, transform .14s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#FFF5E5' }} activeStyle={{ transform: 'scale(.9)' }}>
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                            <path d={ic.minus} />
                          </svg>
                        </Pressable>
                        <span style={{ minWidth: '30px', textAlign: 'center', fontSize: '16px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                          {sf.qty}
                        </span>
                        <Pressable as="button" onClick={sf.plus} aria-label="Add one" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', borderRadius: '12px', display: 'grid', placeItems: 'center', transition: 'background-color .16s ease, transform .14s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#FFF5E5' }} activeStyle={{ transform: 'scale(.9)' }}>
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                            <path d={ic.plus} />
                          </svg>
                        </Pressable>
                      </span>
                    </>
                  ) : null}
                  {sf.soldOut ? (
                    <>
                      <span style={{ alignSelf: 'flex-start', marginTop: '2px', background: '#F4F1EE', color: '#5D4B41', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', fontWeight: '700' }}>
                        Sold out this drop
                      </span>
                    </>
                  ) : null}
                </span>
              </Pressable>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700' }}>{boxTitle}</span>
            <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: '600', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}>
              {boxCountText}
            </span>
          </div>
          {boxReady ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', background: '#FFFBF3', borderRadius: '14px', padding: '8px' }}>
                {(pickedItems ?? []).map((bx, $index) => (
                  <Fragment key={$index}>
                    <Pressable as="button" onClick={bx.remove} aria-label={`Remove one ${bx.name}`} title={`Tap to remove one ${bx.name}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '5px 11px 5px 6px', borderRadius: '999px', background: '#FFFFFF', border: '1px solid #E4D2B4', boxShadow: '0 1px 3px -1px rgba(58,31,20,.22)', transition: 'transform .15s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease' }} hoverStyle={{ transform: 'translateY(-2px)', boxShadow: '0 5px 10px -3px rgba(58,31,20,.28)' }} activeStyle={{ transform: 'scale(.96)' }}>
                      <span style={s(`${bx.imgStyle}; animation: hcPop .26s cubic-bezier(.3,1.5,.5,1)`)} />
                      <span style={{ fontSize: '12px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{bx.qty}</span>
                      <span style={{ fontSize: '12px', color: '#6E574B' }}>{bx.name}</span>
                    </Pressable>
                  </Fragment>
                ))}
              </div>
            </>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#6E574B' }}>{boxProgressText}</span>
            <span style={{ marginLeft: 'auto', fontSize: '20px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
              {boxTotalText}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ flex: '1', minWidth: '0', fontSize: '11px', lineHeight: '1.45', color: '#66524A', textWrap: 'pretty' }}>
              {priceNote}
            </span>
            {boxCount ? (
              <>
                <span style={{ fontSize: '11px', color: '#A98A5F', whiteSpace: 'nowrap' }}>Tap to remove one</span>
              </>
            ) : null}
          </div>
          {boxReady ? (
            <>
              <Pressable as="button" onClick={custToCheckout} style={{ minHeight: '54px', border: '0', borderRadius: '14px', background: '#C24A15', color: '#FFFFFF', fontSize: '16px', fontWeight: '700', boxShadow: '0 3px 12px -4px rgba(231,95,35,.55)', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.98)' }}>
                {boxCta}
              </Pressable>
            </>
          ) : null}
        </div>
        {bareFrame ? <LiveShopFooter v={v} /> : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '4px 2px 0' }}>
          <span style={{ width: '44px', height: '44px', flexShrink: '0', borderRadius: '10px', border: '1px solid #EADCC4', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
            <span style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '.04em', color: '#C24A15' }}>BIR</span>
            <span style={{ fontSize: '7px', fontWeight: '600', color: '#8A7062' }}>REGISTERED</span>
          </span>
          <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#6E574B' }}>The Happy Cookie · TIN 123-456-789-000</span>
            <span style={{ fontSize: '10px', lineHeight: '1.5', color: '#8A7062', textWrap: 'pretty' }}>
              An invoice is issued for every confirmed order. Contains milk, eggs, wheat and soy; peanuts and tree nuts in some flavours.
            </span>
            <Pressable as="button" onClick={openLookup} style={{ alignSelf: 'flex-start', minHeight: '38px', padding: '0', border: '0', background: 'transparent', fontSize: '11px', fontWeight: '600', color: '#6E574B', transition: 'color .18s ease' }} hoverStyle={{ color: '#3A1F14' }}>
              Already ordered? Find my order
            </Pressable>
          </span>
        </div>
        )}
      </div>
    </>
  );
}
