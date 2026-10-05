'use client';

import { useEffect, useRef, useState } from 'react';
import { isLiveMode } from '@/lib/config/app-mode';
import { queuedBeforeSignOut, type LocalSale } from '@/lib/auth/sign-out-guard';

export const SIGN_OUT_COPY = {
  button: 'Sign out',
  title: 'Sales are still on this phone',
  confirmTitle: 'Sign out?',
  emptyBody: 'Nothing is waiting to be sent from this phone.',
  body: (n: number) =>
    `${n} ${n === 1 ? 'sale or change is' : 'sales and changes are'} not sent to the server yet. Send ${n === 1 ? 'it' : 'them'} now, or sign out and ${n === 1 ? 'it stays' : 'they stay'} on this phone until you sign in again.`,
  unknownBody:
    'This phone could not check for unsent sales, so some may still be on it. Send now, or sign out and they stay on this phone until you sign in again.',
  offline:
    'This phone cannot reach the server right now, so you will not be able to sign back in until the signal is back.',
  eventOpen:
    'An event is open on this phone. Once you sign out, this phone cannot open Bazaar Mode without signal until you sign in again.',
  tried: 'Not everything could be sent yet.',
  send: 'Send now',
  sending: 'Sending…',
  anyway: 'Sign out anyway',
  confirm: 'Yes, sign out',
  cancel: 'Keep selling'
} as const;

type Stage = 'idle' | 'checking' | 'confirm' | 'warning' | 'sending' | 'leaving';

/**
 * The live app's one deliberate sign-out (slice A3, N3). It always asks first, so a stray tap
 * costs nothing. With sales still on the phone it says how many and offers "Send now" and
 * "Sign out anyway". It never blocks a sign-out and never touches the queue: only `flush` (the
 * runtime's own send) can change it, and a sign-out never calls it. The sign-out itself is
 * `onSignOut`, the live gate's own lock-out (the frame is hidden at once, a hung network call
 * cannot leave the app open, and the no-signal case shows the gate's notice instead of
 * redirecting to a sign-in page that may not load). The automatic paths are the gate's too.
 *
 * "Keep selling" cancels for good: a count or a send that finishes afterwards does nothing, so
 * a late send can never sign the phone out in the middle of a sale.
 *
 * `local` is read when the person taps, so a sale that exists only on screen is counted.
 */
export function SignOutControl({
  flush,
  onSignOut,
  local,
  offline,
  eventOpen
}: {
  flush: () => Promise<unknown>;
  onSignOut: () => void;
  local: () => readonly LocalSale[];
  offline: boolean;
  eventOpen: () => boolean;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [stall, setStall] = useState(false);
  const epoch = useRef(0);
  // A count or a send that is still out when this unmounts must not sign anyone out afterwards.
  useEffect(
    () => () => {
      epoch.current += 1;
    },
    []
  );
  if (!isLiveMode()) return null;

  function leave() {
    epoch.current += 1;
    setStage('leaving');
    onSignOut();
  }

  async function begin() {
    const mine = ++epoch.current;
    setStage('checking');
    setTried(false);
    // Read when she taps, not from `navigator.onLine`: dead stall Wi-Fi reports online.
    setStall(eventOpen());
    const held = await queuedBeforeSignOut(local());
    if (epoch.current !== mine) return;
    setCount(held);
    setStage(held === 0 ? 'confirm' : 'warning');
  }

  async function sendNow() {
    const mine = epoch.current;
    setStage('sending');
    try {
      await flush();
    } catch {
      // The rows stay queued; the warning below shows what is left.
    }
    if (epoch.current !== mine) return;
    const left = await queuedBeforeSignOut(local());
    if (epoch.current !== mine) return;
    if (left === 0) return leave();
    setCount(left);
    setTried(true);
    setStage('warning');
  }

  function keepSelling() {
    epoch.current += 1;
    setStage('idle');
  }

  const open = stage === 'confirm' || stage === 'warning' || stage === 'sending';
  const button = (primary: boolean): React.CSSProperties => ({
    minHeight: '44px',
    padding: '0 16px',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    border: primary ? 'none' : '1px solid var(--color-line-strong)',
    background: primary ? 'var(--color-brand)' : 'var(--color-surface)',
    color: primary ? 'var(--color-surface)' : 'var(--color-ink)'
  });
  const body =
    stage === 'confirm'
      ? SIGN_OUT_COPY.emptyBody
      : count === null
        ? SIGN_OUT_COPY.unknownBody
        : SIGN_OUT_COPY.body(count);

  return (
    <>
      <button
        type="button"
        onClick={() => void begin()}
        disabled={stage !== 'idle'}
        style={{
          position: 'fixed',
          left: '12px',
          bottom: 'calc(env(safe-area-inset-bottom) + 84px)',
          zIndex: 40,
          minHeight: '32px',
          padding: '0 12px',
          borderRadius: '16px',
          fontSize: '12px',
          fontWeight: 600,
          border: '1px solid var(--color-line-strong)',
          background: 'var(--color-surface)',
          color: 'var(--color-ink-soft)',
          cursor: 'pointer'
        }}
      >
        {SIGN_OUT_COPY.button}
      </button>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: 'color-mix(in srgb, var(--color-ink) 45%, transparent)'
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sign-out-title"
            style={{
              width: '100%',
              maxWidth: '360px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '22px',
              borderRadius: '18px',
              border: '1px solid var(--color-line)',
              background: 'var(--color-surface)'
            }}
          >
            <span
              id="sign-out-title"
              style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-ink)' }}
            >
              {stage === 'confirm' ? SIGN_OUT_COPY.confirmTitle : SIGN_OUT_COPY.title}
            </span>
            <span style={{ fontSize: '14px', lineHeight: 1.45, color: 'var(--color-ink-soft)' }}>
              {body}
            </span>
            {tried && (
              <span style={{ fontSize: '13px', color: 'var(--color-warn)' }}>
                {SIGN_OUT_COPY.tried}
              </span>
            )}
            {offline && (
              <span style={{ fontSize: '13px', color: 'var(--color-warn)' }}>
                {SIGN_OUT_COPY.offline}
              </span>
            )}
            {stall && (
              <span style={{ fontSize: '13px', color: 'var(--color-warn)' }}>
                {SIGN_OUT_COPY.eventOpen}
              </span>
            )}
            {stage === 'confirm' ? (
              <button type="button" onClick={leave} style={button(false)}>
                {SIGN_OUT_COPY.confirm}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void sendNow()}
                  disabled={stage === 'sending'}
                  style={button(true)}
                >
                  {stage === 'sending' ? SIGN_OUT_COPY.sending : SIGN_OUT_COPY.send}
                </button>
                <button type="button" onClick={leave} style={button(false)}>
                  {SIGN_OUT_COPY.anyway}
                </button>
              </>
            )}
            <button type="button" onClick={keepSelling} style={{ ...button(true), border: 'none' }}>
              {SIGN_OUT_COPY.cancel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
