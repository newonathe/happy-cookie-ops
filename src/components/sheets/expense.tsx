import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function ExpenseSheet({ v }: { v: OpsVals }) {
  const { catOptions, expenseItems, saveExpense } = v;
  return (
    <>
      <form onSubmit={saveExpense} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input name="eamount" placeholder="Amount" inputMode="decimal" style={{ height: '52px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '17px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
        <select name="ecat" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 11px', fontSize: '14px', background: '#FFFFFF' }}>
          {(catOptions ?? []).map((co, $index) => (
            <Fragment key={$index}>
              <option value={co}>{co}</option>
            </Fragment>
          ))}
        </select>
        <input name="elabel" placeholder="What was it for? (optional)" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', background: '#FFFFFF' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#F8F6F4', borderRadius: '13px', padding: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600' }}>Was this stock you bought?</span>
          <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.5' }}>
            Name the item and how much came in, and this price becomes the one your cookie cost uses.
          </span>
          <select name="eitem" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 11px', fontSize: '14px', background: '#FFFFFF' }}>
            <option value="">Not a stock item</option>
            {(expenseItems ?? []).map((ei, $index) => (
              <Fragment key={$index}>
                <option value={ei.id}>{ei.label}</option>
              </Fragment>
            ))}
          </select>
          <input name="eqty" placeholder="How much came in" inputMode="decimal" style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 13px', fontSize: '14px', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
        </div>
        <button type="submit" style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
          Record expense
        </button>
      </form>
    </>
  );
}
