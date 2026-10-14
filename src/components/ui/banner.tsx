'use client';

import type { ReactNode } from 'react';
import { Button } from './button';
import { cx } from './cx';
import { usePresence } from './motion';

export type BannerTone = 'info' | 'warn' | 'danger' | 'till';

export interface BannerProps {
  tone: BannerTone;
  title: ReactNode;
  body?: ReactNode;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
  /** False plays the exit, then removes the banner. */
  open?: boolean;
}

const TONE: Record<BannerTone, string> = {
  info: 'bg-info-fill border border-info-line text-ink',
  warn: 'bg-warm-high border border-warm-line border-l-4 border-l-warn-dot text-warn-strong',
  danger: 'bg-surface border border-danger border-l-4 border-l-danger text-ink',
  till: 'bg-brand border border-brand-deep text-surface'
};

/** A message above the work. Slides down in 250 ms and leaves in 150 ms; both stop under reduced motion. */
export function Banner({ tone, title, body, action, onDismiss, open = true }: BannerProps) {
  const { mounted, leaving } = usePresence(open);
  if (!mounted) return null;
  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
      data-tone={tone}
      data-leaving={leaving}
      className={cx('motion-drop flex items-center gap-3 rounded-control px-4 py-3', TONE[tone])}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-bold">{title}</span>
        {body ? <span className="text-caption">{body}</span> : null}
      </div>
      {action ? (
        <Button size="sm" variant={tone === 'till' ? 'secondary' : 'dark'} onClick={action.onPress}>
          {action.label}
        </Button>
      ) : null}
      {onDismiss ? (
        <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
          ✕
        </Button>
      ) : null}
    </div>
  );
}
