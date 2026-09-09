import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function OrderDetailScreen({ v }: { v: OpsVals }) {
  const { ic, od } = v;
  return (
    <>
      {od ? (
        <>
          <div data-screen-label="Order detail" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                <span style={s(`border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 600; background: ${od.bg}; color: ${od.fg}; border: 1px solid ${od.br}`)}>
                  {od.label}
                </span>
                <span style={{ fontSize: '12px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>{od.id}</span>
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#66524A' }}>{od.placed}</span>
              </div>
              <h2 style={{ margin: '0', fontSize: '24px', fontWeight: '600', letterSpacing: '-.5px' }}>{od.name}</h2>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 6px', fontSize: '13px', color: '#6E574B' }}>
                {(od.contactBits ?? []).map((cb, $index) => (
                  <Fragment key={$index}>
                    <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{cb.text}</span>
                  </Fragment>
                ))}
              </span>
            </div>
            {od.needsReview ? (
              <>
                <div style={{ border: '1px solid #EFDCB5', background: '#FDF3E2', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: '#7A4E08' }}>Check this payment</span>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <Pressable as="button" onClick={od.openProof} style={{ width: '92px', height: '118px', flexShrink: '0', border: '1px dashed #DFC28D', background: '#FFFDF9', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#95600A', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.97)' }}>
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d={ic.doc} />
                      </svg>
                      <span style={{ fontSize: '11px', fontWeight: '600' }}>View proof</span>
                    </Pressable>
                    <div style={{ flex: '1', minWidth: '180px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#8A5B10' }}>Expected</span>
                        <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#3A1F14' }}>
                          {od.totalText}
                        </span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#8A5B10' }}>They sent</span>
                        {od.mismatch ? (
                          <>
                            <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#A8231B' }}>
                              {od.paidText}
                            </span>
                          </>
                        ) : null}
                        {od.paidOk ? (
                          <>
                            <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#1B7A4B' }}>
                              {od.paidText}
                            </span>
                          </>
                        ) : null}
                        <span style={{ fontSize: '12px', color: '#8A5B10' }}>{od.pay} · {od.ref}</span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#8A5B10' }}>Submitted</span>
                        <span style={{ fontSize: '13px', color: '#3A1F14' }}>{od.placed}</span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#8A5B10' }}>Collecting</span>
                        <span style={{ fontSize: '13px', color: '#3A1F14' }}>{od.pickup}</span>
                      </span>
                    </div>
                  </div>
                  {od.refBad ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#FFFFFF', border: '1px solid #EFDCB5', borderRadius: '12px', padding: '11px 12px' }}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#C9860F" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
                          <path d={ic.alert} />
                        </svg>
                        <span style={{ fontSize: '13px', lineHeight: '1.45', color: '#8A5B10' }}>{od.refBad}</span>
                      </div>
                    </>
                  ) : null}
                  {od.dup ? (
                    <>
                      <Pressable as="button" onClick={od.dup.go} style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left', background: '#FCECEA', border: '1px solid #F2CFCB', borderRadius: '12px', padding: '11px 12px', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#F9E2DE' }}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#A8231B" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0' }}>
                          <path d={ic.alert} />
                        </svg>
                        <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#8E1F18' }}>
                            This reference is already on {od.dup.id}
                          </span>
                          <span style={{ fontSize: '12px', color: '#A8231B' }}>
                            {od.dup.name} used the same number. Compare them before confirming.
                          </span>
                        </span>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#A8231B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: '0' }}>
                          <path d={ic.right} />
                        </svg>
                      </Pressable>
                    </>
                  ) : null}
                  {od.warn ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#FCECEA', border: '1px solid #F2CFCB', borderRadius: '12px', padding: '11px 12px' }}>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#A8231B" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
                          <path d={ic.alert} />
                        </svg>
                        <span style={{ fontSize: '13px', lineHeight: '1.45', color: '#8E1F18' }}>{od.warn}</span>
                      </div>
                    </>
                  ) : null}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Pressable as="button" onClick={od.confirm} style={{ minHeight: '50px', border: '0', borderRadius: '13px', background: '#1B7A4B', color: '#FFFFFF', fontSize: '15px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#16663F' }} activeStyle={{ transform: 'scale(.985)' }}>
                      Confirm payment
                    </Pressable>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={od.askClearer} style={{ flex: '1', minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
                        Ask for clearer proof
                      </button>
                      <button onClick={od.reject} style={{ minHeight: '44px', padding: '0 14px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', color: '#A8231B' }}>
                        Reject
                      </button>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#8A5B10', lineHeight: '1.45' }}>
                    Nothing is reserved until you confirm. Confirming books capacity and adds this order to the bake plan and grocery list.
                  </span>
                </div>
              </>
            ) : null}
            {od.hasBalance ? (
              <>
                <div style={{ border: '1px solid #EFDCB5', background: '#FDF3E2', borderRadius: '16px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#7A4E08' }}>{od.balanceText} still due</span>
                    <span style={{ fontSize: '12px', color: '#8A5B10' }}>
                      Part payment confirmed. Collect the rest before hand-over.
                    </span>
                  </span>
                  <Pressable as="button" onClick={od.settleBalance} style={{ minHeight: '42px', padding: '0 14px', border: '1px solid #EFDCB5', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFFBF3' }}>
                    Balance received
                  </Pressable>
                </div>
              </>
            ) : null}
            {od.isCancelled ? (
              <>
                <div style={{ border: '1px solid #F2CFCB', background: '#FCECEA', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {od.wasRejected ? (
                    <>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#8E1F18' }}>Proof rejected</span>
                    </>
                  ) : null}
                  {od.wasRefunded ? (
                    <>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#8E1F18' }}>Refunded and cancelled</span>
                    </>
                  ) : null}
                  <span style={{ fontSize: '13px', lineHeight: '1.45', color: '#8E1F18' }}>
                    Nothing is reserved. If they send a valid payment, put this back in your review queue.
                  </span>
                  <Pressable as="button" onClick={od.reopen} style={{ alignSelf: 'flex-start', minHeight: '42px', padding: '0 14px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '10px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF6F5' }}>
                    Reopen for review
                  </Pressable>
                </div>
              </>
            ) : null}
            {od.needsContact ? (
              <>
                <div style={{ border: '1px solid #F2CFCB', background: '#FCECEA', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#8E1F18' }}>A flavour ran out</span>
                  <span style={{ fontSize: '13px', lineHeight: '1.45', color: '#8E1F18' }}>{od.contactText}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button onClick={od.askSwap} style={{ minHeight: '40px', padding: '0 14px', border: '0', background: '#A8231B', color: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                      Record a replacement
                    </button>
                    <button onClick={od.clearContact} style={{ minHeight: '40px', padding: '0 14px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                      Sorted, no swap needed
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>In this order</span>
              {(od.lines ?? []).map((l, $index) => (
                <Fragment key={$index}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '11px', paddingBottom: '10px', borderBottom: '1px solid #F2EEEB' }}>
                    <span style={s(l.imgStyle)} />
                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      {l.out ? (
                        <>
                          <span style={{ fontSize: '13px', fontWeight: '600', textDecoration: 'line-through', color: '#A8231B' }}>
                            {l.name}
                          </span>
                        </>
                      ) : null}
                      {l.inStock ? (
                        <>
                          <span style={{ fontSize: '13px', fontWeight: '600' }}>{l.name}</span>
                        </>
                      ) : null}
                      <span style={{ fontSize: '11px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
                        {l.qty} {l.price}
                      </span>
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{l.line}</span>
                    <button onClick={l.flag} style={{ minHeight: '42px', padding: '0 10px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '9px', fontSize: '11px', fontWeight: '600', color: '#6E574B', flexShrink: '0' }}>
                      {l.flagLabel}
                    </button>
                    {l.out ? (
                      <>
                        <button onClick={l.swap} style={{ minHeight: '42px', padding: '0 10px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '9px', fontSize: '11px', fontWeight: '600', color: '#A8231B', flexShrink: '0' }}>
                          Swap
                        </button>
                      </>
                    ) : null}
                  </div>
                </Fragment>
              ))}
              {od.hasSwaps ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#F8F6F4', borderRadius: '12px', padding: '10px 12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#6E574B' }}>Replaced on this order</span>
                    {(od.swaps ?? []).map((sw, $index) => (
                      <Fragment key={$index}>
                        <span style={{ fontSize: '12px', color: '#66524A' }}>{sw.text}</span>
                      </Fragment>
                    ))}
                  </div>
                </>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', paddingTop: '2px' }}>
                <span style={{ fontSize: '14px', color: '#6E574B' }}>Total</span>
                <span style={{ marginLeft: 'auto', fontSize: '22px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.5px' }}>
                  {od.totalText}
                </span>
              </div>
            </div>
            {od.canPack ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Pressable as="button" onClick={od.pack} style={{ minHeight: '50px', border: '0', borderRadius: '13px', background: '#C24A15', color: '#FFFFFF', fontSize: '15px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.985)' }}>
                    Mark ready
                  </Pressable>
                  <span style={{ fontSize: '12px', color: '#66524A' }}>{od.packHint}</span>
                </div>
              </>
            ) : null}
            {od.canCollect ? (
              <>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Pressable as="button" onClick={od.collect} style={{ flex: '1', minHeight: '50px', border: '0', borderRadius: '13px', background: '#3A1F14', color: '#FFF5E5', fontSize: '15px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.985)' }}>
                    Mark collected
                  </Pressable>
                  <Pressable as="button" onClick={od.noShow} style={{ minHeight: '50px', padding: '0 15px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '13px', fontSize: '13px', fontWeight: '600', color: '#6E574B', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
                    No-show
                  </Pressable>
                </div>
              </>
            ) : null}
            {od.canRefund ? (
              <>
                <Pressable as="button" onClick={od.askRefund} style={{ alignSelf: 'flex-start', minHeight: '42px', padding: '0 14px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', color: '#A8231B', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF6F5' }}>
                  Refund and cancel
                </Pressable>
              </>
            ) : null}
            {od.hasInvoice ? (
              <>
                <span style={{ fontSize: '11px', color: '#66524A', fontVariantNumeric: 'tabular-nums' }}>
                  Invoice {od.invoice} · reference {od.ref} · issued on confirmation
                </span>
              </>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid #EDE8E4', borderRadius: '16px', padding: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>Progress</span>
              {(od.timeline ?? []).map((tl, $index) => (
                <Fragment key={$index}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    {tl.done ? (
                      <>
                        <span style={{ width: '11px', height: '11px', borderRadius: '999px', background: '#22945B', marginTop: '3px', flexShrink: '0' }} />
                      </>
                    ) : null}
                    {tl.now ? (
                      <>
                        <span style={{ width: '11px', height: '11px', borderRadius: '999px', background: '#E75F23', marginTop: '3px', flexShrink: '0', animation: 'hcBreathe 2s infinite' }} />
                      </>
                    ) : null}
                    {tl.todo ? (
                      <>
                        <span style={{ width: '11px', height: '11px', borderRadius: '999px', background: '#E4DDD8', marginTop: '3px', flexShrink: '0' }} />
                      </>
                    ) : null}
                    <span style={{ flex: '1', fontSize: '13px', fontWeight: '500' }}>{tl.what}</span>
                    <span style={{ fontSize: '12px', color: '#66524A' }}>{tl.when}</span>
                  </div>
                </Fragment>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F8F6F4', borderRadius: '14px', padding: '12px 14px' }}>
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '12px', color: '#6E574B' }}>Private order link</span>
                <span style={{ fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {od.link}
                </span>
                <span style={{ fontSize: '11px', color: '#66524A' }}>{od.linkSent}</span>
              </span>
              <button onClick={od.copyLink} style={{ minHeight: '40px', padding: '0 14px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                Copy
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
