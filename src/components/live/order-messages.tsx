import type { OpsVals } from '@/view-models/vals';
import { MESSAGE_SHEET } from '@/lib/orders/staff-copy';
import { secondaryButton } from '@/components/live/form-styles';

/**
 * The owner's customer messages (B3): one status link and one text per open order, to copy and
 * send by hand. Nothing here sends anything. Existing tokens only (form-styles), and the sheet
 * chrome is the ported one shown by the live form host.
 */
export function OrderMessages({
  liveMessages
}: {
  liveMessages: NonNullable<OpsVals['liveMessages']>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: 'var(--color-ink-mute)' }}>
        {MESSAGE_SHEET.intro}
      </span>
      {liveMessages.rows.length ? (
        liveMessages.rows.map((row) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              borderBottom: '1px solid var(--color-divide)',
              paddingBottom: '12px'
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              {row.name} · {row.order} · {row.label}
            </span>
            {row.details.length ? (
              <span style={{ fontSize: '12px', color: 'var(--color-ink-soft)', lineHeight: '1.5' }}>
                {MESSAGE_SHEET.packLine}: {row.details.join(' · ')}
              </span>
            ) : null}
            <textarea
              readOnly
              value={row.text}
              rows={4}
              style={{
                border: '1px solid var(--color-line-strong)',
                borderRadius: '12px',
                padding: '10px 12px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-ink)',
                resize: 'vertical'
              }}
            />
            <button onClick={row.copy} style={secondaryButton}>
              {MESSAGE_SHEET.copy}
            </button>
          </div>
        ))
      ) : (
        <span style={{ fontSize: '13px', color: 'var(--color-ink-mute)' }}>
          {MESSAGE_SHEET.empty}
        </span>
      )}
    </div>
  );
}
