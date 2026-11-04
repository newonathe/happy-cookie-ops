'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LiveProductionStart } from '@/lib/production/live-production-types';
import { cookiePicture } from '@/lib/media/cookie-art';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import page from './production.module.css';
import styles from './start.module.css';
import { ProductionPlanEntry } from './production-plan-entry';

export function ProductionStart({ start, period }: { start: LiveProductionStart; period: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const [error, setError] = useState('');
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const draft = start.draft;
  if (!draft) return null;
  if (start.multi) return <ProductionPlanEntry start={start} period={period} />;
  const product = start.products.find((p) => p.id === draft.productId);
  const photo = cookiePicture(resolveImagePath(product?.photo ?? ''), product?.name ?? '');
  const changed = !!product && product.version !== draft.version;
  const valid =
    /^\d+$/.test(draft.quantity) && Number(draft.quantity) >= 1 && Number(draft.quantity) <= 10000 &&
    (draft.kind !== 'dough' || !!product && [product.yield, Math.ceil(product.yield / 2)].includes(Number(draft.quantity)));
  return (
    <section
      data-screen-label="Production entry"
      className={page.page}
      aria-label="Production plan entry"
    >
      <header className={page.heading}>
        <h1 ref={heading} tabIndex={-1}>
          Start production
        </h1>
        <Button variant="ghost" onClick={start.cancel}>
          Cancel
        </Button>
      </header>
      <p className={styles.intro}>
        Choose a product and what you plan to make. <span>{period}</span>
      </p>
      {start.chooseKind ? <div role="group" aria-label="Production type" className="flex flex-wrap gap-2">
        <Button variant={draft.kind !== 'dough' ? 'primary' : 'secondary'} aria-pressed={draft.kind !== 'dough'} onClick={() => start.chooseKind?.('batch')}>Bake cookies</Button>
        <Button variant={draft.kind === 'dough' ? 'primary' : 'secondary'} aria-pressed={draft.kind === 'dough'} onClick={() => start.chooseKind?.('dough')}>Prepare dough</Button>
      </div> : null}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (product && valid && !changed && !start.begin())
            setError(
              'The production details changed. Check the product and quantity, then try again.'
            );
        }}
      >
        <div className={styles.field}>
          <label htmlFor={id + '-product'}>Product</label>
          <select
            id={id + '-product'}
            value={draft.productId}
            required
            onChange={(event) => {
              start.choose(event.currentTarget.value);
              setError('');
            }}
          >
            <option value="" disabled>
              Choose a product
            </option>
            {start.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {product ? (
          <div className={styles.product}>
            {photo ? (
              <span
                className={styles.photo}
                aria-hidden="true"
                style={{ backgroundImage: `url(${photo})` }}
              />
            ) : null}
            <div>
              <strong>{product.name}</strong>
              <p>
                Recipe version {draft.version} · Makes {product.yield} cookies
              </p>
              <p>
                {product.needed === null
                  ? 'Order quantities are unavailable. You can make a manual batch.'
                  : product.needed > 0
                    ? `${product.needed} cookies still needed for orders`
                    : 'No orders need this flavour. You can still make a batch.'}
              </p>
            </div>
          </div>
        ) : draft.productId ? (
          <Banner
            tone="warn"
            title="This product’s saved recipe is unavailable."
            body="Choose another product or return to Products to check its recipe."
          />
        ) : null}
        {changed && product ? (
          <Banner
            tone="warn"
            title="The saved recipe changed."
            body={`Review version ${product.version} before continuing.`}
            action={{
              label: `Use version ${product.version}`,
              onPress: () => {
                start.choose(product.id);
                setError('');
              }
            }}
          />
        ) : null}
        {draft.kind === 'dough' ? <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-body font-semibold">Recipe amount</legend>
          {product ? <div className="flex flex-wrap gap-2">
            {[product.yield, Math.ceil(product.yield / 2)].map((amount, i) => <Button key={i} variant={draft.quantity === String(amount) ? 'primary' : 'secondary'}
              aria-pressed={draft.quantity === String(amount)} onClick={() => start.setQuantity(String(amount))}>
              {i === 0 ? 'Full recipe' : 'Half recipe'} · {amount} portions
            </Button>)}
          </div> : <p className={styles.hint}>Choose a product above.</p>}
        </fieldset> : <div className={styles.field}>
          <label htmlFor={id + '-quantity'}>Cookies planned</label>
          <input
            id={id + '-quantity'}
            type="number"
            inputMode="numeric"
            min="1"
            max="10000"
            step="1"
            required
            value={draft.quantity}
            aria-describedby={id + '-hint'}
            aria-invalid={draft.quantity !== '' && !valid}
            onChange={(event) => {
              start.setQuantity(event.currentTarget.value);
              setError('');
            }}
          />
        </div>}
        {draft.kind !== 'dough' ? <p id={id + '-hint'} className={styles.hint}>
          Enter a whole number from 1 to 10,000.
        </p> : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={!product || !valid || changed}>
            Continue
          </Button>
          <p>No stock changes until you confirm production.</p>
        </div>
      </form>
    </section>
  );
}
