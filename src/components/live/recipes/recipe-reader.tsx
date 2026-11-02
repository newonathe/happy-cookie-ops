'use client';

import { useEffect, useRef } from 'react';
import type { LiveRecipesVals } from '@/lib/recipes/live-recipes-types';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import styles from './recipe-reader.module.css';

export function RecipeReader({
  page,
  onCosts
}: {
  page: NonNullable<LiveRecipesVals['recipePage']>;
  onCosts: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const photo = resolveImagePath(page.photo);
  return (
    <section data-screen-label="Recipes" className={styles.page} aria-label="Saved recipe">
      <Button className="self-start" onClick={page.back}>
        Back to Products
      </Button>
      <header className={styles.header}>
        {photo ? (
          <span
            aria-hidden="true"
            className={styles.photo}
            style={{ backgroundImage: `url(${photo})` }}
          />
        ) : null}
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {page.name} recipe
          </h1>
          <p>Saved recipe quantities.</p>
        </div>
      </header>
      {page.state !== 'read' ? (
        <Banner
          tone={page.state === 'failed' ? 'warn' : 'info'}
          title={
            page.state === 'failed' ? 'The recipe could not be refreshed.' : 'Reading the recipe…'
          }
          body={page.rows.length ? 'Showing the last saved copy.' : undefined}
          action={
            page.state === 'failed' ? { label: 'Retry recipe', onPress: page.refresh } : undefined
          }
        />
      ) : null}
      {page.rows.length ? (
        <section className={styles.panel} aria-label="Recipe quantities">
          <div className={styles.facts}>
            <strong>{page.yieldText}</strong>
            <span>{page.versionText}</span>
          </div>
          <dl>
            {page.rows.map((row, index) => (
              <div key={`${row.name}:${index}`} className={styles.row}>
                <dt>{row.name}</dt>
                <dd>{row.amountText}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : page.state === 'read' ? (
        <p className={styles.empty}>No saved recipe quantities yet.</p>
      ) : null}
      <Button className="self-start" onClick={onCosts}>
        Costs & history
      </Button>
    </section>
  );
}
