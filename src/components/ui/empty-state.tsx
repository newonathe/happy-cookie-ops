import type { ReactNode } from 'react';
import { Button } from './button';

export interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  action?: { label: string; onPress: () => void };
}

/** What a list says when it has nothing in it, and the one thing to do about it. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-raise px-4 py-6 text-center">
      <p className="m-0 text-body font-bold text-ink">{title}</p>
      {body ? <p className="m-0 max-w-xs text-caption text-ink-soft">{body}</p> : null}
      {action ? (
        <Button variant="secondary" onClick={action.onPress} className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
