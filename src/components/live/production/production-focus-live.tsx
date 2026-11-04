'use client';

import { useEffect, useId, useRef } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { ProductionFocusScreen } from '@/components/screens/production-focus';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import { Field } from '@/components/ui/field';
import { s } from '@/lib/css';
import styles from './focus.module.css';
import { ProductionRecipeUpdate } from './production-recipe-update';

/** Count and review presentation; stock quantities and recording remain runtime actions. */
export function ProductionFocusLive({ v }: { v: OpsVals }) {
  const batch = v.batch, counts = v.liveBatchCounts;
  const formId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [batch?.step2]);
  if (!batch || !counts) return <ProductionFocusScreen v={v} />;
  const locked = counts.saving || counts.uncertain;
  const actual = Number(counts.actual), rejects = Number(counts.rejects);
  const target = typeof batch.target === 'number' ? batch.target : null;
  const good = typeof v.goodCount === 'number' ? v.goodCount : null;
  const chart = counts.valid && target !== null && Number.isFinite(target) && target >= 0 && good !== null;
  const max = Math.max(target ?? 0, actual, 1);
  const actualError = !/^\d+$/.test(counts.actual) || actual < 1 || actual > 10000;
  const rejectError = !/^\d+$/.test(counts.rejects) || rejects > 10000 || (!actualError && rejects > actual);
  return (
    <section className={styles.page} data-screen-label="Production focus" aria-label="Production batch">
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>{counts.periodText} · {batch.step2 ? '2. Review' : '1. Count'}</p>
          <h1 ref={heading} tabIndex={-1}>{batch.step2 ? 'Review production' : 'Cookies made'}</h1>
        </div>
        <Button variant="ghost" onClick={batch.exit}>Leave for now</Button>
      </header>
      <div className={styles.product}>
        <span aria-hidden="true" style={s(batch.imgStyle)} />
        <div><strong>{batch.name}</strong><p>{counts.uncertain ? 'Saved result pending' : counts.sourceUnavailable ? 'Draft kept' : batch.doughText}{counts.recipeVersion !== null ? ` · Recipe v${counts.recipeVersion}` : ''}</p></div>
        <span className={styles.plan}><b>{batch.target}</b> planned</span>
      </div>
      {counts.uncertain ? <Banner tone="warn" title="Save result not confirmed"
        body="Check the saved result using the original batch details. Keep this batch until the result is confirmed." /> : null}
      {counts.sourceUnavailable && !counts.uncertain ? <Banner tone="warn" title="Saved recipe unavailable"
        body="Your counts and notes are kept. Read the saved recipe before continuing."
        action={counts.retryRecipe ? { label: 'Retry saved recipe', onPress: counts.retryRecipe } : undefined} /> : null}
      {counts.sourceChanged && !counts.sourceUnavailable && !counts.uncertain ? <Banner tone="warn" title={counts.recipeUpdate?.previousVersion === null ? 'Review saved recipe' : 'Recipe changed'}
        body="Your counts are kept. Review the recipe before recording this batch." /> : null}
      {counts.recipeUpdate && !counts.uncertain ? <ProductionRecipeUpdate update={counts.recipeUpdate} /> : null}
      {!batch.step2 ? (
        <form id={formId} className={styles.content} onSubmit={(event) => { event.preventDefault(); counts.review(); }}>
          <div className={styles.fields}>
            <Field label="Cookies made, including rejects" mode="numeric" value={counts.actual}
              maxLength={32} disabled={locked} onChange={(e) => counts.setActual(e.currentTarget.value)}
              error={actualError ? 'Enter a whole number from 1 to 10,000.' : undefined} />
            <Field label="Rejects" hint="Burnt, broken or unsuitable to sell." mode="numeric" value={counts.rejects}
              maxLength={32} disabled={locked} onChange={(e) => counts.setRejects(e.currentTarget.value)}
              error={rejectError ? 'Enter zero or a whole number no greater than cookies made.' : undefined} />
          </div>
          <details className={styles.details}><summary>Batch details</summary>
          <label className={styles.select}>Product
            <select aria-label="Product" value={batch.pid} disabled={locked} onChange={batch.setFlavour}>
              {v.bakeFlavours.map((p, i) => <option key={i} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <Field label="Batch note (optional)" hint="Kept with this open batch; not saved in production history." value={batch.note} disabled={locked} onChange={batch.setNote} />
          </details>
        </form>
      ) : null}
      {chart ? (
        <figure className={styles.chart} aria-label="Planned and actual cookies">
          <figcaption>Planned and actual <span>cookies</span></figcaption>
          <div className={styles.barRow}><span>Planned <b>{batch.target}</b></span>
            <div className={styles.track}><i className={styles.planned} style={{ width: `${(target ?? 0) / max * 100}%` }} /></div>
          </div>
          <div className={styles.barRow}><span>Made <b>{counts.actual}</b></span>
            <div className={styles.track}><div className={styles.made} style={{ width: `${actual / max * 100}%` }}>
              <i className={styles.goodBar} style={{ width: `${(good ?? 0) / actual * 100}%` }} />
              <i className={styles.rejectBar} style={{ width: `${rejects / actual * 100}%` }} />
            </div></div>
          </div>
          <div className={styles.legend}><span><i className={styles.goodBar} />{v.goodCount} good</span>
            <span><i className={styles.rejectBar} />{counts.rejects} rejects</span></div>
        </figure>
      ) : null}
      <div className={styles.result} aria-live="polite">
        <strong>{counts.valid ? v.goodCount : '—'}</strong>
        <span>{counts.uncertain ? 'good cookies in this submission' : counts.sourceUnavailable && counts.valid ? 'good cookies counted' : counts.valid ? 'good cookies will enter stock' : 'Check both counts to see the good cookies'}</span>
        <small>{counts.uncertain ? 'The saved result has not been confirmed.' : 'Stock changes only after confirmed production is saved.'}</small>
      </div>
      {!batch.step2 ? <div className={styles.actions}>
        {counts.uncertain ? <Button variant="primary" onClick={counts.confirm}>Check saved result</Button>
          : <Button variant="primary" type="submit" form={formId} disabled={!counts.valid || counts.saving || counts.sourceUnavailable}>Review production</Button>}
      </div> : null}
      {batch.step2 ? (
        <div className={styles.content}>
          {!counts.uncertain && !counts.sourceChanged && !counts.sourceUnavailable ? <p className={styles.dough}>{batch.doughLine}</p> : null}
          {!counts.uncertain && !counts.sourceChanged && !counts.sourceUnavailable && batch.anyShort ? <Banner tone="warn" title="Some recorded stock is short."
            body="Confirming uses the available stock and records the shortage. Stock will stop at zero. Correct the balance with a physical count." /> : null}
          {!counts.uncertain && !counts.sourceChanged && !counts.sourceUnavailable ? <section className={styles.ingredients} aria-label="Ingredients used">
            <h2>Stock this batch uses</h2><p>Check the amounts. Adjust only what you used differently.</p>
            {batch.rows.length ? batch.rows.map((row, i) => {
              const stock = counts.stock.find((item) => item.name === row.name);
              return (
              <div className={styles.ingredient} key={i}>
                <div><strong>{row.name}</strong><small>{stock
                  ? `${stock.balance.toLocaleString('en-PH')} ${stock.unit} recorded`
                  : 'Recorded balance unavailable'}</small></div>
                <b className={row.short ? styles.short : undefined}>{row.amountText}
                  {row.short ? <small>Stock short</small> : null}</b>
                {row.deltaText ? <small className={styles.delta}>{row.deltaText} adjustment</small> : null}
                <div className={styles.adjust}>
                  <Button size="sm" disabled={counts.saving} aria-label={`Use less ${row.name}`} onClick={row.minus}>−</Button>
                  <Button size="sm" disabled={counts.saving} aria-label={`Use more ${row.name}`} onClick={row.plus}>+</Button>
                </div>
              </div>
            ); }) : <p>No fresh ingredients are deducted for this batch.</p>}
          </section> : <p>{counts.sourceUnavailable && !counts.uncertain ? 'Read the saved recipe to see ingredient use.' : counts.sourceChanged && !counts.uncertain
            ? 'Use the updated recipe before reviewing stock use.' : 'Stock use will refresh after confirmation.'}</p>}
          {!counts.valid ? <Banner tone="warn" title="Check the counts before confirming."
            body="Go back and enter cookies made and rejects." /> : null}
          <div className={styles.actions}>
            <Button onClick={batch.toStep1} disabled={locked}>Back to counts</Button>
            <Button variant="primary" onClick={counts.confirm} disabled={!counts.valid || counts.saving || ((counts.sourceChanged || counts.sourceUnavailable) && !counts.uncertain)}>
              {counts.saving ? 'Saving production…' : counts.uncertain ? 'Check saved result' : 'Confirm production'}
            </Button>
          </div>
        </div>
      ) : null}
      {counts.saving ? <p className={styles.saving} role="status">Waiting for the saved result. Please wait before making changes.</p> : null}
      <footer className={styles.footer}>
        <Button variant="danger" size="sm" onClick={batch.discard} disabled={locked}>Discard</Button>
        <span>{counts.uncertain ? 'Check the saved result before discarding this batch.' : 'Discard closes this unfinished batch without recording production.'}</span>
      </footer>
    </section>
  );
}
ProductionFocusLive.ownsSectionNavigation = true;
