'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { CloseInput, DayReviewView } from '@/lib/bazaar/live-bazaar-types';
import {
  buttonBase,
  cardStyle,
  h1Style,
  h2Style,
  listStyle,
  mutedStyle,
  primaryBase,
  screenStyle,
  textStyle
} from '@/components/live/stock/stock-shared';
import { ErrorText, Field, Notices, RemoveButton, SelectField } from './field';
import { Figures } from './figure';
import { useSave } from './use-save';

type Close = NonNullable<DayReviewView['close']>;
type Row = CloseInput['rows'][number];
type Typed = Partial<Omit<Row, 'productId'>>;

const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px' };
const formCard: React.CSSProperties = {
  ...cardStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};
const fieldRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '8px' };
const disabledLook: React.CSSProperties = { opacity: 0.6, cursor: 'not-allowed' };

function LossForm({
  flavours,
  addLoss
}: {
  flavours: DayReviewView['flavours'];
  addLoss: NonNullable<DayReviewView['addLoss']>;
}) {
  const [picked, setPicked] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const { error, saving, run } = useSave();
  const productId = picked || flavours[0]?.id || '';
  const errorId = useId();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await run(() => addLoss({ productId, qty, reason }));
    if (saved) {
      setQty('');
      setReason('');
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} aria-label="Record a loss" style={formCard} noValidate>
      <SelectField
        label="Flavour"
        value={productId}
        options={flavours.map((f) => ({ value: f.id, text: f.name }))}
        onChange={setPicked}
      />
      <span style={fieldRow}>
        <Field label="How many" value={qty} mode="numeric" onChange={setQty} />
        <Field label="What happened" value={reason} mode="text" onChange={setReason} />
      </span>
      <ErrorText error={error} id={errorId} />
      <button
        type="submit"
        disabled={saving}
        aria-describedby={error ? errorId : undefined}
        style={{ ...buttonBase, ...(saving ? disabledLook : {}) }}
      >
        {saving ? 'Saving…' : 'Record the loss'}
      </button>
    </form>
  );
}

function StockForm({
  flavours,
  canAddCarried,
  addStock
}: {
  flavours: DayReviewView['flavours'];
  canAddCarried: boolean;
  addStock: NonNullable<DayReviewView['addStock']>;
}) {
  const [picked, setPicked] = useState('');
  const [qty, setQty] = useState('');
  const [kind, setKind] = useState<'made' | 'carried'>('made');
  const { error, saving, run } = useSave();
  const productId = picked || flavours[0]?.id || '';
  const errorId = useId();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await run(() =>
      addStock({ productId, qty, kind: canAddCarried ? kind : 'made' })
    );
    if (saved) setQty('');
  };
  return (
    <form onSubmit={(e) => void submit(e)} aria-label="Add stock" style={formCard} noValidate>
      <SelectField
        label="Flavour"
        value={productId}
        options={flavours.map((f) => ({ value: f.id, text: f.name }))}
        onChange={setPicked}
      />
      <span style={fieldRow}>
        <Field label="How many" value={qty} mode="numeric" onChange={setQty} />
        {canAddCarried ? (
          <SelectField
            label="Kind"
            value={kind}
            options={[
              { value: 'made', text: 'Made today' },
              { value: 'carried', text: 'Carried over' }
            ]}
            onChange={(value) => setKind(value === 'carried' ? 'carried' : 'made')}
          />
        ) : null}
      </span>
      <ErrorText error={error} id={errorId} />
      <button
        type="submit"
        disabled={saving}
        aria-describedby={error ? errorId : undefined}
        style={{ ...buttonBase, ...(saving ? disabledLook : {}) }}
      >
        {saving ? 'Saving…' : 'Add to the table'}
      </button>
    </form>
  );
}

/**
 * The count at the end of a day. Only what she has typed is kept: a row she has not touched follows what the review says
 * should be left, so a re-read changes nothing she wrote. The form is keyed on the day by its parent.
 */
function CloseForm({ stock, close }: { stock: DayReviewView['stock']; close: Close }) {
  const [typed, setTyped] = useState<Record<string, Typed>>({});
  const [cash, setCash] = useState('');
  const { error, saving, run } = useSave();
  const errorId = useId();
  const blockedId = useId();

  const rowOf = (s: DayReviewView['stock'][number]): Row => ({
    productId: s.productId,
    left: s.shouldBeLeft > 0 ? '' : '0',
    carryNext: '',
    toShop: '',
    writtenOff: '',
    ...typed[s.productId]
  });
  const set = (productId: string, patch: Typed) =>
    setTyped((all) => ({ ...all, [productId]: { ...all[productId], ...patch } }));
  const blocked = close.blocked !== null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    await run(() =>
      close.submit({
        countedPesos: cash,
        rows: stock.map((s) => {
          const row = rowOf(s);
          return { ...row, carryNext: close.lastDay ? '' : row.carryNext };
        })
      })
    );
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-label="Close the day"
      style={{ ...section, gap: '12px' }}
      noValidate
    >
      <ul aria-label="Count by flavour" style={listStyle}>
        {stock.map((s) => {
          const row = rowOf(s);
          return (
            <li key={s.productId} style={formCard}>
              <span style={{ ...textStyle, fontWeight: 700 }}>{s.name}</span>
              <span style={mutedStyle}>Should be left: {s.shouldBeLeft}</span>
              <span style={fieldRow}>
                <Field
                  label="Left"
                  value={row.left}
                  mode="numeric"
                  onChange={(left) => set(s.productId, { left })}
                />
                {close.lastDay ? null : (
                  <Field
                    label="Carried over"
                    value={row.carryNext}
                    mode="numeric"
                    onChange={(carryNext) => set(s.productId, { carryNext })}
                  />
                )}
                <Field
                  label="To the shop"
                  value={row.toShop}
                  mode="numeric"
                  onChange={(toShop) => set(s.productId, { toShop })}
                />
                <Field
                  label="Written off"
                  value={row.writtenOff}
                  mode="numeric"
                  onChange={(writtenOff) => set(s.productId, { writtenOff })}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <div style={formCard}>
        <p style={{ ...textStyle, fontWeight: 700 }}>
          Cash expected in the drawer: {close.cashExpectedText}
        </p>
        <Field label="Cash counted (₱)" value={cash} mode="decimal" onChange={setCash} />
        <p style={mutedStyle}>Leave blank if you did not count it.</p>
      </div>
      {close.blocked ? (
        <p id={blockedId} role="status" style={{ ...textStyle, fontWeight: 700 }}>
          {close.blocked}
        </p>
      ) : null}
      <ErrorText error={error} id={errorId} />
      <button
        type="submit"
        disabled={saving || blocked}
        aria-describedby={blocked ? blockedId : error ? errorId : undefined}
        style={{
          ...primaryBase,
          minHeight: '48px',
          ...(saving || blocked ? disabledLook : {})
        }}
      >
        {saving ? 'Saving…' : 'Close the day'}
      </button>
    </form>
  );
}

/** A day's review: what is left, what was lost, the takings and cash, the event so far, and (for an open day) the close. */
export function DayReview({ review }: { review: DayReviewView }) {
  const open = review.state === 'open';
  return (
    <section
      aria-label={'Review of ' + review.dateText}
      data-screen-label="Bazaar day review"
      style={screenStyle}
    >
      <button
        type="button"
        onClick={review.back}
        style={{ ...buttonBase, alignSelf: 'flex-start', minHeight: '44px' }}
      >
        <span aria-hidden="true">← </span>
        {review.backText}
      </button>
      <h1 style={h1Style}>Review · {review.dateText}</h1>
      <p style={mutedStyle}>{review.eventName}</p>
      <p style={{ ...textStyle, fontWeight: 700 }}>{open ? 'Selling' : 'Closed'}</p>
      <Notices notices={review.notices} />

      <section aria-labelledby="review-cookies" style={section}>
        <h2 id="review-cookies" style={h2Style}>
          Cookies
        </h2>
        <ul aria-label="Cookies" style={listStyle}>
          {review.stock.map((s) => (
            <li
              key={s.productId}
              style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              <span style={{ ...textStyle, fontWeight: 700 }}>{s.name}</span>
              <span style={textStyle}>{s.onTableText}</span>
              <span style={textStyle}>{s.goneText}</span>
              <span style={mutedStyle}>
                {open || s.countText === null ? 'Should be left: ' + s.shouldBeLeft : s.countText}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="review-losses" style={section}>
        <h2 id="review-losses" style={h2Style}>
          Losses
        </h2>
        {review.losses.length ? (
          <ul aria-label="Losses" style={listStyle}>
            {review.losses.map((l) => (
              <li
                key={l.id}
                style={{
                  ...cardStyle,
                  ...textStyle,
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '6px 12px'
                }}
              >
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{l.text}</span>
                {l.remove ? <RemoveButton label={l.text} remove={l.remove} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p style={mutedStyle}>No losses recorded.</p>
        )}
        {review.addLoss ? (
          <LossForm key={review.dayId} flavours={review.flavours} addLoss={review.addLoss} />
        ) : null}
      </section>

      {review.addStock ? (
        <section aria-labelledby="review-stock" style={section}>
          <h2 id="review-stock" style={h2Style}>
            Add stock
          </h2>
          <StockForm
            key={review.dayId}
            flavours={review.flavours}
            canAddCarried={review.canAddCarried}
            addStock={review.addStock}
          />
        </section>
      ) : null}

      <section aria-labelledby="review-day" style={section}>
        <h2 id="review-day" style={h2Style}>
          This day
        </h2>
        <Figures figures={review.dayFigures} label="This day" />
      </section>

      <section aria-labelledby="review-event" style={section}>
        <h2 id="review-event" style={h2Style}>
          Event so far
        </h2>
        {review.eventNote ? <p style={mutedStyle}>{review.eventNote}</p> : null}
        <Figures figures={review.eventFigures} label="Event so far" />
      </section>

      {review.close ? (
        <section aria-labelledby="review-close" style={section}>
          <h2 id="review-close" style={h2Style}>
            Close the day
          </h2>
          <CloseForm key={review.dayId} stock={review.stock} close={review.close} />
        </section>
      ) : null}
    </section>
  );
}
