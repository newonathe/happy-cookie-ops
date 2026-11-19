'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { OwnerField, Panel } from '@/components/ui/owner-kit';
import { fetchCafePrices, CafePricesUnavailable, type CafePrice } from '@/lib/data/cafe-prices';
import {
  CafeOrderRefused,
  cafeOrderBody,
  checkCafeForm,
  createCafeOrder,
  fetchCafeOrderSettings,
  type CafeFormLine,
  type CafeOrderSaved,
  type CafeOrdersClient
} from '@/lib/data/cafe-orders';
import { cafePesosText } from '@/lib/data/cafe-prices';
import { peso } from '@/lib/money/format';
import { createClient } from '@/lib/supabase/client';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { manilaToday } from '@/lib/time/business-clock';

type Phase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'ready'; prices: CafePrice[]; counts: boolean };

let shared: CafeOrdersClient | null = null;
const defaultClient = (): CafeOrdersClient => (shared ??= createClient());

const linesFrom = (prices: CafePrice[]): CafeFormLine[] =>
  prices.map((p) => ({
    productId: p.productId,
    name: p.name,
    qty: '',
    price: cafePesosText(p.effectiveCents)
  }));

/**
 * "New café order" on Sell > Orders (owner only). One row per flavour: a quantity and the café price (hers, else the default), which
 * she can change per line before saving. The database stores those prices, adds up the total itself and counts the order toward the
 * weekly limit when her setting says so. The order starts unpaid, like a public one; she marks it paid on the order when the café pays.
 */
export function CafeOrderSection({
  getClient = defaultClient,
  onSaved = () => ordersRead.get().retry?.(),
  today = () => manilaToday()
}: {
  getClient?: () => CafeOrdersClient;
  /** Called after an order is saved, so the list on the page reads again. */
  onSaved?: () => void;
  today?: () => string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<CafeOrderSaved | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {done ? (
        <Banner
          tone="info"
          title={`Café order ${done.orderNo} saved: ${peso(done.totalCents)}, not paid yet.`}
          body={
            (done.takesSlots
              ? 'It counts toward the weekly limit. '
              : 'It does not count toward the weekly limit. ') +
            'Open it in the list below and mark it paid when the café pays.'
          }
          onDismiss={() => setDone(null)}
        />
      ) : null}
      {open ? (
        <CafeOrderForm
          getClient={getClient}
          today={today}
          onCancel={() => setOpen(false)}
          onSaved={(saved) => {
            setDone(saved);
            setOpen(false);
            onSaved();
          }}
        />
      ) : (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
          New café order
        </Button>
      )}
    </div>
  );
}

function CafeOrderForm({
  getClient,
  today,
  onCancel,
  onSaved
}: {
  getClient: () => CafeOrdersClient;
  today: () => string;
  onCancel: () => void;
  onSaved: (saved: CafeOrderSaved) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [reads, setReads] = useState(0);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CafeFormLine[]>([]);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The id of the order being sent: kept for a retry of the same order, replaced when it is edited.
  const attempt = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => {
        const client = getClient();
        return Promise.all([fetchCafePrices(client), fetchCafeOrderSettings(client)]);
      })
      .then(
        ([prices, settings]) => {
          if (!current) return;
          setLines(linesFrom(prices));
          setPhase({ kind: 'ready', prices, counts: settings.countTowardLimit });
        },
        (e: unknown) => {
          if (current)
            setPhase({ kind: e instanceof CafePricesUnavailable ? 'unavailable' : 'failed' });
        }
      );
    return () => {
      current = false;
    };
  }, [getClient, reads]);

  const heading = 'New café order';
  if (phase.kind === 'loading')
    return (
      <Panel title={heading}>
        <p role="status" className="text-caption text-ink-mute">
          Reading the café prices…
        </p>
      </Panel>
    );
  if (phase.kind === 'unavailable')
    return (
      <Panel
        title={heading}
        action={
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Close
          </Button>
        }
      >
        <p role="note" className="text-body text-ink">
          Café orders need the next database update. Until then, enter a café order from the order
          form. Your other orders are not affected.
        </p>
      </Panel>
    );
  if (phase.kind === 'failed')
    return (
      <Panel title={heading}>
        <Banner
          tone="warn"
          title="The café prices could not be read."
          action={{
            label: 'Try again',
            onPress: () => {
              setPhase({ kind: 'loading' });
              setReads((n) => n + 1);
            }
          }}
          secondaryAction={{ label: 'Close', onPress: onCancel }}
        />
      </Panel>
    );

  const check = checkCafeForm({ name, pickupDate: date, lines }, today());
  const shown = (message?: string) => (tried ? message : undefined);
  const setLine = (productId: string, change: Partial<CafeFormLine>) =>
    setLines((all) => all.map((l) => (l.productId === productId ? { ...l, ...change } : l)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!check.ok || saving) return;
    const key = JSON.stringify(
      cafeOrderBody({ clientId: '', name, pickupDate: date, notes, lines: check.send })
    );
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    setSaving(true);
    setError(null);
    try {
      const saved = await createCafeOrder(getClient(), {
        clientId: attempt.current.id,
        name,
        pickupDate: date,
        notes,
        lines: check.send
      });
      attempt.current = null;
      onSaved(saved);
    } catch (e) {
      if (e instanceof CafePricesUnavailable) setPhase({ kind: 'unavailable' });
      else
        setError(e instanceof CafeOrderRefused ? e.message : 'The order was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title={heading}
      action={
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      }
    >
      <form onSubmit={submit} noValidate aria-label={heading} className="flex flex-col gap-4">
        {error ? <Banner tone="danger" title={error} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <OwnerField
              label="Café or customer name"
              value={name}
              maxLength={80}
              autoComplete="off"
              aria-invalid={shown(check.name) ? true : undefined}
              onChange={(e) => setName(e.target.value)}
            />
            {shown(check.name) ? (
              <span role="alert" className="text-caption text-danger">
                {check.name}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <OwnerField
              label="Pickup date"
              type="date"
              value={date}
              min={today()}
              aria-invalid={shown(check.date) ? true : undefined}
              onChange={(e) => setDate(e.target.value)}
            />
            {shown(check.date) ? (
              <span role="alert" className="text-caption text-danger">
                {check.date}
              </span>
            ) : null}
          </div>
        </div>
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-label font-semibold text-ink-soft">
            Flavours and café prices
          </legend>
          <p className="m-0 text-caption text-ink-mute">
            Each price starts at the café price. Change it for this order if you agreed another.
            Leave the quantity empty for flavours not on the order.
          </p>
          {lines.map((line) => {
            const price = phase.prices.find((p) => p.productId === line.productId);
            const lineError = check.lineErrors[line.productId];
            const sent = check.send.find((x) => x.productId === line.productId);
            return (
              <div
                key={line.productId}
                className="grid grid-cols-[minmax(0,1fr)_5rem_7rem] items-start gap-2 border-b border-line pb-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_7rem]"
              >
                <span className="col-span-3 text-body font-semibold text-ink sm:col-span-1 sm:pt-3">
                  {line.name}
                  {price ? (
                    <span className="block text-caption font-normal text-ink-mute">
                      Order form {peso(price.retailCents)} · café {peso(price.effectiveCents)}
                    </span>
                  ) : null}
                </span>
                <OwnerField
                  label="Quantity"
                  inputMode="numeric"
                  value={line.qty}
                  autoComplete="off"
                  aria-label={`Quantity of ${line.name}`}
                  aria-invalid={tried && lineError?.qty ? true : undefined}
                  onChange={(e) => setLine(line.productId, { qty: e.target.value })}
                />
                <OwnerField
                  label="Price (₱)"
                  inputMode="decimal"
                  value={line.price}
                  autoComplete="off"
                  aria-label={`Price of ${line.name}`}
                  aria-invalid={tried && lineError?.price ? true : undefined}
                  onChange={(e) => setLine(line.productId, { price: e.target.value })}
                />
                <span className="col-span-3 text-caption text-ink-mute sm:col-span-1 sm:pt-9">
                  {sent ? peso(sent.qty * sent.unitCents) : ''}
                </span>
                {tried && (lineError?.qty || lineError?.price) ? (
                  <span role="alert" className="col-span-3 text-caption text-danger sm:col-span-4">
                    {line.name}: {[lineError.qty, lineError.price].filter(Boolean).join(' ')}
                  </span>
                ) : null}
              </div>
            );
          })}
          {shown(check.lines) ? (
            <span role="alert" className="text-caption text-danger">
              {check.lines}
            </span>
          ) : null}
        </fieldset>
        <OwnerField
          label="Notes (optional)"
          value={notes}
          maxLength={300}
          autoComplete="off"
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="m-0 text-heading font-semibold text-ink">Total {peso(check.totalCents)}</p>
          <p className="m-0 text-caption text-ink-mute">
            {phase.counts
              ? 'This order counts toward the weekly limit (a setting in the order settings), like any order: it keeps its slots while unpaid for the unpaid-order hold, and for good once paid. It is refused if the pickup week is full.'
              : 'This order does not count toward the weekly limit (a setting in the order settings).'}{' '}
            It starts unpaid; mark it paid on the order when the café pays. The database adds up the
            total again when it saves.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save café order'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
