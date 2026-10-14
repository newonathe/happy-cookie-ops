import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type CardVariant = 'plain' | 'accent' | 'inset' | 'warm';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  as?: ElementType;
  children?: ReactNode;
}

const VARIANT: Record<CardVariant, string> = {
  plain: 'bg-surface border border-line',
  // The 4 px brand left bar of Home's "Prepare" card.
  accent: 'bg-surface border border-line border-l-4 border-l-brand',
  inset: 'bg-inset border border-line',
  warm: 'bg-warm-high border border-warm-line'
};

/** A surface that holds one headline figure and what explains it (spec rule 3). */
export function Card({ variant = 'plain', as, className, children, ...rest }: CardProps) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag
      {...rest}
      data-variant={variant}
      className={cx('rounded-card p-4', VARIANT[variant], className)}
    >
      {children}
    </Tag>
  );
}
