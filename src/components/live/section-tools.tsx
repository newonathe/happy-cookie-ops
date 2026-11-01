'use client';

import type { LiveTabItem } from '@/view-models/vals';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';

function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Escape') return;
  const disclosure = event.currentTarget.closest('details');
  if (!disclosure) return;
  disclosure.open = false;
  disclosure.querySelector('summary')?.focus();
}

/** Contextual tools stay out of the section navigation. Native disclosure also works by keyboard. */
export function SectionTools({ label, items }: { label: string; items: LiveTabItem[] }) {
  if (!items.length) return null;
  return (
    <details
      className="relative self-end text-ink"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
    >
      <summary
        onKeyDown={closeOnEscape}
        className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-control border border-line bg-surface px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-brand"
      >
        {label}
      </summary>
      <div
        className="absolute right-0 z-30 mt-2 flex w-64 max-w-[calc(100vw-32px)] flex-col gap-1 rounded-card border border-line bg-surface p-2 shadow-lg"
        style={{
          background: 'var(--owner-popover-surface, var(--color-surface))',
          backdropFilter: 'var(--owner-popover-filter, none)',
          WebkitBackdropFilter: 'var(--owner-popover-filter, none)'
        }}
      >
        {items.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className="justify-start text-left"
            onKeyDown={closeOnEscape}
            onClick={(event) => {
              const disclosure = event.currentTarget.closest('details');
              if (disclosure) disclosure.open = false;
              item.go();
            }}
          >
            {item.label}
            {item.badge ? (
              <span className="rounded-tag bg-chip px-2 tabular-nums">{item.badge}</span>
            ) : null}
          </Button>
        ))}
      </div>
    </details>
  );
}
