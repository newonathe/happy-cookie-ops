import type * as React from 'react';
import type { ReviewFigure } from '@/lib/bazaar/live-bazaar-types';
import { cardStyle, listStyle, mutedStyle, textStyle } from '@/components/live/stock/stock-shared';

const summaryRow: React.CSSProperties = {
  ...textStyle,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '4px 12px',
  minHeight: '44px',
  cursor: 'pointer'
};
const plainRow: React.CSSProperties = { ...summaryRow, cursor: 'default' };
const valueStyle: React.CSSProperties = { fontWeight: 700, textAlign: 'right', minWidth: 0 };

/**
 * One figure of a review or an event: a label and a number in words. With parts it opens (a native details, so it works by
 * keyboard and screen reader) to show what it is made of; the note under it is always visible.
 */
export function Figure({ figure }: { figure: ReviewFigure }) {
  return (
    <li style={cardStyle}>
      {figure.parts.length > 0 ? (
        <details>
          <summary style={summaryRow}>
            <span>{figure.label}</span>
            <span style={valueStyle}>{figure.valueText}</span>
          </summary>
          <ul
            aria-label={'Parts of ' + figure.label}
            style={{ ...listStyle, gap: '6px', marginTop: '6px' }}
          >
            {figure.parts.map((p, i) => (
              <li
                key={i}
                style={{
                  ...textStyle,
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  gap: '2px 12px'
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span>{p.label}</span>
                  {p.detail ? <span style={mutedStyle}>{p.detail}</span> : null}
                </span>
                <span style={valueStyle}>{p.valueText}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <div style={plainRow}>
          <span>{figure.label}</span>
          <span style={valueStyle}>{figure.valueText}</span>
        </div>
      )}
      {figure.note ? <p style={mutedStyle}>{figure.note}</p> : null}
    </li>
  );
}

/** A list of figures. */
export function Figures({ figures, label }: { figures: ReviewFigure[]; label: string }) {
  return (
    <ul aria-label={label} style={listStyle}>
      {figures.map((f) => (
        <Figure key={f.key} figure={f} />
      ))}
    </ul>
  );
}
