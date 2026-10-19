'use client';

import type { DayReviewView, ReviewFigure } from '@/lib/bazaar/live-bazaar-types';
import { StatTile, type StatPart } from '@/components/ui/stat-tile';
import { peso } from '@/lib/money/format';
import { cx } from '@/components/ui/cx';

const partsOf = (f: ReviewFigure): StatPart[] =>
  f.parts.map((p) => ({
    label: p.detail ? `${p.label} · ${p.detail}` : p.label,
    value: p.valueText
  }));

/**
 * The day's live figures as tiles (U5): revenue and cash from the database's summary, then the cookies sold, left and
 * lost. Each opens to its parts. A figure that is words ("Cost pending", "₱5.00 short") is drawn as the words.
 * `settled` plays the 250 ms settle when the day has just been closed (the D0 motion table).
 */
export function DayTiles({ review, settled }: { review: DayReviewView; settled: boolean }) {
  const open = review.state === 'open';
  const figures = review.dayFigures;
  const sold = review.stock.reduce((n, s) => n + s.sold, 0);
  const lost = review.stock.reduce((n, s) => n + s.lost, 0);
  const given = review.stock.reduce((n, s) => n + s.given, 0);
  const left = review.stock.reduce(
    (n, s) => n + (open ? Math.max(0, s.shouldBeLeft) : (s.countedLeft ?? 0)),
    0
  );
  return (
    <ul
      aria-label="This day"
      className={cx(
        'm-0 grid list-none grid-cols-2 items-start gap-3 p-0 md:grid-cols-3 lg:grid-cols-6',
        settled && 'motion-settle'
      )}
    >
      {figures.map((f) => (
        <li key={f.key} className="min-w-0">
          <StatTile
            label={f.label}
            value={f.cents ?? f.valueText}
            format={f.cents === undefined ? undefined : peso}
            detail={f.note ?? undefined}
            parts={partsOf(f)}
          />
        </li>
      ))}
      <li className="min-w-0">
        <StatTile
          label="Sold"
          value={sold}
          detail={given ? `${given} given away` : undefined}
          parts={review.stock.map((s) => ({ label: s.name, value: String(s.sold) }))}
        />
      </li>
      <li className="min-w-0">
        <StatTile
          label={open ? 'Should be left' : 'Left'}
          value={left}
          parts={review.stock.map((s) => ({
            label: s.name,
            value: String(open ? Math.max(0, s.shouldBeLeft) : (s.countedLeft ?? 0))
          }))}
        />
      </li>
      <li className="min-w-0">
        <StatTile
          label="Lost"
          value={lost}
          parts={review.stock
            .filter((s) => s.lost > 0)
            .map((s) => ({ label: s.name, value: String(s.lost) }))}
        />
      </li>
    </ul>
  );
}
