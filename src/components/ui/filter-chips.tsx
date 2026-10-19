'use client';

import { flushSync } from 'react-dom';
import { cx } from './cx';
import { useViewTransition } from './motion';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  /** Names the group for a screen reader: "Events". */
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
}

/** A row of single-choice chips. The change cross-fades through a view transition where the browser has one. */
export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  const run = useViewTransition();
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-2 overflow-x-auto py-0.5 [scrollbar-width:none]"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (selected) return;
              run(() => flushSync(() => onChange(option.id)));
            }}
            className={cx(
              'motion-press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-3 text-caption font-semibold whitespace-nowrap',
              selected
                ? 'border-2 border-brand bg-warm-high text-brand-deep'
                : 'border border-line-strong bg-surface text-ink hover:bg-inset'
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cx('tabular-nums', selected ? 'text-brand-deep' : 'text-ink-mute')}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
