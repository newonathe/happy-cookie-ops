'use client';

import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { BazaarDayRow, BazaarEventView } from '@/lib/bazaar/live-bazaar-types';
import { primaryActionOf, type PrimaryAction } from '@/lib/bazaar/event-rules';
import { formIds, validateCostForm, validateFeeForm, validateTargetForm } from '@/lib/bazaar/forms';
import { peso } from '@/lib/money/format';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field, SelectField } from '@/components/ui/field';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ReceiptTable } from '@/components/ui/receipt-table';
import { Sheet } from '@/components/ui/sheet';
import { SectionHeader } from '@/components/ui/section-header';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusPill } from '@/components/ui/status-pill';
import { Notices } from './field';
import { Figures } from './figure';
import { CloseEventSheet } from './close-event-sheet';
import { StartDaySheet } from './start-day-sheet';
import { useIssues } from './use-issues';
import { useSave } from './use-save';

const DAY_PILL = { Planned: 'planned', Selling: 'selling', Closed: 'closed' } as const;

/** What the event page needs signal for, said once under the action it disables (spec rule 9). */
const NEEDS_SIGNAL = 'Starting a day needs signal. Selling does not.';

function figureOf(event: BazaarEventView, key: string) {
  return event.figures.find((f) => f.key === key);
}

/** The stat row: revenue, profit (or "Cost pending"), cookies sold, and the profit against the target. */
function Stats({ event }: { event: BazaarEventView }) {
  const revenue = figureOf(event, 'revenue');
  const profit = figureOf(event, 'profit');
  const target = figureOf(event, 'target');
  const partsOf = (f: typeof revenue) =>
    f?.parts.map((p) => ({
      label: p.detail ? `${p.label} · ${p.detail}` : p.label,
      value: p.valueText
    }));
  const pending = event.profitCents === null;
  const goal = event.targetCents;
  const barLabel =
    goal === null
      ? 'No target set'
      : event.profitCents === null
        ? `Profit not known yet · target ${peso(goal)}`
        : `${peso(Math.max(0, event.profitCents))} of ${peso(goal)} target profit`;
  return (
    <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-4">
      <StatTile
        label="Revenue"
        value={event.figures.length ? (revenue?.cents ?? revenue?.valueText ?? null) : null}
        format={peso}
        parts={partsOf(revenue)}
      />
      <StatTile
        label="Profit"
        value={event.figures.length ? (pending ? 'Cost pending' : event.profitCents) : null}
        format={peso}
        tone={pending && event.figures.length ? 'warn' : undefined}
        detail={profit?.note ?? undefined}
        parts={partsOf(profit)}
      />
      <StatTile label="Cookies sold" value={event.figures.length ? event.soldCount : null} />
      <div className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-4">
        <span className="text-caption font-semibold text-ink-soft">Against the target</span>
        <ProgressBar
          value={Math.max(0, event.profitCents ?? 0)}
          max={goal ?? 0}
          label={barLabel}
          overBy={
            goal !== null && event.profitCents !== null ? peso(event.profitCents - goal) : undefined
          }
        />
        {target && target.valueText !== 'No target set' ? (
          <span className="text-caption text-ink-mute">{target.valueText}</span>
        ) : null}
      </div>
    </div>
  );
}

/** One row of the days timeline: the plan for a day that has not run, what happened for a day that has. */
function DayRow({
  day,
  primary,
  onStart
}: {
  day: BazaarDayRow;
  primary: boolean;
  onStart: (day: BazaarDayRow) => void;
}) {
  const noteId = 'day-note-' + day.id;
  const blocked = day.actionNote !== null;
  const o = day.outcome;
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body font-bold text-ink">{day.dateText}</span>
        <StatusPill status={DAY_PILL[day.word]} />
      </div>
      {o ? (
        <div className="flex flex-col gap-1">
          <span className="text-body font-bold text-ink tabular-nums">{o.revenueText}</span>
          <span className="text-caption text-ink-soft">
            {[o.soldText, o.leftText, o.carriedText, o.drawerText && `Drawer: ${o.drawerText}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ) : (
        <>
          <span className="flex flex-wrap gap-x-3 text-body text-ink">
            <span>{day.cookiesText}</span>
            <span className="text-ink-mute">{day.floatText}</span>
          </span>
          {day.lines.length ? (
            <ul aria-label={'Plan for ' + day.dateText} className="m-0 list-none p-0">
              {day.lines.map((line) => (
                <li key={line} className="text-caption text-ink-mute">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {day.hint ? <p className="m-0 text-caption text-ink-mute">{day.hint}</p> : null}
      <span className="flex flex-wrap gap-2">
        {day.action && !primary ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={day.action === 'start' ? () => onStart(day) : day.run}
            disabled={blocked}
            aria-describedby={blocked ? noteId : undefined}
          >
            {day.action === 'start'
              ? 'Start this day'
              : day.action === 'review'
                ? 'Review and close'
                : 'See the review'}
          </Button>
        ) : null}
        {day.edit ? (
          <Button variant="ghost" size="sm" onClick={day.edit}>
            Change the plan
          </Button>
        ) : null}
      </span>
      {day.actionNote && !primary ? (
        <p id={noteId} className="m-0 text-caption text-ink-mute">
          {day.actionNote}
        </p>
      ) : null}
    </li>
  );
}

type OnSaving = ((saving: boolean) => void) | undefined;

/** Tells the sheet around a form when a save starts and ends, so the sheet stays open until the answer is shown. */
function useReportSaving(saving: boolean, onSaving: OnSaving) {
  const last = useRef(false);
  useEffect(() => {
    if (last.current === saving) return;
    last.current = saving;
    onSaving?.(saving);
  }, [saving, onSaving]);
}

/** The fees of the event, with the stall rent first, and a form to add one. */
export function FeesSection({ event, onSaving }: { event: BazaarEventView; onSaving?: OnSaving }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [dayId, setDayId] = useState('');
  const { error, saving, run } = useSave();
  useReportSaving(saving, onSaving);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const issues = useIssues(() => validateFeeForm({ label, amount }));
  const { addFee } = event;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFee || !issues.submit()) return;
    const saved = await run(() => addFee({ label, amount, dayId: dayId === '' ? null : dayId }));
    if (saved) {
      setLabel('');
      setAmount('');
      issues.clear();
    }
  };
  const lines = event.fees.map((f) => {
    const [name = f.text, ...rest] = f.text.split(' · ');
    return {
      label: name,
      detail: rest.join(' · ') || undefined,
      value: f.amountCents,
      onRemove: f.remove
        ? () => {
            const remove = f.remove;
            setRemoveError(null);
            if (remove) void remove().then(setRemoveError);
          }
        : undefined
    };
  });
  return (
    <section aria-labelledby="bazaar-fees" className="flex flex-col gap-2">
      <SectionHeader title={<span id="bazaar-fees">Fees</span>} count={event.fees.length} />
      {removeError ? <Banner tone="danger" title={removeError} /> : null}
      <ReceiptTable
        caption="Fees"
        lines={lines}
        total={event.feesTotalCents}
        emptyText="No fees yet"
        note="The stall rent is booked when the first day starts."
      />
      {addFee ? (
        <form
          {...issues.formProps}
          onSubmit={(e) => void submit(e)}
          aria-label="Add a fee"
          noValidate
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:max-w-xl"
        >
          <ErrorSummary errors={issues.summary} focusKey={issues.focusKey} />
          {error ? <Banner tone="danger" title={error} /> : null}
          <Field
            id={formIds.feeLabel}
            label="What for"
            value={label}
            maxLength={80}
            autoComplete="off"
            error={issues.messageOf(formIds.feeLabel)}
            onChange={(e) => {
              setLabel(e.target.value);
              issues.touch(formIds.feeLabel);
            }}
            onBlur={() => issues.blur(formIds.feeLabel)}
          />
          <Field
            id={formIds.feeAmount}
            label="Amount"
            mode="decimal"
            prefix="₱"
            value={amount}
            autoComplete="off"
            error={issues.messageOf(formIds.feeAmount)}
            onChange={(e) => {
              setAmount(e.target.value);
              issues.touch(formIds.feeAmount);
            }}
            onBlur={() => issues.blur(formIds.feeAmount)}
          />
          <SelectField
            label="For"
            value={dayId}
            options={event.feeFor.map((o) => ({ value: o.dayId ?? '', label: o.text }))}
            onChange={(e) => setDayId(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            busy={saving}
            busyLabel="Saving…"
            className="self-start"
          >
            Add the fee
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function TargetSection({ event, onSaving }: { event: BazaarEventView; onSaving?: OnSaving }) {
  const [pesos, setPesos] = useState(event.targetPesos);
  const { error, saving, run } = useSave();
  useReportSaving(saving, onSaving);
  const issues = useIssues(() => validateTargetForm({ pesos }));
  const { saveTarget } = event;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveTarget && issues.submit()) await run(() => saveTarget(pesos));
  };
  return (
    <section aria-labelledby="bazaar-target" className="flex flex-col gap-2">
      <SectionHeader title={<span id="bazaar-target">Target profit</span>} />
      <p className="m-0 text-body text-ink">{event.targetText}</p>
      {saveTarget ? (
        <form
          {...issues.formProps}
          onSubmit={(e) => void submit(e)}
          aria-label="Target profit"
          noValidate
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:max-w-xl"
        >
          <ErrorSummary errors={issues.summary} focusKey={issues.focusKey} />
          {error ? <Banner tone="danger" title={error} /> : null}
          <Field
            id={formIds.target}
            label="Target"
            mode="decimal"
            prefix="₱"
            hint="Leave blank for no target."
            value={pesos}
            autoComplete="off"
            error={issues.messageOf(formIds.target)}
            onChange={(e) => {
              setPesos(e.target.value);
              issues.touch(formIds.target);
            }}
            onBlur={() => issues.blur(formIds.target)}
          />
          <Button
            type="submit"
            variant="secondary"
            busy={saving}
            busyLabel="Saving…"
            className="self-start"
          >
            Save the target
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/** One flavour's cost per cookie as a receipt: what it is, where it came from, how the recipe makes it up. */
function CostCard({
  cost,
  onSaving
}: {
  cost: BazaarEventView['costs'][number];
  onSaving?: OnSaving;
}) {
  const [pesos, setPesos] = useState(cost.typedPesos);
  const { error, saving, run } = useSave();
  useReportSaving(saving, onSaving);
  const field = formIds.cost(cost.productId);
  const issues = useIssues(() => validateCostForm({ field, pesos }));
  const { save } = cost;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (save && issues.submit()) await run(() => save(pesos));
  };
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-body font-bold text-ink">{cost.name}</span>
        <span className="text-body font-bold text-ink tabular-nums">{cost.unitText}</span>
      </div>
      <span className="text-caption text-ink-mute">
        {cost.unitText === 'Cost pending'
          ? 'No cost per cookie yet'
          : `per cookie · ${cost.sourceText}`}
      </span>
      {cost.breakdown ? (
        <details className="text-body">
          <summary className="cursor-pointer text-caption font-semibold text-brand-deep">
            How the recipe makes it up
          </summary>
          <div className="pt-2">
            <ReceiptTable
              caption={'Recipe cost per cookie for ' + cost.name}
              lines={cost.breakdown.slice(0, -1).map((l) => ({
                label: l.label,
                value: 0,
                valueText: l.valueText
              }))}
              total={0}
              totalText={cost.breakdown[cost.breakdown.length - 1]?.valueText}
              totalLabel={cost.breakdown[cost.breakdown.length - 1]?.label}
              note={cost.breakdownNote ?? undefined}
            />
          </div>
        </details>
      ) : cost.breakdownNote ? (
        <p className="m-0 text-caption text-ink-mute">{cost.breakdownNote}</p>
      ) : null}
      {save ? (
        <form
          {...issues.formProps}
          onSubmit={(e) => void submit(e)}
          aria-label={'Cost per cookie for ' + cost.name}
          noValidate
          className="flex flex-col gap-3"
        >
          <ErrorSummary errors={issues.summary} focusKey={issues.focusKey} />
          {error ? <Banner tone="danger" title={error} /> : null}
          <Field
            id={field}
            label="Your cost per cookie"
            mode="decimal"
            prefix="₱"
            hint="Leave blank to use the recipe's cost."
            value={pesos}
            autoComplete="off"
            error={issues.messageOf(field)}
            onChange={(e) => {
              setPesos(e.target.value);
              issues.touch(field);
            }}
            onBlur={() => issues.blur(field)}
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            busy={saving}
            busyLabel="Saving…"
            className="self-start"
          >
            Save the cost
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/** The one forward action of the page, in the words of the state the event is in. */
function PrimaryButton({
  event,
  action,
  onStart,
  onClose
}: {
  event: BazaarEventView;
  action: PrimaryAction;
  onStart: (day: BazaarDayRow) => void;
  onClose: () => void;
}) {
  const day = (id: string) => event.days.find((d) => d.id === id);
  if (action.kind === 'close') {
    return (
      <Button
        variant="dark"
        size="lg"
        onClick={onClose}
        disabled={event.finalise?.blocked != null}
        reason={event.finalise?.blocked ?? undefined}
        className="self-start"
      >
        Close the event
      </Button>
    );
  }
  if (action.kind === 'plan') {
    const when = event.unplanned.find((u) => u.ymd === action.ymd)?.text ?? '';
    return (
      <Button
        variant="primary"
        size="lg"
        onClick={() => event.planDay(action.ymd)}
        className="self-start"
      >
        {`Plan ${when} →`}
      </Button>
    );
  }
  const d = day(action.dayId);
  if (!d) return null;
  const blocked = d.actionNote !== null;
  if (action.kind === 'start') {
    return (
      <Button
        variant="primary"
        size="lg"
        onClick={() => onStart(d)}
        disabled={blocked}
        reason={
          blocked
            ? d.actionNote === 'Needs signal'
              ? NEEDS_SIGNAL
              : (d.actionNote ?? undefined)
            : undefined
        }
        className="self-start"
      >
        {`Start the day →`}
      </Button>
    );
  }
  return (
    <Button
      variant="primary"
      size="lg"
      onClick={d.run}
      disabled={blocked}
      reason={blocked ? (d.actionNote ?? undefined) : undefined}
      className="self-start"
    >
      {`Review and close →`}
    </Button>
  );
}

type CostsPanel = 'fees' | 'target' | 'costs';

/**
 * Fees, the target and the cost per cookie as one card of three rows (Ethan, 19 October: consolidated, mockups
 * K5nHQS8GjtBYGseDtYZDnZ). Each row says its figure and opens its form, unchanged, in a sheet.
 */
function CostsCard({ event }: { event: BazaarEventView }) {
  const [open, setOpen] = useState<CostsPanel | null>(null);
  // How many of the open sheet's forms are saving: the sheet stays open until each answer (or refusal) is on screen.
  const [saving, setSaving] = useState(0);
  const onSaving = (on: boolean) => setSaving((n) => Math.max(0, n + (on ? 1 : -1)));
  const close = () => {
    if (saving === 0) setOpen(null);
  };
  const n = event.fees.length;
  const k = event.costs.length;
  const rows: Array<{ key: CostsPanel; label: string; detail: string; value: string }> = [
    {
      key: 'fees',
      label: 'Fees',
      detail: n === 0 ? 'None yet' : n === 1 ? '1 fee' : `${n} fees`,
      value: event.feesTotalText
    },
    {
      key: 'target',
      label: 'Target profit',
      detail: event.saveTarget ? 'Tap to set or change it' : '',
      value: event.targetText
    },
    ...(k > 0
      ? [
          {
            key: 'costs' as const,
            label: 'Cost per cookie',
            detail: k === 1 ? '1 flavour on the table' : `${k} flavours on the table`,
            value: ''
          }
        ]
      : [])
  ];
  const title = { fees: 'Fees', target: 'Target profit', costs: 'Cost per cookie' };
  return (
    <section aria-labelledby="bazaar-costs" className="flex flex-col gap-2">
      <SectionHeader title={<span id="bazaar-costs">Costs</span>} />
      <ul
        aria-label="Costs"
        className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0"
      >
        {rows.map((r) => (
          <li key={r.key} className="border-b border-divide last:border-b-0">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpen(r.key)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-raise"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-bold text-ink">{r.label}</span>
                {r.detail ? <span className="text-caption text-ink-mute">{r.detail}</span> : null}
              </span>
              {r.value ? (
                <span className="text-body font-bold text-ink tabular-nums">{r.value}</span>
              ) : null}
              <span aria-hidden="true" className="text-ink-faint">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <Sheet
          title={title[open]}
          onClose={close}
          footer={
            <Button
              variant="secondary"
              onClick={close}
              disabled={saving > 0}
              reason="Saving… The sheet closes once it is saved."
            >
              Done
            </Button>
          }
        >
          {open === 'fees' ? (
            <FeesSection event={event} onSaving={onSaving} />
          ) : open === 'target' ? (
            <TargetSection event={event} onSaving={onSaving} />
          ) : (
            <ul aria-label="Cost per cookie" className="m-0 flex list-none flex-col gap-2 p-0">
              {event.costs.map((c) => (
                <CostCard key={c.productId} cost={c} onSaving={onSaving} />
              ))}
            </ul>
          )}
        </Sheet>
      ) : null}
    </section>
  );
}

/** One booking: its hero and figures, then its days, fees, target and costs. A day is planned and started here. */
export function EventPage({ event }: { event: BazaarEventView }) {
  const [starting, setStarting] = useState<BazaarDayRow | null>(null);
  const [closing, setClosing] = useState(false);
  const primary = primaryActionOf(event);
  const startDay = (day: BazaarDayRow) => {
    if (day.startPrompt) setStarting(day);
    else day.start(false);
  };
  // The primary action is not drawn a second time on its day's row.
  const primaryDayId = primary && 'dayId' in primary ? primary.dayId : null;
  return (
    <>
      <Button variant="ghost" onClick={event.back} className="self-start">
        <span aria-hidden="true">← </span>Back to the events
      </Button>
      <Card variant="accent" as="section" aria-label="Event" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 min-w-0 text-title text-ink">{event.name}</h1>
          <StatusPill status={event.status} />
        </div>
        <span className="text-body text-ink-soft">
          {event.placeText} · {event.datesText}
        </span>
        <span className="text-caption text-ink-mute">{event.rentText}</span>
        <Notices notices={event.notices} />
        <Stats event={event} />
        {primary ? (
          <div className="flex flex-col gap-1">
            <PrimaryButton
              event={event}
              action={primary}
              onStart={startDay}
              onClose={() => setClosing(true)}
            />
          </div>
        ) : null}
      </Card>
      <section aria-labelledby="bazaar-days" className="flex flex-col gap-2">
        <SectionHeader title={<span id="bazaar-days">Days</span>} count={event.days.length} />
        {event.days.length === 0 ? (
          <p className="m-0 text-body text-ink-mute">No day is planned yet.</p>
        ) : (
          <ol aria-label="Days" className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {event.days.map((day) => (
              <DayRow key={day.id} day={day} primary={day.id === primaryDayId} onStart={startDay} />
            ))}
          </ol>
        )}
        {event.unplanned.length ? (
          <div className="flex flex-col gap-2">
            <span className="text-caption font-semibold text-ink-soft">
              {event.days.length === 0 ? 'Plan a day' : 'Plan another day'}
            </span>
            <span className="flex flex-wrap gap-2">
              {event.unplanned.map((u) => (
                <Button
                  key={u.ymd}
                  variant="secondary"
                  size="sm"
                  onClick={() => event.planDay(u.ymd)}
                >
                  {u.text}
                </Button>
              ))}
            </span>
          </div>
        ) : null}
      </section>
      <CostsCard event={event} />
      {event.figures.length > 0 ? (
        <section aria-labelledby="bazaar-figures" className="flex flex-col gap-2">
          <SectionHeader title={<span id="bazaar-figures">The event</span>} />
          {event.figuresNote ? (
            <p className="m-0 text-caption text-ink-mute">{event.figuresNote}</p>
          ) : null}
          <Figures figures={event.figures} label="The event" />
        </section>
      ) : null}
      {event.finalise && primary?.kind !== 'close' ? (
        <section aria-labelledby="bazaar-finalise" className="flex flex-col gap-2">
          <SectionHeader title={<span id="bazaar-finalise">Close the event</span>} />
          <p className="m-0 text-caption text-ink-mute">
            Closing the event counts its sales, fees and stock in the books. It cannot be undone.
          </p>
          <Button
            variant="dark"
            onClick={() => setClosing(true)}
            disabled={event.finalise.blocked !== null}
            reason={event.finalise.blocked ?? undefined}
            className="self-start"
          >
            Close the event
          </Button>
        </section>
      ) : null}
      {starting?.startPrompt ? (
        <StartDaySheet
          prompt={starting.startPrompt}
          onConfirm={() => {
            starting.start(true);
            setStarting(null);
          }}
          onClose={() => setStarting(null)}
        />
      ) : null}
      {closing && event.finalise ? (
        <CloseEventSheet finalise={event.finalise} onClose={() => setClosing(false)} />
      ) : null}
    </>
  );
}
