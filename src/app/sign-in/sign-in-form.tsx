'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { returnPathFromSearch } from '@/lib/auth/return-path';
import { clearIdleSpent } from '@/lib/auth/offline-trust';

/**
 * Staff sign-in. Styled from the prototype's own control vocabulary — the same 44px
 * controls, the same ink and brand values — because the owner sees this screen more
 * often than any customer sees the shop.
 */
export function SignInForm() {
  const router = useRouter();
  const next = returnPathFromSearch(useSearchParams());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    router.replace(next);
  }

  const field: React.CSSProperties = {
    height: '44px',
    padding: '0 12px',
    borderRadius: '12px',
    border: '1px solid #E7E1DC',
    background: '#FFFFFF',
    fontSize: '15px',
    color: '#3A1F14',
    width: '100%'
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#F1EFEE'
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
          border: '1px solid #EDE8E4',
          background: '#FFFFFF'
        }}
      >
        <img
          src="/assets/logo-full.png"
          alt="The Happy Cookie"
          style={{ height: '40px', width: 'auto', alignSelf: 'flex-start' }}
        />
        <span style={{ fontSize: '17px', fontWeight: 600, color: '#3A1F14' }}>Sign in</span>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#6E574B'
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
            color: '#6E574B'
          }}
        >
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={field}
          />
        </label>
        {error ? (
          <span role="alert" style={{ fontSize: '12.5px', color: '#A8231B' }}>
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
            background: busy ? '#6E574B' : '#3A1F14',
            color: '#FFF5E5',
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
