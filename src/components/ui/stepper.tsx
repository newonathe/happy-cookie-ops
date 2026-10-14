'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cx } from './cx';

export interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** What is counted, for a screen reader: "Classic Chocolate Chip made". */
  label: string;
  onChange: (value: number) => void;
  size?: 'sm' | 'md';
  /** Writes the number (for example as pesos). The keypad still takes plain digits. */
  format?: (n: number) => string;
}

const FIRST_REPEAT_MS = 450;
const REPEAT_MS = 90;

/**
 * – n +. Tap to step, hold to repeat, or tap the number to type it on the numeric keypad (Enter or leaving the field
 * sets it, Escape cancels). A number outside min and max is refused with a message, not clamped silently.
 */
export function Stepper({
  value,
  min = 0,
  max = 9999,
  step = 1,
  label,
  onChange,
  size = 'md',
  format
}: StepperProps) {
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const latest = useRef({ value, min, max, step, onChange });
  useEffect(() => {
    latest.current = { value, min, max, step, onChange };
  });
  const timers = useRef<{ start?: number; repeat?: number }>({});
  const numberButton = useRef<HTMLButtonElement>(null);
  // Enter and Escape remove the input; focus goes back to the number so the keyboard is not dropped on the page.
  const refocus = useRef(false);
  useEffect(() => {
    if (typing === null && refocus.current) {
      refocus.current = false;
      numberButton.current?.focus();
    }
  }, [typing]);

  const stop = () => {
    window.clearTimeout(timers.current.start);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const bump = (direction: 1 | -1): boolean => {
    const now = latest.current;
    const next = Math.min(now.max, Math.max(now.min, now.value + direction * now.step));
    if (next === now.value) return false;
    // Kept in the ref at once, so a held button steps on from this value before the parent has rendered it.
    latest.current = { ...now, value: next };
    now.onChange(next);
    return true;
  };
  const press = (direction: 1 | -1) => {
    stop();
    if (!bump(direction)) return;
    timers.current.start = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => {
        if (!bump(direction)) stop();
      }, REPEAT_MS);
    }, FIRST_REPEAT_MS);
  };

  /** True when the typed number was taken (or there was nothing typed); false when it is refused and stays on screen. */
  const commit = (): boolean => {
    if (typing === null) return true;
    const text = typing.trim();
    const n = Number(text);
    if (text === '' || !Number.isInteger(n) || n < min || n > max) {
      setError(`Enter a whole number from ${min} to ${max}.`);
      return false;
    }
    setError(null);
    setTyping(null);
    if (n !== value) onChange(n);
    return true;
  };

  const small = size === 'sm';
  const button = cx(
    'motion-press grid shrink-0 place-items-center rounded-control border border-line-strong bg-surface font-bold text-ink hover:bg-inset disabled:cursor-not-allowed disabled:opacity-40',
    small ? 'size-9 text-body' : 'size-11 text-title'
  );
  const display = format ? format(value) : value.toLocaleString('en-PH');

  const stepButton = (direction: 1 | -1) => (
    <button
      type="button"
      aria-label={`${direction === 1 ? 'More' : 'Fewer'} ${label}`}
      disabled={direction === 1 ? value >= max : value <= min}
      className={cx(button, 'select-none [-webkit-touch-callout:none]')}
      // A long press must not select text or open the context menu on a phone: that cancels the hold.
      onContextMenu={(event) => event.preventDefault()}
      // Pointer: step now, then repeat while held. The click that follows a pointer press (detail > 0) is ignored.
      onPointerDown={(event) => {
        if (event.button > 0) return;
        press(direction);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      // Keyboard and assistive technology click with detail 0.
      onClick={(event) => {
        if (event.detail === 0) bump(direction);
      }}
    >
      <span aria-hidden="true">{direction === 1 ? '+' : '−'}</span>
    </button>
  );

  return (
    <div role="group" aria-label={label} className="inline-flex flex-col gap-1">
      <div className="inline-flex items-center gap-1.5">
        {stepButton(-1)}
        {typing === null ? (
          <button
            ref={numberButton}
            type="button"
            aria-label={`${label}: ${display}. Tap to type a number`}
            onClick={() => {
              setTyping(String(value));
              setError(null);
            }}
            className={cx(
              'min-w-12 rounded-control px-2 text-center font-bold text-ink tabular-nums hover:bg-inset',
              small ? 'min-h-9 text-body' : 'min-h-11 text-title'
            )}
          >
            {display}
          </button>
        ) : (
          <input
            // Opened by the tap that asked for it, so taking focus here is what the person just did.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={label}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={typing}
            onChange={(event) => setTyping(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={() => {
              commit();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                refocus.current = true;
                if (!commit()) refocus.current = false;
              } else if (event.key === 'Escape') {
                // Not the sheet's Escape: this one only cancels the typing.
                event.stopPropagation();
                refocus.current = true;
                setTyping(null);
                setError(null);
              }
            }}
            className={cx(
              'w-16 rounded-control border bg-surface text-center font-bold text-ink tabular-nums',
              error ? 'border-danger border-l-4' : 'border-line-strong',
              small ? 'min-h-9 text-[16px]' : 'min-h-11 text-[16px]'
            )}
          />
        )}
        {stepButton(1)}
      </div>
      {error ? (
        <span id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
