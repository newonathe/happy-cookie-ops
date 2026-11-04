'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { LiveProductionStart } from '@/lib/production/live-production-types';
import { validProductionChoice } from '@/lib/production/plan';
import { cookiePicture } from '@/lib/media/cookie-art';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { Button } from '@/components/ui/button';
import page from './production.module.css';
import styles from './plan-entry.module.css';

export function ProductionPlanEntry({ start, period }: { start: LiveProductionStart; period: string }) {
  const plan = start.multi!, heading = useRef<HTMLHeadingElement>(null), id = useId();
  const [error, setError] = useState('');
  useEffect(() => { heading.current?.focus(); }, [plan.reviewing]);
  const selected = plan.choices;
  const valid = selected.length > 0 && selected.every(row => validProductionChoice(row, start.products.find(p => p.id === row.productId)));
  const unavailable = selected.filter(row => !start.products.some(p => p.id === row.productId));
  return <section className={page.page} aria-label="Production plan entry">
    <header className={page.heading}>
      <h1 ref={heading} tabIndex={-1}>{plan.reviewing ? 'Review production plan' : 'Start production'}</h1>
      <Button variant="ghost" onClick={start.cancel}>Cancel</Button>
    </header>
    <p className={styles.intro}>{period} · Choose all the products you plan to make.</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault();
      setError('');
      const ok = plan.reviewing ? plan.begin() : plan.review();
      if (!ok) setError('The plan could not be confirmed. Your selections are kept; check the recipes and device copy, then retry.');
    }}>
      {plan.reviewing ? <section className={styles.review} aria-label="Selected production">
        {selected.map(row => { const product = start.products.find(p => p.id === row.productId);
          return <article key={row.productId}><div><strong>{product?.name ?? row.name ?? 'Unavailable product'}</strong>
            <p>Recipe version {row.version} · {row.kind === 'dough' ? 'Prepare dough' : 'Bake cookies'}</p></div>
            <b>{row.quantity} {row.kind === 'dough' ? 'dough portions' : 'cookies'}</b></article>;
        })}
      </section> : <fieldset className={styles.products}>
        <legend>Products to make</legend>
        {start.products.map(product => {
          const choice = selected.find(row => row.productId === product.id), photo = cookiePicture(resolveImagePath(product.photo), product.name);
          const changed = !!choice && choice.version !== product.version;
          return <article key={product.id} className={styles.product} data-selected={!!choice}>
            <label className={styles.identity}>
              <input type="checkbox" aria-label={product.name} checked={!!choice} onChange={() => { plan.toggle(product.id); setError(''); }} />
              {photo ? <span className={styles.photo} aria-hidden="true" style={{ backgroundImage: `url(${photo})` }} /> : null}
              <span><strong>{product.name}</strong><small>Recipe v{choice?.version ?? product.version} · Makes {product.yield}</small>
                {product.needed !== null ? <small>{product.needed} still needed for orders</small> : null}</span>
            </label>
            {choice ? <div className={styles.inputs}>
              <label htmlFor={`${id}-${product.id}-kind`}>Production type</label>
              <select id={`${id}-${product.id}-kind`} value={choice.kind} onChange={event => plan.setKind(product.id, event.target.value as 'batch' | 'dough')}>
                <option value="batch">Bake cookies</option><option value="dough">Prepare dough</option>
              </select>
              <label htmlFor={`${id}-${product.id}-quantity`}>{choice.kind === 'dough' ? 'Dough portions' : 'Cookies planned'} for {product.name}</label>
              {choice.kind === 'dough' ? <select id={`${id}-${product.id}-quantity`} value={choice.quantity} onChange={event => plan.setQuantity(product.id, event.target.value)}>
                <option value="" disabled>Choose recipe amount</option>
                <option value={product.yield}>Full recipe · {product.yield} portions</option>
                <option value={Math.ceil(product.yield / 2)}>Half recipe · {Math.ceil(product.yield / 2)} portions</option>
              </select> : <input id={`${id}-${product.id}-quantity`} type="number" inputMode="numeric" min="1" max="10000" step="1"
                value={choice.quantity} onChange={event => plan.setQuantity(product.id, event.target.value)}
                aria-invalid={!validProductionChoice(choice, product)} />}
              {changed ? <Button onClick={() => plan.useRecipe(product.id)} aria-label={`Use version ${product.version} for ${product.name}`}>Use version {product.version}</Button> : null}
            </div> : null}
          </article>;
        })}
        {unavailable.map(row => <article key={row.productId} className={styles.product}>
          <strong>{row.name ?? 'Selected product'} is unavailable.</strong>
          <Button onClick={() => plan.toggle(row.productId)}>Remove unavailable product</Button>
        </article>)}
      </fieldset>}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <footer className={styles.actions}>
        {plan.reviewing ? <Button onClick={() => { setError(''); plan.edit(); }}>Back to products and quantities</Button> : null}
        <Button type="submit" variant="primary" disabled={!valid}>{plan.reviewing
          ? `Start ${selected.length} production ${selected.length === 1 ? 'item' : 'items'}`
          : `Review ${selected.length} ${selected.length === 1 ? 'product' : 'products'}`}</Button>
        <p>Planning does not change stock. Record actual counts for each batch when it is finished.</p>
      </footer>
    </form>
  </section>;
}
