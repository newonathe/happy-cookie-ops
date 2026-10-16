'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { DayReviewView } from '@/lib/bazaar/live-bazaar-types';
import {
  buttonBase,
  cardStyle,
  h1Style,
  h2Style,
  listStyle,
  mutedStyle,
  screenStyle,
  textStyle
} from '@/components/live/stock/stock-shared';
import { ErrorText, Field, Notices, RemoveButton, SelectField } from './field';
import { StatusPill } from '@/components/ui/status-pill';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { useLeavingRows } from '@/components/ui/motion';
import { Field as UiField, SelectField as UiSelectField } from '@/components/ui/field';
import { formIds, validateLossForm } from '@/lib/bazaar/forms';
import { useIssues } from './use-issues';
import { CloseForm } from './close-form';
import { DayReport } from './day-report';
import { DayTiles } from './day-tiles';
import { Figures } from './figure';
import { useSave } from './use-save';

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
  const issues = useIssues(() => validateLossForm({ productId, qty, reason }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!issues.submit()) return;
    const saved = await run(() => addLoss({ productId, qty, reason }));
    if (saved) {
      setQty('');
      setReason('');
      issues.clear();
    }
  };
  return (
    <form
      {...issues.formProps}
      onSubmit={(e) => void submit(e)}
      aria-label="Record a loss"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:max-w-xl"
      noValidate
    >
      <ErrorSummary errors={issues.summary} focusKey={issues.focusKey} />
      {error ? <Banner tone="danger" title={error} /> : null}
      <UiSelectField
        id={formIds.lossFlavour}
        label="Flavour"
        value={productId}
        options={flavours.map((f) => ({ value: f.id, label: f.name }))}
        error={issues.messageOf(formIds.lossFlavour)}
        onChange={(e) => {
          setPicked(e.target.value);
          issues.touch(formIds.lossFlavour);
        }}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UiField
          id={formIds.lossQty}
          label="How many"
          mode="numeric"
          autoComplete="off"
          value={qty}
          error={issues.messageOf(formIds.lossQty)}
          onChange={(e) => {
            setQty(e.target.value);
            issues.touch(formIds.lossQty);
          }}
          onBlur={() => issues.blur(formIds.lossQty)}
        />
        <UiField
          id={formIds.lossReason}
          label="What happened"
          autoComplete="off"
          maxLength={80}
          value={reason}
          error={issues.messageOf(formIds.lossReason)}
          onChange={(e) => {
            setReason(e.target.value);
            issues.touch(formIds.lossReason);
          }}
          onBlur={() => issues.blur(formIds.lossReason)}
        />
      </div>
      <Button
        type="submit"
        variant="secondary"
        busy={saving}
        busyLabel="Saving…"
        className="self-start"
      >
        Record the loss
      </Button>
    </form>
  );
}

export function StockForm({
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

/** A day's review: what is left, what was lost, the takings and cash, the event so far, and (for an open day) the close. */
export function DayReview({ review }: { review: DayReviewView }) {
  const open = review.state === 'open';
  // A loss taken back fades out (150 ms) instead of vanishing.
  const lossRows = useLeavingRows(review.losses, (l) => l.id);
  // The day has just been closed while this is on screen: the tiles settle once (the D0 motion table). A day opened
  // already closed does not play it.
  const [seen, setSeen] = useState(review.state);
  const [settled, setSettled] = useState(false);
  if (seen !== review.state) {
    setSeen(review.state);
    setSettled(review.state === 'closed');
  }
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
      <span style={{ alignSelf: 'flex-start' }}>
        <StatusPill status={open ? 'selling' : 'closed'} />
      </span>
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
        {lossRows.length ? (
          <ul aria-label="Losses" style={listStyle}>
            {lossRows.map(({ item: l, key, leaving }) => (
              <li
                key={key}
                data-leaving={leaving}
                aria-hidden={leaving || undefined}
                className="motion-enter motion-leave"
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
                {l.remove && !leaving ? <RemoveButton label={l.text} remove={l.remove} /> : null}
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
        <DayTiles review={review} settled={settled} />
      </section>

      {review.report ? (
        <section aria-labelledby="review-report" style={section}>
          <h2 id="review-report" style={h2Style}>
            Day summary
          </h2>
          <DayReport review={review} />
        </section>
      ) : null}

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
