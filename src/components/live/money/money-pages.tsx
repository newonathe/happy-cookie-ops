'use client';

import type { LiveMoney, OpsVals } from '@/view-models/vals';
import type { MoneyEntryView } from '@/store/money-entry';
import { formatPesos } from '@/lib/stock/stock-status';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  FooterActions,
  OwnerField,
  PageTitle,
  Panel,
  SignedMoney,
  TaskRow
} from '@/components/ui/owner-kit';
import { FactRow, ReviewPanel } from '@/components/ui/owner-patterns';

const selectClass =
  'h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-[14px]';

/** Record expense or Record owner draw: entry, then Review, then one save. */
export function MoneyEntryLive({ entry }: { entry: MoneyEntryView }) {
  const expense = entry.kind === 'expense';
  const problem = entry.error ? (
    <div className="mb-3">
      <Banner tone="warn" title={entry.error} />
    </div>
  ) : null;
  if (entry.step === 'review')
    return (
      <div className="w-full">
        <PageTitle
          title="Review transaction"
          subtitle={expense ? 'Expense' : 'Owner draw. It does not change your result.'}
        />
        {problem}
        <ReviewPanel
          backLabel="Change entry"
          onBack={entry.change}
          saveLabel={expense ? 'Record expense' : 'Record owner draw'}
          onSave={() => void entry.save()}
          saving={entry.saving}
        >
          <FactRow label={expense ? 'Description' : 'Note'}>{entry.description || 'None'}</FactRow>
          <FactRow label="Amount">{entry.pesos === null ? '' : formatPesos(entry.pesos)}</FactRow>
          <FactRow label="Date">{entry.date}</FactRow>
          {expense ? <FactRow label="Category">{entry.category}</FactRow> : null}
        </ReviewPanel>
      </div>
    );
  return (
    <div className="w-full">
      <PageTitle
        title={expense ? 'Record expense' : 'Record owner draw'}
        subtitle={
          expense
            ? 'Record a completed movement of money. Buying stock? Use Add to inventory in Stock.'
            : 'Money you take for yourself. It is kept apart from expenses.'
        }
      />
      {problem}
      <Panel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OwnerField
            label={expense ? 'Description' : 'Note (optional)'}
            maxLength={120}
            value={entry.description}
            onChange={(event) => entry.setDescription(event.target.value)}
          />
          <OwnerField
            label="Amount (₱)"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={entry.amount}
            onChange={(event) => entry.setAmount(event.target.value)}
          />
          <OwnerField
            label="Date"
            type="date"
            min={entry.earliest}
            max={entry.today}
            value={entry.date}
            onChange={(event) => entry.setDate(event.target.value)}
          />
          {expense ? (
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-caption font-semibold text-ink-soft">Category</span>
              <select
                value={entry.category}
                onChange={(event) => entry.setCategory(event.target.value)}
                className={selectClass}
              >
                {entry.categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={entry.close}>
                Back to Money
              </Button>
            }
            forward={
              <Button variant="primary" onClick={entry.review}>
                Review transaction
              </Button>
            }
          />
        </div>
      </Panel>
    </div>
  );
}

type Transaction = LiveMoney['transactions'][number];

const SOURCE: Record<Transaction['kind'], string> = {
  revenue: 'Sale',
  refund: 'Refund',
  expense: 'Expense',
  draw: 'Owner draw'
};

/** One line of the books, with where it came from. Nothing here can be changed. */
export function TransactionLive({ row, back }: { row: Transaction; back: () => void }) {
  return (
    <div className="w-full">
      <PageTitle title="Transaction" subtitle={row.label} />
      <Panel>
        <FactRow label="Amount">
          {row.kind === 'draw' ? formatPesos(row.signed) : <SignedMoney pesos={row.signed} />}
        </FactRow>
        <FactRow label="Date">{row.when}</FactRow>
        <FactRow label="Category">{row.cat}</FactRow>
        <FactRow label="Source">{SOURCE[row.kind]}</FactRow>
        <FactRow label="Reference">{row.id}</FactRow>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={back}>
                Back to Money
              </Button>
            }
          />
        </div>
      </Panel>
    </div>
  );
}

/** Expense categories as a page: the engine's own add, rename and hide. */
export function MoneyCategoriesLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        {(v.catRows ?? []).map((row, i) => (
          <TaskRow
            key={i}
            title={row.name}
            detail={row.stateText}
            action={
              <span className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={row.rename}>
                  Rename<span className="sr-only"> {row.name}</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={row.toggle}>
                  {row.off ? 'Show' : 'Hide'}
                  <span className="sr-only"> {row.name}</span>
                </Button>
              </span>
            }
          />
        ))}
        <form
          onSubmit={v.saveCategory}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-4"
        >
          <OwnerField name="cname" label="New category" className="min-w-0 flex-1 basis-48" />
          <Button type="submit" variant="primary">
            Add category
          </Button>
        </form>
      </Panel>
      <div className="mt-2">
        <Button variant="secondary" onClick={v.closeSheet}>
          Back to Money settings
        </Button>
      </div>
    </div>
  );
}
