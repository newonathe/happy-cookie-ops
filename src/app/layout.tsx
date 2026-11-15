import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './fonts/onest.css';
import './globals.css';

// Onest is bundled in ./fonts (see its README) so a build never downloads it. This is the
// Latin subset, preloaded; ./fonts/onest.css declares the other subsets and the fallback
// and assembles them into --font-onest, which globals.css reads.
const onest = localFont({
  src: './fonts/onest-latin.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-onest-latin',
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
    }
  ]
});

// Owner-area display and figure faces (espresso glass, Ethan 16 Nov 2026), bundled like Onest (OFL, see ./fonts).
const baloo = localFont({
  src: [{ path: './fonts/baloo-2-latin-600-normal.woff2', weight: '600', style: 'normal' }],
  display: 'swap',
  // Not preloaded: only owner page titles use it, and the customer pages must not pay for it (performance budget).
  preload: false,
  variable: '--font-baloo',
  adjustFontFallback: false
});
const jbMono = localFont({
  src: [
    { path: './fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/jetbrains-mono-latin-600-normal.woff2', weight: '600', style: 'normal' }
  ],
  display: 'swap',
  // Not preloaded, for the same reason: fetched only where a figure uses it.
  preload: false,
  variable: '--font-jbmono',
  adjustFontFallback: false
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
    <html lang="en" className={`${onest.variable} ${baloo.variable} ${jbMono.variable}`}>
      {/* Extensions add attributes to this otherwise attribute-free wrapper before hydration.
          Limit compatibility to this element; child hydration checks remain enabled. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
