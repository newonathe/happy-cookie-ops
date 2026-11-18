// Synthetic owner UI QA. Start with PREVIEW_PORT=4212 pnpm preview:owner.
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const out = path.resolve(process.argv[2] ?? 'C:/Users/ethan/dev/happy-cookie-flavour-removal-qa');
assert(!out.startsWith(path.resolve(__dirname, '../..') + path.sep), 'artifacts must stay outside the repo');
mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:4212';

async function screenshot(page, name, reduced) {
  const facts = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
  }));
  assert.equal(facts.reduced, reduced, `${name}: unexpected reduced-motion setting`);
  assert(facts.scrollWidth <= facts.width, `${name}: horizontal overflow ${facts.scrollWidth}/${facts.width}`);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function openFlavours(page) {
  await page.getByRole('button', { name: /^Make/ }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: /make settings/i }).waitFor();
  await page.getByRole('button', { name: /Menu & flavours/ }).click();
  await page.getByRole('heading', { name: 'Menu & flavours' }).waitFor();
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[390, 844], [1920, 1080]]) {
      for (const reduced of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route =>
          new URL(route.request().url()).origin === base ? route.continue() : route.abort()
        );
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.__hcOps?.go === 'function' && window.__hcOps.flavourSync?.current?.().length);

        const setup = await page.evaluate(async () => {
          const runtime = window.__hcOps;
          const original = runtime.flavourSync;
          const rpc = original.client.rpc.bind(original.client);
          const rows = original.current().map(row => ({ ...row, archived_at: row.archived_at ?? null }));
          const template = rows.find(row => row.id !== 'sampler') ?? rows[0];
          const probe = {
            ...template,
            id: 'qa-archive-probe',
            name: 'QA duplicate flavour',
            short_name: 'QA duplicate',
            updated_at: '2026-11-18T01:00:00.000Z',
            archived_at: null,
            active: true,
            published: true
          };
          const serverRows = [...rows, probe];
          const expected = serverRows.map(({ id, name, price_cents }) => ({ id, name, price_cents }));
          window.qaArchive = { serverRows, expected, failSamplerOnce: true, pendingArchive: null, writes: [] };
          const client = {
            rpc: async (name, args) => {
              const qa = window.qaArchive;
              if (name === 'get_flavours') return { data: qa.serverRows.map(row => ({ ...row })), error: null };
              if (name === 'archive_flavour' || name === 'restore_flavour') {
                const id = args?.p_id;
                const row = qa.serverRows.find(item => item.id === id);
                if (!row || row.updated_at !== args?.p_expected_updated_at) return { data: null, error: { code: 'P0002' } };
                if (name === 'archive_flavour' && id === 'qa-archive-probe' && qa.failSamplerOnce) {
                  qa.failSamplerOnce = false;
                  return { data: null, error: { code: '23514', message: 'sampler item cannot be archived' } };
                }
                return new Promise(resolve => { qa.pendingArchive = () => {
                  row.archived_at = name === 'archive_flavour' ? '2026-11-18T01:01:00.000Z' : null;
                  row.updated_at = name === 'archive_flavour' ? '2026-11-18T01:02:00.000Z' : '2026-11-18T01:03:00.000Z';
                  row.active = false;
                  row.published = false;
                  qa.writes.push({ name, id, stamp: args.p_expected_updated_at });
                  resolve({ data: [{ id: row.id, archived_at: row.archived_at, updated_at: row.updated_at }], error: null });
                }; });
              }
              return rpc(name, args);
            }
          };
          await runtime.loadFlavours(client);
          return { original: expected, probe: probe.id };
        });
        await page.evaluate(() => window.__hcOps.setState({ online: false }));
        await openFlavours(page);
        const remove = page.getByRole('button', { name: `Remove QA duplicate flavour` });
        assert.equal(await remove.isDisabled(), true, 'offline Remove remained enabled');
        await screenshot(page, `${width}-${reduced ? 'reduced' : 'motion'}-flavour-list`, reduced);
        await page.evaluate(() => window.__hcOps.setState({ online: true }));
        await page.waitForFunction(() => window.__hcOps.renderVals().liveForm?.online === true);
        await remove.click();
        const dialog = page.getByRole('alertdialog', { name: 'Remove QA duplicate flavour' });
        await dialog.waitFor();
        assert((await dialog.innerText()).includes('Existing orders, recipes and stock records stay saved'));
        await page.getByRole('button', { name: 'Remove flavour', exact: true }).click();
        await page.getByText(/Turn off the sampler box in Shop settings before removing this flavour\./).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Remove QA duplicate flavour' }).count(), 1, 'sampler refusal hid the choice');

        await page.getByRole('button', { name: 'Remove QA duplicate flavour' }).click();
        await page.getByRole('alertdialog', { name: 'Remove QA duplicate flavour' }).getByRole('button', { name: 'Remove flavour' }).click();
        await page.getByRole('button', { name: 'Removing…' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Keep flavour' }).isDisabled(), true, 'confirmation stayed actionable while pending');
        await page.evaluate(() => window.qaArchive.pendingArchive?.());
        await page.getByRole('heading', { name: 'Removed flavours' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Remove QA duplicate flavour' }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Restore QA duplicate flavour' }).count(), 1);
        await screenshot(page, `${width}-${reduced ? 'reduced' : 'motion'}-removed`, reduced);

        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await page.getByRole('heading', { name: /make settings/i }).waitFor();
        await page.getByRole('button', { name: /Products and prices/ }).click();
        await page.getByRole('heading', { name: 'Products', level: 1 }).waitFor();
        await page.getByRole('button', { name: /^All products/ }).click();
        assert.equal(await page.getByText('QA duplicate flavour', { exact: true }).count(), 0, 'archived choice appeared in All products');
        await screenshot(page, `${width}-${reduced ? 'reduced' : 'motion'}-all-products`, reduced);

        await openFlavours(page);
        await page.getByRole('button', { name: 'Restore QA duplicate flavour' }).click();
        const restoreDialog = page.getByRole('alertdialog', { name: 'Restore QA duplicate flavour' });
        await restoreDialog.waitFor();
        assert((await restoreDialog.innerText()).includes('off the order form and unpublished'));
        await restoreDialog.getByRole('button', { name: 'Restore flavour' }).click();
        await page.getByRole('button', { name: 'Restoring…' }).waitFor();
        await page.evaluate(() => window.qaArchive.pendingArchive?.());
        await page.waitForFunction(() => window.qaArchive.serverRows.find(row => row.id === 'qa-archive-probe')?.archived_at === null);
        await page.getByRole('button', { name: 'Remove QA duplicate flavour' }).waitFor();
        const after = await page.evaluate(() => ({
          expected: window.qaArchive.expected,
          current: window.__hcOps.flavourSync.current().map(({ id, name, price_cents }) => ({ id, name, price_cents })),
          state: window.qaArchive.serverRows.find(row => row.id === 'qa-archive-probe'),
          writes: window.qaArchive.writes
        }));
        assert.deepEqual(after.current, after.expected, 'internal catalogue ID/name/price tuples changed');
        assert.equal(after.state.active, false);
        assert.equal(after.state.published, false);
        assert.equal(after.writes.length, 2, 'expected only acknowledged archive and restore mutations');
        assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
        console.log(`PASS synthetic ${width}px/${reduced ? 'reduced' : 'normal'} motion: remove refusal, acknowledged archive/restore, retained catalogue`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
