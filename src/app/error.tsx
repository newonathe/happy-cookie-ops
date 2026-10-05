'use client';

import { useEffect } from 'react';

/** Last resort: the tree itself failed to mount. */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '40px 20px',
        textAlign: 'center',
        background: '#F1EFEE'
      }}
    >
      <span style={{ fontSize: '18px', fontWeight: 600, color: '#3A1F14' }}>
        The app could not start
      </span>
      <p
        style={{
          margin: 0,
          maxWidth: '34ch',
          fontSize: '14px',
          lineHeight: 1.55,
          color: '#6E574B'
        }}
      >
        Your saved orders and takings are untouched. Try again, and if it keeps happening, export
        your books from Settings before clearing anything.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: '4px',
          height: '44px',
          padding: '0 18px',
          borderRadius: '12px',
          border: 'none',
          background: '#3A1F14',
          color: '#FFF5E5',
          fontSize: '13px',
          fontWeight: 600
        }}
      >
        Try again
      </button>
    </main>
  );
}
