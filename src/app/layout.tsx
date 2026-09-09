import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import './globals.css';

const onest = Onest({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'The Happy Cookie Ops',
  description: 'Production, ordering and bookkeeping for The Happy Cookie.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Happy Cookie Ops',
  appleWebApp: { capable: true, title: 'Happy Cookie Ops', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: { icon: '/assets/mark-solid.png', apple: '/assets/mark-solid.png' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#F1EFEE'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={onest.variable}>
      <body>{children}</body>
    </html>
  );
}
