'use client';

import { useId } from 'react';
import type {
  ReceiveDeliveryView,
  StockChangeView,
  StockChangeReason
} from '@/store/stock-entries';
import { formatPesos } from '@/lib/stock/stock-status';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FooterActions, OwnerField, PageTitle, Panel } from '@/components/ui/owner-kit';
import { FactRow, ReviewPanel } from '@/components/ui/owner-patterns';

const selectClass =
  'h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-[14px]';

function Select({
  label,
  value,
  onChange,
  options,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1.5">
      <span className="text-caption font-semibold text-ink-soft">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <div className="mb-3">
      <Banner tone="warn" title={text} />
    </div>
  ) : null;
}

const twoColumns = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

/** Add to inventory: what she actually got, reviewed before it is saved. On one item's page, only that item. */
export function ReceiveLive({
  receive,
  backLabel = 'Back to inventory'
}: {
  receive: ReceiveDeliveryView;
  backLabel?: string;
}) {
  if (receive.step === 'review')
    return (
      <div className="w-full">
        <PageTitle title="Review" subtitle={receive.supplier || 'No supplier chosen'} />
        <Problem text={receive.error} />
        <ReviewPanel
          note={
            receive.someUnpriced
              ? 'A line with no amount still records the stock. Its cost stays pending until a price is known.'
              : undefined
          }
          backLabel="Change"
          onBack={receive.change}
          saveLabel="Add to inventory"
          onSave={() => void receive.save()}
          saving={receive.saving}
        >
          {receive.lines.map((line) => (
            <FactRow key={line.key} label={line.itemName} detail={line.afterText}>
              {line.receivedText}
            </FactRow>
          ))}
          <FactRow label="Total paid">
            {receive.totalPaid === null ? 'Not recorded' : formatPesos(receive.totalPaid)}
          </FactRow>
        </ReviewPanel>
      </div>
    );
  return (
    <div className="w-full">
      <PageTitle
        title="Add to inventory"
        subtitle={receive.fixedItem ?? 'Enter what you actually got, not what you ordered.'}
      />
      <Problem text={receive.error} />
      <Panel>
        <Select
          label="Supplier"
          value={receive.supplier}
          onChange={receive.setSupplier}
          options={receive.suppliers.map((name) => [name, name] as const)}
          placeholder="No supplier"
        />
        {receive.lines.map((line) => (
          <div key={line.key} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            {receive.fixedItem ? null : (
              <Select
                label="Item"
                value={line.itemName}
                onChange={line.setItem}
                options={receive.items.map((name) => [name, name] as const)}
                placeholder="Choose an item"
              />
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <OwnerField
                label="Packs received"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={line.packs}
                onChange={(event) => line.setPacks(event.target.value)}
              />
              <OwnerField
                label={line.unit ? `Per pack (${line.unit})` : 'Per pack'}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={line.perPack}
                onChange={(event) => line.setPerPack(event.target.value)}
              />
              <OwnerField
                label="Total paid (₱)"
                hint="Leave empty if not known yet."
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={line.paid}
                onChange={(event) => line.setPaid(event.target.value)}
              />
            </div>
            {line.remove && !receive.fixedItem ? (
              <div>
                <Button variant="ghost" size="sm" onClick={line.remove}>
                  Remove {line.itemName}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {receive.fixedItem ? null : (
          <div className="mt-4">
            <Button variant="secondary" onClick={receive.addLine}>
              Add another item
            </Button>
          </div>
        )}
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={receive.close}>
                {backLabel}
              </Button>
            }
            forward={
              <Button variant="primary" onClick={receive.review}>
                Review
              </Button>
            }
          />
        </div>
      </Panel>
    </div>
  );
}

const REASONS: ReadonlyArray<readonly [StockChangeReason, string]> = [
  ['Waste', 'Waste / damaged'],
  ['Correction', 'Quantity correction']
];

/** Waste / correction: one item, one reason, reviewed before it is saved. */
export function StockChangeLive({ change }: { change: StockChangeView }) {
  const removing = change.reason === 'Waste' || change.direction === 'remove';
  if (change.step === 'review')
    return (
      <div className="w-full">
        <PageTitle title="Review stock change" subtitle={change.itemName} />
        <Problem text={change.error} />
        <ReviewPanel
          backLabel="Change entry"
          onBack={change.change}
          saveLabel="Save stock change"
          onSave={() => void change.save()}
          saving={change.saving}
        >
          <FactRow label="Reason">
            {REASONS.find(([id]) => id === change.reason)?.[1] ?? change.reason}
          </FactRow>
          <FactRow label={removing ? 'Quantity removed' : 'Quantity added'}>
            {change.amount} {change.unit}
          </FactRow>
          {change.afterText ? <FactRow label="After change">{change.afterText}</FactRow> : null}
          <FactRow label="Note">{change.note}</FactRow>
        </ReviewPanel>
      </div>
    );
  return (
    <div className="w-full">
      <PageTitle title="Waste / correction" subtitle={change.itemName} />
      <Problem text={change.error} />
      <Panel>
        <div className={twoColumns}>
          <Select
            label="Reason"
            value={change.reason}
            onChange={(value) => change.setReason(value as StockChangeReason | '')}
            options={REASONS}
            placeholder="Choose a reason"
          />
          {change.reason === 'Correction' ? (
            <Select
              label="Correction"
              value={change.direction}
              onChange={(value) => change.setDirection(value as 'remove' | 'add')}
              options={[
                ['remove', 'Take away'],
                ['add', 'Add']
              ]}
            />
          ) : null}
          <OwnerField
            label={`${removing ? 'Quantity removed' : 'Quantity added'} (${change.unit})`}
            hint={change.beforeText ? `Recorded now: ${change.beforeText}` : 'Not counted yet'}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={change.amount}
            onChange={(event) => change.setAmount(event.target.value)}
          />
        </div>
        <div className="mt-3">
          <OwnerField
            label="Note"
            placeholder="What happened?"
            value={change.note}
            onChange={(event) => change.setNote(event.target.value)}
          />
        </div>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={change.close}>
                Back to item
              </Button>
            }
            forward={
              <Button variant="primary" onClick={change.review}>
                Review change
              </Button>
            }
          />
        </div>
      </Panel>
    </div>
  );
}
