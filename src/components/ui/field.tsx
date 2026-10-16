'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cx } from './cx';

export type FieldMode = 'text' | 'decimal' | 'numeric' | 'date';

interface Chrome {
  label: string;
  hint?: string;
  /** What is wrong and how to fix it. Setting it turns the field red and links the words to the input. */
  error?: string;
  /** The field's own id: the link in an ErrorSummary points at it. */
  id?: string;
}

export interface FieldProps
  extends Chrome, Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'prefix'> {
  mode?: FieldMode;
  /** Drawn before the text: "₱". */
  prefix?: ReactNode;
}

export interface SelectFieldProps
  extends Chrome, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  options: Array<{ value: string; label: string }>;
}

/** Label, control, hint and error, joined by ids (`aria-describedby`, `aria-invalid`). */
function Shell({
  label,
  hint,
  error,
  id,
  disabled,
  children
}: Chrome & { disabled?: boolean; children: (props: ControlProps) => ReactNode }) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5" data-invalid={error ? 'true' : undefined}>
      <label htmlFor={inputId} className="text-caption font-semibold text-ink-soft">
        {label}
      </label>
      <div
        className={cx(
          'flex items-center rounded-control border bg-surface focus-within:ring-2 focus-within:ring-accent',
          error ? 'border-danger border-l-4' : 'border-line-strong',
          disabled && 'bg-inset opacity-60'
        )}
      >
        {children({
          id: inputId,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy
        })}
      </div>
      {hint ? (
        <span id={hintId} className="text-caption text-ink-mute">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-caption font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface ControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

// 16 px on the control: below that, iOS zooms the page when it takes focus.
const CONTROL =
  'min-h-12 w-full min-w-0 rounded-control bg-transparent px-3 text-[16px] font-semibold text-ink outline-none';

/** A text, money (`decimal`), count (`numeric`) or date input. Validate on blur; the form validates on submit. */
export function Field({
  label,
  hint,
  error,
  id,
  mode = 'text',
  prefix,
  className,
  ...rest
}: FieldProps) {
  return (
    <Shell label={label} hint={hint} error={error} id={id} disabled={rest.disabled}>
      {(aria) => (
        <>
          {prefix ? (
            <span aria-hidden="true" className="pl-3 text-[16px] font-semibold text-ink-soft">
              {prefix}
            </span>
          ) : null}
          <input
            {...rest}
            {...aria}
            type={mode === 'date' ? 'date' : 'text'}
            inputMode={mode === 'decimal' ? 'decimal' : mode === 'numeric' ? 'numeric' : undefined}
            className={cx(CONTROL, prefix ? 'pl-1' : '', className)}
          />
        </>
      )}
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  options,
  className,
  ...rest
}: SelectFieldProps) {
  return (
    <Shell label={label} hint={hint} error={error} id={id} disabled={rest.disabled}>
      {(aria) => (
        <select {...rest} {...aria} className={cx(CONTROL, className)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Shell>
  );
}
