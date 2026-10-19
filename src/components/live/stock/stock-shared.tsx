import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { LiveStockVals, StockStatus } from '@/lib/stock/live-stock-types';
import { formatManila } from '@/lib/time/business-clock';
import { primaryButton, secondaryButton } from '@/components/live/form-styles';

/**
 * Shared by the New Stock screens (B5). Existing tokens only: every colour below is one that
 * form-styles.ts or the @theme block of src/app/globals.css already holds. Sizes are in rem so the
 * owner's text-size setting reaches them; every row and primary button is at least 44 px high.
 */

/** `liveStock` as the runtime provides it. Typed through the contract so this compiles before and after vals.ts widens. */
export function liveStockOf(v: OpsVals): LiveStockVals | null {
  return (v as OpsVals & { liveStock?: LiveStockVals | null }).liveStock ?? null;
}

export const INK = '#3A1F14';
export const INK_SOFT = '#6E574B';
export const LINE = '#E7E1DC';
/** A status is a word first. The colour only backs it up: danger, warn, ok of the @theme. */
export const STATUS_COLOUR: Record<StockStatus, string> = {
  Out: '#A8231B',
  Low: '#95600A',
  Good: '#1B7A4B'
};

export const screenStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box'
};
export const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: '1.375rem',
  fontWeight: 700,
  color: INK,
  overflowWrap: 'anywhere'
};
export const h2Style: React.CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: INK
};
export const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.875rem',
  color: INK,
  overflowWrap: 'anywhere',
  minWidth: 0
};
export const mutedStyle: React.CSSProperties = {
  ...textStyle,
  color: INK_SOFT,
  fontSize: '0.8125rem'
};
export const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};
export const cardStyle: React.CSSProperties = {
  border: `1px solid ${LINE}`,
  borderRadius: '12px',
  background: '#FFFFFF',
  padding: '12px',
  boxSizing: 'border-box',
  minWidth: 0
};
export const wrapRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '4px 12px',
  minWidth: 0
};
export const buttonBase: React.CSSProperties = {
  ...secondaryButton,
  minWidth: '44px',
  padding: '0 14px',
  fontSize: '0.875rem',
  cursor: 'pointer'
};
export const primaryBase: React.CSSProperties = {
  ...primaryButton,
  padding: '0 16px',
  fontSize: '0.875rem',
  cursor: 'pointer'
};

/** Shown for as long as the runtime has no stock to give. */
export function StockLoading({ title, label }: { title: string; label: string }) {
  return (
    <section aria-label={title} data-screen-label={label} style={screenStyle}>
      <h1 style={h1Style}>{title}</h1>
      <p aria-live="polite" style={mutedStyle}>
        Stock is loading.
      </p>
    </section>
  );
}

export function OfflineLine({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <p style={{ ...textStyle, color: STATUS_COLOUR.Out, fontWeight: 600 }}>
      Offline. Changes here will not save until this device is back online.
    </p>
  );
}

/** The status in words, in its colour. The word carries the meaning; the colour does not. */
export function StatusWord({ status }: { status: StockStatus }) {
  return (
    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: STATUS_COLOUR[status] }}>
      {status}
    </span>
  );
}

/** A definition list of label and text pairs that wraps instead of overflowing. */
export function Facts({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 16px', minWidth: 0 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <dt style={{ ...mutedStyle, fontWeight: 600 }}>{label}</dt>
          <dd style={{ ...textStyle, margin: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "3 Oct, 2:15 PM", on the business clock (Manila) whatever zone the device is set to. */
export function manilaStamp(at: number): string {
  const day = formatManila(at, { day: 'numeric', month: 'short' }, 'en-GB');
  const time = formatManila(at, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}, ${time.replace(/\s/g, ' ')}`;
}
