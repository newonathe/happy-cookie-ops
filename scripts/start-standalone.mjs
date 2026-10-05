import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, '.next/standalone');
if (!existsSync(join(output, 'server.js')))
  throw new Error('Run pnpm build before starting the standalone server.');
// Next deliberately leaves static assets outside standalone; Docker copies the same two trees.
cpSync(join(root, 'public'), join(output, 'public'), { recursive: true });
cpSync(join(root, '.next/static'), join(output, '.next/static'), { recursive: true });
const index = process.argv.indexOf('--port');
const port = index >= 0 ? process.argv[index + 1] : (process.env.PORT ?? '3000');
if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('Invalid local server port');
process.env.PORT = port;
process.env.HOSTNAME = 'localhost';
await import(new URL('../.next/standalone/server.js', import.meta.url));
