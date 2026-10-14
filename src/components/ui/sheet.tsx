'use client';

import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';
import { cx } from './cx';
import { usePresence } from './motion';

export interface SheetProps {
  title: string;
  onClose: () => void;
  /** The sheet's actions, pinned under the content. */
  footer?: ReactNode;
  /** Unset: a bottom sheet on a phone, a 460 px panel on the right from 768 px. */
  side?: 'bottom' | 'right';
  /** False plays the exit, then removes the sheet. */
  open?: boolean;
  children?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A modal sheet. Focus moves into it, Tab stays inside, Escape and the backdrop close it, the page behind does not
 * scroll, and focus goes back to what opened it. It is drawn into `document.body`, so a transformed parent cannot trap it.
 */
export function Sheet({ title, onClose, footer, side, open = true, children }: SheetProps) {
  const { mounted, leaving } = usePresence(open, 150);
  // The page body once there is one (never on the server), without setting state in an effect.
  const host = useSyncExternalStore(
    () => () => undefined,
    () => document.body,
    () => null
  );
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!mounted || !host) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [mounted, host]);

  if (!mounted || !host) return null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panel.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const mode = side ?? 'auto';
  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-50 flex',
        mode === 'right' && 'justify-end',
        mode === 'bottom' && 'items-end',
        mode === 'auto' && 'items-end md:items-stretch md:justify-end'
      )}
    >
      <div
        data-leaving={leaving}
        onClick={onClose}
        aria-hidden="true"
        className="motion-scrim absolute inset-0 bg-scrim"
      />
      {/* The dialog owns Escape and the Tab loop, as a modal must. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-side={mode}
        data-leaving={leaving}
        onKeyDown={onKeyDown}
        className={cx(
          'motion-sheet relative flex flex-col bg-surface shadow-lift outline-none',
          mode === 'right'
            ? 'h-full w-full max-w-[460px] rounded-l-sheet'
            : mode === 'bottom'
              ? 'max-h-[90dvh] w-full rounded-t-sheet'
              : 'max-h-[90dvh] w-full rounded-t-sheet md:h-full md:max-h-none md:max-w-[460px] md:rounded-t-none md:rounded-l-sheet'
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-divide px-4 py-3">
          <h2 id={titleId} className="m-0 text-title text-ink">
            {title}
          </h2>
          <Button variant="icon" size="sm" aria-label={`Close ${title}`} onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-col gap-2 border-t border-divide px-4 py-3 pb-[max(var(--space-3),env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    host
  );
}
