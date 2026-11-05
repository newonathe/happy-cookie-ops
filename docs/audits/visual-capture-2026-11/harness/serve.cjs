// Audit capture server: builds the REAL application shell (OpsApp, LiveGate, RouteSync, OfflineBridge)
// against a simulated server and serves it on 127.0.0.1 only. Synthetic data; no hosted URL or key exists here.
// Usage: node docs/audits/visual-capture-2026-11/harness/serve.cjs [--no-build]
const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const repo = path.resolve(__dirname, '../../../..').replace(/\\/g, '/');
const here = __dirname.replace(/\\/g, '/');
const req = createRequire(repo + '/package.json');
const viteReq = createRequire(req.resolve('vitest/package.json'));
const port = Number(process.env.CAPTURE_PORT ?? 4196);
const outDir = process.env.CAPTURE_OUT ?? repo + '/build/visual-capture-site';
(async () => {
  const vite = await import(pathToFileURL(viteReq.resolve('vite')).href);
  const reactPlugin = await import(pathToFileURL(req.resolve('@vitejs/plugin-react')).href);
  const tailwind = req('@tailwindcss/postcss');
  const config = {
    root: here,
    configFile: false,
    publicDir: repo + '/public',
    logLevel: 'warn',
    plugins: [(reactPlugin.default ?? reactPlugin)()],
    resolve: {
      alias: [
        { find: '@/lib/supabase/client', replacement: here + '/fake-supabase.js' },
        { find: 'next/navigation', replacement: here + '/next-navigation-shim.js' },
        { find: /^@\//, replacement: repo + '/src/' },
        { find: /^react-dom(.*)$/, replacement: repo + '/node_modules/react-dom$1' },
        { find: /^react(\/.*)?$/, replacement: repo + '/node_modules/react$1' }
      ]
    },
    css: { postcss: { plugins: [tailwind({ base: repo })] } },
    define: {
      'process.env': JSON.stringify({
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_MODE: 'live',
        NEXT_PUBLIC_HARNESS: '0',
        NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-audit.invalid',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-not-a-key'
      })
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      minify: false,
      chunkSizeWarningLimit: 100000
    },
    preview: { host: '127.0.0.1', port, strictPort: true },
    server: { fs: { allow: [repo] } }
  };
  if (!process.argv.includes('--no-build')) await (vite.build ?? vite.default.build)(config);
  if (process.argv.includes('--build-only')) return;
  await (vite.preview ?? vite.default.preview)(config);
  process.stdout.write(`Audit capture server (synthetic data only): http://127.0.0.1:${port}/\n`);
})().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
