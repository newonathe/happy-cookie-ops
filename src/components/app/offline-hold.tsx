'use client';

/**
 * What the live gate shows instead of a screen it will not open (slice A2). Three cases, each
 * one sentence of what happened, what is safe, and one button.
 *
 *   elsewhere  Bazaar Mode is open without signal and she moved to another screen or sheet.
 *   waiting    The sign-in could not be checked and this phone may not open offline.
 *   signin     She is signed out and the sign-in page cannot be reached yet.
 */
export type HoldKind = 'elsewhere' | 'waiting' | 'signin';

export const HOLD_COPY: Record<HoldKind, { title: string; body: string; action: string }> = {
  elsewhere: {
    title: 'Only Bazaar Mode works without signal',
    body: 'This phone could not check your sign-in. Selling still works and every sale is kept on this phone. The rest opens when the signal is back.',
    action: 'Back to Bazaar Mode'
  },
  waiting: {
    title: 'No signal',
    body: 'This phone could not check your sign-in, so the app stays closed for now. Sales already recorded are kept on this phone. It opens by itself when the signal is back.',
    action: 'Try again'
  },
  signin: {
    title: 'Sign in when you have signal',
    body: 'You are signed out on this phone. Sales already recorded are kept on this phone and are sent after you sign in.',
    action: 'Go to sign-in'
  }
};

export function OfflineHold({ kind, onAction }: { kind: HoldKind; onAction: () => void }) {
  const copy = HOLD_COPY[kind];
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'var(--color-app)'
      }}
    >
      <div
        role="status"
        data-hold={kind}
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          alignItems: 'flex-start',
          padding: '22px',
          borderRadius: '18px',
          border: '1px solid var(--color-line)',
          background: 'var(--color-surface)'
        }}
      >
        <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-ink)' }}>
          {copy.title}
        </span>
        <p
          style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--color-ink-soft)' }}
        >
          {copy.body}
        </p>
        <button
          type="button"
          onClick={onAction}
          style={{
            height: '44px',
            marginTop: '4px',
            padding: '0 16px',
            borderRadius: '12px',
            border: 'none',
            background: 'var(--color-ink)',
            color: 'var(--color-cust-bg)',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          {copy.action}
        </button>
      </div>
    </main>
  );
}
