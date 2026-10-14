'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { DayPlanEditor, PlanFlavour } from '@/lib/bazaar/live-bazaar-types';
import {
  buttonBase,
  cardStyle,
  h1Style,
  h2Style,
  listStyle,
  mutedStyle,
  primaryBase,
  screenStyle,
  STATUS_COLOUR,
  textStyle
} from '@/components/live/stock/stock-shared';
import { Field } from './field';

/** What an earlier day set aside for a flavour, as the text of the Carried over field; blank for none. */
function carriedText(carryIn: NonNullable<DayPlanEditor['carryIn']>, id: string): string {
  const n = carryIn.byFlavour[id];
  return n === undefined ? '' : String(n);
}

/**
 * One day's plan: which flavours, how many, at what price, and the drawer float. It is a form of text: the runtime turns it
 * into centavos and whole cookies when it is saved, and says in words what is wrong.
 */
export function DayPlan({ editor, online }: { editor: DayPlanEditor; online: boolean }) {
  const [floatPesos, setFloat] = useState(editor.floatPesos);
  const { carryIn } = editor;
  // A new day starts with what the earlier day set aside, unless she has typed otherwise (a saved plan is left as it is).
  const [flavours, setFlavours] = useState<PlanFlavour[]>(() =>
    carryIn && editor.isNew
      ? editor.flavours.map((f) =>
          f.carried === '' && carryIn.byFlavour[f.id] !== undefined
            ? { ...f, carried: carriedText(carryIn, f.id) }
            : f
        )
      : editor.flavours
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = useId();

  const change = (id: string, patch: Partial<PlanFlavour>) =>
    setFlavours((all) => all.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const copyDayBefore = () => {
    if (!editor.copy) return;
    setFloat(editor.copy.floatPesos);
    // The day before's made and prices: what was carried over depends on how that day closed, so it starts at none,
    // or at what the closed day set aside when there is one.
    setFlavours(
      editor.copy.flavours.map((f) => ({
        ...f,
        carried: carryIn ? carriedText(carryIn, f.id) : ''
      }))
    );
    setError(null);
  };
  const fillCarriedOver = () => {
    if (!carryIn) return;
    setFlavours((all) => all.map((f) => ({ ...f, carried: carriedText(carryIn, f.id) })));
    setError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      setError(await editor.save({ floatPesos, flavours }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-label={'Plan for ' + editor.dateText}
      data-screen-label="Bazaar day plan"
      style={screenStyle}
      noValidate
    >
      <button
        type="button"
        onClick={editor.back}
        style={{ ...buttonBase, alignSelf: 'flex-start', minHeight: '44px' }}
      >
        <span aria-hidden="true">← </span>Back to the event
      </button>
      <h1 style={h1Style}>
        {editor.isNew ? 'Plan ' : 'Change '}
        {editor.dateText}
      </h1>
      {editor.copy ? (
        <button
          type="button"
          onClick={copyDayBefore}
          style={{ ...buttonBase, alignSelf: 'flex-start' }}
        >
          Copy the day before ({editor.copy.dateText})
        </button>
      ) : null}
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Field label="Drawer float (₱)" value={floatPesos} mode="decimal" onChange={setFloat} />
        <p style={mutedStyle}>
          The cash in the drawer before the first sale. Leave blank for none.
        </p>
      </div>
      <section aria-labelledby="plan-flavours" style={{ ...screenStyle, gap: '8px' }}>
        <h2 id="plan-flavours" style={h2Style}>
          Cookies on the table
        </h2>
        {carryIn ? (
          <button
            type="button"
            onClick={fillCarriedOver}
            style={{ ...buttonBase, alignSelf: 'flex-start' }}
          >
            Use what was carried over from {carryIn.dateText}
          </button>
        ) : null}
        <ul aria-label="Flavours" style={listStyle}>
          {flavours.map((f) => (
            <li
              key={f.id}
              style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <span style={{ ...textStyle, fontWeight: 700 }}>{f.name}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Field
                  label="Made"
                  value={f.made}
                  mode="numeric"
                  onChange={(made) => change(f.id, { made })}
                />
                {editor.showCarried ? (
                  <Field
                    label="Carried over"
                    value={f.carried}
                    mode="numeric"
                    onChange={(carried) => change(f.id, { carried })}
                  />
                ) : null}
                <Field
                  label="Price (₱)"
                  value={f.price}
                  mode="decimal"
                  onChange={(price) => change(f.id, { price })}
                />
              </span>
              {carryIn && carryIn.byFlavour[f.id] !== undefined ? (
                <span style={mutedStyle}>
                  {carryIn.byFlavour[f.id]} set aside on {carryIn.dateText}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <p style={mutedStyle}>
        Leave a flavour at 0 to leave it off the table. The price you set is this day&apos;s price,
        whatever the menu says.
      </p>
      {error ? (
        <p
          id={errorId}
          role="alert"
          style={{ ...textStyle, color: STATUS_COLOUR.Out, fontWeight: 600 }}
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={saving || !online}
        aria-describedby={error ? errorId : undefined}
        style={{
          ...primaryBase,
          minHeight: '48px',
          ...(saving || !online ? { opacity: 0.6, cursor: 'not-allowed' } : {})
        }}
      >
        {saving ? 'Saving…' : 'Save the plan'}
      </button>
      {!online ? <p style={mutedStyle}>Saving a plan needs signal.</p> : null}
    </form>
  );
}
