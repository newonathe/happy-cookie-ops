'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { OwnerField, PageTitle, Panel } from '@/components/ui/owner-kit';
import { CafeOrderSettings } from '@/components/live/cafe-order-settings';
import type { StaffIdentity } from '@/lib/auth/staff-name';
import {
  CafePricesUnavailable,
  cafePesosText,
  fetchCafePrices,
  type CafePrice
} from '@/lib/data/cafe-prices';
import { fetchCafeOrderSettings } from '@/lib/data/cafe-orders';
import { CafeExpenseRecovery, type PendingCafeExpense } from '@/lib/data/cafe-expense-recovery';
import {
  CAFE_SALE_DAYS_BACK,
  CafeSaleRefused,
  DEFAULT_EXPENSE_CATEGORIES,
  addCafeExpense,
  addDays,
  cafeSaleBody,
  checkCafeExpenses,
  checkCafeForm,
  fetchCafeSales,
  fetchExpenseCategories,
  recordCafeSale,
  type CafeFormExpense,
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

/** An expense's own note: the books' label is "Café <name> · <note or category>", so the note is what follows the first " · ". */
const noteOf = (x: { category: string; label: string }): string => {
  const note = x.label.replace(/^Café .*? · /, '');
  return note === x.category ? '' : note;
};

const SELECT_CLASS =
  'h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-label';
const MAX_EXPENSES = 10;

/** Her expense categories, read once; the short default until they arrive or when they cannot be read. */
function useExpenseCategories(getClient: () => CafeSalesClient): string[] {
  const [categories, setCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => fetchExpenseCategories(getClient()))
      .then((list) => {
        if (current) setCategories(list);
      });
    return () => {
      current = false;
    };
  }, [getClient]);
  return categories;
}

type ListPhase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'ready'; rows: CafeSaleRow[] };

/**
 * Café (owner only): the cookies Cine sells in bulk to cafés, logged after the fact, with their additional expenses. A sale is paid and
 * handed over on its date, counted in the books that day, and never appears among the orders or customers; each expense is a cost line
 * of the books on the same date. It stands on its own: no till, events or selling days. `onBack` is given only while the page is
 * reached from Orders (until it has its own tab); then the page leaves its title to the screen around it.
 */
export function CafePage({
  getClient = defaultClient,
  getWriteScope = () => null,
  onBack,
  today = () => manilaToday()
}: {
  getClient?: () => CafeSalesClient;
  getWriteScope?: () => StaffIdentity | null;
  onBack?: () => void;
  today?: () => string;
}) {
  const [phase, setPhase] = useState<ListPhase>({ kind: 'loading' });
  const [reads, setReads] = useState(0);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    saved: CafeSaleSaved;
    method: string;
    takeStock: boolean;
  } | null>(null);
  const categories = useExpenseCategories(getClient);

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

  const title = onBack ? null : (
    <PageTitle title="Café" subtitle="Cookies sold in bulk to cafés, logged after the sale." />
  );
  const back = onBack ? (
    <Button variant="ghost" size="sm" onClick={onBack}>
      Back to orders
    </Button>
  ) : undefined;
  const settings = <CafeOrderSettings getClient={getClient} />;

  if (phase.kind === 'loading')
    return (
      <div className="flex flex-col gap-3">
        {title}
        <Panel title="Café sales" action={back}>
          <p role="status" className="text-caption text-ink-mute">
            Reading the café sales…
          </p>
        </Panel>
      </div>
    );
  if (phase.kind === 'unavailable')
    return (
      <div className="flex flex-col gap-3">
        {title}
        <Panel title="Café sales" action={back}>
          <p role="note" className="text-body text-ink">
            Café sales need the next database update. Until then they cannot be logged. Your orders
            are not affected.
          </p>
        </Panel>
      </div>
    );
  if (phase.kind === 'failed')
    return (
      <div className="flex flex-col gap-3">
        {title}
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
      </div>
    );

  const paid = phase.rows.filter((r) => r.paid);
  const total = paid.reduce((sum, r) => sum + r.totalCents, 0);
  const expenses = phase.rows.reduce((sum, r) => sum + r.expenseCents, 0);
  const reload = () => setReads((n) => n + 1);
  return (
    <div className="flex flex-col gap-3">
      {title}
      {saved ? (
        <Banner
          tone={saved.saved.short.length ? 'warn' : 'info'}
          title={`Café sale ${saved.saved.orderNo} logged: ${peso(saved.saved.totalCents)}, paid by ${saved.method} on ${dateText(saved.saved.saleDate)}.`}
          body={
            saved.saved.short.length
              ? `Stock did not cover: ${saved.saved.short.join(', ')}.`
              : saved.takeStock
                ? 'The cookies and the packaging were taken off stock.'
                : 'Stock was not changed.'
          }
          onDismiss={() => setSaved(null)}
        />
      ) : null}
      {done ? <Banner tone="info" title={done} onDismiss={() => setDone(null)} /> : null}
      {settings}
      {open ? (
        <CafeSaleForm
          getClient={getClient}
          today={today}
          onCancel={() => setOpen(false)}
          onSaved={(result, method, takeStock) => {
            setSaved({ saved: result, method, takeStock });
            setOpen(false);
            reload();
          }}
        />
      ) : (
        <Panel title="Café sales" action={back}>
          <Button variant="secondary" className="mb-3" onClick={() => setOpen(true)}>
            Log café sale
          </Button>
          {phase.rows.length === 0 ? (
            <p className="text-body text-ink-mute">
              No café sales logged yet. Log one when you sell cookies to a café in bulk: it is
              counted as paid on its date and never shows among your orders or customers.
            </p>
          ) : (
            <>
              <p className="mb-2 text-caption text-ink-mute">
                {paid.length === 1 ? '1 sale' : `${paid.length} sales`} · {peso(total)}
                {expenses > 0
                  ? ` · expenses ${peso(expenses)} · net ${peso(total - expenses)}`
                  : ''}
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
                      {dateText(row.saleDate)} ·{' '}
                      {row.cookies === 1 ? '1 cookie' : `${row.cookies} cookies`}
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
                    {row.expenses.length ? (
                      <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
                        {row.expenses.map((x, i) => (
                          <li
                            key={i}
                            className="flex justify-between gap-3 text-caption text-ink-mute"
                          >
                            <span>
                              {x.category}
                              {noteOf(x) ? ` · ${noteOf(x)}` : ''}
                            </span>
                            <span>-{peso(x.amountCents)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {row.expenseCents > 0 ? (
                      <span className="text-caption font-semibold text-ink">
                        Net {peso(row.totalCents - row.expenseCents)}
                      </span>
                    ) : null}
                    {row.paid ? (
                      adding === row.orderNo ? (
                        <ExpenseForm
                          getClient={getClient}
                          getWriteScope={getWriteScope}
                          orderNo={row.orderNo}
                          categories={categories}
                          onCancel={() => setAdding(null)}
                          onSaved={() => {
                            setAdding(null);
                            setDone(`Expense added to the sale for ${row.name}.`);
                            reload();
                          }}
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="self-start"
                          aria-label={`Add an expense to the sale for ${row.name} on ${dateText(row.saleDate)}`}
                          onClick={() => setAdding(row.orderNo)}
                        >
                          Add expense
                        </Button>
                      )
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

/** One expense for a sale already logged: its category, an amount and a note. The same attempt keeps its id, so a retry cannot add it twice. */
function ExpenseForm({
  getClient,
  getWriteScope,
  orderNo,
  categories,
  onCancel,
  onSaved
}: {
  getClient: () => CafeSalesClient;
  getWriteScope: () => StaffIdentity | null;
  orderNo: string;
  categories: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [row, setRow] = useState<CafeFormExpense>({
    category: categories[0] ?? '',
    amount: '',
    note: ''
  });
  const scope = getWriteScope();
  const recovery = scope ? new CafeExpenseRecovery(scope, orderNo) : null;
  const [restored] = useState(() => {
    try {
      return { pending: recovery?.read() ?? null, unreadable: false };
    } catch {
      return { pending: null, unreadable: true };
    }
  });
  const [pending, setPending] = useState(restored.pending);
  const shown = pending
    ? { category: pending.category, amount: cafePesosText(pending.amountCents), note: pending.note }
    : row;
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = checkCafeExpenses([row]);
  const problem = row.amount.trim() === '' ? 'Type the amount.' : check.errors[0];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    const line = pending ?? check.send[0];
    if (!line || saving) return;
    if (!scope || !recovery) {
      setError('Sign in as the owner before saving an expense.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const locked = await recovery.withWriter(async () => {
        if (getWriteScope() !== scope) return;
        const stored = recovery.read();
        if (stored?.clientId !== pending?.clientId) {
          setPending(stored);
          setError('Another tab changed this expense. Check it before saving.');
          return;
        }
        const request: PendingCafeExpense = stored ?? {
          ...line,
          orderNo,
          clientId: crypto.randomUUID()
        };
        if (!stored) recovery.keep(request);
        setPending(request);
        try {
          await addCafeExpense(getClient(), request);
        } catch (e) {
          if (e instanceof CafeSaleRefused && e.requestRejected) {
            recovery.clear();
            setRow({
              category: request.category,
              amount: cafePesosText(request.amountCents),
              note: request.note
            });
            setPending(null);
          }
          throw e;
        }
        recovery.clear();
        if (getWriteScope() === scope) onSaved();
      });
      if (!locked)
        setError(
          'Use the tab already saving this expense, or try again in a browser that can keep saves in order.'
        );
    } catch (e) {
      setError(
        e instanceof CafeSaleRefused
          ? e.message
          : e instanceof CafePricesUnavailable
            ? 'Café expenses need the next database update.'
            : 'Check that this browser can keep the expense, then try the same save again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Add expense"
      className="mt-1 flex flex-col gap-2 rounded-control border border-line p-3"
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      {restored.unreadable ? (
        <Banner
          tone="danger"
          title="This browser could not read the earlier expense. Check the café log before trying on another device."
        />
      ) : pending && !saving ? (
        <Banner
          tone="warn"
          title="A previous save needs confirmation. Save this same expense again to check it."
        />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-label font-semibold text-ink-soft">Expense category</span>
          <select
            value={shown.category}
            onChange={(e) => setRow({ ...row, category: e.target.value })}
            disabled={saving || !!pending}
            className={SELECT_CLASS}
          >
            {pending && !categories.includes(shown.category) ? (
              <option value={shown.category}>{shown.category}</option>
            ) : null}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <OwnerField
          label="Expense amount (₱)"
          inputMode="decimal"
          value={shown.amount}
          disabled={saving || !!pending}
          autoComplete="off"
          onChange={(e) => setRow({ ...row, amount: e.target.value })}
        />
        <OwnerField
          label="Expense note"
          value={shown.note}
          disabled={saving || !!pending}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setRow({ ...row, note: e.target.value })}
        />
      </div>
      {tried && !pending && problem ? (
        <span role="alert" className="text-caption text-danger">
          {problem}
        </span>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving || restored.unreadable}>
          {saving ? 'Saving…' : 'Save expense'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
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
  const [expenses, setExpenses] = useState<CafeFormExpense[]>([]);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = useExpenseCategories(getClient);
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
              ...new Set(methods.filter((m) => m.active && m.label !== 'Cash').map((m) => m.label))
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
  const check = checkCafeForm({ name, saleDate: date, payMethod: method, lines, expenses }, now);
  const shown = (message?: string) => (tried ? message : undefined);
  const setLine = (productId: string, change: Partial<CafeFormLine>) =>
    setLines((all) => all.map((l) => (l.productId === productId ? { ...l, ...change } : l)));
  const setExpense = (index: number, change: Partial<CafeFormExpense>) =>
    setExpenses((all) => all.map((x, i) => (i === index ? { ...x, ...change } : x)));

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
      lines: check.send,
      expenses: check.expenses
    };
    const key = JSON.stringify(cafeSaleBody(input));
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    setSaving(true);
    setError(null);
    try {
      const result = await recordCafeSale(getClient(), { ...input, clientId: attempt.current.id });
      attempt.current = null;
      onSaved(result, method, takeStock);
    } catch (e) {
      if (e instanceof CafePricesUnavailable) setPhase({ kind: 'unavailable' });
      else
        setError(e instanceof CafeSaleRefused ? e.message : 'The sale was not saved. Try again.');
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
                className={SELECT_CLASS}
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
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-label font-semibold text-ink-soft">
            Additional expenses (optional)
          </legend>
          <p className="m-0 text-caption text-ink-mute">
            Delivery, extra packaging or anything else this sale cost you. Each one is an expense in
            the books on the sale date.
          </p>
          {expenses.map((x, i) => (
            <div
              key={i}
              className="grid items-start gap-2 border-b border-line pb-2 sm:grid-cols-[12rem_8rem_minmax(0,1fr)_auto]"
            >
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-label font-semibold text-ink-soft">Expense category</span>
                <select
                  value={x.category}
                  aria-label={`Category of expense ${i + 1}`}
                  onChange={(e) => setExpense(i, { category: e.target.value })}
                  className={SELECT_CLASS}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <OwnerField
                label="Amount (₱)"
                inputMode="decimal"
                value={x.amount}
                autoComplete="off"
                aria-label={`Amount of expense ${i + 1}`}
                aria-invalid={tried && check.expenseErrors[i] ? true : undefined}
                onChange={(e) => setExpense(i, { amount: e.target.value })}
              />
              <OwnerField
                label="Note"
                value={x.note}
                maxLength={120}
                autoComplete="off"
                aria-label={`Note of expense ${i + 1}`}
                onChange={(e) => setExpense(i, { note: e.target.value })}
              />
              <Button
                variant="ghost"
                size="sm"
                className="sm:mt-7"
                aria-label={`Remove expense ${i + 1}`}
                onClick={() => setExpenses((all) => all.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
              {tried && check.expenseErrors[i] ? (
                <span role="alert" className="text-caption text-danger sm:col-span-4">
                  Expense {i + 1}: {check.expenseErrors[i]}
                </span>
              ) : null}
            </div>
          ))}
          {expenses.length < MAX_EXPENSES ? (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                setExpenses((all) => [
                  ...all,
                  { category: categories[0] ?? '', amount: '', note: '' }
                ])
              }
            >
              Add an expense
            </Button>
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
          {check.expenseCents > 0 ? (
            <p className="m-0 text-body text-ink">
              Expenses {peso(check.expenseCents)} · Net{' '}
              {peso(check.totalCents - check.expenseCents)}
            </p>
          ) : null}
          <p className="m-0 text-caption text-ink-mute">
            {phase.counts
              ? 'This sale counts toward the weekly limit of its date (a setting at the top of this page), and is refused if that week is full.'
              : 'This sale does not count toward the weekly limit (a setting at the top of this page).'}{' '}
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
