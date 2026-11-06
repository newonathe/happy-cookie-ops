// The real owner app with fake data and no network: `pnpm preview:owner`, then http://localhost:4186/
const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const repo = process.env.REPO;
const req = createRequire(repo + '/package.json');
const viteReq = createRequire(req.resolve('vitest/package.json'));
(async () => {
  const vite = await import(pathToFileURL(viteReq.resolve('vite')).href);
  const react = await import(pathToFileURL(req.resolve('@vitejs/plugin-react')).href);
  const tailwind = req('@tailwindcss/postcss');
  const createServer = vite.createServer ?? vite.default.createServer;
  const server = await createServer({
    root: __dirname,
    configFile: false,
    publicDir: repo + '/public',
    plugins: [(react.default ?? react)()],
    resolve: {
      alias: {
        '@': repo + '/src',
        react: repo + '/node_modules/react',
        'react-dom': repo + '/node_modules/react-dom'
      }
    },
    css: { postcss: { plugins: [tailwind({ base: repo })] } },
    define: {
      'process.env': JSON.stringify({
        NODE_ENV: 'development',
        NEXT_PUBLIC_APP_MODE: 'live',
        NEXT_PUBLIC_HARNESS: '0'
      })
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.PREVIEW_PORT ?? 4186),
      strictPort: true,
      fs: { allow: [repo, __dirname] }
    }
  });
  await server.listen();
  process.stdout.write(
    'Local QA of real app components with synthetic RPC only: http://localhost:4186/\n'
  );
})().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
