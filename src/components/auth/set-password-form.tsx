'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * S3: the first sign-in of a helper whose account was made with a temporary password. Nothing else opens until they choose their
 * own. The flag is cleared in the same update that sets the password (user metadata `must_change_password`), so a later sign-in
 * goes straight in. It is a convenience for the person, not a security boundary: the temporary password was given by the owner.
 */
export const SET_PASSWORD_COPY = {
  title: 'Choose your own password',
  body: 'You signed in with a temporary password. Choose a password only you know. You will use it every time you sign in.',
  newLabel: 'New password',
  confirmLabel: 'New password again',
  save: 'Save password',
  saving: 'Saving…',
  signOut: 'Sign out',
  short: 'Use at least 10 characters.',
  mismatch: 'The two passwords are not the same.',
  same: 'Choose a password you have not used before.',
  failed: 'The password could not be saved. Check the signal and try again.'
} as const;

export const MIN_PASSWORD_LENGTH = 10;

type Updater = {
  auth: {
    updateUser: (attributes: {
      password: string;
      data: { must_change_password: boolean };
    }) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
};

export function SetPasswordForm({
  onChanged,
  onSignOut,
  client
}: {
  onChanged: () => void;
  onSignOut: () => void;
  /** Tests pass a fake; the page uses the browser client. */
  client?: Updater;
}) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(SET_PASSWORD_COPY.short);
    if (password !== again) return setError(SET_PASSWORD_COPY.mismatch);
    setBusy(true);
    let failure: { code?: string; message?: string } | null = null;
    try {
      const updater = client ?? (createClient() as unknown as Updater);
      const { error: updateError } = await updater.auth.updateUser({
        password,
        data: { must_change_password: false }
      });
      failure = updateError;
    } catch {
      failure = { message: 'network' };
    }
    setBusy(false);
    if (failure) {
      setError(
        failure.code === 'same_password' ? SET_PASSWORD_COPY.same : SET_PASSWORD_COPY.failed
      );
      return;
    }
    onChanged();
  }

  const field: React.CSSProperties = {
    height: '44px',
    padding: '0 12px',
    borderRadius: '12px',
    border: '1px solid var(--color-line)',
    background: 'var(--color-surface)',
    fontSize: '15px',
    color: 'var(--color-ink)',
    width: '100%'
  };
  const label: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-ink-soft)'
  };

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
      <form
        onSubmit={submit}
        data-hold="password"
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '22px',
          borderRadius: '18px',
          border: '1px solid var(--color-line)',
          background: 'var(--color-surface)'
        }}
      >
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--color-ink)' }}>
          {SET_PASSWORD_COPY.title}
        </h1>
        <p
          style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--color-ink-soft)' }}
        >
          {SET_PASSWORD_COPY.body}
        </p>
        <label style={label}>
          {SET_PASSWORD_COPY.newLabel}
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={field}
          />
        </label>
        <label style={label}>
          {SET_PASSWORD_COPY.confirmLabel}
          <input
            type="password"
            required
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            style={field}
          />
        </label>
        {error ? (
          <span role="alert" style={{ fontSize: '12.5px', color: 'var(--color-danger)' }}>
            {error}
          </span>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          style={{
            height: '44px',
            borderRadius: '12px',
            border: 'none',
            background: busy ? 'var(--color-ink-soft)' : 'var(--color-brand)',
            color: 'var(--color-surface)',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          {busy ? SET_PASSWORD_COPY.saving : SET_PASSWORD_COPY.save}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          style={{
            minHeight: '36px',
            border: 'none',
            background: 'transparent',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-brand)'
          }}
        >
          {SET_PASSWORD_COPY.signOut}
        </button>
      </form>
    </main>
  );
}
