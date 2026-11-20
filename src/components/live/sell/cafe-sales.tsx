'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { OwnerField, Panel } from '@/components/ui/owner-kit';
import {
  CafePricesUnavailable,
  cafePesosText,
  fetchCafePrices,
  type CafePrice
} from '@/lib/data/cafe-prices';
import { fetchCafeOrderSettings } from '@/lib/data/cafe-orders';
import {
  CAFE_SALE_DAYS_BACK,
  CafeSaleRefused,
  addDays,
  cafeSaleBody,
  checkCafeForm,
  fetchCafeSales,
  recordCafeSale,
  type CafeFormLine,
  type CafeSaleRow,
  type CafeSaleSaved,
  type CafeSalesClient
} from '@/lib/data/cafe-sales';
import { fetchPaymentMethods } from '@/lib/data/payments';
import { peso } from '@/lib/money/format';
import { createClient } from '@/lib/supabase/client';
import { manilaToday } from '@/lib/time/business-clock';

let shared: CafeSalesClient | null = null;
const defaultClient = (): CafeSalesClient => (shared ??= createClient());

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-11-18 as "18 Nov 2026": a calendar date, so no time zone is involved. */
const dateText = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : ymd;
};

type ListPhase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'ready'; rows: CafeSaleRow[] };

/**
 * Café sales (owner only, inside Sell > Orders): the cookies Cine has sold in bulk to cafés, logged after the fact. Each is paid and
 * handed over on its date, counts in the books on that date, and never appears among the orders or customers. "Log café sale" adds one.
 */
export function CafeSalesView({
  getClient = defaultClient,
  onBack,
  today = () => manilaToday()
}: {
  getClient?: () => CafeSalesClient;
  onBack: () => void;
  today?: () => string;
}) {
  const [phase, setPhase] = useState<ListPhase>({ kind: 'loading' });
  const [reads, setReads] = useState(0);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ saved: CafeSaleSaved; method: string; takeStock: boolean } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => fetchCafeSales(getClient()))
      .then(
        (rows) => {
          if (current) setPhase({ kind: 'ready', rows });
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

  const back = (
    <Button variant="ghost" size="sm" onClick={onBack}>
      Back to orders
    </Button>
  );
  if (phase.kind === 'loading')
    return (
      <Panel title="Café sales" action={back}>
        <p role="status" className="text-caption text-ink-mute">
          Reading the café sales…
        </p>
      </Panel>
    );
  if (phase.kind === 'unavailable')
    return (
      <Panel title="Café sales" action={back}>
        <p role="note" className="text-body text-ink">
          Café sales need the next database update. Until then they cannot be logged. Your orders
          are not affected.
        </p>
      </Panel>
    );
  if (phase.kind === 'failed')
    return (
      <Panel title="Café sales" action={back}>
        <Banner
          tone="warn"
          title="The café sales could not be read."
          action={{
            label: 'Try again',
            onPress: () => {
              setPhase({ kind: 'loading' });
              setReads((n) => n + 1);
            }
          }}
        />
      </Panel>
    );

  const paid = phase.rows.filter((r) => r.paid);
  const total = paid.reduce((sum, r) => sum + r.totalCents, 0);
  return (
    <div className="flex flex-col gap-3">
      {done ? (
        <Banner
          tone={done.saved.short.length ? 'warn' : 'info'}
          title={`Café sale ${done.saved.orderNo} logged: ${peso(done.saved.totalCents)}, paid by ${done.method} on ${dateText(done.saved.saleDate)}.`}
          body={
            done.saved.short.length
              ? `Stock did not cover: ${done.saved.short.join(', ')}.`
              : done.takeStock
                ? 'The cookies and the packaging were taken off stock.'
                : 'Stock was not changed.'
          }
          onDismiss={() => setDone(null)}
        />
      ) : null}
      {open ? (
        <CafeSaleForm
          getClient={getClient}
          today={today}
          onCancel={() => setOpen(false)}
          onSaved={(saved, method, takeStock) => {
            setDone({ saved, method, takeStock });
            setOpen(false);
            setReads((n) => n + 1);
          }}
        />
      ) : (
        <Panel
          title="Café sales"
          action={
            <div className="flex gap-2">
              {back}
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                Log café sale
              </Button>
            </div>
          }
        >
          {phase.rows.length === 0 ? (
            <p className="text-body text-ink-mute">
              No café sales logged yet. Log one when you sell cookies to a café in bulk: it is
              counted as paid on its date and never shows among your orders or customers.
            </p>
          ) : (
            <>
              <p className="mb-2 text-caption text-ink-mute">
                {paid.length === 1 ? '1 sale' : `${paid.length} sales`} · {peso(total)}
              </p>
              <ul className="m-0 flex list-none flex-col p-0">
                {phase.rows.map((row) => (
                  <li
                    key={row.orderNo}
                    className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-body font-semibold text-ink">{row.name}</span>
                      <span className="text-body text-ink">{peso(row.totalCents)}</span>
                    </span>
                    <span className="text-caption text-ink-mute">
                      {dateText(row.saleDate)} · {row.cookies === 1 ? '1 cookie' : `${row.cookies} cookies`}
                      {row.payMethod ? ` · ${row.payMethod}` : ''}
                    </span>
                    {!row.paid ? (
                      <span className="text-caption text-danger">
                        Not paid (entered as an order before the log)
                      </span>
                    ) : null}
                    {row.notes ? (
                      <span className="text-caption text-ink-mute">{row.notes}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

type FormPhase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'ready'; prices: CafePrice[]; counts: boolean; methods: string[] };

const linesFrom = (prices: CafePrice[]): CafeFormLine[] =>
  prices.map((p) => ({
    productId: p.productId,
    name: p.name,
    qty: '',
    price: cafePesosText(p.effectiveCents)
  }));

function CafeSaleForm({
  getClient,
  today,
  onCancel,
  onSaved
}: {
  getClient: () => CafeSalesClient;
  today: () => string;
  onCancel: () => void;
  onSaved: (saved: CafeSaleSaved, method: string, takeStock: boolean) => void;
}) {
  const [phase, setPhase] = useState<FormPhase>({ kind: 'loading' });
  const [reads, setReads] = useState(0);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [takeStock, setTakeStock] = useState(true);
  const [lines, setLines] = useState<CafeFormLine[]>([]);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The id of the sale being sent: kept for a retry of the same sale, replaced when it is edited.
  const attempt = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => {
        const client = getClient();
        return Promise.all([
          fetchCafePrices(client),
          fetchCafeOrderSettings(client),
          // The payment methods only add to Cash: if they cannot be read, Cash alone is offered.
          fetchPaymentMethods(client).catch(() => [])
        ]);
      })
      .then(
        ([prices, settings, methods]) => {
          if (!current) return;
          setLines(linesFrom(prices));
          setPhase({
            kind: 'ready',
            prices,
            counts: settings.countTowardLimit,
            methods: [
              ...new Set(
                methods.filter((m) => m.active && m.label !== 'Cash').map((m) => m.label)
              )
            ]
          });
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

  const heading = 'Log café sale';
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
          Café sales need the next database update. Until then they cannot be logged.
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

  const now = today();
  const check = checkCafeForm({ name, saleDate: date, payMethod: method, lines }, now);
  const shown = (message?: string) => (tried ? message : undefined);
  const setLine = (productId: string, change: Partial<CafeFormLine>) =>
    setLines((all) => all.map((l) => (l.productId === productId ? { ...l, ...change } : l)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!check.ok || saving) return;
    const input = {
      clientId: '',
      name,
      saleDate: date,
      payMethod: method,
      notes,
      takeStock,
      lines: check.send
    };
    const key = JSON.stringify(cafeSaleBody(input));
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    setSaving(true);
    setError(null);
    try {
      const saved = await recordCafeSale(getClient(), { ...input, clientId: attempt.current.id });
      attempt.current = null;
      onSaved(saved, method, takeStock);
    } catch (e) {
      if (e instanceof CafePricesUnavailable) setPhase({ kind: 'unavailable' });
      else setError(e instanceof CafeSaleRefused ? e.message : 'The sale was not saved. Try again.');
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <OwnerField
              label="Café name"
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
              label="Sale date"
              type="date"
              value={date}
              min={addDays(now, -CAFE_SALE_DAYS_BACK)}
              max={now}
              aria-invalid={shown(check.date) ? true : undefined}
              onChange={(e) => setDate(e.target.value)}
            />
            {shown(check.date) ? (
              <span role="alert" className="text-caption text-danger">
                {check.date}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-label font-semibold text-ink-soft">Paid by</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-label"
              >
                {['Cash', ...phase.methods].map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {shown(check.method) ? (
              <span role="alert" className="text-caption text-danger">
                {check.method}
              </span>
            ) : null}
          </div>
        </div>
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-label font-semibold text-ink-soft">
            Flavours and café prices
          </legend>
          <p className="m-0 text-caption text-ink-mute">
            Each price starts at the café price. Change it for this sale if you agreed another.
            Leave the quantity empty for flavours not in the sale.
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
        <label className="flex items-start gap-3 text-body text-ink">
          <input
            type="checkbox"
            checked={takeStock}
            onChange={(e) => setTakeStock(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <span>
            Take these cookies and the packaging off stock
            <span className="block text-caption text-ink-mute">
              Done once, when the sale is saved, like packing an order. Untick it if these cookies
              were not baked from your stock.
            </span>
          </span>
        </label>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="m-0 text-heading font-semibold text-ink">Total {peso(check.totalCents)}</p>
          <p className="m-0 text-caption text-ink-mute">
            {phase.counts
              ? 'This sale counts toward the weekly limit of its date (a setting in the order settings), and is refused if that week is full.'
              : 'This sale does not count toward the weekly limit (a setting in the order settings).'}{' '}
            It is saved as paid and handed over on its date, and counted in the books that day. The
            database adds up the total again when it saves.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save café sale'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
