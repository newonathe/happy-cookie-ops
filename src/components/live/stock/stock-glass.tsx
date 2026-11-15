'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { glassStyles } from '@/components/ui/glass';
import styles from './stock-glass.module.css';

/** The Stock pages on espresso glass: shared pieces; the layout classes live in `stock-glass.module.css`. */
export { styles as stockGlass };

/** A Stock sub-page (one item, a count, a delivery, settings, one supplier) on one light card, never dark on dark. */
export function SubPage({ children }: { children: ReactNode }) {
  return <div className={cx(glassStyles.glassCard, styles.subpage)}>{children}</div>;
}

/** A notice on the ground: a light surface with dark text. It takes no room while its content is empty. */
export function Notice({ children }: { children: ReactNode }) {
  return <div className={styles.notice}>{children}</div>;
}

/**
 * A count or a figure as a tile: the figure over its label. `labelFirst` keeps the label ahead of the figure in the
 * reading order (a page that has always read "label, then figure") and only draws the figure on top.
 */
export function Tile({
  label,
  tone,
  labelFirst = false,
  textual = false,
  children
}: {
  label: string;
  /** A theme background class for a colour dot, such as `bg-ok`. */
  tone?: string;
  labelFirst?: boolean;
  /** The value is a sentence (a total with a note), not one figure: set smaller so it never towers over its row. */
  textual?: boolean;
  children: ReactNode;
}) {
  const figure = (
    <span className="flex items-center gap-2">
      {tone ? <span aria-hidden="true" className={cx(glassStyles.dot, tone)} /> : null}
      <span className={tone ? styles.countFigure : textual ? styles.textFigure : styles.figure}>
        {children}
      </span>
    </span>
  );
  const caption = <span className={glassStyles.statLabel}>{label}</span>;
  return labelFirst ? (
    <div className={cx(glassStyles.stat, styles.labelFirst)}>
      {caption}
      {figure}
    </div>
  ) : (
    <div className={glassStyles.stat}>
      {figure} {caption}
    </div>
  );
}
