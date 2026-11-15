'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { useCountUp } from '@/components/ui/motion';
import styles from './glass.module.css';

/**
 * Espresso glass (approved 16 Nov 2026): the floating cards, split bars, goal ring and count-ups that Home and Money
 * share. The classes live in `glass.module.css`; pages add only their own grid.
 */
export { styles as glassStyles };

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The espresso-glass count-up: 700 ms from 100 ms, and a changed figure counts on from the one on show. */
export const COUNT = { durationMs: 700, delayMs: 100, followChanges: true } as const;

export const centsText = (cents: number) =>
  `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A peso figure that counts up. It counts in centavos so the last frame is the books' own figure, to the centavo; a
 * screen reader hears that final figure, never a frame of the count.
 */
export function CountMoney({ pesos, sign = '' }: { pesos: number; sign?: string }) {
  const cents = Math.round(Math.abs(pesos) * 100);
  const counted = useCountUp(cents, COUNT);
  return (
    <>
      <span aria-hidden="true" className="whitespace-nowrap">
        {sign}
        {centsText(counted)}
      </span>
      <span className="sr-only">
        {sign}
        {centsText(cents)}
      </span>
    </>
  );
}

/** The goal ring: how much of the month's profit goal is made. Drawn in once, then it keeps its place. */
export function GoalRing({ pct }: { pct: number }) {
  const counted = useCountUp(pct, COUNT);
  const arc = (RING_CIRCUMFERENCE * pct) / 100;
  return (
    <div
      role="img"
      aria-label={`${pct}% of this month's profit goal`}
      data-goal-pct={pct}
      className={styles.ring}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className={styles.ringTrack} cx="60" cy="60" r={RING_RADIUS} />
        {pct > 0 ? (
          <circle
            className={styles.ringArc}
            cx="60"
            cy="60"
            r={RING_RADIUS}
            style={
              {
                strokeDasharray: `${arc} ${RING_CIRCUMFERENCE}`,
                '--circ': RING_CIRCUMFERENCE
              } as CSSProperties
            }
          />
        ) : null}
      </svg>
      <span aria-hidden="true" className="relative flex flex-col items-center">
        <span className={cx(styles.ringNum, 'font-mono leading-none font-semibold tabular-nums')}>
          {counted}%
        </span>
        <span className={cx(styles.ringCap, 'mt-1 text-ink-mute')}>of goal</span>
      </span>
    </div>
  );
}

export interface SplitPart {
  id: string;
  label: string;
  value: number;
  /** A theme background class, such as `bg-ok`. */
  tone: string;
}

/** How a whole splits into parts: one segment per non-empty part, each growing in 40 ms after the one before. */
export function SplitBar({ parts, label }: { parts: SplitPart[]; label?: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div
      role="img"
      aria-label={label ?? parts.map((part) => `${part.value} ${part.label}`).join(', ')}
      className={styles.splitBar}
    >
      {parts
        .filter((part) => part.value > 0)
        .map((part, index) => (
          <span
            key={part.id}
            data-segment={part.id}
            data-count={part.value}
            className={cx(styles.segment, part.tone)}
            style={{ width: `${(part.value / total) * 100}%`, '--i': index } as CSSProperties}
          />
        ))}
    </div>
  );
}

/** A glass card with the one head every card shares: its name, and room for one thing on the right. */
export function GlassCard({
  title,
  action,
  className,
  children
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cx(styles.glassCard, className)}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
        <h2 className="text-heading font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
