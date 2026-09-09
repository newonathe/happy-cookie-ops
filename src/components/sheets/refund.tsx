import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

export function RefundSheet({ v }: { v: OpsVals }) {
  const { closeSheet, saveRefund, sheetAmountText } = v;
  return (
    <>
      <form onSubmit={saveRefund} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
          Send {sheetAmountText} back to the account they paid from, then record the outgoing reference here. Revenue drops by that amount and the cookies go back into stock.
        </span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Refund reference</span>
          <input name="rref" placeholder="From your send-money receipt" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontVariantNumeric: 'tabular-nums' }} />
        </label>
        <Pressable as="button" type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#A8231B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.985)' }}>
          Record refund and cancel
        </Pressable>
        <button onClick={closeSheet} style={{ minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
          Keep the order
        </button>
      </form>
    </>
  );
}
