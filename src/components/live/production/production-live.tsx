'use client';

import { bakeWords } from '@/lib/production/owner-words';
import { useEffect, useId, useRef } from 'react';
import Image from 'next/image';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { BakePlanScreen } from '@/components/screens/bake-plan';
import { Button } from '@/components/ui/button';
import styles from './production.module.css';
import { ProductionResults } from './production-results';
import { ProductionReceipts } from './production-receipts';
import { ProductionRecoveryNotice } from './production-recovery-notice';
import { ProductionStart } from './production-start';
import { cookiePicture } from '@/lib/media/cookie-art';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { PageTitle } from '@/components/ui/owner-kit';
import { useAreaSettings } from '@/components/live/account/settings-areas';
import { MakeTabs } from '../recipes/make-shared';
import {
  CatalogueNotice,
  PRODUCTS_NOTICE_COPY,
  useCatalogueHeld
} from '../bazaar/catalogue-notice';

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
          {bakeWords(row.doughText)}
        </Button>
      ) : row.noDough ? (
        <span className={styles.muted}>{bakeWords(row.doughText)}</span>
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

/** The write actions stay authoritative. History spans drops; the order plan is scoped. */
export function ProductionLive({ v }: { v: OpsVals }) {
  const data = v.liveProduction,
    planNote = useId();
  const page = useRef<HTMLElement>(null);
  const wasStarting = useRef(false);
  const entryOpen = !!data?.start?.draft;
  const settings = useAreaSettings(v, 'make', 'Back to production');
  // HCB-004 a2: the order plan and the flavours' work are worked out from her products, which this phone may not have read.
  const catalogue = useCatalogueHeld(v.catalogueHeld);
  const unread = !catalogue.held && catalogue.started;
  useEffect(() => {
    if (entryOpen) wasStarting.current = true;
    else if (wasStarting.current) {
      page.current?.querySelector<HTMLButtonElement>('[data-production-start]')?.focus();
      wasStarting.current = false;
    }
  }, [entryOpen]);
  if (!data) return <BakePlanScreen v={v} />;
  if (settings.page) return settings.page;
  const canStart = data.start
    ? !!data.start.resume || data.start.products.length > 0
    : data.planReady;
  const unavailable =
    data.state === 'failed'
      ? 'Production could not be refreshed. Use Retry production below.'
      : data.state === 'loading'
        ? 'Reading saved production. Please wait.'
        : 'Check the saved products and recipes in Products before starting.';
  const active = v.bakeRows.filter((row) => row.hasWork || row.hasDough);
  const completed = v.bakeRows.filter((row) => !row.hasWork && !row.hasDough);
  return (
    <>
      {entryOpen && data.start ? (
        <ProductionStart start={data.start} period={data.periodText} />
      ) : null}
      <div hidden={entryOpen}>
        <section ref={page} data-screen-label="Production" className={styles.page}>
          <PageTitle
            title="Production"
            subtitle="See what you made and what is ready."
            actions={
              <>
                <Button
                  variant="primary"
                  data-production-start
                  onClick={data.start?.open ?? v.startFirst}
                  disabled={!canStart}
                  aria-describedby={!canStart || !data.planReady ? planNote : undefined}
                >
                  Start production
                </Button>
                <Button variant="secondary" onClick={settings.open}>
                  Settings
                </Button>
              </>
            }
          />
          <MakeTabs v={v} />
          <p className={styles.muted}>Order plan · {data.periodText}</p>
          <ProductionRecoveryNotice data={data.recovery} />
          {data.saving ? (
            <p role="status" className={styles.muted}>
              Production is saving. You can prepare another batch while you wait.
            </p>
          ) : null}
          {unread ? (
            <div id={planNote}>
              <CatalogueNotice
                failed={catalogue.failed}
                retry={catalogue.retry}
                copy={PRODUCTS_NOTICE_COPY}
              />
            </div>
          ) : data.planReady ? (
            <div className={styles.plan}>
              <strong>{v.bakeTotals.toBakeNum}</strong>
              <span>
                cookies to bake
                <small>
                  {active.some((row) => row.hasWork)
                    ? v.bakeTotals.summary
                    : 'No orders need baking.'}
                </small>
              </span>
            </div>
          ) : (
            <p id={planNote} className={styles.muted}>
              {!data.start
                ? 'The bake plan is not available yet.'
                : canStart
                  ? 'The order plan is unavailable. You can still start a manual batch.'
                  : unavailable}
            </p>
          )}
          {!unread && data.planReady && !canStart ? (
            <p id={planNote} className={styles.muted}>
              {unavailable}
            </p>
          ) : null}
          {data.inProgress?.length ? (
            <section aria-label="Production in progress" className={styles.work}>
              <h2>In progress ({data.inProgress.length})</h2>
              {data.inProgress.map((work) => {
                const photo = cookiePicture(resolveImagePath(work.photo), work.name);
                return (
                  <article
                    className={styles.workRow}
                    key={work.id}
                    aria-label={`${work.name}, ${work.label}`}
                  >
                    <div className={styles.workName}>
                      {photo ? (
                        <Image
                          src={photo}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : null}
                      <strong>{work.name}</strong>
                      <b>{work.status}</b>
                    </div>
                    <p className={styles.muted}>
                      {work.label} · {work.quantityText}
                    </p>
                    <Button onClick={work.open} aria-label={`Continue ${work.name}, ${work.label}`}>
                      {work.status === 'Saving' ? 'View' : 'Continue'}
                    </Button>
                  </article>
                );
              })}
            </section>
          ) : null}
          <ProductionReceipts rows={data.completed ?? []} />
          <ProductionResults data={data} />
          {!unread && data.planReady ? (
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
      </div>
    </>
  );
}
ProductionLive.ownsSectionNavigation = true;
