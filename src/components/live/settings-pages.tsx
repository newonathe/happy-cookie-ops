'use client';

import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { OwnerField, Panel, SectionHeading, TaskRow } from '@/components/ui/owner-kit';
import { FactRow } from '@/components/ui/owner-patterns';

/**
 * Settings and order actions that used to open a sheet, drawn as pages in the owner frame. Every
 * value and action is the engine's own, read from the same fields as the locked sheet beside it.
 */

const stepper =
  'size-11 shrink-0 rounded-control border border-line-strong bg-surface text-[18px] text-ink hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand';

function Choice({
  on,
  label,
  detail,
  onPick
}: {
  on: unknown;
  label: React.ReactNode;
  detail?: React.ReactNode;
  onPick: (event?: unknown) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={!!on}
      onClick={onPick}
      className={cx(
        'flex min-h-14 w-full flex-col justify-center rounded-control border p-3 text-left focus-visible:outline-2 focus-visible:outline-brand',
        on ? 'border-brand bg-raise' : 'border-line-strong hover:bg-raise'
      )}
    >
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      {detail ? <span className="text-caption text-ink-mute">{detail}</span> : null}
    </button>
  );
}

function BackRow({ v, label }: { v: OpsVals; label: string }) {
  return (
    <div className="mt-2">
      <Button variant="secondary" onClick={v.closeSheet}>
        {label}
      </Button>
    </div>
  );
}

/** The numbers every screen follows, and the ordering week. */
export function RulesLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <p className="mb-2 text-caption text-ink-mute">
          Change any of these and every screen follows.
        </p>
        {(v.rules ?? []).map((rule, i) => (
          <div key={i} className="border-b border-line py-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 basis-40 text-[14px] font-semibold text-ink">
                {rule.label}
              </span>
              <button
                type="button"
                className={stepper}
                onClick={rule.down}
                aria-label={`Lower ${String(rule.label)}`}
              >
                −
              </button>
              <input
                value={rule.value}
                onChange={rule.set}
                inputMode="decimal"
                aria-label={String(rule.label)}
                className="h-11 w-20 rounded-control border border-line-strong bg-surface text-center text-[16px] font-semibold text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-brand"
              />
              <button
                type="button"
                className={stepper}
                onClick={rule.up}
                aria-label={`Raise ${String(rule.label)}`}
              >
                +
              </button>
            </div>
            <p className="mt-1 text-caption text-ink-mute">
              {rule.note} <span className="font-semibold text-ink-soft">Now: {rule.valueText}</span>
            </p>
          </div>
        ))}
      </Panel>
      <SectionHeading>Ordering week</SectionHeading>
      <Panel>
        {(v.schedRows ?? []).map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 border-b border-line py-2.5 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 basis-40 flex-col">
              <span className="text-[14px] font-semibold text-ink">{row.label}</span>
              <span className="text-caption text-ink-mute">{row.value}</span>
            </span>
            <button
              type="button"
              className={stepper}
              onClick={row.prev}
              aria-label={`Earlier ${String(row.label)}`}
            >
              ‹
            </button>
            <button
              type="button"
              className={stepper}
              onClick={row.next}
              aria-label={`Later ${String(row.label)}`}
            >
              ›
            </button>
          </div>
        ))}
        {(v.schedHours ?? []).map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center gap-2 border-b border-line py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 basis-40 text-[14px] font-semibold text-ink">
              {row.label}
            </span>
            <button
              type="button"
              className={stepper}
              onClick={row.down}
              aria-label={`Earlier ${String(row.label)}`}
            >
              −
            </button>
            <span className="w-20 text-center text-[14px] font-semibold text-ink tabular-nums">
              {row.valueText}
            </span>
            <button
              type="button"
              className={stepper}
              onClick={row.up}
              aria-label={`Later ${String(row.label)}`}
            >
              +
            </button>
          </div>
        ))}
      </Panel>
      <BackRow v={v} label="Back" />
    </div>
  );
}

/** Who can see what. Each person has their own account; this page only shows it. */
export function PeopleLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        {(v.users ?? []).map((person, i) => (
          <TaskRow
            key={i}
            title={person.name}
            detail={
              <>
                {person.role} · {person.can}
                {person.extra ? <span className="block">{person.extra}</span> : null}
              </>
            }
          />
        ))}
      </Panel>
      <BackRow v={v} label="Back" />
    </div>
  );
}

/** How long contact details are kept. */
export function RetentionLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <p className="mb-3 text-caption text-ink-mute">
          Only contact details. Sales records are always kept.
        </p>
        <div className="flex flex-col gap-2">
          {(v.retentionOptions ?? []).map((option, i) => (
            <Choice key={i} on={option.on} label={option.label} onPick={option.pick} />
          ))}
        </div>
      </Panel>
      <BackRow v={v} label="Back" />
    </div>
  );
}

export function StatusesLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        {(v.statusList ?? []).map((status, i) => (
          <TaskRow key={i} title={status.label} detail={status.what} />
        ))}
      </Panel>
      <BackRow v={v} label="Back" />
    </div>
  );
}

export function PricingLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <p className="mb-3 text-caption text-ink-mute">
          Pick a rule, check the preview, then publish it. Customers see the new total straight
          away. Past orders keep theirs.
        </p>
        <div className="flex flex-col gap-2">
          {(v.priceModes ?? []).map((mode, i) => (
            <Choice key={i} on={mode.on} label={mode.label} onPick={mode.pick} />
          ))}
        </div>
        <div className="mt-3">
          <FactRow label="Preview · six cookies" detail={v.priceModePreview?.items}>
            {v.priceModePreview?.total}
          </FactRow>
        </div>
        <div className="mt-3">
          <Button variant="primary" onClick={v.publishPriceMode}>
            Publish this rule
          </Button>
        </div>
      </Panel>
      <BackRow v={v} label="Back" />
    </div>
  );
}

export function PayRulesLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <p className="mb-2 text-caption text-ink-soft">
          Proof is required before a customer can submit, and you confirm every payment by hand.
          Nothing reserves capacity until you do.
        </p>
        {(v.payChannels ?? []).map((channel, i) => (
          <TaskRow
            key={i}
            title={channel.label}
            detail={`${String(channel.num)} · ${String(channel.holder)}`}
          />
        ))}
        <p className="mt-2 text-caption text-ink-mute">
          These are the numbers customers see at checkout.
        </p>
      </Panel>
      <BackRow v={v} label="Back" />
    </div>
  );
}

/** Refund: the same form and handler as the sheet. It records a refund already sent. */
export function RefundLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <form onSubmit={v.saveRefund} className="flex flex-col gap-3">
          <p className="text-caption text-ink-soft">
            Send {v.sheetAmountText} back to the account they paid from, then record the outgoing
            reference here. Revenue drops by that amount and the cookies go back into stock.
          </p>
          <OwnerField
            name="rref"
            label="Refund reference"
            placeholder="From your send-money receipt"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={v.closeSheet}>
              Keep the order
            </Button>
            <Button type="submit" variant="primary">
              Record refund and cancel
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

export function NoShowLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <p className="text-caption text-ink-soft">
          {v.sheetName} stays marked as paid — you keep the money. The cookies go back into baked
          stock so you can sell them at the next bazaar.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button variant="secondary" onClick={v.closeSheet}>
            Still waiting
          </Button>
          <Button variant="primary" onClick={v.confirmNoShow}>
            Mark as no-show
          </Button>
        </div>
      </Panel>
    </div>
  );
}

export function SwapLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <p className="mb-3 text-caption text-ink-soft">{v.swapIntro}</p>
        <div className="flex flex-col gap-2">
          {(v.swapOptions ?? []).map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={option.go}
              className="flex min-h-14 items-center justify-between gap-3 rounded-control border border-line-strong p-3 text-left hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold text-ink">{option.name}</span>
                <span className="text-caption text-ink-mute">{option.stockText}</span>
              </span>
              <span className="text-caption font-semibold text-ink-soft tabular-nums">
                {option.deltaText}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-caption text-ink-mute">
          Agree it with the customer first. Any price difference shows as a balance.
        </p>
      </Panel>
      <BackRow v={v} label="Back to order" />
    </div>
  );
}
