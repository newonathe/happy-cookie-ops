import type * as React from 'react';
import type { LiveStockPriceRow, LiveStockSupplierEdit, OpsVals } from '@/view-models/vals';
import { STOCK_COPY as C } from '@/lib/orders/staff-copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

type LiveStockSuppliers = NonNullable<OpsVals['liveStockSuppliers']>;

const fieldValue = (form: HTMLFormElement, name: string): string =>
  (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
const isChecked = (form: HTMLFormElement, name: string): boolean =>
  (form.elements.namedItem(name) as HTMLInputElement | null)?.checked === true;

const rowCard = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
  border: '1px solid #E7E1DC',
  borderRadius: '12px',
  padding: '11px'
};

/**
 * What the edit form reads back: the supplier, every existing price row, and the blank new price row only when it
 * has an item picked. A blank price is NaN, never 0, so a cleared price is refused rather than saved as free.
 */
export function readSupplierForm(
  form: HTMLFormElement,
  before: LiveStockSupplierEdit
): LiveStockSupplierEdit {
  const prices: LiveStockPriceRow[] = [];
  for (let i = 0; i <= before.prices.length; i += 1) {
    const itemName = fieldValue(form, 'prItem' + i).trim();
    if (i === before.prices.length && itemName === '') continue;
    const raw = fieldValue(form, 'prPrice' + i).trim();
    prices.push({
      id: before.prices[i]?.id ?? before.newPriceId,
      itemName,
      packLabel: fieldValue(form, 'prPack' + i).trim(),
      pricePesos: raw === '' ? Number.NaN : Number(raw),
      lastBought: fieldValue(form, 'prBought' + i).trim(),
      preferred: isChecked(form, 'prPref' + i),
      active: isChecked(form, 'prOn' + i),
      previousText: before.prices[i]?.previousText ?? ''
    });
  }
  return {
    id: before.id,
    isNew: before.isNew,
    name: fieldValue(form, 'supName').trim(),
    phone: fieldValue(form, 'supPhone').trim(),
    notes: fieldValue(form, 'supNotes').trim(),
    place: fieldValue(form, 'supPlace').trim(),
    active: isChecked(form, 'supActive'),
    prices,
    newPriceId: before.newPriceId
  };
}

/**
 * The owner's suppliers and what each charges (A3), on the live form host: a list, and one edit form with the
 * supplier's details and a row per price (plus a blank row). Nothing is deleted: a supplier or price is switched
 * off. Existing tokens only (form-styles).
 */
export function StockSuppliersForm({ liveStock }: { liveStock: LiveStockSuppliers }) {
  const editing = liveStock.editing;
  const offline = !liveStock.online ? (
    <span style={{ fontSize: '12px', color: '#A8231B' }}>
      Offline. Changes here will not save until this device is back online.
    </span>
  ) : null;
  if (!editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {offline}
        <span style={{ fontSize: '11px', color: '#66524A' }}>{C.suppliersIntro}</span>
        <button type="button" onClick={liveStock.add} style={primaryButton}>
          {C.addSupplier}
        </button>
        {liveStock.rows.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {liveStock.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => liveStock.edit(row.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minHeight: '54px',
                  border: '0',
                  borderBottom: '1px solid #F2EEEB',
                  background: 'transparent',
                  padding: '8px 2px',
                  textAlign: 'left',
                  opacity: row.active ? 1 : 0.55
                }}
              >
                <span
                  style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{row.name}</span>
                  <span style={{ fontSize: '11px', color: '#66524A' }}>
                    {row.place ? row.place + ' · ' : ''}
                    {row.priceCount === 1 ? '1 price' : row.priceCount + ' prices'}
                    {row.active ? '' : ' · switched off'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: '12px', color: '#66524A' }}>{C.noSuppliers}</span>
        )}
        <button type="button" onClick={liveStock.close} style={secondaryButton}>
          Close
        </button>
      </div>
    );
  }
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveStock.save(readSupplierForm(event.currentTarget, editing));
  };
  const all = [...editing.prices, null];
  return (
    <form
      key={liveStock.version + ':' + editing.id}
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {offline}
      <label style={labelStyle}>
        <span style={smallLabel}>Name</span>
        <input
          name="supName"
          required
          maxLength={80}
          defaultValue={editing.name}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Place</span>
        <input name="supPlace" maxLength={80} defaultValue={editing.place} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Phone</span>
        <input name="supPhone" maxLength={40} defaultValue={editing.phone} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Notes</span>
        <textarea
          name="supNotes"
          maxLength={300}
          rows={2}
          defaultValue={editing.notes}
          style={{ ...inputStyle, height: 'auto', padding: '10px 13px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input name="supActive" type="checkbox" defaultChecked={editing.active} />
        <span style={smallLabel}>In use</span>
      </label>
      <span style={{ fontSize: '13px', fontWeight: 600 }}>Prices</span>
      <span style={{ fontSize: '11px', color: '#66524A' }}>{C.priceHint}</span>
      {editing.isNew ? (
        <span style={{ fontSize: '11px', color: '#66524A' }}>
          Save the supplier first, then add its prices.
        </span>
      ) : (
        all.map((r, i) => (
          <div key={r?.id ?? 'new'} style={rowCard}>
            <label style={labelStyle}>
              <span style={smallLabel}>{r ? 'Item' : 'Add a price: item'}</span>
              <select name={'prItem' + i} defaultValue={r?.itemName ?? ''} style={inputStyle}>
                <option value="">Pick an item</option>
                {liveStock.itemNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                {r && !liveStock.itemNames.includes(r.itemName) ? (
                  <option value={r.itemName}>{r.itemName}</option>
                ) : null}
              </select>
            </label>
            <label style={labelStyle}>
              <span style={smallLabel}>Pack (like 1 kg block)</span>
              <input
                name={'prPack' + i}
                maxLength={40}
                defaultValue={r?.packLabel ?? ''}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={smallLabel}>Price (₱)</span>
              <input
                name={'prPrice' + i}
                type="number"
                inputMode="decimal"
                min={0}
                max={1000000}
                step="any"
                defaultValue={r ? r.pricePesos : ''}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={smallLabel}>Last bought (like 2 Aug)</span>
              <input
                name={'prBought' + i}
                maxLength={20}
                defaultValue={r?.lastBought ?? ''}
                style={inputStyle}
              />
            </label>
            {r ? (
              <span style={{ fontSize: '11px', color: '#66524A' }}>{r.previousText}</span>
            ) : null}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input name={'prPref' + i} type="checkbox" defaultChecked={r?.preferred ?? true} />
              <span style={smallLabel}>My preferred source</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input name={'prOn' + i} type="checkbox" defaultChecked={r?.active ?? true} />
              <span style={smallLabel}>Price in use</span>
            </label>
          </div>
        ))
      )}
      <button type="submit" style={primaryButton}>
        Save
      </button>
      <button type="button" onClick={liveStock.back} style={secondaryButton}>
        Back to the list
      </button>
    </form>
  );
}
