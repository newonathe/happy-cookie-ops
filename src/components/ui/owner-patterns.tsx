'use client';

import { useEffect, type ReactNode } from 'react';
import { Button } from './button';
import { cx } from './cx';
import { PageTitle, Panel, TaskRow } from './owner-kit';

/**
 * The repeated row, filter and tracker patterns of the v4 reference, built once so pages only say
 * what to show. Theme tokens only; inside the owner frame they resolve to the neutral palette.
 */

/** A label on the left and its exact value on the right: the reference's summary row. */
export function FactRow({
  label,
  detail,
  children
}: {
  label: ReactNode;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <span className="text-[14px] text-ink-soft">{label}</span>
        {detail ? <span className="text-caption text-ink-mute">{detail}</span> : null}
      </span>
      <span className="text-right text-[14px] font-semibold text-ink tabular-nums">{children}</span>
    </div>
  );
}

/** A name, one line of detail and one button: the reference's settings row. */
/** A panel head's link to the whole of what the panel summarises, its words lined up with the panel's right edge. */
export function PanelLink({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" className="-mr-3" onClick={onOpen}>
      {children}
    </Button>
  );
}

/** A row that is itself the button: a name, one line of detail, an optional mark, and a chevron. */
export function ListRow({
  title,
  detail,
  trailing,
  onOpen
}: {
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-raise focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold text-ink">{title}</span>
        {detail ? <span className="text-caption text-ink-mute">{detail}</span> : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
      <span aria-hidden="true" className="shrink-0 text-ink-faint">
        ›
      </span>
    </button>
  );
}

export function OpenRow({
  title,
  detail,
  label = 'Open',
  onOpen
}: {
  title: ReactNode;
  detail?: ReactNode;
  label?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <TaskRow
      title={title}
      detail={detail}
      onOpen={onOpen}
      openLabel={
        typeof title === 'string' && typeof label === 'string' ? `${label} ${title}` : undefined
      }
    />
  );
}

export interface ChipOption {
  id: string;
  label: ReactNode;
  count?: ReactNode;
  active: boolean;
  onSelect: () => void;
}

/** A row of single-choice filters that wrap. The choice shows by more than colour: `aria-pressed` and a filled chip. */
export function ChipRow({ label, options }: { label: string; options: ChipOption[] }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.active}
          onClick={option.onSelect}
          className={cx(
            'min-h-10 rounded-full border px-3.5 text-caption font-semibold transition-colors duration-[140ms] focus-visible:outline-2 focus-visible:outline-brand',
            option.active
              ? 'border-ink bg-ink text-surface'
              : 'border-line-strong bg-surface text-ink hover:bg-raise'
          )}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className="ml-1.5 tabular-nums">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export interface BarPart {
  id: string;
  label: string;
  value: number;
  /** A theme background class, such as `bg-ok`. */
  tone: string;
}

/** How a whole splits into parts, with a legend of exact counts. An empty whole draws nothing. */
export function StackedBar({ parts, legend = true }: { parts: BarPart[]; legend?: boolean }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (!total) return null;
  return (
    <div>
      <div
        role="img"
        aria-label={parts.map((part) => `${part.value} ${part.label}`).join(', ')}
        className="flex h-2.5 overflow-hidden rounded-full bg-chip"
      >
        {parts
          .filter((part) => part.value > 0)
          .map((part) => (
            <span
              key={part.id}
              className={part.tone}
              style={{ width: `${(part.value / total) * 100}%` }}
            />
          ))}
      </div>
      {legend ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-mute">
          {parts.map((part) => (
            <li key={part.id} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cx('size-2.5 rounded-sm', part.tone)} />
              <span className="font-semibold text-ink tabular-nums">{part.value}</span>
              {part.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The reference's confirm step: what will be saved, the way back, and one action that saves. */
/** A record that is not here, and the way back. Nothing typed elsewhere is lost. */
export function RecordUnavailable({
  backLabel = 'Return to the list',
  onBack
}: {
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div className="w-full">
      <PageTitle title="Record unavailable" subtitle="Your current work is kept." />
      <Panel>
        <p className="text-caption text-ink-soft">
          This record is not available. It may have been removed, or it could not be read.
        </p>
        {onBack ? (
          <div className="mt-4">
            <Button variant="secondary" onClick={onBack}>
              {backLabel}
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

export function ReviewPanel({
  children,
  note,
  backLabel,
  onBack,
  saveLabel,
  onSave,
  saving
}: {
  children: ReactNode;
  note?: ReactNode;
  backLabel: string;
  onBack: () => void;
  saveLabel: string;
  onSave: () => void;
  saving?: boolean;
}) {
  // A long form's button sits far down the page: Review starts at the top, with its title in view.
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }, []);
  return (
    <Panel>
      {children}
      {note ? (
        <p className="mt-3 rounded-control bg-raise p-3 text-caption text-ink-soft">{note}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          {backLabel}
        </Button>
        <Button variant="primary" onClick={onSave} busy={saving} busyLabel="Saving…">
          {saveLabel}
        </Button>
      </div>
    </Panel>
  );
}
