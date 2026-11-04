'use client';

import { useState } from 'react';
import type { LiveMoney, MoneyPeriod, OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { MoneyEntryLive, TransactionLive } from './money-pages';
import { SubTabs } from '@/components/ui/sub-tabs';
import { cx } from '@/components/ui/cx';
import {
  FooterActions,
  PageTitle,
  Panel,
  SectionHeading,
  SignedMoney,
  TaskRow
} from '@/components/ui/owner-kit';

const PERIODS: Array<[MoneyPeriod, string]> = [
  ['week', 'Last 7 days'],
  ['days30', 'Last 30 days'],
  ['month', 'This month']
];

type Filter = { kind: 'all' | 'income' | 'costs' } | { kind: 'cat'; cat: string };

const pesos = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** Income against expenses for each day or week of the period, with the exact amounts beside the bars. */
function IncomeExpenseChart({ money }: { money: LiveMoney }) {
  const max = Math.max(
    1,
    ...money.buckets.flatMap((b) => [Math.abs(b.income), Math.abs(b.expenses)])
  );
  const unit = money.period === 'week' ? 'day' : 'week';
  return (
    <Panel title="Income and expenses">
      <p className="mb-3 text-caption text-ink-mute">
        Each pair is one {unit}.{' '}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-ok" /> Income
        </span>{' '}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-danger" />{' '}
          Expenses
        </span>
      </p>
      <div
        className="relative grid items-end gap-2 pl-3"
        style={{ gridTemplateColumns: `repeat(${money.buckets.length}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        <span className="absolute left-0 top-16 -translate-y-1/2 text-[10px] text-ink-mute">0</span>
        <span className="absolute left-3 right-0 top-16 border-t border-line-strong" />
        {money.buckets.map((b) => (
          <div key={b.label} className="flex min-w-0 flex-col items-center gap-1.5">
            <div className="relative flex h-32 w-full justify-center gap-1">
              {(['income', 'expenses'] as const).map((k) => {
                const flow = k === 'expenses' ? -b[k] : b[k];
                return (
                  <span key={k} className="relative h-full w-full max-w-5">
                    <span
                      data-money-series={k}
                      data-value={b[k]}
                      className={cx(
                        'absolute block w-full transition-[height] duration-[280ms] motion-reduce:transition-none',
                        flow < 0 ? 'rounded-b-[5px]' : 'rounded-t-[5px]',
                        flow >= 0 ? 'bg-ok' : 'bg-danger'
                      )}
                      style={{
                        top: flow < 0 ? '50%' : undefined,
                        bottom: flow >= 0 ? '50%' : undefined,
                        height: `${b[k] !== 0 ? Math.max(1.5, (Math.abs(b[k]) / max) * 50) : 0}%`
                      }}
                    />
                  </span>
                );
              })}
            </div>
            <span className="truncate text-[11px] text-ink-mute">{b.label}</span>
          </div>
        ))}
      </div>
      {money.buckets.some((b) => b.income < 0) ? (
        <p className="mt-2 text-caption text-danger">
          Refunds exceed income in the red bars below zero.
        </p>
      ) : null}
      {money.buckets.some((b) => b.expenses < 0) ? (
        <p className="mt-2 text-caption text-ink-mute">Reversed expenses appear above zero.</p>
      ) : null}
      <details className="mt-3 text-caption">
        <summary className="min-h-10 cursor-pointer py-2 font-semibold text-ink-soft">
          Show amounts
        </summary>
        <table className="w-full tabular-nums">
          <caption className="sr-only">Income and expenses by {unit}</caption>
          <thead>
            <tr className="text-left text-ink-mute">
              <th scope="col" className="py-1 font-semibold">
                {unit === 'day' ? 'Day' : 'Week from'}
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Income
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Expenses
              </th>
            </tr>
          </thead>
          <tbody>
            {money.buckets.map((b) => (
              <tr key={b.label} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {b.label}
                </th>
                <td className="py-1.5 text-right">
                  <SignedMoney pesos={b.income} />
                </td>
                <td className="py-1.5 text-right">
                  <SignedMoney pesos={-b.expenses} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}

function MoneySettings({ money, back }: { money: LiveMoney; back: () => void }) {
  return (
    <div className="w-full max-w-[860px]">
      <PageTitle
        title="Money settings"
        subtitle="How your books count costs, and the lists they use."
        actions={
          <Button variant="secondary" onClick={back}>
            Back to Money
          </Button>
        }
      />
      <Panel>
        <TaskRow
          title="Books & costs"
          detail="How stock costs reach your books, and costs that need a fix"
          action={
            <Button variant="secondary" size="sm" onClick={money.openBooks}>
              Open
            </Button>
          }
        />
        <TaskRow
          title="Expense categories"
          detail="The groups used when you record an expense"
          action={
            <Button variant="secondary" size="sm" onClick={money.openCategories}>
              Open
            </Button>
          }
        />
        <TaskRow
          title="Tax set-aside"
          detail={`${money.taxRate}% of takings is set aside`}
          action={
            <Button variant="secondary" size="sm" onClick={money.openTaxRules}>
              Open
            </Button>
          }
        />
        <TaskRow
          title="Download all books"
          detail="The last 13 months as a spreadsheet (CSV)"
          action={
            <Button variant="secondary" size="sm" onClick={money.exportAll}>
              Download
            </Button>
          }
        />
      </Panel>
      {money.recipeCosts?.length ? (
        <>
          <SectionHeading>Recipe costs</SectionHeading>
          <Panel>
            {money.recipeCosts.map((item) => (
              <TaskRow
                key={item.id}
                title={item.name}
                detail={item.costText}
                action={
                  <Button variant="secondary" size="sm" onClick={item.open}>
                    View cost<span className="sr-only"> of {item.name}</span>
                  </Button>
                }
              />
            ))}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

/**
 * Money (client v4): one period for every figure, the bars and the list. Positive amounts are
 * green with +, costs red with −; the books' own sums are shown, never a chart's own arithmetic.
 */
export function MoneyLive({ v }: { v: OpsVals }) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const money = v.liveMoney;
  const [settings, setSettings] = useState(false);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  if (!money) return null;
  if (money.entry) return <MoneyEntryLive entry={money.entry} />;
  if (settings) return <MoneySettings money={money} back={() => setSettings(false)} />;
  const opened = money.transactions.find((t) => t.id === openRow);
  if (opened) return <TransactionLive row={opened} back={() => setOpenRow(null)} />;
  const tabs = v.liveScreen?.tabs;
  const cat = filter.kind === 'cat' ? filter.cat : null;
  const rows = money.transactions.filter((t) =>
    filter.kind === 'all'
      ? true
      : filter.kind === 'income'
        ? t.kind === 'revenue' || t.kind === 'refund'
        : filter.kind === 'costs'
          ? t.kind === 'expense'
          : t.kind === 'expense' && t.cat === cat
  );
  const catMax = Math.max(1, ...money.categories.map((c) => c.amount));
  const chip = (active: boolean) =>
    cx(
      'min-h-10 rounded-full border px-3.5 text-caption font-semibold transition-colors duration-[140ms] focus-visible:outline-2 focus-visible:outline-brand',
      active
        ? 'border-ink bg-ink text-surface'
        : 'border-line-strong bg-surface text-ink hover:bg-raise'
    );
  return (
    <div className="w-full">
      <PageTitle
        title="Money"
        subtitle={money.periodText}
        actions={
          <>
            <Button variant="primary" onClick={money.recordExpense}>
              Record expense
            </Button>
            <Button variant="secondary" onClick={() => setSettings(true)}>
              Settings
            </Button>
          </>
        }
      />
      {tabs ? (
        <div className="mb-4">
          <SubTabs
            label={tabs.label}
            tabs={tabs.places.filter((t) => t.id !== 'expenses')}
            refined
          />
        </div>
      ) : null}
      <div role="group" aria-label="Period" className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={money.period === key}
            onClick={() => money.setPeriod(key)}
            className={chip(money.period === key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!money.loaded ? (
        <Panel tone="hero" title="Books not loaded yet">
          <p className="text-caption text-ink-mute">
            Your books could not be read on this device yet. Figures appear once they load; nothing
            here is counted as zero.
          </p>
        </Panel>
      ) : (
        <>
          <Panel tone="hero">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-caption text-ink-mute">Income</span>
                <SignedMoney pesos={money.revenue} className="text-[26px] leading-tight" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-caption text-ink-mute">Expenses</span>
                <SignedMoney pesos={-money.expenses} className="text-[26px] leading-tight" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-caption font-semibold text-ink">
                  {money.profit < 0 ? 'Loss' : 'Profit'}
                </span>
                <SignedMoney pesos={money.profit} className="text-[30px] leading-tight" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-caption text-ink-mute">
              <span>
                Set aside for tax ({money.taxRate}%):{' '}
                <strong className="text-ink tabular-nums">
                  ₱{pesos.format(money.taxSetAside)}
                </strong>
              </span>
              {money.draw > 0 ? (
                <span>
                  Taken out by you:{' '}
                  <strong className="text-ink tabular-nums">₱{pesos.format(money.draw)}</strong>
                </span>
              ) : null}
              {money.refunded > 0 ? (
                <span>
                  Refunded: <SignedMoney pesos={-money.refunded} />
                </span>
              ) : null}
            </div>
          </Panel>

          {money.held.length ? (
            <details className="mb-4 rounded-control border border-line bg-surface px-3 text-caption text-ink-soft">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">
                {money.held.length === 1
                  ? '1 open event is not in these books yet'
                  : `${money.held.length} open events are not in these books yet`}
              </summary>
              <ul className="pb-2">
                {money.held.map((h) => (
                  <li key={h.name} className="border-t border-divide py-2">
                    <strong>{h.name}</strong>: sales ₱{pesos.format(h.revenue)}, costs ₱
                    {pesos.format(h.expenses)}. Added when the event is finished.
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {money.uncosted > 0 ? (
            <p
              role="status"
              className="mb-4 rounded-control border border-warm-line bg-warm-high p-3 text-caption text-ink"
            >
              {money.uncosted} {money.uncosted === 1 ? 'use' : 'uses'} of stock in this period{' '}
              {money.uncosted === 1 ? 'has' : 'have'} no cost yet, so expenses may be higher than
              shown.
            </p>
          ) : null}

          <IncomeExpenseChart money={money} />

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Panel title="Where the money went">
              {money.categories.length === 0 ? (
                <p className="text-caption text-ink-mute">No expenses in this period.</p>
              ) : (
                <ul className="flex flex-col">
                  {money.categories.map((c) => (
                    <li key={c.cat}>
                      <button
                        type="button"
                        aria-pressed={filter.kind === 'cat' && filter.cat === c.cat}
                        onClick={() =>
                          setFilter(
                            filter.kind === 'cat' && filter.cat === c.cat
                              ? { kind: 'all' }
                              : { kind: 'cat', cat: c.cat }
                          )
                        }
                        className="flex w-full flex-col gap-1.5 border-b border-line py-2.5 text-left last:border-b-0 hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand aria-pressed:bg-raise"
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[14px] font-semibold text-ink">{c.cat}</span>
                          <span className="text-caption text-ink-mute">
                            {c.n} {c.n === 1 ? 'entry' : 'entries'}
                          </span>
                          <span className="ml-auto text-[14px] font-semibold text-ink tabular-nums">
                            ₱{pesos.format(c.amount)}
                          </span>
                        </span>
                        <span className="block h-1.5 rounded-full bg-chip">
                          <span
                            className="block h-full rounded-full bg-danger/70"
                            style={{
                              width: `${Math.max(3, Math.round((c.amount / catMax) * 100))}%`
                            }}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Transactions">
              <div role="group" aria-label="Show" className="mb-2 flex flex-wrap gap-2">
                {(
                  [
                    ['all', 'All'],
                    ['income', 'Income'],
                    ['costs', 'Expenses']
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={filter.kind === kind}
                    onClick={() => setFilter({ kind })}
                    className={chip(filter.kind === kind)}
                  >
                    {label}
                  </button>
                ))}
                {filter.kind === 'cat' ? (
                  <button
                    type="button"
                    aria-pressed
                    onClick={() => setFilter({ kind: 'all' })}
                    className={chip(true)}
                  >
                    {filter.cat} ×
                  </button>
                ) : null}
              </div>
              {rows.length === 0 ? (
                <p className="py-3 text-caption text-ink-mute">Nothing recorded in this period.</p>
              ) : (
                <ul className="flex flex-col">
                  {rows.map((t) => (
                    <li key={t.id} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setOpenRow(t.id)}
                        className="flex min-h-14 w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[14px] font-semibold text-ink">
                            {t.label}
                          </span>
                          <span className="text-caption text-ink-mute">
                            {t.when} · {t.kind === 'draw' ? 'Taken out (not an expense)' : t.cat}
                          </span>
                        </span>
                        {t.kind === 'draw' ? (
                          <span className="font-semibold text-ink tabular-nums">
                            −₱{pesos.format(Math.abs(t.signed))}
                          </span>
                        ) : (
                          <SignedMoney pesos={t.signed} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {v.pl?.hasMargins ? (
            <>
              <SectionHeading>What each flavour earns, all time</SectionHeading>
              <Panel>
                <ul className="flex flex-col">
                  {(v.pl.marginRows ?? []).map((m, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-line py-2.5 text-caption last:border-b-0"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[14px] font-semibold text-ink">{m.name}</span>
                        <span className="text-ink-mute tabular-nums">{m.soldText}</span>
                      </span>
                      <span className="text-right text-ink-mute tabular-nums">
                        {m.eachText} each · {m.pctText}
                      </span>
                      <span className="text-right text-[14px] font-semibold text-ink tabular-nums">
                        {m.madeText}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2 text-caption text-ink-mute">
                  Per cookie, its margin, and what it has brought in. Counts all recorded orders and
                  sales, not only this period.
                </p>
              </Panel>
            </>
          ) : null}

          <FooterActions
            back={
              <Button variant="secondary" onClick={money.takeMoneyOut}>
                Record owner draw
              </Button>
            }
            forward={
              <Button variant="secondary" onClick={money.exportPeriod}>
                Export this period (CSV)
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}
