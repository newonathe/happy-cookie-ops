'use client';

import { useEffect, useRef } from 'react';

export interface FieldError {
  /** The id of the field's input. */
  field: string;
  message: string;
}

export interface ErrorSummaryProps {
  errors: FieldError[];
  /** Bump this on every submit that fails, so focus returns to the summary even when the errors are the same. */
  focusKey?: number;
}

/**
 * "There is a problem", with one link per bad field (spec rule 7). Focus moves here when errors appear. A link focuses
 * its input itself rather than navigating: this app moves between screens with history.replaceState, and a hash
 * change would fight it.
 */
export function ErrorSummary({ errors, focusKey = 0 }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = errors.length > 0;
  useEffect(() => {
    if (shown) ref.current?.focus();
  }, [shown, focusKey]);
  if (!shown) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-labelledby="error-summary-title"
      className="motion-rise rounded-control border-[3px] border-danger bg-surface p-4"
    >
      <h2 id="error-summary-title" className="m-0 text-body font-bold text-ink">
        There is a problem
      </h2>
      <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0">
        {errors.map((error) => (
          <li key={error.field + error.message}>
            <a
              href={`#${error.field}`}
              className="text-body font-semibold text-danger underline"
              onClick={(event) => {
                event.preventDefault();
                const input = document.getElementById(error.field);
                if (!input) return;
                input.focus();
                if (typeof input.scrollIntoView === 'function')
                  input.scrollIntoView({ block: 'center' });
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
