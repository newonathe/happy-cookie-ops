import { expect, type Page } from '@playwright/test';
import { fixtureTime } from '../fixtures/route-cases';
import type { SaleEvidence } from '../fixtures/acceptance';
import demoState from '../fixtures/g0-demo-state.json';

// Existing prototype bridge; only tests use this to select explicit layout/prerequisites.
declare global {
  interface Window {
    __hcOps?: {
      state: { screen: string; orders: Array<{ id: string }>; [key: string]: unknown };
      setState(state: Record<string, unknown>, callback?: () => void): void;
      go(screen: string): void;
    };
  }
}
export async function initializeFixture(page: Page, mode: 'demo' | 'offline' = 'demo'): Promise<void> {
  await waitForHydration(page);
  await page.clock.setFixedTime(fixtureTime);
  await page.evaluate(({ now, state, mode }) => new Promise<void>((resolve) => {
    const engine = window.__hcOps;
    if (!engine) throw new Error('Engine not hydrated');
    engine.setState(mode === 'offline' ? { now } : { ...state, now, screen: engine.state.screen }, resolve);
  }), { now: fixtureTime.getTime(), state: demoState, mode });
}
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__hcOps));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
export async function selectPrerequisites(page: Page, path: string): Promise<void> {
  await page.evaluate((path) => new Promise<void>((resolve) => {
    const engine = window.__hcOps;
    if (!engine) throw new Error('Engine not hydrated');
    const selected = engine.state.orders[0];
    if (!selected) throw new Error('Missing deterministic order fixture');
    const state: Record<string, unknown> = {};
    if (path === '/order' || path === '/status') state.orderId = selected.id;
    if (path === '/batch') state.batch = { pid: 'dcf', target: 6, actual: 6, step: 1, note: '', adj: {}, rejects: 0 };
    if (path === '/stocktake') state.stocktake = { i: 0, counts: {}, items: ['Unsalted butter'] };
    engine.setState(state, resolve);
  }), path);
}
export async function selectVisualFixture(page: Page, path: string, device = 'mobile'): Promise<void> {
  await waitForHydration(page);
  await selectPrerequisites(page, path);
  await page.evaluate(({ path, device }) => {
    const engine = window.__hcOps;
    if (!engine) throw new Error('Engine not hydrated');
    engine.setState({ device });
    engine.go(path === '/' ? 'today' : path.slice(1));
  }, { path, device });
}
export async function readSales(page: Page): Promise<SaleEvidence[]> {
  const data: unknown = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('hc-ops', 1);
    open.onupgradeneeded = () => { open.transaction?.abort(); reject(new Error('Sale queue absent; read must not create it')); };
    open.onerror = () => reject(new Error('Cannot open sale queue'));
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('sale-queue')) { db.close(); reject(new Error('Sale queue missing')); return; }
      const tx = db.transaction('sale-queue', 'readonly');
      const request = tx.objectStore('sale-queue').getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(new Error('Queue read aborted')); };
    };
  }));
  if (!Array.isArray(data)) throw new Error('Queue is not an array');
  return data.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid queue row');
    const { clientId, saleId, total, items, state } = row as Record<string, unknown>;
    if (typeof clientId !== 'string' || typeof saleId !== 'string' || typeof total !== 'number' || typeof state !== 'string' || !items || typeof items !== 'object') throw new Error('Invalid queue fields');
    const quantities: Record<string, number> = {};
    for (const [key, value] of Object.entries(items)) { if (typeof value !== 'number') throw new Error('Invalid quantity'); quantities[key] = value; }
    return { clientId, saleId, total, items: quantities, state };
  });
}
export async function requireScreen(page: Page, label: string): Promise<void> {
  await expect(page.locator(`[data-screen-label="${label}"]`)).toBeVisible();
}
