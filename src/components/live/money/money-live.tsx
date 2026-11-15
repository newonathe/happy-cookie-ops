'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { LiveMoney, MoneyPeriod, OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { BooksNotLoaded, BooksRefreshNotice } from './books-read-notice';
import { MoneyEntryLive, TransactionLive } from './money-pages';
import { SubTabs } from '@/components/ui/sub-tabs';
import { cx } from '@/components/ui/cx';
import { CountMoney, GlassCard, GoalRing, SplitBar, glassStyles } from '@/components/ui/glass';
import {
  FooterActions,
  PageTitle,
  Panel,
  SectionHeading,
  SignedMoney,
  TaskRow
} from '@/components/ui/owner-kit';
import styles from './money-live.module.css';

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

/** A figure's sign for the count-up: + when it is money in, − when it is money out, nothing at zero. */
const signOf = (value: number, positive: '+' | '−') =>
  value === 0 ? '' : value > 0 ? positive : positive === '+' ? '−' : '+';

/** Income against expenses for each day or week of the period, with the exact amounts beside the bars. */
function IncomeExpenseChart({ money }: { money: LiveMoney }) {
  const max = Math.max(
    1,
    ...money.buckets.flatMap((b) => [Math.abs(b.income), Math.abs(b.expenses)])
  );
  const unit = money.period === 'week' ? 'day' : 'week';
  return (
    <GlassCard title="Income and expenses" className={styles.span12}>
      <p className="text-caption text-ink-mute">
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
        className="relative grid items-end gap-2 pl-20"
        style={{ gridTemplateColumns: `repeat(${money.buckets.length}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        <span className="absolute left-0 top-0 text-caption text-ink-mute">
          +₱{pesos.format(max)}
        </span>
        <span className="absolute left-0 top-16 -translate-y-1/2 text-caption text-ink-mute">
          ₱0
        </span>
        <span className="absolute left-0 top-32 -translate-y-full text-caption text-ink-mute">
          −₱{pesos.format(max)}
        </span>
        <span className="absolute left-20 right-0 top-16 border-t border-line-strong" />
        {money.buckets.map((b, index) => (
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
                        'absolute block w-full',
                        styles.bar,
                        flow < 0
                          ? cx('rounded-b-[5px]', styles.barDown)
                          : cx('rounded-t-[5px]', styles.barUp),
                        flow >= 0 ? 'bg-ok' : 'bg-danger'
                      )}
                      style={
                        {
                          top: flow < 0 ? '50%' : undefined,
                          bottom: flow >= 0 ? '50%' : undefined,
                          height: `${b[k] !== 0 ? Math.max(1.5, (Math.abs(b[k]) / max) * 50) : 0}%`,
                          '--i': index
                        } as CSSProperties
                      }
                    />
                  </span>
                );
              })}
            </div>
            <span className="truncate text-caption text-ink-mute">{b.label}</span>
          </div>
        ))}
      </div>
      {money.buckets.some((b) => b.income < 0) ? (
        <p className="text-caption text-danger">
          Refunds exceed income in the red bars below zero.
        </p>
      ) : null}
      {money.buckets.some((b) => b.expenses < 0) ? (
        <p className="text-caption text-ink-mute">Reversed expenses appear above zero.</p>
      ) : null}
      <details className="text-caption">
        <summary className="flex min-h-11 cursor-pointer items-center py-2 font-semibold text-ink-soft">
          Show amounts
        </summary>
        <table className="w-full">
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
    </GlassCard>
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
 * The month's profit goal (Ethan, 16 Nov 2026; settings key `profitGoal`). Profit so far is this month's books, not the
 * selected period. "Change goal" saves through the owner's settings (`save_setting`), like every money rule.
 */
function ProfitGoalCard({
  goal,
  className
}: {
  goal: NonNullable<OpsVals['profitGoal']>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goal.goal));
  const pct =
    goal.profit === null
      ? null
      : Math.max(0, Math.min(100, Math.round((goal.profit / goal.goal) * 100)));
  const value = Number(draft);
  const valid = Number.isFinite(value) && value > 0 && value <= 1000000;
  return (
    <GlassCard title="Goal this month" className={className}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-title font-semibold text-ink">
          {pct === null ? '—' : `${pct}%`}
        </span>
        <span className="text-caption text-ink-mute">
          {goal.profit === null
            ? `Profit not read yet · goal ₱${pesos.format(goal.goal)}`
            : `₱${pesos.format(goal.profit)} profit of ₱${pesos.format(goal.goal)}`}
        </span>
      </div>
      <div className={glassStyles.splitBar} aria-hidden="true">
        <span
          className={cx(glassStyles.segment, 'bg-accent')}
          style={{ width: `${pct ?? 0}%`, minWidth: pct ? undefined : 0 }}
        />
      </div>
      {editing ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            goal.set(value);
            setEditing(false);
          }}
        >
          <label className="flex flex-col gap-1 text-label font-semibold text-ink">
            Monthly profit goal (₱)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000000}
              step={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-11 w-44 rounded-control border border-line-strong bg-surface px-3 font-mono text-body text-ink"
            />
          </label>
          <Button type="submit" disabled={!valid}>
            Save goal
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft(String(goal.goal));
              setEditing(true);
            }}
          >
            Change goal
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

/** A Money sub-page (settings, one transaction, a new entry) on one light card, so nothing reads dark on dark. */
function SubPage({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Money" className={cx(glassStyles.glassCard, styles.subpage)}>
      {children}
    </section>
  );
}

export function MoneyLive({ v }: { v: OpsVals }) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const money = v.liveMoney;
  const [settings, setSettings] = useState(false);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  if (!money) return null;
  if (money.entry)
    return (
      <SubPage>
        <MoneyEntryLive entry={money.entry} />
      </SubPage>
    );
  if (settings)
    return (
      <SubPage>
        <MoneySettings money={money} back={() => setSettings(false)} />
      </SubPage>
    );
  const opened = money.transactions.find((t) => t.id === openRow);
  if (opened)
    return (
      <SubPage>
        <TransactionLive row={opened} back={() => setOpenRow(null)} />
      </SubPage>
    );
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
  const goal = v.profitGoal;
  const goalPct =
    goal && goal.profit !== null
      ? Math.max(0, Math.min(100, Math.round((goal.profit / goal.goal) * 100)))
      : null;
  // Of every ₱100 that came in, how much was kept: shown only while income covers the costs.
  const kept =
    money.revenue > 0 && money.profit >= 0
      ? Math.min(100, Math.round((money.profit / money.revenue) * 100))
      : null;
  return (
    <div data-screen-label="Money" className={styles.money}>
      <div className={styles.span12}>
        <PageTitle
          onGround
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
              onGround
            />
          </div>
        ) : null}
        <div role="group" aria-label="Period" className={cx(styles.chips, styles.groundChips)}>
          {PERIODS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={money.period === key}
              onClick={() => money.setPeriod(key)}
              className={styles.chip}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!money.loaded ? (
        <div className={styles.span12}>
          <BooksNotLoaded read={money.read} />
        </div>
      ) : (
        <>
          {money.read?.state ? (
            <div className={cx(styles.span12, styles.notice, 'px-4 py-1 text-caption')}>
              <BooksRefreshNotice read={money.read} />
            </div>
          ) : null}
          <GlassCard
            title={money.profit < 0 ? 'Loss' : 'Profit'}
            className={goal ? styles.spanHero : styles.span12}
          >
            <div className={glassStyles.heroFigure}>
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-label font-medium text-ink-soft">{money.periodText}</span>
                <span
                  className={cx(
                    'font-mono text-[length:clamp(28px,9vw,40px)] leading-none font-semibold tabular-nums md:text-[56px]',
                    money.profit < 0 ? 'text-danger' : 'text-ink'
                  )}
                >
                  <CountMoney pesos={money.profit} sign={money.profit < 0 ? '−' : ''} />
                </span>
                {goal && goalPct !== null ? (
                  <span className="text-caption text-ink-mute">
                    of ₱{Math.round(goal.goal).toLocaleString('en-PH')} goal this month
                  </span>
                ) : null}
              </div>
              {goalPct !== null ? <GoalRing pct={goalPct} /> : null}
            </div>
            {kept !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-label font-medium text-ink-soft">Where income went</span>
                  <span className="text-caption text-ink-mute">₱{kept} kept of every ₱100</span>
                </div>
                <SplitBar
                  label={`${100 - kept}% spent, ${kept}% kept`}
                  parts={[
                    {
                      id: 'spent',
                      label: 'Spent',
                      value: Math.max(0, money.expenses),
                      tone: 'bg-danger'
                    },
                    { id: 'kept', label: 'Kept', value: money.profit, tone: 'bg-ok' }
                  ]}
                />
              </div>
            ) : null}
            <dl className={glassStyles.moneyWells}>
              <div className={glassStyles.glassWell}>
                <dt>Income</dt>
                <dd className="text-ok">
                  <CountMoney pesos={money.revenue} sign={signOf(money.revenue, '+')} />
                </dd>
              </div>
              <div className={glassStyles.glassWell}>
                <dt>Expenses</dt>
                <dd className="text-danger">
                  <CountMoney pesos={money.expenses} sign={signOf(money.expenses, '−')} />
                </dd>
              </div>
            </dl>
            <div className={styles.statChips}>
              <span className={styles.statChip}>
                Set aside for tax ({money.taxRate}%):{' '}
                <strong className="text-ink">₱{pesos.format(money.taxSetAside)}</strong>
              </span>
              {money.draw > 0 ? (
                <span className={styles.statChip}>
                  Taken out by you:{' '}
                  <strong className="text-ink">₱{pesos.format(money.draw)}</strong>
                </span>
              ) : null}
              {money.refunded > 0 ? (
                <span className={styles.statChip}>
                  Refunded: <SignedMoney pesos={-money.refunded} />
                </span>
              ) : null}
            </div>
          </GlassCard>
          {goal ? <ProfitGoalCard goal={goal} className={styles.spanSide} /> : null}

          {money.held.length ? (
            <details
              className={cx(styles.span12, styles.notice, 'px-4 text-caption text-ink-soft')}
            >
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
              className={cx(
                styles.span12,
                styles.notice,
                styles.noticeWarn,
                'p-3 text-caption text-ink'
              )}
            >
              {money.uncosted} {money.uncosted === 1 ? 'use' : 'uses'} of stock in this period{' '}
              {money.uncosted === 1 ? 'has' : 'have'} no cost yet, so expenses may be higher than
              shown.
            </p>
          ) : null}

          <IncomeExpenseChart money={money} />

          <GlassCard title="Where the money went" className={styles.spanLeft}>
            {money.categories.length === 0 ? (
              <p className="text-caption text-ink-mute">No expenses in this period.</p>
            ) : (
              <ul className={styles.rows}>
                {money.categories.map((c, index) => (
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
                      className="flex-col justify-center gap-1.5"
                    >
                      <span className="flex w-full flex-wrap items-baseline gap-x-2">
                        <span className="text-label font-semibold text-ink">{c.cat}</span>
                        <span className="text-caption text-ink-mute">
                          {c.n} {c.n === 1 ? 'entry' : 'entries'}
                        </span>
                        <span className="ml-auto font-mono text-label font-semibold tabular-nums text-ink">
                          ₱{pesos.format(c.amount)}
                        </span>
                      </span>
                      <span className={styles.catTrack}>
                        <span
                          className={cx(styles.catFill, 'bg-danger')}
                          style={
                            {
                              width: `${Math.max(3, Math.round((c.amount / catMax) * 100))}%`,
                              '--i': index
                            } as CSSProperties
                          }
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard title="Transactions" className={styles.spanRight}>
            <div role="group" aria-label="Show" className={styles.chips}>
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
                  className={styles.chip}
                >
                  {label}
                </button>
              ))}
              {filter.kind === 'cat' ? (
                <button
                  type="button"
                  aria-pressed
                  onClick={() => setFilter({ kind: 'all' })}
                  className={styles.chip}
                >
                  {filter.cat} ×
                </button>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <p className="py-3 text-caption text-ink-mute">Nothing recorded in this period.</p>
            ) : (
              <ul className={styles.rows}>
                {rows.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpenRow(t.id)}
                      className="items-center justify-between gap-3"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="[overflow-wrap:anywhere] text-label font-semibold text-ink">
                          {t.label}
                        </span>
                        <span className="text-caption text-ink-mute">
                          {t.when} · {t.kind === 'draw' ? 'Taken out (not an expense)' : t.cat}
                        </span>
                      </span>
                      {t.kind === 'draw' ? (
                        <span className="font-semibold whitespace-nowrap text-ink">
                          −₱{pesos.format(Math.abs(t.signed))}
                        </span>
                      ) : (
                        <SignedMoney pesos={t.signed} className="whitespace-nowrap" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {v.pl?.hasMargins ? (
            <GlassCard title="What each flavour earns, all time" className={styles.span12}>
              <ul className={styles.rows}>
                {(v.pl.marginRows ?? []).map((m, i) => (
                  <li key={i} className={styles.plainRow}>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-label font-semibold text-ink">{m.name}</span>
                      <span className="text-caption text-ink-mute">{m.soldText}</span>
                    </span>
                    <span className="text-caption text-ink-mute sm:text-right">
                      {m.eachText} each · {m.pctText}
                    </span>
                    <span className="text-label font-semibold text-ink sm:text-right">
                      {m.madeText}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-ink-mute">
                Per cookie, its margin, and what it has brought in. Counts all recorded orders and
                sales, not only this period.
              </p>
            </GlassCard>
          ) : null}

          <div className={cx(styles.span12, styles.footer)}>
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
          </div>
        </>
      )}
    </div>
  );
}
