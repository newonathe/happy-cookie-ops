'use client';

import { useEffect, useRef, useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { HelperBazaarVals } from '@/lib/bazaar/helper-bazaar-types';
import { OwnerField } from '@/components/ui/owner-kit';
import {
  buttonBase,
  h1Style,
  mutedStyle,
  screenStyle,
  textStyle
} from '@/components/live/stock/stock-shared';

/**
 * S3: the Bazaar screen of a helper. They see the day Cine has open and nothing else: no list of events, no plan, no review. While
 * the phone holds the day it is the till (drawn by the caller); with none, this says plainly what is going on. Closing the day is a
 * count of what is left, done in `HelperClose`.
 */
export const HELPER_COPY = {
  title: 'Bazaar',
  looking: 'Looking for the open bazaar day…',
  noneTitle: 'No bazaar day is open right now',
  none: 'When the owner starts the day it appears here by itself.',
  error: 'The open day could not be checked. Check the signal and try again.',
  offline: 'No signal. The day is checked when the signal is back.',
  unavailable: 'Helper access is not available yet. Ask the owner.',
  refused: 'Your access has ended. Ask the owner if you should have more.',
  retry: 'Check again'
} as const;

/** `liveHelperBazaar` as the runtime provides it: null for anyone but a helper in live mode. */
export function helperBazaarOf(v: OpsVals): HelperBazaarVals | null {
  return v.liveHelperBazaar ?? null;
}

/** Every 15 s while on screen and online, and on coming back: the day Cine has open, and sales from other phones. */
const REFRESH_MS = 15_000;

export function HelperBazaar({
  helper,
  till
}: {
  helper: HelperBazaarVals;
  /** The till, drawn by the caller while the phone holds the day. */
  till: React.ReactNode;
}) {
  const joinRef = useRef(helper.join);
  useEffect(() => {
    joinRef.current = helper.join;
  });
  useEffect(() => {
    joinRef.current();
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) joinRef.current();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
    };
  }, []);

  const selling = helper.phase === 'selling';
  return (
    <>
      {selling ? (
        till
      ) : (
        <section
          aria-label="Bazaar"
          data-screen-label="Bazaar"
          data-helper-day={helper.phase}
          style={{ ...screenStyle, paddingBottom: '96px' }}
        >
          <h1 style={h1Style}>{HELPER_COPY.title}</h1>
          {helper.phase === 'loading' || helper.phase === 'idle' ? (
            <p aria-live="polite" style={mutedStyle}>
              {helper.online ? HELPER_COPY.looking : HELPER_COPY.offline}
            </p>
          ) : helper.phase === 'none' ? (
            <>
              <p style={{ ...textStyle, fontWeight: 600 }}>{HELPER_COPY.noneTitle}</p>
              <p style={textStyle}>{HELPER_COPY.none}</p>
            </>
          ) : (
            <p role="alert" style={textStyle}>
              {helper.phase === 'unavailable'
                ? HELPER_COPY.unavailable
                : helper.phase === 'refused'
                  ? HELPER_COPY.refused
                  : helper.online
                    ? HELPER_COPY.error
                    : HELPER_COPY.offline}
            </p>
          )}
          {helper.phase !== 'unavailable' && helper.phase !== 'refused' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" onClick={helper.join} style={buttonBase}>
                {HELPER_COPY.retry}
              </button>
            </div>
          ) : null}
        </section>
      )}
      {helper.close ? <HelperClose close={helper.close} dayName={helper.dayName} /> : null}
    </>
  );
}

export const CLOSE_COPY = {
  title: 'Close the day',
  intro:
    'Count what is left of each flavour, and the cash in the drawer if you counted it. The owner checks the day afterwards. Sales on this phone are sent first.',
  cash: 'Cash counted (optional)',
  confirm: 'Close the day',
  closing: 'Closing…',
  cancel: 'Keep selling'
} as const;

export function HelperClose({
  close,
  dayName
}: {
  close: NonNullable<HelperBazaarVals['close']>;
  dayName: string;
}) {
  const [left, setLeft] = useState<Record<string, string>>(() =>
    Object.fromEntries(close.flavours.map((f) => [f.id, String(f.onTable)]))
  );
  const [cash, setCash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const counts: Record<string, number> = {};
    for (const f of close.flavours) {
      const text = (left[f.id] ?? '').trim();
      if (!/^[0-9]{1,5}$/.test(text))
        return setError(`Count ${f.name} as a whole number, 0 or more.`);
      counts[f.id] = Number(text);
    }
    let countedPesos: number | null = null;
    if (cash.trim() !== '') {
      if (!/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(cash.trim()))
        return setError('The cash counted is an amount in pesos, 0 or more.');
      countedPesos = Number(cash.trim());
    }
    setBusy(true);
    const problem = await close.submit({ left: counts, countedPesos });
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Sheet
      title={dayName ? `${CLOSE_COPY.title}: ${dayName}` : CLOSE_COPY.title}
      onClose={close.cancel}
      footer={
        <>
          <Button
            variant="dark"
            busy={busy}
            busyLabel={CLOSE_COPY.closing}
            onClick={() => void submit()}
          >
            {CLOSE_COPY.confirm}
          </Button>
          <Button variant="secondary" onClick={close.cancel}>
            {CLOSE_COPY.cancel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-body text-ink">{CLOSE_COPY.intro}</p>
        {close.flavours.map((f) => (
          <OwnerField
            key={f.id}
            label={`${f.name} left (the till says ${f.onTable})`}
            inputMode="numeric"
            value={left[f.id] ?? ''}
            onChange={(event) => setLeft((now) => ({ ...now, [f.id]: event.target.value }))}
          />
        ))}
        <OwnerField
          label={CLOSE_COPY.cash}
          inputMode="decimal"
          value={cash}
          onChange={(event) => setCash(event.target.value)}
        />
        {error ? (
          <span role="alert" className="text-caption text-danger">
            {error}
          </span>
        ) : null}
      </div>
    </Sheet>
  );
}
