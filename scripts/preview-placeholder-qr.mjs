// Replaces the payment QR images in the built static export with "test preview, do not pay"
// placeholders, so a hosted preview never shows a working payment code. Touches only the
// build output (build/pages-spike/public/assets), never the source images in public/.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'build', 'pages-spike', 'public', 'assets');
const targets = (await readdir(assets)).filter((name) => /^qr-.*\.png$/.test(name));
if (!targets.length) throw new Error(`No qr-*.png files in ${assets}; build the export first.`);

function pngSize(buffer) {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('Not a PNG file.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true });
try {
  const result = [];
  for (const name of targets) {
    const file = path.join(assets, name);
    const { width, height } = pngSize(await readFile(file));
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;
      width:${width}px;height:${height}px;background:#fff;font-family:system-ui,sans-serif;text-align:center">
      <div style="border:8px dashed #c0392b;padding:40px;color:#c0392b">
        <div style="font-size:${Math.round(width / 9)}px;font-weight:800">TEST PREVIEW</div>
        <div style="font-size:${Math.round(width / 14)}px;font-weight:700;margin-top:16px">DO NOT PAY</div>
        <div style="font-size:${Math.round(width / 28)}px;margin-top:24px;color:#555">No real payment account</div>
      </div></body></html>`);
    const png = await page.screenshot({ type: 'png' });
    await page.close();
    await writeFile(file, png);
    result.push({ file: `assets/${name}`, sha256: createHash('sha256').update(png).digest('hex') });
  }
  console.log(JSON.stringify({ replaced: result }, null, 2));
} finally {
  await browser.close();
}
