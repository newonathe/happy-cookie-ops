import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { BOOKS_COPY as C } from '@/lib/orders/staff-copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

type LiveBooks = NonNullable<OpsVals['liveBooks']>;

const card = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
  border: '1px solid #E7E1DC',
  borderRadius: '12px',
  padding: '11px'
};

/**
 * The owner's books settings (E1), on the live form host: how stock is costed, a correction to a delivery's cost, and the books as a
 * spreadsheet. Existing tokens only (form-styles).
 */
export function BooksForm({ liveBooks }: { liveBooks: LiveBooks }) {
  const { basis, receipts, online, unpaid } = liveBooks;
  const uncosted = liveBooks.uncosted ?? [];
  const held = liveBooks.held ?? [];
  const onCorrect = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const movement = (form.elements.namedItem('receipt') as HTMLSelectElement | null)?.value ?? '';
    const cost = (form.elements.namedItem('newCost') as HTMLInputElement | null)?.value ?? '';
    liveBooks.correct(movement, cost);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {!online ? <span style={{ fontSize: '12px', color: '#A8231B' }}>{C.offline}</span> : null}
      {held.length ? (
        <div style={card}>
          <span style={smallLabel}>{C.heldTitle}</span>
          <span style={{ fontSize: '12px', color: '#66524A' }}>{C.heldNote}</span>
          {held.map((h) => (
            <div
              key={h.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: '12px',
                color: '#3A1F14'
              }}
            >
              <span style={{ fontWeight: 600 }}>{h.name}</span>
              <span style={{ color: '#66524A' }}>{h.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
      {unpaid ? (
        <div style={card}>
          <span style={smallLabel}>{C.unpaidTitle}</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#3A1F14' }}>
            {unpaid.summary}
          </span>
          {unpaid.rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                fontSize: '12px',
                color: '#3A1F14'
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{r.title}</span>
                <span style={{ color: '#66524A' }}>{r.detail}</span>
              </span>
              <span style={{ fontWeight: 600 }}>{r.amount}</span>
            </div>
          ))}
        </div>
      ) : null}
      {uncosted.length ? (
        <div style={card}>
          <span style={smallLabel}>{C.uncostedTitle}</span>
          <span style={{ fontSize: '12px', color: '#66524A' }}>{C.uncostedNote}</span>
          {uncosted.map((u) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: '12px',
                color: '#3A1F14'
              }}
            >
              <span style={{ fontWeight: 600 }}>{u.item}</span>
              <span style={{ color: '#66524A' }}>{u.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div style={card}>
        <span style={smallLabel}>{C.basisTitle}</span>
        <span style={{ fontSize: '12px', color: '#66524A' }}>{C.basisNote}</span>
        {(['bought', 'used'] as const).map((b) => (
          <button
            key={b}
            type="button"
            disabled={!online}
            onClick={() => liveBooks.setBasis(b)}
            aria-pressed={basis === b}
            style={basis === b ? primaryButton : secondaryButton}
          >
            {b === 'bought' ? C.bought : C.used}
          </button>
        ))}
      </div>
      <form onSubmit={onCorrect} style={card}>
        <span style={smallLabel}>{C.correctTitle}</span>
        <span style={{ fontSize: '12px', color: '#66524A' }}>{C.correctNote}</span>
        {receipts.length ? (
          <>
            <label style={labelStyle}>
              <span style={smallLabel}>{C.receipt}</span>
              <select name="receipt" style={inputStyle}>
                {receipts.map((r) => (
                  <option key={r.movementId} value={r.movementId}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              <span style={smallLabel}>{C.newCost}</span>
              <input
                name="newCost"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                style={inputStyle}
              />
            </label>
            <button type="submit" disabled={!online} style={primaryButton}>
              {C.correct}
            </button>
          </>
        ) : (
          <span style={{ fontSize: '12px', color: '#66524A' }}>{C.noReceipts}</span>
        )}
      </form>
      <div style={card}>
        <span style={smallLabel}>{C.downloadTitle}</span>
        <span style={{ fontSize: '12px', color: '#66524A' }}>{C.downloadNote}</span>
        <button
          type="button"
          disabled={!online}
          onClick={liveBooks.download}
          style={secondaryButton}
        >
          {C.download}
        </button>
      </div>
    </div>
  );
}
