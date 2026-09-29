import type * as React from 'react';
import type { LiveStockItemEdit, OpsVals } from '@/view-models/vals';
import { STOCK_COPY as C } from '@/lib/orders/staff-copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

type LiveStockItems = NonNullable<OpsVals['liveStockItems']>;

const fieldValue = (form: HTMLFormElement, name: string): string =>
  (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
/** A blank field is null, never a fallback number, so a cleared pack size is not saved as 0. */
const optionalNumber = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

/** What the edit form reads back. A blank low-stock level is 0; a blank pack size or use-by is none. */
export function readItemForm(form: HTMLFormElement, before: LiveStockItemEdit): LiveStockItemEdit {
  const par = fieldValue(form, 'itemPar').trim();
  return {
    id: before.id,
    isNew: before.isNew,
    name: fieldValue(form, 'itemName').trim(),
    category: fieldValue(form, 'itemCategory') === 'Packaging' ? 'Packaging' : 'Ingredients',
    unit: fieldValue(form, 'itemUnit').trim(),
    parLevel: par === '' ? 0 : Number(par),
    packSize: optionalNumber(fieldValue(form, 'itemPack')),
    packLabel: fieldValue(form, 'itemPackLabel').trim(),
    supplierId: fieldValue(form, 'itemSupplier') || null,
    useByDays: optionalNumber(fieldValue(form, 'itemUseBy')),
    active: (form.elements.namedItem('itemActive') as HTMLInputElement | null)?.checked === true
  };
}

/**
 * The owner's stock items (A3), on the live form host: a list, and one edit form. Nothing is deleted: an item is
 * switched off. The quantity on hand is not edited here. Existing tokens only (form-styles).
 */
export function StockItemsForm({ liveStock }: { liveStock: LiveStockItems }) {
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
        <span style={{ fontSize: '11px', color: '#66524A' }}>{C.itemsIntro}</span>
        <button type="button" onClick={liveStock.add} style={primaryButton}>
          {C.addItem}
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
                    {row.category} · {row.unit} · {row.supplierName}
                    {row.active ? '' : ' · switched off'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: '12px', color: '#66524A' }}>{C.noItems}</span>
        )}
        <button type="button" onClick={liveStock.close} style={secondaryButton}>
          Close
        </button>
      </div>
    );
  }
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveStock.save(readItemForm(event.currentTarget, editing));
  };
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
          name="itemName"
          required
          maxLength={80}
          defaultValue={editing.name}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Kind</span>
        <select name="itemCategory" defaultValue={editing.category} style={inputStyle}>
          <option value="Ingredients">Ingredients</option>
          <option value="Packaging">Packaging</option>
        </select>
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Unit (g, ml, pcs)</span>
        <input
          name="itemUnit"
          required
          maxLength={12}
          defaultValue={editing.unit}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Low-stock level</span>
        <input
          name="itemPar"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          defaultValue={editing.parLevel}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Pack size, in the unit above (blank if none)</span>
        <input
          name="itemPack"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          defaultValue={editing.packSize ?? ''}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Pack label (like 1 kg bag)</span>
        <input
          name="itemPackLabel"
          maxLength={40}
          defaultValue={editing.packLabel}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Usual supplier</span>
        <select name="itemSupplier" defaultValue={editing.supplierId ?? ''} style={inputStyle}>
          <option value="">None</option>
          {liveStock.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Use within days of opening (blank if none)</span>
        <input
          name="itemUseBy"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          step={1}
          defaultValue={editing.useByDays ?? ''}
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input name="itemActive" type="checkbox" defaultChecked={editing.active} />
        <span style={smallLabel}>In use</span>
      </label>
      <button type="submit" style={primaryButton}>
        Save
      </button>
      <button type="button" onClick={liveStock.back} style={secondaryButton}>
        Back to the list
      </button>
    </form>
  );
}
