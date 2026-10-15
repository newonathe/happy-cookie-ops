'use client';

import { useId, useRef, useState } from 'react';
import type * as React from 'react';
import type { CloseInput, DayReviewView } from '@/lib/bazaar/live-bazaar-types';
import { closeRowOf, drawerCheck, type CloseTyped } from '@/lib/bazaar/review';
import { peso } from '@/lib/money/format';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { cx } from '@/components/ui/cx';
import { ErrorText } from './field';
import { useSave } from './use-save';

type Close = NonNullable<DayReviewView['close']>;
type Part = keyof CloseTyped;

const num = (text: string): number => (/^[0-9]{1,5}$/.test(text.trim()) ? Number(text) : 0);

/**
 * The count at the end of a day (U5). Every field starts at a fact, not blank: Left is what should be left, the rest of it
 * sits in one field (carried over, else the shop when the flavour has a recipe, else written off), and she changes what is
 * not so. What is sent is exactly what is shown (`closeRowOf`). The cash starts blank, with "It matches", so a count she
 * did not make is never booked. A difference above the line asks her to count again first (Ateneo A3).
 * Only what she has changed is kept, so a re-read of the day moves what she has not touched. Keyed on the day by its parent.
 */
export function CloseForm({ stock, close }: { stock: DayReviewView['stock']; close: Close }) {
  const [typed, setTyped] = useState<Record<string, CloseTyped>>({});
  const [cash, setCash] = useState('');
  // What she kept: the amount AND the cash it was kept against, so a re-read that moves the expected cash asks again.
  const [kept, setKept] = useState<string | null>(null);
  const { error, saving, run } = useSave();
  const errorId = useId();
  const blockedId = useId();
  const cashId = useId();
  const lineId = useId();
  const cashInput = useRef<HTMLInputElement>(null);
  const againId = useId();

  const rows: CloseInput['rows'] = stock.map((s) =>
    closeRowOf(s, close.lastDay, typed[s.productId])
  );
  const set = (productId: string, patch: CloseTyped) =>
    setTyped((all) => ({ ...all, [productId]: { ...all[productId], ...patch } }));
  const check = drawerCheck(close.cashExpectedCents, cash);
  // The question stands until she keeps this very amount; typing another amount asks again.
  const keepKey = `${close.cashExpectedCents}:${check.countedCents}`;
  const asking = check.recount && keepKey !== kept;
  const blocked = close.blocked !== null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    if (asking) {
      document.getElementById(againId)?.focus();
      return;
    }
    await run(() => close.submit({ countedPesos: cash, rows }));
  };

  const stepper = (
    s: DayReviewView['stock'][number],
    row: CloseInput['rows'][number],
    part: Exclude<Part, undefined>,
    caption: string,
    max: number
  ) => (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-soft">{caption}</span>
      <Stepper
        size="sm"
        label={`${s.name}: ${caption.toLowerCase()}`}
        value={num(row[part])}
        min={0}
        max={max}
        onChange={(n) => set(s.productId, { [part]: String(n) })}
      />
    </div>
  );

  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-label="Close the day"
      className="flex flex-col gap-3"
      noValidate
    >
      <ul aria-label="Count by flavour" className="m-0 flex list-none flex-col gap-2 p-0">
        {stock.map((s, i) => {
          const row = rows[i] as CloseInput['rows'][number];
          const left = num(row.left);
          const split = num(row.carryNext) + num(row.toShop) + num(row.writtenOff);
          const unsure = close.lastDay && s.hasRecipe === null && split === 0 && left > 0;
          return (
            <li
              key={s.productId}
              className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
            >
              <span className="text-body font-bold text-ink">{s.name}</span>
              <span className="text-caption text-ink-soft">Should be left: {s.shouldBeLeft}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {stepper(s, row, 'left', 'Left', Math.max(0, s.shouldBeLeft))}
                {close.lastDay ? null : stepper(s, row, 'carryNext', 'Carried over', left)}
                {stepper(s, row, 'toShop', 'To the shop', left)}
                {stepper(s, row, 'writtenOff', 'Written off', left)}
              </div>
              {split !== left && !unsure ? (
                <span className="text-caption font-semibold text-danger">
                  {`The ${left} left must be split into ${close.lastDay ? '' : 'carried over, '}to the shop and written off. These add up to ${split}.`}
                </span>
              ) : null}
              {unsure ? (
                <span className="text-caption text-ink-soft">
                  {`Choose where the ${left} left go: to the shop or written off.`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
        <p className="m-0 text-body font-bold text-ink">
          Cash expected in the drawer: {close.cashExpectedText}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label htmlFor={cashId} className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
            <span className="text-caption font-semibold text-ink-soft">Cash counted (₱)</span>
            <input
              ref={cashInput}
              id={cashId}
              value={cash}
              inputMode="decimal"
              autoComplete="off"
              aria-describedby={lineId}
              onChange={(e) => setCash(e.target.value)}
              className="min-h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-[16px] font-semibold text-ink"
            />
          </label>
          <Button variant="secondary" onClick={() => setCash(close.cashExpectedPesos)}>
            It matches
          </Button>
        </div>
        <p
          id={lineId}
          aria-live="polite"
          className={cx(
            'm-0 min-h-5 text-body font-semibold',
            check.kind === 'matches' ? 'text-ok' : 'text-ink'
          )}
        >
          {check.text}
        </p>
        <p className="m-0 text-caption text-ink-mute">Leave blank if you did not count it.</p>
        {asking ? (
          <div
            role="alert"
            className="motion-drop flex flex-col gap-3 rounded-control border border-l-4 border-warm-line border-l-warn-dot bg-warm-high px-4 py-3 text-warn-strong"
          >
            <span className="text-body font-bold">
              {`That is ${peso(check.diffCents)} ${check.kind === 'over' ? 'over' : 'short'}. Count the drawer again?`}
            </span>
            <span className="flex flex-wrap gap-2">
              <Button
                id={againId}
                variant="dark"
                size="sm"
                onClick={() => {
                  cashInput.current?.focus();
                  cashInput.current?.select();
                }}
              >
                Count again
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setKept(keepKey)}>
                {`Keep ${peso(check.countedCents ?? 0)}`}
              </Button>
            </span>
          </div>
        ) : null}
      </div>

      {close.blocked ? (
        <p id={blockedId} role="status" className="m-0 text-body font-bold text-ink">
          {close.blocked}
        </p>
      ) : null}
      <ErrorText error={error} id={errorId} />
      <Button
        type="submit"
        variant="dark"
        size="lg"
        disabled={saving || blocked}
        busy={saving}
        busyLabel="Saving…"
        aria-describedby={blocked ? blockedId : error ? errorId : undefined}
        className="w-full"
      >
        Close the day
      </Button>
    </form>
  );
}
