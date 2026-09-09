import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  // The books live on the device until Postgres is wired (docs/TECH-DEBT.md, item 1),
  // so nothing in this app may be cached by a shared proxy.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }
    ];
  }
};

/**
 * Sentry wraps the config to upload source maps at build time — without them a
 * production stack trace is minified line numbers and useless.
 *
 * `tunnelRoute` proxies reports through this app's own origin so an ad blocker on the
 * owner's phone cannot silently swallow them, which is a real failure mode: you conclude
 * there are no errors because none arrive.
 */
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  // The source maps are uploaded to Sentry; shipping them to the browser as well would
  // hand the whole codebase to anyone who opens dev tools.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  webpack: { treeshake: { removeDebugLogging: true } }
});
