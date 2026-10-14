'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { BazaarDayRow, BazaarEventView } from '@/lib/bazaar/live-bazaar-types';
import {
  Facts,
  INK_SOFT,
  LINE,
  buttonBase,
  cardStyle,
  h1Style,
  h2Style,
  listStyle,
  mutedStyle,
  primaryBase,
  textStyle,
  wrapRow
} from '@/components/live/stock/stock-shared';
import { ErrorText, Field, Notices, RemoveButton, SelectField } from './field';
import { Figures } from './figure';
import { useSave } from './use-save';

const ACTION_WORD: Record<NonNullable<BazaarDayRow['action']>, string> = {
  start: 'Start this day',
  review: 'Review and close',
  see: 'See the review'
};

const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px' };
const formCard: React.CSSProperties = {
  ...cardStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};
const disabledLook: React.CSSProperties = { opacity: 0.6, cursor: 'not-allowed' };

function DayCard({ day }: { day: BazaarDayRow }) {
  const noteId = 'day-note-' + day.id;
  const blocked = day.actionNote !== null;
  const base = day.action === 'start' ? primaryBase : buttonBase;
  const look: React.CSSProperties = blocked
    ? { ...base, background: LINE, color: INK_SOFT, cursor: 'not-allowed' }
    : base;
  return (
    <li style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ ...wrapRow, justifyContent: 'space-between' }}>
        <span style={{ ...textStyle, fontWeight: 700 }}>{day.dateText}</span>
        <span style={{ ...textStyle, fontWeight: 700 }}>{day.word}</span>
      </span>
      <span style={wrapRow}>
        <span style={textStyle}>{day.cookiesText}</span>
        <span style={mutedStyle}>{day.floatText}</span>
      </span>
      {day.lines.length ? (
        <ul aria-label={'Plan for ' + day.dateText} style={{ ...listStyle, gap: '2px' }}>
          {day.lines.map((line) => (
            <li key={line} style={mutedStyle}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {day.hint ? <p style={mutedStyle}>{day.hint}</p> : null}
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {day.action ? (
          <button
            type="button"
            onClick={day.run}
            disabled={blocked}
            aria-describedby={blocked ? noteId : undefined}
            style={look}
          >
            {ACTION_WORD[day.action]}
          </button>
        ) : null}
        {day.edit ? (
          <button type="button" onClick={day.edit} style={buttonBase}>
            Change the plan
          </button>
        ) : null}
      </span>
      {day.actionNote ? (
        <p id={noteId} style={mutedStyle}>
          {day.actionNote}
        </p>
      ) : null}
    </li>
  );
}

/** The fees of the event, with the stall rent first, and a form to add one. */
export function FeesSection({ event }: { event: BazaarEventView }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [dayId, setDayId] = useState('');
  const { error, saving, run } = useSave();
  const errorId = useId();
  const { addFee } = event;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFee) return;
    const saved = await run(() => addFee({ label, amount, dayId: dayId === '' ? null : dayId }));
    if (saved) {
      setLabel('');
      setAmount('');
    }
  };
  return (
    <section aria-labelledby="bazaar-fees" style={section}>
      <h2 id="bazaar-fees" style={h2Style}>
        Fees
      </h2>
      <ul aria-label="Fees" style={listStyle}>
        {event.fees.map((f) => (
          <li
            key={f.id}
            style={{
              ...cardStyle,
              ...textStyle,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: '2px 12px'
            }}
          >
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{f.text}</span>
            <span style={{ fontWeight: 700, textAlign: 'right' }}>{f.amountText}</span>
            {f.remove ? <RemoveButton label={f.text} remove={f.remove} /> : null}
          </li>
        ))}
      </ul>
      <p style={{ ...textStyle, fontWeight: 700 }}>Total {event.feesTotalText}</p>
      {addFee ? (
        <form onSubmit={(e) => void submit(e)} aria-label="Add a fee" style={formCard} noValidate>
          <Field label="What for" value={label} mode="text" onChange={setLabel} />
          <Field label="Amount (₱)" value={amount} mode="decimal" onChange={setAmount} />
          <SelectField
            label="For"
            value={dayId}
            options={event.feeFor.map((o) => ({ value: o.dayId ?? '', text: o.text }))}
            onChange={setDayId}
          />
          <ErrorText error={error} id={errorId} />
          <button
            type="submit"
            disabled={saving}
            aria-describedby={error ? errorId : undefined}
            style={{ ...buttonBase, ...(saving ? disabledLook : {}) }}
          >
            {saving ? 'Saving…' : 'Add the fee'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function TargetSection({ event }: { event: BazaarEventView }) {
  const [pesos, setPesos] = useState(event.targetPesos);
  const { error, saving, run } = useSave();
  const errorId = useId();
  const { saveTarget } = event;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveTarget) await run(() => saveTarget(pesos));
  };
  return (
    <section aria-labelledby="bazaar-target" style={section}>
      <h2 id="bazaar-target" style={h2Style}>
        Target profit
      </h2>
      <p style={textStyle}>{event.targetText}</p>
      {saveTarget ? (
        <form
          onSubmit={(e) => void submit(e)}
          aria-label="Target profit"
          style={formCard}
          noValidate
        >
          <Field label="Target (₱)" value={pesos} mode="decimal" onChange={setPesos} />
          <ErrorText error={error} id={errorId} />
          <button
            type="submit"
            disabled={saving}
            aria-describedby={error ? errorId : undefined}
            style={{ ...buttonBase, ...(saving ? disabledLook : {}) }}
          >
            {saving ? 'Saving…' : 'Save the target'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function CostCard({ cost }: { cost: BazaarEventView['costs'][number] }) {
  const [pesos, setPesos] = useState(cost.typedPesos);
  const { error, saving, run } = useSave();
  const errorId = useId();
  const { save } = cost;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (save) await run(() => save(pesos));
  };
  return (
    <li style={formCard}>
      <span style={{ ...textStyle, fontWeight: 700 }}>{cost.name}</span>
      <span style={textStyle}>{cost.text}</span>
      {save ? (
        <form
          onSubmit={(e) => void submit(e)}
          aria-label={'Cost per cookie for ' + cost.name}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          noValidate
        >
          <Field
            label="Your cost per cookie (₱)"
            value={pesos}
            mode="decimal"
            onChange={setPesos}
          />
          <p style={mutedStyle}>Leave blank to use the recipe&apos;s cost.</p>
          <ErrorText error={error} id={errorId} />
          <button
            type="submit"
            disabled={saving}
            aria-describedby={error ? errorId : undefined}
            style={{ ...buttonBase, ...(saving ? disabledLook : {}) }}
          >
            {saving ? 'Saving…' : 'Save the cost'}
          </button>
        </form>
      ) : null}
    </li>
  );
}

/** Closing the event is a count in the books that cannot be undone: it asks twice. */
function FinaliseSection({ finalise }: { finalise: NonNullable<BazaarEventView['finalise']> }) {
  const [confirming, setConfirming] = useState(false);
  const { error, saving, run } = useSave();
  const errorId = useId();
  const blocked = finalise.blocked !== null;
  const off = blocked || saving;
  return (
    <section aria-labelledby="bazaar-finalise" style={section}>
      <h2 id="bazaar-finalise" style={h2Style}>
        Close the event
      </h2>
      <p style={mutedStyle}>
        Closing the event counts its sales, fees and stock in the books. It cannot be undone.
      </p>
      {finalise.blocked ? (
        <p role="status" style={{ ...textStyle, fontWeight: 700 }}>
          {finalise.blocked}
        </p>
      ) : null}
      <ErrorText error={error} id={errorId} />
      {confirming && !blocked ? (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(finalise.run).then((saved) => {
                if (!saved) setConfirming(false);
              })
            }
            style={{ ...primaryBase, minHeight: '48px', ...(saving ? disabledLook : {}) }}
          >
            {saving ? 'Closing…' : 'Yes, close the event'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setConfirming(false)}
            style={buttonBase}
          >
            Not yet
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={off}
          aria-describedby={error ? errorId : undefined}
          onClick={() => setConfirming(true)}
          style={{
            ...primaryBase,
            minHeight: '48px',
            alignSelf: 'flex-start',
            ...(off ? disabledLook : {})
          }}
        >
          Close the event
        </button>
      )}
    </section>
  );
}

/** One booking: its details, then its days. A day is planned here and started here. */
export function EventPage({ event }: { event: BazaarEventView }) {
  return (
    <>
      <button
        type="button"
        onClick={event.back}
        style={{ ...buttonBase, alignSelf: 'flex-start', minHeight: '44px' }}
      >
        <span aria-hidden="true">← </span>Back to the events
      </button>
      <h1 style={h1Style}>{event.name}</h1>
      <Notices notices={event.notices} />
      <section aria-label="Event details" style={cardStyle}>
        <Facts
          rows={[
            ['Dates', event.datesText],
            ['Place', event.placeText],
            ['Stall rent', event.rentText.replace(/^Stall rent /, '')]
          ]}
        />
      </section>
      <section aria-labelledby="bazaar-days" style={section}>
        <h2 id="bazaar-days" style={h2Style}>
          Days
        </h2>
        {event.days.length === 0 ? (
          <p style={mutedStyle}>No day is planned yet.</p>
        ) : (
          <ul aria-label="Days" style={listStyle}>
            {event.days.map((day) => (
              <DayCard key={day.id} day={day} />
            ))}
          </ul>
        )}
      </section>
      {event.unplanned.length ? (
        <section aria-labelledby="bazaar-plan" style={section}>
          <h2 id="bazaar-plan" style={h2Style}>
            Plan a day
          </h2>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {event.unplanned.map((u) => (
              <button
                key={u.ymd}
                type="button"
                onClick={() => event.planDay(u.ymd)}
                style={buttonBase}
              >
                {u.text}
              </button>
            ))}
          </span>
        </section>
      ) : null}
      <FeesSection event={event} />
      <TargetSection event={event} />
      {event.costs.length > 0 ? (
        <section aria-labelledby="bazaar-costs" style={section}>
          <h2 id="bazaar-costs" style={h2Style}>
            Cost per cookie
          </h2>
          <ul aria-label="Cost per cookie" style={listStyle}>
            {event.costs.map((c) => (
              <CostCard key={c.productId} cost={c} />
            ))}
          </ul>
        </section>
      ) : null}
      {event.figures.length > 0 ? (
        <section aria-labelledby="bazaar-figures" style={section}>
          <h2 id="bazaar-figures" style={h2Style}>
            The event
          </h2>
          {event.figuresNote ? <p style={mutedStyle}>{event.figuresNote}</p> : null}
          <Figures figures={event.figures} label="The event" />
        </section>
      ) : null}
      {event.finalise ? <FinaliseSection finalise={event.finalise} /> : null}
    </>
  );
}
