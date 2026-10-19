import { cx } from './cx';

export type Status = 'today' | 'selling' | 'planned' | 'closed' | 'past' | 'costPending' | 'good';

export interface StatusPillProps {
  status: Status;
  /** Overrides the word, for `good` ("On the menu", "Open"). */
  label?: string;
}

const LOOK: Record<Status, { word: string; classes: string }> = {
  selling: { word: 'Selling', classes: 'bg-ok-fill border-ok-line text-ok' },
  planned: { word: 'Planned', classes: 'bg-info-fill border-info-line text-ink' },
  today: { word: 'Today', classes: 'bg-warm-high border-warm-line text-brand-deep' },
  closed: { word: 'Closed', classes: 'bg-chip border-line text-ink-mute' },
  past: { word: 'Past', classes: 'bg-chip border-line text-ink-mute' },
  costPending: { word: 'Cost pending', classes: 'bg-warm-high border-warm-line text-warn' },
  good: { word: 'Open', classes: 'bg-ok-fill border-ok-line text-ok' }
};

/** What state something is in. The word always shows: colour and the breathing dot are never the only signal. */
export function StatusPill({ status, label }: StatusPillProps) {
  const look = LOOK[status];
  return (
    <span
      data-status={status}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap',
        look.classes
      )}
    >
      {status === 'selling' ? (
        <span aria-hidden="true" className="size-1.5 animate-breathe rounded-full bg-ok" />
      ) : null}
      {label ?? look.word}
    </span>
  );
}
