import { useRef, useState } from 'react';
import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

type LivePay = NonNullable<OpsVals['livePay']>;
type LiveTexts = NonNullable<OpsVals['liveTexts']>;

function fieldValue(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
}

/**
 * A file picker that uploads straight to the shop-media bucket and drops the returned bucket
 * path into a sibling text field. The file's own name never reaches the bucket (the runtime
 * generates one); a refusal is toasted by the runtime and leaves the field as it was.
 */
export function UploadField({
  upload,
  target,
  label,
  hint = '(PNG, JPEG or WebP, up to 2 MB)'
}: {
  upload: (file: File) => Promise<string | null>;
  target: React.RefObject<HTMLInputElement | null>;
  label: string;
  /** The size note after the label; flavour photos are resized for her, so theirs differs. */
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const path = await upload(file);
      if (path && target.current) target.current.value = path;
    } finally {
      setBusy(false);
      input.value = '';
    }
  };
  return (
    <label style={labelStyle}>
      <span style={smallLabel}>{busy ? 'Uploading…' : label + ' ' + hint}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void onChange(e)}
        disabled={busy}
        style={{ fontSize: '13px', color: '#3A1F14' }}
      />
    </label>
  );
}

export function PayList({ livePay }: { livePay: LivePay }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!livePay.online ? (
        <span style={{ fontSize: '12px', color: '#A8231B' }}>
          Offline. Changes here will not save until this device is back online.
        </span>
      ) : null}
      <span style={{ fontSize: '11px', color: '#66524A' }}>
        Customers pick from the methods marked shown. Turn a method off to stop offering it.
      </span>
      <button onClick={livePay.addNew} style={primaryButton}>
        Add a payment method
      </button>
      {livePay.rows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {livePay.rows.map((row) => (
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
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{row.label}</span>
                <span style={{ fontSize: '11px', color: '#66524A' }}>
                  {row.active ? 'Shown' : 'Not shown'} · {row.hasQr ? 'QR set' : 'no QR'}
                  {row.detail ? ' · ' + row.detail : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: '12px', color: '#66524A' }}>No payment methods yet.</span>
      )}
    </div>
  );
}

export function PayEditForm({ editing }: { editing: NonNullable<LivePay['editing']> }) {
  const qrRef = useRef<HTMLInputElement>(null);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const order = fieldValue(form, 'sortOrder').trim();
    editing.save({
      label: fieldValue(form, 'label'),
      accountNumber: fieldValue(form, 'accountNumber'),
      accountName: fieldValue(form, 'accountName'),
      qrPath: fieldValue(form, 'qrPath'),
      active: (form.elements.namedItem('active') as HTMLInputElement | null)?.checked ?? true,
      sortOrder: order === '' ? NaN : Number(order)
    });
  };
  return (
    <form
      key={editing.id ?? 'new'}
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      <label style={labelStyle}>
        <span style={smallLabel}>Name customers see (for example GCash)</span>
        <input
          name="label"
          defaultValue={editing.label}
          maxLength={30}
          required
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Account number</span>
        <input
          name="accountNumber"
          defaultValue={editing.accountNumber}
          maxLength={40}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Account name</span>
        <input
          name="accountName"
          defaultValue={editing.accountName}
          maxLength={60}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>QR image path (leave empty for no QR)</span>
        <input
          ref={qrRef}
          name="qrPath"
          defaultValue={editing.qrPath}
          maxLength={200}
          style={inputStyle}
        />
      </label>
      <UploadField upload={editing.upload} target={qrRef} label="Upload the QR image" />
      <label style={labelStyle}>
        <span style={smallLabel}>Order in the list (0-99)</span>
        <input
          name="sortOrder"
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          step={1}
          required
          defaultValue={editing.sortOrder}
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input name="active" type="checkbox" defaultChecked={editing.active} />
        <span style={smallLabel}>Shown to customers</span>
      </label>
      <button type="submit" style={primaryButton}>
        Save payment method
      </button>
      <button type="button" onClick={editing.cancel} style={secondaryButton}>
        Cancel
      </button>
    </form>
  );
}

export function ShopTextsForm({ liveTexts }: { liveTexts: LiveTexts }) {
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    liveTexts.save({
      registrationBadge: fieldValue(form, 'registrationBadge'),
      tinLine: fieldValue(form, 'tinLine'),
      invoiceNote: fieldValue(form, 'invoiceNote'),
      allergenNote: fieldValue(form, 'allergenNote')
    });
  };
  const field = (name: string, label: string, value: string, max: number) => (
    <label style={labelStyle}>
      <span style={smallLabel}>{label}</span>
      <input name={name} defaultValue={value} maxLength={max} style={inputStyle} />
    </label>
  );
  // B2: how the shop names itself. Saved on its own, so the footer lines below are untouched.
  const onIdentity = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    liveTexts.saveIdentity({
      shopName: fieldValue(form, 'shopName'),
      ownerName: fieldValue(form, 'ownerName'),
      contactLine: fieldValue(form, 'contactLine'),
      tagline: fieldValue(form, 'tagline')
    });
  };
  const own = (name: string, label: string, value: string, max: number) => (
    <label style={labelStyle}>
      <span style={smallLabel}>{label}</span>
      <input name={name} defaultValue={value} maxLength={max} style={inputStyle} />
      {value === '' ? (
        <span style={{ fontSize: '11px', color: '#66524A' }}>
          Not set: the app uses neutral wording.
        </span>
      ) : null}
    </label>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <form
        // Remount when a save or a reload brings new values: the inputs are uncontrolled.
        key={Object.values(liveTexts.identity).join('\u0000')}
        onSubmit={onIdentity}
        style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        <span style={{ fontSize: '13px', fontWeight: '600' }}>Shop details</span>
        <span style={{ fontSize: '11px', color: '#66524A' }}>
          How the shop names itself in the app and to customers. Nothing is filled in for you: an
          empty line means the app says it without a name.
        </span>
        {own('shopName', 'Shop name', liveTexts.identity.shopName, 60)}
        {own(
          'ownerName',
          'Your name, as customers and helpers read it',
          liveTexts.identity.ownerName,
          40
        )}
        {own(
          'contactLine',
          'How to reach you: one full sentence, added to messages such as “This order is cancelled.”',
          liveTexts.identity.contactLine,
          160
        )}
        {own('tagline', 'The line under the shop heading', liveTexts.identity.tagline, 120)}
        {!liveTexts.identityReady ? (
          <span style={{ fontSize: '12px', color: '#A8231B' }}>
            Shop details cannot be saved here yet.
          </span>
        ) : null}
        <button type="submit" disabled={!liveTexts.identityReady} style={primaryButton}>
          Save shop details
        </button>
      </form>
      <ShopFooterForm liveTexts={liveTexts} onSubmit={onSubmit} field={field} />
    </div>
  );
}

function ShopFooterForm({
  liveTexts,
  onSubmit,
  field
}: {
  liveTexts: LiveTexts;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  field: (name: string, label: string, value: string, max: number) => React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {!liveTexts.online ? (
        <span style={{ fontSize: '12px', color: '#A8231B' }}>
          Offline. Changes here will not save until this device is back online.
        </span>
      ) : null}
      <span style={{ fontSize: '11px', color: '#66524A' }}>
        The shop footer says only what you write here. Leave a line empty to show nothing, and only
        write what is true for the business.
      </span>
      {field(
        'registrationBadge',
        'Registration badge (up to 20 characters)',
        liveTexts.texts.registrationBadge,
        20
      )}
      {field('tinLine', 'Business and TIN line', liveTexts.texts.tinLine, 80)}
      {field('invoiceNote', 'Invoice note', liveTexts.texts.invoiceNote, 200)}
      {field('allergenNote', 'Allergen note', liveTexts.texts.allergenNote, 300)}
      <button type="submit" style={primaryButton}>
        Save shop texts
      </button>
      <button type="button" onClick={liveTexts.close} style={secondaryButton}>
        Close
      </button>
    </form>
  );
}
