import type * as React from 'react';
import type { LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import {
  INK,
  cardStyle,
  h1Style,
  listStyle,
  mutedStyle,
  primaryBase,
  textStyle,
  wrapRow
} from '@/components/live/stock/stock-shared';

const rowButton: React.CSSProperties = {
  ...cardStyle,
  width: '100%',
  minHeight: '44px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  color: INK
};

/** The owner's upcoming bookings. Each opens its page, where its days are planned and started. */
export function EventList({ bazaar }: { bazaar: LiveBazaarVals }) {
  return (
    <>
      <h1 style={h1Style}>Bazaar</h1>
      {bazaar.list.length === 0 ? (
        <p style={mutedStyle}>No upcoming events yet. Add one to plan its days.</p>
      ) : (
        <ul aria-label="Events" style={listStyle}>
          {bazaar.list.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={row.open} style={rowButton}>
                <span style={{ ...textStyle, fontWeight: 700 }}>{row.name}</span>
                <span style={wrapRow}>
                  <span style={textStyle}>{row.datesText}</span>
                  <span style={mutedStyle}>{row.placeText}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p style={mutedStyle}>
        {bazaar.online
          ? 'Starting a day needs signal. Selling does not.'
          : 'Starting a day needs signal: it is read from the server.'}
      </p>
      <div style={wrapRow}>
        <button
          type="button"
          onClick={bazaar.add}
          style={{ ...primaryBase, minHeight: '48px', alignSelf: 'flex-start' }}
        >
          Add an event
        </button>
      </div>
    </>
  );
}
