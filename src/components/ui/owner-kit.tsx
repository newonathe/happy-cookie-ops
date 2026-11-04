'use client';

import { useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * The page patterns of the refined owner workspace (client v4 reference, 3 November): one title
 * with its actions, solid panels, task rows, switch rows with a small explanation, editable choice
 * rows and a footer. They use the theme tokens only; inside the owner frame those resolve to the
 * neutral owner palette (owner-theme.module.css).
 */

export function PageTitle({
  title,
  subtitle,
  actions,
  headingId
}: {
  title: string;
  subtitle?: ReactNode;
  /** The page's primary action first, then Settings. */
  actions?: ReactNode;
  headingId?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3.5">
      <div className="min-w-0">
        <h1
          id={headingId}
          tabIndex={-1}
          className="text-[26px] leading-tight font-semibold tracking-[-0.01em] text-ink outline-none"
        >
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-caption text-ink-mute">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  tone = 'plain'
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** `hero` marks the page's most important status with the brand edge. */
  tone?: 'plain' | 'hero';
}) {
  return (
    <section
      className={cx(
        'mb-4 rounded-[18px] border border-line bg-surface p-4 sm:p-5',
        tone === 'hero' && 'border-l-[3px] border-l-accent',
        className
      )}
    >
      {title || action ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          {title ? <h2 className="text-[17px] font-semibold text-ink">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A heading between panels. */
export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

/** One thing to look at or do: its name, one line of detail and a single action. */
export function TaskRow({
  title,
  detail,
  action,
  onOpen
}: {
  title: ReactNode;
  detail?: ReactNode;
  /** A button or link; when absent and `onOpen` is given the whole row opens. */
  action?: ReactNode;
  onOpen?: () => void;
}) {
  const body = (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[15px] font-semibold text-ink">{title}</span>
      {detail ? <span className="text-caption text-ink-mute">{detail}</span> : null}
    </span>
  );
  if (onOpen && !action)
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line py-3 text-left transition-colors duration-[140ms] last:border-b-0 hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand"
      >
        {body}
        <span aria-hidden="true" className="text-ink-faint">
          ›
        </span>
      </button>
    );
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
      {body}
      {action}
    </div>
  );
}

/**
 * A short explanation of a control. It opens on hover, on keyboard focus and on tap, closes on
 * Escape or when focus leaves, and the control's own label always says what it is without it.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const tipId = useId();
  const shown = open || pinned;
  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={shown}
        aria-describedby={shown ? tipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setPinned(false);
        }}
        onClick={() => setPinned((p) => !p)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setPinned(false);
          }
        }}
        className="ml-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full border border-line text-[12px] font-semibold text-ink-mute hover:border-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
      >
        i
      </button>
      {shown ? (
        <span
          id={tipId}
          role="note"
          className="absolute top-8 left-0 z-30 w-64 max-w-[calc(100vw-48px)] rounded-control border border-line p-3 text-caption font-normal text-ink shadow-lg"
          style={{
            background: 'var(--owner-popover-surface, var(--color-surface))',
            backdropFilter: 'var(--owner-popover-filter, none)',
            WebkitBackdropFilter: 'var(--owner-popover-filter, none)'
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/** An on/off setting with its state readable as a word and, where it helps, an explanation. */
export function SwitchRow({
  label,
  name,
  checked,
  defaultChecked,
  onChange,
  info,
  detail
}: {
  label: string;
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  info?: ReactNode;
  detail?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-h-14 items-center justify-between gap-3.5 border-b border-line py-3 last:border-b-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center text-[14px] font-semibold text-ink">
          <label htmlFor={id}>{label}</label>
          {info ? <InfoTip label={label}>{info}</InfoTip> : null}
        </span>
        {detail ? <span className="text-caption text-ink-mute">{detail}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          name={name}
          type="checkbox"
          role="switch"
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={onChange ? (event) => onChange(event.currentTarget.checked) : undefined}
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="flex h-7 w-12 items-center rounded-full bg-line-strong p-0.5 transition-colors duration-[140ms] peer-checked:bg-ok peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-checked:[&>span]:translate-x-5"
        >
          <span className="size-6 rounded-full bg-surface shadow-sm transition-transform duration-[140ms] motion-reduce:transition-none" />
        </span>
      </span>
    </div>
  );
}

const fieldInput =
  'h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-[16px] font-semibold text-ink sm:text-[14px] focus-visible:outline-2 focus-visible:outline-brand';

/** A labelled input. Uncontrolled unless `value` is given; extra props go to the input. */
export function OwnerField({
  label,
  hint,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-caption font-semibold text-ink-soft">{label}</span>
      <input id={id} className={fieldInput} {...input} />
      {hint ? <span className="text-caption text-ink-mute">{hint}</span> : null}
    </label>
  );
}

/** Editable rows of short choices, such as ribbon colours. Blank rows are ignored on save. */
export function ChoiceRows({
  name,
  values,
  onChange,
  label = 'Option'
}: {
  /** Each row's input is named `${name}_${index}`. */
  name: string;
  values: string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2 pt-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-end gap-2">
          <OwnerField
            className="flex-1"
            label={`${label} ${index + 1}`}
            name={`${name}_${index}`}
            value={value}
            maxLength={20}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.currentTarget.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            className="min-h-12 rounded-control px-3 text-caption font-semibold text-brand-deep hover:bg-chip focus-visible:outline-2 focus-visible:outline-brand"
          >
            Remove
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-caption font-semibold text-ink hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand"
        >
          Add {label.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

/** The bottom of a form: the way back on the left, the one forward action on the right. */
export function FooterActions({ back, forward }: { back?: ReactNode; forward?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <div>{back}</div>
      <div className="flex flex-wrap gap-2">{forward}</div>
    </div>
  );
}

const pesos = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * A peso amount whose sign and colour agree: positive green with +, negative red with −, zero
 * neutral. `null` is an amount nobody recorded, shown as words and never as ₱0.
 */
export function SignedMoney({
  pesos: value,
  signed = true,
  className,
  missing = 'Not recorded'
}: {
  pesos: number | null;
  signed?: boolean;
  className?: string;
  missing?: string;
}) {
  if (value === null || !Number.isFinite(value))
    return <span className={cx('font-semibold text-ink-mute', className)}>{missing}</span>;
  const tone = value > 0 ? 'text-ok' : value < 0 ? 'text-danger' : 'text-ink';
  const sign = value > 0 ? (signed ? '+' : '') : value < 0 ? '−' : '';
  return (
    <span className={cx('font-semibold tabular-nums', tone, className)}>
      {sign}₱{pesos.format(Math.abs(value))}
    </span>
  );
}
