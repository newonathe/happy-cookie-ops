import type { ReactNode } from 'react';
import { Button } from './button';

export interface SectionHeaderProps {
  title: ReactNode;
  count?: number;
  action?: { label: string; onPress: () => void };
  /** The heading level, so the page outline stays right. */
  level?: 2 | 3;
}

/** A section title with an optional count chip and one action on the right. */
export function SectionHeader({ title, count, action, level = 2 }: SectionHeaderProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Heading className="m-0 truncate text-body font-bold text-ink">{title}</Heading>
        {count !== undefined ? (
          <span className="rounded-tag bg-chip px-2 py-0.5 text-caption font-semibold text-ink-mute">
            {count}
          </span>
        ) : null}
      </div>
      {action ? (
        <Button variant="ghost" size="sm" onClick={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
