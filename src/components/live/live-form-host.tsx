import { useId, useRef, useState } from 'react';
import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { PayEditForm, PayList, ShopTextsForm, UploadField } from '@/components/live/payment-forms';
import { LiveLookup, LiveWaitlistForm } from '@/components/live/live-checkout';
import { OrderMessages } from '@/components/live/order-messages';
import { OrderExtrasForm } from '@/components/live/order-extras-form';
import { ScheduledEventsForm } from '@/components/live/scheduled-events-form';
import { BooksForm } from '@/components/live/books-form';
import { StockItemsForm } from '@/components/live/stock-items-form';
import { StockSuppliersForm } from '@/components/live/stock-suppliers-form';
import { OrderRulesForm } from '@/components/live/order-rules-form';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';
import { RecipeDraftsForm } from '@/components/live/recipe-drafts-form';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { CostForm } from '@/components/live/recipes/flavour-page';
import { ProductTypesPanel } from '@/components/live/product-types-panel';
import { ProductionDough } from '@/components/live/production/production-dough';

/**
 * The live-only owner form host (MP-09 c1c, F3, docs/state/protected-exception.md): the
 * ported sheet chrome (backdrop, header, close button) is protected markup, shown around
 * whatever `v.liveForm` names. Today that is only the flavour editor; later owner forms
 * plug in by dispatching on `liveForm.kind` here, with no further protected-file edit.
 */
export function LiveFormHost({ v }: { v: OpsVals }) {
  if (v.liveDough) return <ProductionDough data={v.liveDough} />;
  const { liveForm } = v;
  if (liveForm && liveForm.kind === 'flavours') {
    return liveForm.editing ? (
      <FlavourEditForm key={liveForm.editing.id ?? 'new'} editing={liveForm.editing} />
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
  // Keyed by the saved values: a re-read after a conflict shows their version, never a stale draft.
  if (v.liveOrderRules)
    return (
      <OrderRulesForm
        key={JSON.stringify(v.liveOrderRules.rules)}
        liveOrderRules={v.liveOrderRules}
      />
    );
  if (v.liveOrderExtras)
    return (
      <OrderExtrasForm
        key={JSON.stringify(v.liveOrderExtras.extras)}
        liveOrderExtras={v.liveOrderExtras}
      />
    );
  if (v.liveScheduled) return <ScheduledEventsForm liveScheduled={v.liveScheduled} />;
  if (v.liveBooks) return <BooksForm liveBooks={v.liveBooks} />;
  if (v.liveStockItems) return <StockItemsForm liveStock={v.liveStockItems} />;
  if (v.liveStockSuppliers) return <StockSuppliersForm liveStock={v.liveStockSuppliers} />;
  if (v.liveRecipeDrafts)
    return <RecipeDraftsForm liveDrafts={v.liveRecipeDrafts} catalogueHeld={v.catalogueHeld} />;
  if (v.liveLookup) return <LiveLookup v={v} />;
  if (v.liveWaitlist) return <LiveWaitlistForm v={v} />;
  return null;
}

type FlavourConfirmation = {
  id: string;
  name: string;
  updatedAt: string;
  action: 'remove' | 'restore';
  run: (updatedAt: string) => Promise<boolean>;
};

function FlavourList({ liveForm }: { liveForm: NonNullable<OpsVals['liveForm']> }) {
  const [confirming, setConfirming] = useState<FlavourConfirmation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const drafts = liveForm.rows.filter((row) => !row.published).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!liveForm.online ? (
        <span style={{ fontSize: '13px', color: 'var(--color-danger)' }}>
          Offline. Changes here will not save until this device is back online.
        </span>
      ) : null}
      {/* Publish does something only while a draft waits (publish_flavours publishes every row; a new one starts as a
        draft). Otherwise it steps aside for one quiet line (Ethan, 15 November 2026). */}
      {drafts ? (
        <div
          role="status"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '12px',
            border: '1px solid var(--color-line-strong)',
            background: 'var(--color-chip)'
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-warn-strong)' }}>
            {drafts === 1
              ? '1 change customers cannot see yet'
              : `${drafts} changes customers cannot see yet`}
          </span>
          <button onClick={liveForm.publish} style={primaryButton}>
            Publish menu
          </button>
          <span style={{ fontSize: '13px', color: 'var(--color-ink-mute)' }}>
            Customers see every flavour still on the order form as soon as you publish.
          </span>
        </div>
      ) : liveForm.rows.length ? (
        <span role="status" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ok)' }}>
          Everything is published.
        </span>
      ) : null}
      <button onClick={liveForm.addNew} style={secondaryButton}>
        Add a flavour
      </button>
      {liveForm.rows.length || liveForm.archivedRows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {liveForm.rows.map((row) => (
            <div key={row.id} style={{ borderBottom: '1px solid var(--color-divide)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={row.edit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flex: '1',
                    minWidth: '0',
                    minHeight: '54px',
                    border: '0',
                    background: 'transparent',
                    padding: '8px 2px',
                    textAlign: 'left'
                  }}
                >
                  <span
                    style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{row.name}</span>
                    <span style={{ fontSize: '13px', color: 'var(--color-ink-mute)' }}>
                      {row.published ? '' : 'Draft, not published · '}
                      {row.active ? 'On the order form' : 'Off the order form'}
                    </span>
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{row.priceText}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${row.name}`}
                  disabled={!liveForm.online || busy !== null}
                  onClick={() =>
                    setConfirming({
                      id: row.id,
                      name: String(row.name),
                      updatedAt: row.updatedAt,
                      action: 'remove',
                      run: row.archive
                    })
                  }
                  style={secondaryButton}
                >
                  Remove
                </button>
              </div>
              {confirming?.id === row.id && confirming.action === 'remove' ? (
                <div
                  role="alertdialog"
                  aria-label={`Remove ${confirming.name}`}
                  style={{ padding: '8px 2px 12px' }}
                >
                  <p style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                    Remove {confirming.name} from the working lists? Existing orders, recipes and
                    stock records stay saved. You can restore this flavour later.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      disabled={!liveForm.online || busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy(row.id);
                          if (await confirming.run(confirming.updatedAt)) setConfirming(null);
                          setBusy(null);
                        })();
                      }}
                      style={primaryButton}
                    >
                      {busy === row.id ? 'Removing…' : 'Remove flavour'}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirming(null)}
                      style={secondaryButton}
                    >
                      Keep flavour
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: '13px', color: 'var(--color-ink-mute)' }}>
          No active flavours. See Removed flavours below.
        </span>
      )}
      {liveForm.archivedRows.length ? (
        <section
          aria-label="Removed flavours"
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Removed flavours</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-ink-mute)' }}>
            These flavours stay in old orders, recipes and stock records.
          </p>
          {liveForm.archivedRows.map((row) => (
            <div key={row.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ flex: '1', fontSize: '13px' }}>{row.name}</span>
                <button
                  type="button"
                  aria-label={`Restore ${row.name}`}
                  disabled={!liveForm.online || busy !== null}
                  onClick={() =>
                    setConfirming({
                      id: row.id,
                      name: row.name,
                      updatedAt: row.updatedAt,
                      action: 'restore',
                      run: row.restore
                    })
                  }
                  style={secondaryButton}
                >
                  Restore
                </button>
              </div>
              {confirming?.id === row.id && confirming.action === 'restore' ? (
                <div
                  role="alertdialog"
                  aria-label={`Restore ${confirming.name}`}
                  style={{ padding: '8px 2px 12px' }}
                >
                  <p style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                    Restore {confirming.name}? It will stay off the order form and unpublished until
                    you edit and publish it.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      disabled={!liveForm.online || busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy(row.id);
                          if (await confirming.run(confirming.updatedAt)) setConfirming(null);
                          setBusy(null);
                        })();
                      }}
                      style={primaryButton}
                    >
                      {busy === row.id ? 'Restoring…' : 'Restore flavour'}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirming(null)}
                      style={secondaryButton}
                    >
                      Keep removed
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      {/* Her product types are set up once, so they follow the list she works in every day. */}
      {liveForm.types ? <ProductTypesPanel types={liveForm.types} /> : null}
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
  const badgeHintId = useId();
  const [photoPath, setPhotoPath] = useState(editing.imagePath);
  const photoEditSequence = useRef(0);
  const photo = resolveImagePath(photoPath);
  const uploadPhoto = async (file: File) => {
    const sequence = ++photoEditSequence.current;
    const path = await editing.upload(file);
    if (sequence !== photoEditSequence.current) return null;
    if (path) setPhotoPath(path);
    return path;
  };
  const removePhoto = () => {
    photoEditSequence.current += 1;
    setPhotoPath('');
    const form = photoRef.current?.form;
    const picker = form?.querySelector<HTMLInputElement>('input[type="file"]');
    if (picker && !picker.disabled) picker.focus();
    else (form?.elements.namedItem('allergens') as HTMLInputElement | null)?.focus();
  };
  const typeOptions = editing.typeOptions ?? [
    { id: 'cookie', label: 'Cookie', behavesAs: 'cookie' as const },
    { id: 'set', label: 'Set', behavesAs: 'set' as const }
  ];
  const typeFields = (typeId: string): Pick<Editing, 'itemType' | 'typeId'> => {
    const chosen = typeOptions.find((option) => option.id === typeId) ?? typeOptions[0]!;
    return editing.typeOptions
      ? { itemType: chosen.behavesAs, typeId: chosen.id }
      : { itemType: chosen.behavesAs === 'set' ? 'set' : 'cookie' };
  };
  const [typeId, setTypeId] = useState(
    editing.typeId ?? (editing.itemType === 'set' ? 'set' : 'cookie')
  );
  // Her type decides how it counts: a type sold by the piece (migration 84) takes no cookie slots (migration 86).
  const soldByPiece =
    (typeOptions.find((option) => option.id === typeId) ?? typeOptions[0]!).behavesAs === 'item';
  const unit = editing.itemType === 'item' ? 'piece' : 'cookie';
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
      // Her product type decides the behaviour (migration 84); without her types, Cookie or Set as before.
      ...typeFields(fieldValue(form, 'typeId')),
      capacityWeight: fieldNumber(form, 'capacityWeight'),
      sortOrder: fieldNumber(form, 'sortOrder'),
      price: fieldNumber(form, 'price'),
      active: (form.elements.namedItem('active') as HTMLInputElement | null)?.checked ?? true
    });
  };
  return (
    <>
      <form
        key={editing.id ?? 'new'}
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        <label style={labelStyle}>
          <span style={smallLabel}>Name</span>
          <input
            name="name"
            defaultValue={editing.name}
            maxLength={60}
            required
            style={inputStyle}
          />
        </label>
        {/* What decides the rest comes first: the type (cookie slots, recipe) and the price customers pay. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: '8px'
          }}
        >
          <label style={labelStyle}>
            <span style={smallLabel}>Type</span>
            <select
              name="typeId"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              style={inputStyle}
            >
              {typeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={smallLabel}>Price (₱)</span>
            <input
              name="price"
              type="number"
              inputMode="decimal"
              min={0.01}
              step="0.01"
              required
              defaultValue={editing.price}
              style={{ ...inputStyle }}
            />
          </label>
        </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {photo ? (
            <span
              role="img"
              aria-label="Product photo"
              style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                flexShrink: 0,
                background: `var(--color-chip) url(${photo}) center / cover`
              }}
            />
          ) : (
            <span style={smallLabel}>No photo</span>
          )}
          <span style={smallLabel}>Photo</span>
        </div>
        <input ref={photoRef} type="hidden" name="imagePath" value={photoPath} readOnly />
        <UploadField upload={uploadPhoto} label="Change photo" hint="" />
        {photoPath ? (
          <button type="button" onClick={removePhoto} style={secondaryButton}>
            Remove photo
          </button>
        ) : null}
        <label style={labelStyle}>
          <span style={smallLabel}>Contains</span>
          <input
            name="allergens"
            defaultValue={editing.allergens}
            maxLength={200}
            required
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={smallLabel}>Shop label (optional)</span>
          <input
            name="badge"
            defaultValue={editing.badge}
            maxLength={30}
            style={inputStyle}
            aria-describedby={badgeHintId}
            placeholder="Popular or Seasonal"
          />
        </label>
        <p
          id={badgeHintId}
          style={{
            margin: '-4px 0 0',
            fontSize: '13px',
            color: 'var(--color-ink-mute)',
            lineHeight: 1.5
          }}
        >
          Shown beside the name on the order form.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: '8px'
          }}
        >
          <label style={labelStyle}>
            <span style={smallLabel}>Permanent or rotating</span>
            <select name="kind" defaultValue={editing.kind} style={inputStyle}>
              <option value="Permanent">Permanent</option>
              <option value="Rotating">Rotating</option>
            </select>
          </label>
          <label style={labelStyle}>
            <span style={smallLabel}>Display order</span>
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
        {soldByPiece ? (
          <>
            {/* Migration 86: an item uses no cookie slots. The saved weight goes back unchanged; the database keeps an item at 0. */}
            <input type="hidden" name="capacityWeight" value={editing.capacityWeight} readOnly />
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: 'var(--color-ink-mute)',
                lineHeight: 1.5
              }}
            >
              Sold by the piece: it uses no cookie slots in the order limit or the drop.
            </p>
          </>
        ) : (
          <label style={labelStyle}>
            <span style={smallLabel}>Cookies counted toward the order limit</span>
            <input
              name="capacityWeight"
              type="number"
              inputMode="numeric"
              min={1}
              max={48}
              step={1}
              required
              // An item switched to a cookie was stored at 0 slots: it starts again from 1.
              defaultValue={Math.max(1, editing.capacityWeight)}
              style={inputStyle}
            />
          </label>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px' }}>
          <input name="active" type="checkbox" defaultChecked={editing.active} />
          <span style={smallLabel}>On the order form</span>
        </label>
        <button type="submit" style={primaryButton}>
          Save product
        </button>
        <button type="button" onClick={editing.cancel} style={secondaryButton}>
          Cancel
        </button>
      </form>
      {/* Cine, 14 November 2026: the cost of goods sold is set where the product is edited; every bazaar uses it. */}
      {editing.costItem ? (
        <section aria-label={'Cost per ' + unit} style={{ marginTop: '20px' }}>
          <CostForm item={editing.costItem} unit={unit} />
        </section>
      ) : editing.id ? (
        <p style={{ ...smallLabel, marginTop: '16px' }}>
          The cost per {unit} appears here once the product is on the menu.
        </p>
      ) : null}
    </>
  );
}
