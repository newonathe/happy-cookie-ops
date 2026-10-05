import Link from 'next/link';

export default function NotFound() {
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
        textAlign: 'center'
      }}
    >
      <span style={{ fontSize: '20px', fontWeight: 600 }}>That screen does not exist</span>
      <p
        style={{
          margin: 0,
          maxWidth: '320px',
          fontSize: '14px',
          lineHeight: 1.55,
          color: '#6E574B'
        }}
      >
        Check the link, or go back to the home screen.
      </p>
      <Link
        href="/"
        style={{
          marginTop: '4px',
          height: '44px',
          padding: '0 18px',
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: '12px',
          background: '#3A1F14',
          color: '#FFF5E5',
          fontSize: '13px',
          fontWeight: 600
        }}
      >
        Back to what you can do
      </Link>
    </main>
  );
}
