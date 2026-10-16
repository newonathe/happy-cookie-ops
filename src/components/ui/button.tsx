'use client';

import { useId } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  /** primary: the screen's one forward action; dark: commits money or a close; the rest are quieter. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** While true the button shows `busyLabel` and cannot be pressed again. */
  busy?: boolean;
  busyLabel?: string;
  /** Why the button is disabled; shown under it, never hidden (spec rule 9). */
  reason?: string;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-surface shadow-brand hover:bg-brand-deep',
  dark: 'bg-ink text-cust-bg hover:bg-ink-soft',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-inset',
  danger: 'bg-surface text-danger border border-danger-line hover:bg-raise',
  ghost: 'bg-transparent text-brand-deep hover:bg-chip',
  icon: 'bg-chip text-ink hover:bg-divide'
};
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-caption',
  md: 'min-h-11 px-4 text-body',
  lg: 'min-h-12 px-5 text-body'
};
const ICON_SIZE: Record<ButtonSize, string> = { sm: 'size-11', md: 'size-11', lg: 'size-12' };

/**
 * The button of the live screens (docs/design/bazaar-v2.md, sections 1 and 3). Pressing scales it to 0.97 over 100 ms
 * (`motion-press`), and that stops under reduced motion. A disabled button with a `reason` says why under itself.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  busyLabel,
  reason,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const off = Boolean(disabled) || busy;
  const button = (
    <button
      {...rest}
      type={type}
      disabled={off}
      aria-busy={busy || undefined}
      aria-describedby={disabled && reason ? reasonId : rest['aria-describedby']}
      className={cx(
        'motion-press inline-flex items-center justify-center gap-2 rounded-control font-semibold',
        variant === 'icon' ? ICON_SIZE[size] : SIZE[size],
        VARIANT[variant],
        off && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
  if (!(disabled && reason)) return button;
  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      {button}
      <span id={reasonId} className="text-caption text-ink-mute">
        {reason}
      </span>
    </span>
  );
}
