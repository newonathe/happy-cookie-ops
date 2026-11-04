'use client';

import { useEffect } from 'react';
import type { LiveProductionVals } from '@/lib/production/live-production-types';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { formatManila } from '@/lib/time/business-clock';
import { Banner } from '@/components/ui/banner';
import styles from './results.module.css';

const n = (value: number) => value.toLocaleString('en-PH');
type Group = {
  id: string;
  name: string;
  photo: string;
  good: number;
  rejects: number;
  plan: number;
  missing: boolean;
  known: boolean;
};
export function ProductionResults({ data }: { data: LiveProductionVals }) {
  const refresh = data.refresh,
    period = data.periodText;
  useEffect(() => {
    refresh();
  }, [refresh, period]);
  const groups = new Map<string, Group>();
  for (const row of data.rows) {
    const group = groups.get(row.productId) ?? {
      id: row.productId,
      name: row.name,
      photo: row.photo,
      good: 0,
      rejects: 0,
      plan: 0,
      missing: false,
      known: false
    };
    group.good += row.qty;
    group.rejects += row.rejects;
    if (row.target === null) group.missing = true;
    else {
      group.plan += row.target;
      group.known = true;
    }
    groups.set(row.productId, group);
  }
  const scale = Math.max(
    1,
    ...[...groups.values()].flatMap((g) => [g.good + g.rejects, g.missing ? 0 : g.plan])
  );
  const good = data.rows.reduce((sum, row) => sum + row.qty, 0);
  const rejects = data.rows.reduce((sum, row) => sum + row.rejects, 0);
  const baked = good + rejects;
  const dates = data.rows
    .map((row) => row.at)
    .filter((at) => Number.isFinite(new Date(at).getTime()));
  const date = (at: number) =>
    formatManila(at, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-PH');
  const first = Math.min(...dates),
    last = Math.max(...dates);
  const range = !dates.length
    ? 'Dates unavailable'
    : dates.length !== data.rows.length
      ? 'Some dates unavailable'
      : date(first) === date(last)
        ? date(first)
        : `${date(first)} – ${date(last)}`;
  const showSaved = data.state === 'read' || data.rows.length > 0;
  return (
    <section className={styles.results} aria-label="Saved production">
      <header className={styles.sectionHeading}>
        <h2>Cookies made</h2>
        <span>Recent history · all drops</span>
      </header>
      {data.rows.length ? <p className={styles.detail}>{range}</p> : null}
      {data.state !== 'read' ? (
        <Banner
          tone={data.state === 'failed' ? 'warn' : 'info'}
          title={
            data.state === 'failed'
              ? 'Production history could not be refreshed.'
              : 'Reading saved production…'
          }
          body={data.rows.length ? 'Showing the last saved results.' : undefined}
          action={
            data.state === 'failed'
              ? { label: 'Retry production', onPress: data.refresh }
              : undefined
          }
        />
      ) : null}
      {showSaved ? (
        <div className={styles.total} role="group" aria-label="Saved production totals">
          <strong>{n(baked)}</strong>
          <span>
            cookies baked
            <small>
              {n(good)} good · {n(rejects)} not for sale
            </small>
          </span>
        </div>
      ) : null}
      {data.state === 'read' && !data.rows.length ? (
        <p className={styles.empty}>No saved batches yet.</p>
      ) : null}
      {data.rows.length ? (
        <>
          <div className={styles.legend}>
            <span>
              <i className={styles.planned} />
              Saved batch plans
            </span>
            <span>
              <i className={styles.good} />
              Good cookies
            </span>
            <span>
              <i className={styles.reject} />
              Not for sale
            </span>
          </div>
          <div className={styles.scale} aria-hidden="true">
            <span>0</span>
            <span>{n(scale)} cookies</span>
          </div>
          <div className={styles.charts}>
            {[...groups.values()].map((g) => {
              const plan = g.missing ? null : g.plan;
              const made = g.good + g.rejects;
              const unknown = g.known ? 'Plan incomplete' : 'No plan saved';
              const max = scale,
                photo = resolveImagePath(g.photo);
              return (
                <article key={g.id} className={styles.chart}>
                  <div className={styles.product}>
                    {photo ? (
                      <span aria-hidden="true" style={{ backgroundImage: `url(${photo})` }} />
                    ) : null}
                    <h3>{g.name}</h3>
                  </div>
                  <div
                    role="img"
                    aria-label={`${g.name}: ${plan === null ? unknown : n(plan) + ' planned'}; ${n(made)} baked; ${n(g.good)} good; ${n(g.rejects)} not for sale`}
                  >
                    <div className={styles.barLine} aria-hidden="true">
                      <span>Planned</span>
                      {plan === null ? (
                        <span className={styles.unknown}>{unknown}</span>
                      ) : (
                        <>
                          <div className={styles.track}>
                            <div
                              data-plan-bar
                              className={styles.planned}
                              style={{ width: `${(plan / max) * 100}%` }}
                            />
                          </div>
                          <b>{n(plan)}</b>
                        </>
                      )}
                    </div>
                    <div className={styles.barLine} aria-hidden="true">
                      <span>Baked</span>
                      <div className={styles.track}>
                        <div
                          data-baked-bar
                          className={styles.baked}
                          style={{ width: `${(made / max) * 100}%` }}
                        >
                          <i
                            className={styles.good}
                            style={{ width: `${made ? (g.good / made) * 100 : 0}%` }}
                          />
                          <i
                            className={styles.reject}
                            style={{ width: `${made ? (g.rejects / made) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <b>{n(made)}</b>
                    </div>
                  </div>
                  <p className={styles.detail}>
                    {n(g.good)} good{g.rejects ? ` · ${n(g.rejects)} not for sale` : ''}
                  </p>
                </article>
              );
            })}
          </div>
          <details className={styles.history}>
            <summary>Production history</summary>
            <ul>
              {[...data.rows]
                .sort((a, b) => b.at - a.at)
                .map((row, index) => {
                  const date = new Date(row.at),
                    when = Number.isFinite(date.getTime())
                      ? formatManila(
                          date,
                          {
                            day: 'numeric',
                            month: 'short',
                            hour: 'numeric',
                            minute: '2-digit'
                          },
                          'en-PH'
                        )
                      : 'Time unavailable';
                  return (
                    <li key={`${row.productId}:${row.at}:${index}`}>
                      <strong>{row.name}</strong>
                      <span>
                        {when} · Recipe version {row.version}
                      </span>
                      <span>
                        {n(row.qty + row.rejects)} baked · {n(row.qty)} good · {n(row.rejects)} not
                        for sale
                      </span>
                    </li>
                  );
                })}
            </ul>
          </details>
        </>
      ) : null}
    </section>
  );
}
