import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Pressable } from '@/components/ui/pressable';

export function InvEditSheet({ v }: { v: OpsVals }) {
  const {
      invMeta, invPickList, invSubtract, openSpoil, pickInvItem, removeInvItem, saveInvDelta,
      saveInvEdit, setSheetQty, sheet
  } = v;
  if (!sheet) throw new Error('inv-edit sheet requires active sheet data.');
  return (
    <>
      <form onSubmit={saveInvEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Which item?</span>
          <select value={sheet.name} onChange={pickInvItem} style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 11px', fontSize: '14px', fontWeight: '600', background: '#FFFFFF', color: '#3A1F14' }}>
            {(invPickList ?? []).map((ip, $index) => (
              <Fragment key={$index}>
                <option value={ip.id}>{ip.label}</option>
              </Fragment>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>How much do you have? ({sheet.unit})</span>
          <input name="qty" value={sheet.qty} onChange={setSheetQty} inputMode="decimal" style={{ height: '52px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
        </label>
        {invMeta ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: '#F8F6F4', borderRadius: '12px', padding: '11px 12px' }}>
              <span style={{ fontSize: '12px', color: '#6E574B' }}>{invMeta.system} · {invMeta.counted}</span>
              <span style={{ fontSize: '12px', color: '#66524A' }}>{invMeta.level} · usually from {invMeta.supplier}</span>
            </div>
          </>
        ) : null}
        <button type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Save the correction
        </button>
      </form>
      <form onSubmit={saveInvDelta} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: '600' }}>Or add and subtract ({sheet.unit})</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="button" onClick={invSubtract} style={{ minHeight: '48px', padding: '0 16px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '15px', fontWeight: '600' }}>
            Subtract
          </button>
          <input name="dq" placeholder="0" inputMode="decimal" style={{ flex: '1', minWidth: '0', height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '15px', fontWeight: '600', textAlign: 'center', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
          <button type="submit" style={{ minHeight: '48px', padding: '0 16px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '15px', fontWeight: '600' }}>
            Add
          </button>
        </div>
        <span style={{ fontSize: '11px', color: '#66524A', lineHeight: '1.5' }}>Add what arrived, subtract what you used.</span>
      </form>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Pressable as="button" onClick={openSpoil} style={{ flex: '1', minWidth: '120px', minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FBFAF9' }}>
          Write off waste
        </Pressable>
        <Pressable as="button" onClick={removeInvItem} style={{ minHeight: '44px', padding: '0 14px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', color: '#A8231B', transition: 'background-color .18s ease' }} hoverStyle={{ background: '#FFF6F5' }}>
          Remove
        </Pressable>
      </div>
    </>
  );
}
