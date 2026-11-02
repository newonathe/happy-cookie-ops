'use client';

import { useId } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { BakePlanScreen } from '@/components/screens/bake-plan';
import { Button } from '@/components/ui/button';
import styles from './production.module.css';
import { ProductionResults } from './production-results';

function WorkRow({ row }: { row: OpsVals['bakeRows'][number] }) {
  return (
    <article className={styles.workRow}>
      <div className={styles.workName}>
        <span aria-hidden="true" style={s(row.imgStyle)} />
        <strong>{row.name}</strong>
        {row.done ? (
          <span className={styles.done}>Done</span>
        ) : (
          <b>
            {row.actNum} {row.actWord}
          </b>
        )}
      </div>
      {row.hasDough ? (
        <Button variant="ghost" size="sm" onClick={row.openDough} className="self-start">
          {row.doughText}
        </Button>
      ) : row.noDough ? (
        <span className={styles.muted}>{row.doughText}</span>
      ) : null}
      {row.hasWork ? (
        <div className={styles.actions}>
          <Button onClick={row.act}>{row.actLabel}</Button>
          {row.canMixMore ? <Button onClick={row.mixAhead}>Mix</Button> : null}
        </div>
      ) : null}
    </article>
  );
}

/** The write actions remain the existing runtime actions. Results come only from saved, scoped reads. */
export function ProductionLive({ v }: { v: OpsVals }) {
  const data = v.liveProduction,
    planNote = useId();
  if (!data) return <BakePlanScreen v={v} />;
  const active = v.bakeRows.filter((row) => row.hasWork || row.hasDough);
  const completed = v.bakeRows.filter((row) => !row.hasWork && !row.hasDough);
  return (
    <section data-screen-label="Bake plan" className={styles.page}>
      <header className={styles.heading}>
        <h1>Bake plan</h1>
        <Button
          variant="primary"
          onClick={v.startFirst}
          disabled={!data.planReady}
          aria-describedby={!data.planReady ? planNote : undefined}
        >
          Start production
        </Button>
      </header>
      {data.planReady ? (
        <div className={styles.plan}>
          <strong>{v.bakeTotals.toBakeNum}</strong>
          <span>
            cookies to bake
            <small>
              {active.some((row) => row.hasWork) ? v.bakeTotals.summary : 'No orders need baking.'}
            </small>
          </span>
        </div>
      ) : (
        <p id={planNote} className={styles.muted}>
          The bake plan is not available yet.
        </p>
      )}
      <ProductionResults data={data} />
      {data.planReady ? (
        <section aria-label="Baking work" className={styles.work}>
          <h2>To make</h2>
          {active.length ? (
            active.map((row, i) => <WorkRow key={i} row={row} />)
          ) : (
            <p className={styles.empty}>No orders to bake.</p>
          )}
          {completed.length ? (
            <details>
              <summary>Completed flavours ({completed.length})</summary>
              {completed.map((row, i) => (
                <WorkRow key={i} row={row} />
              ))}
            </details>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
