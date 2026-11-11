'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { returnPathFromSearch } from '@/lib/auth/return-path';
import { clearIdleSpent } from '@/lib/auth/offline-trust';
import { clearStaffName } from '@/lib/auth/staff-name';

/**
 * Staff sign-in. Styled from the prototype's own control vocabulary — the same 44px
 * controls, the same ink and brand values — because the owner sees this screen more
 * often than any customer sees the shop.
 */
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [help, setHelp] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password
    });
    setBusy(false);
    if (signInError) {
      setError('That email and password do not match an account.');
      return;
    }
    // A2: a session just signed in cannot have spent its idle time.
    clearIdleSpent();
    // B2: nor is it the person this phone last remembered. Their name is read from the profile.
    clearStaffName();
    // Read at submit, not render: useSearchParams() would suspend the prerender and leave the
    // static page empty until the JavaScript ran (T-18: LCP 6.2 s on the phone profile).
    router.replace(returnPathFromSearch(new URLSearchParams(window.location.search)));
  }

  const field: React.CSSProperties = {
    height: '44px',
    padding: '0 12px',
    borderRadius: '12px',
    border: '1px solid var(--color-owner-line)',
    background: 'var(--color-surface)',
    fontSize: '15px',
    color: 'var(--color-owner-ink)',
    width: '100%'
  };

  const linkButton: React.CSSProperties = {
    minHeight: '32px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    fontSize: '12.5px',
    fontWeight: 600,
    color: 'var(--color-brand)',
    cursor: 'pointer'
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'var(--color-owner-app)'
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '22px',
          borderRadius: '18px',
          border: '1px solid var(--color-owner-line)',
          background: 'var(--color-surface)'
        }}
      >
        <img
          src="/assets/logo-full.png"
          alt="The Happy Cookie"
          style={{ height: '40px', width: 'auto', alignSelf: 'flex-start' }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--color-owner-ink)'
            }}
          >
            Sign in
          </h1>
          <span style={{ fontSize: '12.5px', color: 'var(--color-owner-muted)' }}>
            Private access is verified. Sign in to your workspace.
          </span>
        </span>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-owner-muted)'
          }}
        >
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={field}
          />
        </label>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-owner-muted)'
          }}
        >
          Password
          <input
            type={shown ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={field}
          />
        </label>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
          <button type="button" onClick={() => setShown((now) => !now)} style={linkButton}>
            {shown ? 'Hide password' : 'Show password'}
          </button>
          <button type="button" onClick={() => setHelp((now) => !now)} style={linkButton}>
            Account help
          </button>
        </span>
        {help ? (
          <span style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-owner-muted)' }}>
            Use the email approved by the owner. If you cannot sign in, ask the owner to check your
            access or reset your password.
          </span>
        ) : null}
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
            marginTop: '4px',
            borderRadius: '12px',
            border: 'none',
            background: busy ? 'var(--color-owner-muted)' : 'var(--color-brand)',
            color: 'var(--color-surface)',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
