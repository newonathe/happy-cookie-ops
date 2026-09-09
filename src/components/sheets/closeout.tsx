import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';

export function CloseoutSheet({ v }: { v: OpsVals }) {
  const {
      bzCloseout, bzReturns, closeEvent, digitalTotals, drawerCashText, drawerCounted,
      drawerDiffText, drawerExpectedText, drawerFloatText, helperBazaarNote, setCounted,
      showEventMoney
  } = v;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {showEventMoney ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#66524A' }}>Revenue</span>
                <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                  {bzCloseout.revenue}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#66524A' }}>Cookie cost</span>
                <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{bzCloseout.cogs}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#66524A' }}>Event expenses</span>
                <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                  {bzCloseout.expenses}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#66524A' }}>Profit</span>
                <span style={{ fontSize: '15px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{bzCloseout.profit}</span>
              </span>
            </div>
          </>
        ) : null}
        {helperBazaarNote ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#F8F6F4', border: '1px solid #EDE8E4', borderRadius: '12px', padding: '11px 12px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#3A1F14' }}>You can finish this table</span>
              <span style={{ fontSize: '12px', color: '#6E574B', lineHeight: '1.5' }}>
                Count the box and close up. Your name goes on the record.
              </span>
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', background: '#F8F6F4', borderRadius: '12px', padding: '11px 12px' }}>
          <span style={{ fontSize: '12px', color: '#6E574B' }}>{bzCloseout.opening}</span>
          <span style={{ fontSize: '12px', color: '#6E574B' }}>{bzCloseout.sold} across {bzCloseout.salesCount}</span>
          <span style={{ fontSize: '12px', color: '#6E574B' }}>{bzCloseout.samples}</span>
          <span style={{ fontSize: '12px', color: '#6E574B' }}>{bzCloseout.remaining}</span>
        </div>
        {(bzReturns ?? []).map((br, $index) => (
          <Fragment key={$index}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <span style={{ flex: '1' }}>{br.name}</span>
              <span style={{ color: '#6E574B' }}>{br.qtyText}</span>
            </div>
          </Fragment>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', border: '1px solid #EDE8E4', borderRadius: '12px', padding: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600' }}>Count the cash box</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', fontSize: '12px', color: '#6E574B' }}>
            <span>Float {drawerFloatText} + cash sales {drawerCashText}</span>
            <span style={{ marginLeft: 'auto', fontSize: '15px', fontWeight: '600', color: '#3A1F14', fontVariantNumeric: 'tabular-nums' }}>
              {drawerExpectedText}
            </span>
          </div>
          <input value={drawerCounted} onChange={setCounted} inputMode="decimal" placeholder="What you actually counted" style={{ height: '48px', border: '1px solid #E4DDD8', borderRadius: '11px', padding: '0 12px', fontSize: '16px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
          {drawerDiffText ? (
            <>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#3A1F14' }}>{drawerDiffText}</span>
            </>
          ) : null}
          {(digitalTotals ?? []).map((dt, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', fontSize: '12px', color: '#6E574B' }}>
                <span>{dt.pay} — check your app</span>
                <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: '600', color: '#3A1F14' }}>
                  {dt.totalText}
                </span>
              </div>
            </Fragment>
          ))}
        </div>
        <span style={{ fontSize: '12px', color: '#66524A', lineHeight: '1.5' }}>Unsold cookies go back into stock.</span>
        <button onClick={closeEvent} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#3A1F14', color: '#FFF5E5', fontSize: '14px', fontWeight: '600' }}>
          Close the event
        </button>
      </div>
    </>
  );
}
