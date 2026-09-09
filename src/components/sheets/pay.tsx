import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function PaySheet({ v }: { v: OpsVals }) {
  const {
      bzDueText, cashTenders, changeText, clerkName, discountOptions, payMethods, saleRef,
      setSaleRefIn, setTenderedIn, tendered
  } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: '#6E574B' }}>Due</span>
          <span style={{ marginLeft: 'auto', fontSize: '26px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.6px' }}>
            {bzDueText}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(discountOptions ?? []).map((dc, $index) => (
            <Fragment key={$index}>
              <Pressable as="button" onClick={dc.go} style={{ position: 'relative', flex: '1', minHeight: '44px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                {dc.on ? (
                  <>
                    <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '11px' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative' }}>{dc.label}</span>
              </Pressable>
            </Fragment>
          ))}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Cash handed over</span>
          <input value={tendered} onChange={setTenderedIn} inputMode="decimal" placeholder="Leave blank if exact" style={{ height: '52px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '18px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
          <span style={{ display: 'flex', gap: '6px' }}>
            {(cashTenders ?? []).map((ct2, $index) => (
              <Fragment key={$index}>
                <Pressable as="button" onClick={ct2.go} style={{ flex: '1', minHeight: '40px', border: '1px solid #E4DDD8', background: '#FFFFFF', borderRadius: '10px', fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                  {ct2.label}
                </Pressable>
              </Fragment>
            ))}
          </span>
        </label>
        {changeText ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', background: '#FDEDE5', border: '1px solid #F7D6C5', borderRadius: '12px', padding: '12px 13px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#A63C0E' }}>Change due</span>
              <span style={{ marginLeft: 'auto', fontSize: '24px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', color: '#A63C0E', letterSpacing: '-.5px' }}>
                {changeText}
              </span>
            </div>
          </>
        ) : null}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Last 4 of their reference</span>
          <input id="hc-sale-ref" value={saleRef} onChange={setSaleRefIn} inputMode="numeric" placeholder="Needed for GCash, Maya and GoTyme" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '15px', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {(payMethods ?? []).map((pm, $index) => (
            <Fragment key={$index}>
              <Pressable as="button" onClick={pm.go} style={s(pm.style)} activeStyle={{ transform: 'scale(.97)' }}>
                <span style={{ fontSize: '16px', fontWeight: '700' }}>{pm.label}</span>
                {pm.blocked ? (
                  <>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#A8231B' }}>needs the last 4</span>
                  </>
                ) : null}
              </Pressable>
            </Fragment>
          ))}
        </div>
        <span style={{ fontSize: '11px', color: '#66524A' }}>Rung up by {clerkName}</span>
      </div>
    </>
  );
}
