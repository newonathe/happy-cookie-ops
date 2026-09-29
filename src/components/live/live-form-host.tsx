import { useRef } from 'react';
import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { PayEditForm, PayList, ShopTextsForm, UploadField } from '@/components/live/payment-forms';
import { LiveLookup, LiveWaitlistForm } from '@/components/live/live-checkout';
import { OrderMessages } from '@/components/live/order-messages';
import { OrderExtrasForm } from '@/components/live/order-extras-form';
import { ScheduledEventsForm } from '@/components/live/scheduled-events-form';
import { StockItemsForm } from '@/components/live/stock-items-form';
import { StockSuppliersForm } from '@/components/live/stock-suppliers-form';
import { OrderRulesForm } from '@/components/live/order-rules-form';
import { inputStyle, labelStyle, primaryButton, secondaryButton, smallLabel } from '@/components/live/form-styles';

/**
 * The live-only owner form host (MP-09 c1c, F3, docs/state/protected-exception.md): the
 * ported sheet chrome (backdrop, header, close button) is protected markup, shown around
 * whatever `v.liveForm` names. Today that is only the flavour editor; later owner forms
 * plug in by dispatching on `liveForm.kind` here, with no further protected-file edit.
 */
export function LiveFormHost({ v }: { v: OpsVals }) {
  const { liveForm } = v;
  if (liveForm && liveForm.kind === 'flavours') {
    return liveForm.editing ? (
      <FlavourEditForm editing={liveForm.editing} />
    ) : (
      <FlavourList liveForm={liveForm} />
    );
  }
  if (v.livePay) {
    return v.livePay.editing ? (
      <PayEditForm editing={v.livePay.editing} />
    ) : (
      <PayList livePay={v.livePay} />
    );
  }
  if (v.liveTexts) return <ShopTextsForm liveTexts={v.liveTexts} />;
  if (v.liveMessages) return <OrderMessages liveMessages={v.liveMessages} />;
  if (v.liveOrderRules) return <OrderRulesForm liveOrderRules={v.liveOrderRules} />;
  if (v.liveOrderExtras) return <OrderExtrasForm liveOrderExtras={v.liveOrderExtras} />;
  if (v.liveScheduled) return <ScheduledEventsForm liveScheduled={v.liveScheduled} />;
  if (v.liveStockItems) return <StockItemsForm liveStock={v.liveStockItems} />;
  if (v.liveStockSuppliers) return <StockSuppliersForm liveStock={v.liveStockSuppliers} />;
  if (v.liveLookup) return <LiveLookup v={v} />;
  if (v.liveWaitlist) return <LiveWaitlistForm v={v} />;
  return null;
}

function FlavourList({ liveForm }: { liveForm: NonNullable<OpsVals['liveForm']> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!liveForm.online ? (
        <span style={{ fontSize: '12px', color: '#A8231B' }}>
          Offline. Changes here will not save until this device is back online.
        </span>
      ) : null}
      <button onClick={liveForm.publish} style={primaryButton}>
        Publish menu
      </button>
      <span style={{ fontSize: '11px', color: '#66524A' }}>
        Customers see every flavour still on the order form as soon as you publish.
      </span>
      <button onClick={liveForm.addNew} style={secondaryButton}>
        Add a flavour
      </button>
      {liveForm.rows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {liveForm.rows.map((row) => (
            <button
              key={row.id}
              onClick={row.edit}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                minHeight: '54px',
                border: '0',
                borderBottom: '1px solid #F2EEEB',
                background: 'transparent',
                padding: '8px 2px',
                textAlign: 'left'
              }}
            >
              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{row.name}</span>
                <span style={{ fontSize: '11px', color: '#66524A' }}>
                  {row.published ? 'Published' : 'Draft, not published'} ·{' '}
                  {row.active ? 'on the order form' : 'off the order form'}
                </span>
              </span>
              <span
                style={{ fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
              >
                {row.priceText}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: '12px', color: '#66524A' }}>No flavours loaded yet.</span>
      )}
    </div>
  );
}

type Editing = NonNullable<NonNullable<OpsVals['liveForm']>['editing']>;

function fieldValue(form: HTMLFormElement, name: string): string {
  return (
    (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
  );
}

/**
 * A blank or non-numeric field becomes NaN, never a fallback number: `flavourFieldError`'s
 * `Number.isInteger` checks (and `priceCents`'s `Number.isFinite` check) then correctly
 * refuse it, rather than a cleared price silently saving as ₱0 — which "Publish menu" would
 * send live with everything else, since it publishes every loaded flavour at once.
 */
function fieldNumber(form: HTMLFormElement, name: string): number {
  const raw = fieldValue(form, name).trim();
  return raw === '' ? NaN : Number(raw);
}

function FlavourEditForm({ editing }: { editing: Editing }) {
  const photoRef = useRef<HTMLInputElement>(null);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    editing.save({
      name: fieldValue(form, 'name'),
      shortName: fieldValue(form, 'shortName'),
      description: fieldValue(form, 'description'),
      imagePath: fieldValue(form, 'imagePath'),
      allergens: fieldValue(form, 'allergens'),
      badge: fieldValue(form, 'badge'),
      kind: fieldValue(form, 'kind') === 'Rotating' ? 'Rotating' : 'Permanent',
      itemType: fieldValue(form, 'itemType') === 'set' ? 'set' : 'cookie',
      capacityWeight: fieldNumber(form, 'capacityWeight'),
      sortOrder: fieldNumber(form, 'sortOrder'),
      price: fieldNumber(form, 'price'),
      active: (form.elements.namedItem('active') as HTMLInputElement | null)?.checked ?? true
    });
  };
  return (
    <form
      key={editing.id ?? 'new'}
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      <label style={labelStyle}>
        <span style={smallLabel}>Name</span>
        <input name="name" defaultValue={editing.name} maxLength={60} required style={inputStyle} />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Short name</span>
        <input
          name="shortName"
          defaultValue={editing.shortName}
          maxLength={40}
          required
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Description</span>
        <textarea
          name="description"
          defaultValue={editing.description}
          maxLength={300}
          rows={3}
          style={{
            ...inputStyle,
            height: 'auto',
            padding: '10px 13px',
            resize: 'vertical' as const
          }}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Photo path</span>
        <input
          ref={photoRef}
          name="imagePath"
          defaultValue={editing.imagePath}
          maxLength={200}
          style={inputStyle}
        />
      </label>
      <UploadField upload={editing.upload} target={photoRef} label="Upload a photo" />
      <label style={labelStyle}>
        <span style={smallLabel}>Allergens (shown as &quot;Contains …&quot;)</span>
        <input
          name="allergens"
          defaultValue={editing.allergens}
          maxLength={200}
          required
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Badge</span>
        <input name="badge" defaultValue={editing.badge} maxLength={30} style={inputStyle} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <label style={labelStyle}>
          <span style={smallLabel}>Permanent or rotating</span>
          <select name="kind" defaultValue={editing.kind} style={inputStyle}>
            <option value="Permanent">Permanent</option>
            <option value="Rotating">Rotating</option>
          </select>
        </label>
        <label style={labelStyle}>
          <span style={smallLabel}>Cookie or set</span>
          <select name="itemType" defaultValue={editing.itemType} style={inputStyle}>
            <option value="cookie">Cookie</option>
            <option value="set">Set</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <label style={labelStyle}>
          <span style={smallLabel}>Capacity weight (1-48)</span>
          <input
            name="capacityWeight"
            type="number"
            inputMode="numeric"
            min={1}
            max={48}
            step={1}
            required
            defaultValue={editing.capacityWeight}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={smallLabel}>Sort order (0-999)</span>
          <input
            name="sortOrder"
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            step={1}
            required
            defaultValue={editing.sortOrder}
            style={inputStyle}
          />
        </label>
      </div>
      <label style={labelStyle}>
        <span style={smallLabel}>Price</span>
        <input
          name="price"
          type="number"
          inputMode="decimal"
          min={0.01}
          step="0.01"
          required
          defaultValue={editing.price}
          style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' as const }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input name="active" type="checkbox" defaultChecked={editing.active} />
        <span style={smallLabel}>On the order form</span>
      </label>
      <button type="submit" style={primaryButton}>
        Save flavour
      </button>
      <button type="button" onClick={editing.cancel} style={secondaryButton}>
        Cancel
      </button>
    </form>
  );
}
