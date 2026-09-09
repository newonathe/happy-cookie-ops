import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

export function ReceiveSheet({ v }: { v: OpsVals }) {
  const { pickRecvItem, recvItem, recvPickList, saveReceive } = v;
  return (
    <>
      <form onSubmit={saveReceive} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Which item?</span>
          <select value={recvItem.name} onChange={pickRecvItem} style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 11px', fontSize: '14px', fontWeight: '600', background: '#FFFFFF', color: '#3A1F14' }}>
            {(recvPickList ?? []).map((rp, $index) => (
              <Fragment key={$index}>
                <option value={rp.id}>{rp.label}</option>
              </Fragment>
            ))}
          </select>
        </label>
        {recvItem.offListText ? (
          <>
            <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>{recvItem.offListText}</span>
          </>
        ) : null}
        {recvItem.plannedLine ? (
          <>
            <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>{recvItem.plannedLine}</span>
          </>
        ) : null}
        {recvItem.alreadyText ? (
          <>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#95600A' }}>{recvItem.alreadyText}</span>
          </>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '0' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>How much came in</span>
            <input name="rqty" defaultValue={recvItem.planned} inputMode="decimal" style={{ height: '48px', minWidth: '0', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }} />
            <span style={{ fontSize: '11px', color: '#8A7062' }}>In {recvItem.unit}</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '0' }}>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>What you paid</span>
            <input name="rpaid" defaultValue={recvItem.cost} inputMode="decimal" style={{ height: '48px', minWidth: '0', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }} />
            <span style={{ fontSize: '11px', color: '#8A7062' }}>Total, not per pack</span>
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Bought something else instead?</span>
          <input name="rsub" placeholder="Brand or pack you actually got — leave blank if usual" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '12px', padding: '0 13px', fontSize: '14px' }} />
        </label>
        <Pressable as="button" type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600', transition: 'background-color .2s ease, transform .16s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.985)' }}>
          Put it in stock
        </Pressable>
        <span style={{ fontSize: '11px', color: '#66524A', lineHeight: '1.5' }}>
          Less than planned keeps the item on your list with the remainder outstanding.
        </span>
      </form>
    </>
  );
}
