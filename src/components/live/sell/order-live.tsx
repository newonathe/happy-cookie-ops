'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { orderStepWords } from '@/lib/orders/owner-words';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { ordersRead } from '@/lib/orders/orders-read-state';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { Sheet } from '@/components/ui/sheet';
import { PageTitle, Panel, SectionHeading } from '@/components/ui/owner-kit';
import { RecordUnavailable } from '@/components/ui/owner-patterns';
import theme from '../owner-theme.module.css';
import { OrderPill } from './sell-shared';

type Order = NonNullable<OpsVals['od']>;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <span className="text-caption text-ink-mute">{label}</span>
      <span className="text-right text-[14px] font-semibold text-ink tabular-nums">{children}</span>
    </div>
  );
}

/**
 * Reject cancels the order and frees its slots, so it asks first (HCB-007, the OD-03 default form:
 * a dialog). Keep, Close and Escape send nothing; Confirm sends once. Keyed by order in the caller,
 * so the question never carries over to another order.
 */
function RejectButton({ od }: { od: Order }) {
  const [asking, setAsking] = useState(false);
  const sent = useRef(false);
  const copy = STAFF_COPY.rejectConfirm;
  const confirm = () => {
    if (sent.current) return;
    sent.current = true;
    setAsking(false);
    od.reject();
  };
  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          sent.current = false;
          setAsking(true);
        }}
      >
        Reject
      </Button>
      {asking ? (
        <Sheet
          className={theme.theme}
          side="bottom"
          title={copy.title}
          onClose={() => setAsking(false)}
          footer={
            <>
              {/* Keep first: the safe choice is the first button and the first thing a hurried tap meets. */}
              <Button variant="secondary" onClick={() => setAsking(false)}>
                {copy.keep}
              </Button>
              <Button variant="danger" onClick={confirm}>
                {copy.confirm}
              </Button>
            </>
          }
        >
          <p className="m-0 text-body text-ink">{copy.body(String(od.name), String(od.id))}</p>
          <p className="mt-2 text-caption text-ink-mute">{copy.note}</p>
        </Sheet>
      ) : null}
    </>
  );
}

/** Nothing counts as paid until the owner confirms it here. */
function PaymentReview({ od }: { od: Order }) {
  return (
    <Panel tone="hero" title="Check this payment">
      <Fact label="Expected">{od.totalText}</Fact>
      <Fact label="They sent">
        <span className={od.mismatch ? 'text-danger' : undefined}>{od.paidText}</span>
      </Fact>
      <Fact label="Reference">
        {od.pay} · {od.ref}
      </Fact>
      <Fact label="Submitted">{od.placed}</Fact>
      <Fact label="Collecting">{od.pickup}</Fact>
      {od.refBad ? <p className="mt-3 text-caption text-danger">{od.refBad}</p> : null}
      {od.dup ? (
        <button
          type="button"
          onClick={od.dup.go}
          className="mt-3 flex w-full flex-col gap-0.5 rounded-control border border-danger-line p-3 text-left hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span className="text-[14px] font-semibold text-danger">
            This reference is already on {od.dup.id}
          </span>
          <span className="text-caption text-ink-mute">
            {od.dup.name} used the same number. Compare them before confirming.
          </span>
        </button>
      ) : null}
      {od.warn ? <p className="mt-3 text-caption text-danger">{od.warn}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={od.confirm}>
          Confirm payment
        </Button>
        <Button variant="secondary" onClick={od.openProof}>
          View proof
        </Button>
        <Button variant="secondary" onClick={od.askClearer}>
          Ask for clearer proof
        </Button>
        <RejectButton key={String(od.id)} od={od} />
      </div>
      <p className="mt-3 text-caption text-ink-mute">
        Nothing is reserved until you confirm. Confirming books capacity and adds this order to the
        bake plan and grocery list.
      </p>
    </Panel>
  );
}

function Lines({ od }: { od: Order }) {
  return (
    <Panel title="In this order">
      <ul className="flex flex-col">
        {(od.lines ?? []).map((line, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <span aria-hidden="true" className="shrink-0" style={s(line.imgStyle)} />
            <span className="flex min-w-0 flex-1 basis-32 flex-col">
              <span
                className={cx(
                  'text-[14px] font-semibold',
                  line.out ? 'text-danger line-through' : 'text-ink'
                )}
              >
                {line.name}
              </span>
              <span className="text-caption text-ink-mute tabular-nums">
                {line.qty} {line.price}
              </span>
            </span>
            <span className="text-[14px] font-semibold text-ink tabular-nums">{line.line}</span>
            <Button variant="ghost" size="sm" onClick={line.flag}>
              {line.flagLabel}
            </Button>
            {line.out ? (
              <Button variant="secondary" size="sm" onClick={line.swap}>
                Swap
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {od.hasSwaps ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="text-caption font-semibold text-ink-soft">Replaced on this order</p>
          {(od.swaps ?? []).map((swap, i) => (
            <p key={i} className="text-caption text-ink-mute">
              {swap.text}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-[14px] font-semibold text-ink">Total</span>
        <span className="text-[20px] font-semibold text-ink tabular-nums">{od.totalText}</span>
      </div>
    </Panel>
  );
}

/** Where the order is on its way, with the time of each step that has happened. */
function Progress({ od }: { od: Order }) {
  return (
    <Panel title="Progress">
      <ol className="flex flex-col">
        {(od.timeline ?? []).map((step, i) => (
          <li key={i} className="flex items-baseline gap-3 py-1.5">
            <span
              aria-hidden="true"
              className={cx(
                'size-2.5 shrink-0 translate-y-0.5 rounded-full',
                step.done ? 'bg-ok' : step.now ? 'bg-accent' : 'bg-line-strong'
              )}
            />
            <span
              className={cx(
                'min-w-0 flex-1 text-[14px]',
                step.todo ? 'text-ink-mute' : 'font-semibold text-ink'
              )}
            >
              {orderStepWords(step.what)}
            </span>
            <span className="text-caption text-ink-mute tabular-nums">{step.when}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/**
 * One order (client v4): its status and single next step first, everything else below. Every
 * action is the engine's own, so payment, refund, swap and no-show rules are unchanged.
 */
export function OrderLive({ v }: { v: OpsVals }) {
  const od = v.od;
  // HCB-006: this order's change was saved but the list could not be refreshed.
  const read = useSyncExternalStore(ordersRead.subscribe, ordersRead.get, ordersRead.getServer);
  if (!od) return <RecordUnavailable backLabel="Back to orders" onBack={() => v.goBack()} />;
  return (
    <div className="w-full max-w-[860px]">
      <PageTitle
        title={`Order ${od.id}`}
        subtitle={
          <>
            {od.name} · {od.placed}
          </>
        }
        actions={<OrderPill label={od.label} fg={od.fg} bg={od.bg} br={od.br} />}
      />
      {(od.contactBits ?? []).length ? (
        <p className="mb-4 -mt-3 text-caption text-ink-mute">
          {(od.contactBits ?? []).map((bit, i) => (
            <span key={i}>
              {i ? ' · ' : ''}
              {bit.text}
            </span>
          ))}
        </p>
      ) : null}

      {read.savedNotRefreshed !== null && read.savedNotRefreshed === String(od.id) ? (
        <div className="mb-4">
          <Banner
            tone="warn"
            title={STAFF_COPY.savedNotRefreshed}
            action={read.retry ? { label: 'Try again', onPress: read.retry } : undefined}
          />
        </div>
      ) : null}

      {od.needsReview ? <PaymentReview od={od} /> : null}

      {od.hasBalance ? (
        <Panel tone="hero" title={`${String(od.balanceText)} still due`}>
          <p className="text-caption text-ink-mute">
            Part payment confirmed. Collect the rest before hand-over.
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={od.settleBalance}>
              Balance received
            </Button>
          </div>
        </Panel>
      ) : null}

      {od.isCancelled ? (
        <Panel
          title={
            od.wasRejected
              ? 'Proof rejected'
              : od.wasRefunded
                ? 'Refunded and cancelled'
                : 'Cancelled'
          }
        >
          <p className="text-caption text-ink-mute">
            Nothing is reserved. If they send a valid payment, put this back in your review queue.
          </p>
          <div className="mt-3">
            <Button variant="secondary" onClick={od.reopen}>
              Reopen for review
            </Button>
          </div>
        </Panel>
      ) : null}

      {od.needsContact ? (
        <Panel tone="hero" title="A flavour ran out">
          <p className="text-caption text-ink-mute">{od.contactText}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={od.askSwap}>
              Record a replacement
            </Button>
            <Button variant="secondary" onClick={od.clearContact}>
              Sorted, no swap needed
            </Button>
          </div>
        </Panel>
      ) : null}

      {od.canPack || od.canCollect ? (
        <Panel tone="hero">
          {od.canPack ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-caption text-ink-mute">{od.packHint}</span>
              <Button variant="primary" onClick={od.pack}>
                Mark packed
              </Button>
            </div>
          ) : null}
          {od.canCollect ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-caption text-ink-mute">Ready for customer pickup</span>
              <span className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={od.noShow}>
                  No-show
                </Button>
                <Button variant="primary" onClick={od.collect}>
                  Mark picked up
                </Button>
              </span>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Lines od={od} />
      <Progress od={od} />

      <SectionHeading>Order details</SectionHeading>
      <Panel>
        <Fact label="Pickup">{od.pickup}</Fact>
        <Fact label="Payment">
          {od.pay}
          {od.ref ? ` · ${String(od.ref)}` : ''}
        </Fact>
        {od.hasInvoice ? <Fact label="Invoice">{od.invoice} · issued on confirmation</Fact> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <span className="flex min-w-0 flex-col">
            <span className="text-caption text-ink-mute">Private order link</span>
            <span className="text-[14px] font-semibold break-all text-ink">{od.link}</span>
            <span className="text-caption text-ink-mute">{od.linkSent}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={od.copyLink}>
            Copy
          </Button>
        </div>
      </Panel>

      {od.canRefund ? (
        <div className="mt-2">
          <Button variant="danger" onClick={od.askRefund}>
            Refund and cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
