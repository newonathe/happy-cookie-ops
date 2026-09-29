import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { ScreenKey } from '@/lib/screens';

export type { ScreenKey };
export type Role = 'owner' | 'helper' | 'support';

/** Owner-editable defaults the prototype exposed as props. */
export interface OpsEngineProps {
  boxPricing?: string;
  packagingFee?: number;
  flatBoxPrice?: number;
  capacity?: number;
  showFlowStrip?: boolean;
  children?: React.ReactNode;
}

/** One sale taken at a bazaar. Written on the device before it is sent. */
export interface EventSale {
  id: string;
  items: Record<string, number>;
  total: number;
  gross: number;
  discount: number;
  pay: string;
  ref: string;
  clerk: string;
  at: number;
  tendered: number;
  change: number;
  synced: boolean;
  failed: boolean;
  ledgerId: string | null;
}

/**
 * The engine's state. The keys the app itself reads are typed; the rest of the
 * prototype's state (84 keys of books, stock and drafts) stays behind the index
 * signature until it is moved to Postgres — see docs/TECH-DEBT.md.
 */
export interface OpsEngineState {
  screen: ScreenKey;
  role: Role;
  orderId: string | null;
  online: boolean;
  sales: EventSale[];
  unsynced: number;
  syncState: 'syncing' | 'partial' | 'synced' | null;
  syncTried: boolean;
  event: { id?: string; name?: string; stage?: string } | null;
  restored?: boolean;
  [key: string]: unknown;
}

export declare class OpsEngine extends React.Component<OpsEngineProps, OpsEngineState> {
  renderVals(): OpsVals;
  /** Runs once the saved books are restored after mount; subclasses call super. */
  afterRestore(): void;
  toast(message: string, tone?: 'ok' | 'warn', undo?: unknown): void;
  go(screen: ScreenKey, opts?: { orderId?: string; replace?: boolean }): void;
  setRole(role: Role): void;
  syncNow: () => void;
  retrySale: (id: string) => void;
  toggleOnline: () => void;
  /** Debounced write of `this.state` (minus EPHEMERAL) to storage. An instance field, not a prototype method. */
  persist: (flushNow?: boolean) => void;
  /** Clears storage and returns to BASE_STATE(). An instance field, not a prototype method. */
  resetData: () => void;
  pnlTotals(state: OpsEngineState): { profit: number };
  /** The engine's animated number (a React element). An instance field. */
  num: (value: number, prefix?: string, suffix?: string) => React.ReactNode;
  /** The engine's settings actions, all instance fields. Each writes `state.cfg`. */
  setCfg: (key: string, value: unknown) => void;
  bumpCfg: (key: string, delta: number, min: number, max: number) => void;
  numCfg: (key: string, value: unknown, min: number, max: number) => void;
  publishPriceMode: () => void;
  extendDrop: () => void;
  closeDrop: () => void;
  /** Expense-category actions (instance fields). They write `state.categories`/`inactiveCats`. */
  addCategory: (name: string) => void;
  renameCategory: (old: string, next: string) => void;
  toggleCategory: (name: string) => void;
  /** Takes a flavour off the order form or puts it back (`state.dropActive`). An instance field. */
  toggleDropProduct: (pid: string) => void;
  /** A flavour's price now: an order's own `priced`, then `state.prices`, then the flavour's. An instance field. */
  priceOf: (pid: string, priced?: Record<string, number>) => number;
  /** Sets a flavour's price for new orders (`state.prices`) and closes the sheet. An instance field. */
  setPrice: (pid: string, value: unknown) => void;
  /** Opens the bottom sheet (`state.sheet`); an unrecognised `kind` renders no ported body. An instance field. */
  sheet: (kind: string, data?: Record<string, unknown>) => void;
  /** Closes the bottom sheet (`state.sheet = null`). An instance field. */
  closeSheet: () => void;
  /** Customer checkout actions (B2): instance fields the live runtime replaces. */
  custSubmit: () => void;
  custRestart: () => void;
  custReorder: () => void;
  custSet: (key: string, value: unknown) => void;
  /** SVG path data keyed by icon name. An instance field. */
  IC: Record<string, string>;
}

export declare class OpsProvider extends OpsEngine {}

export const OpsContext: React.Context<OpsVals | null>;
export const OpsEngineContext: React.Context<OpsEngine | null>;

export const SCREENS: ScreenKey[];
export const CUSTOMER_SCREENS: ScreenKey[];
export const SCREEN_NAMES: Record<string, string>;
export const PRODUCTS: Array<{
  id: string;
  name: string;
  short: string;
  price: number;
  img: string;
  kind: string;
  tag: string;
  desc: string;
}>;
export type EngineFlavour = (typeof PRODUCTS)[number];
/** Flavour id → "milk, eggs, …", shown as "Contains …" on the shop. */
export const ALLERGENS: Record<string, string>;
/**
 * MP-09 c engine exception: replaces PRODUCTS, P, SEED_PRICES and ALLERGENS in place with
 * the flavour list loaded from the database (docs/state/protected-exception.md).
 */
export function replaceFlavours(list: EngineFlavour[], allergens: Record<string, string>): void;
/**
 * MP-09 c2 engine exception: replaces PAY_ACCOUNTS in place with the payment methods loaded from
 * the database (docs/state/protected-exception.md).
 */
export function replacePayAccounts(
  list: Array<{ id: string; num: string; name: string; qr: string }>
): void;
export const DEFAULT_CFG: Record<string, unknown>;
export const RECIPES: Record<
  string,
  { yield: number; ingredients: Array<{ name: string; qty: number; unit: string }> }
>;
export const INVENTORY: Array<Record<string, unknown>>;
export const SUPPLIERS: Array<Record<string, unknown>>;
export const PACK_SIZE: Record<string, number>;
export const ROLES: Record<
  Role,
  {
    /** The person's name as the app addresses them — 'Cine' for the owner. */
    label: string;
    /** The attribution line: 'Cine To · owner'. */
    who: string;
    /** Whether this role may see money at all. The P&L and payments gate on it. */
    money: boolean;
    /** Whether they may run the bazaar cash-up. */
    cashup: boolean;
    /** Where they land on sign-in. */
    home: string;
    /** null means every screen; otherwise the allowlist. */
    screens: string[] | null;
    /** null means the full All-tools list; otherwise the allowlist. */
    more: string[] | null;
    sub: string;
    note: string;
  }
>;
export const PAY_ACCOUNTS: Array<{ id: string; num: string; name: string; qr: string }>;
export const RAW_ORDERS: Array<Record<string, unknown>>;
export const SEED_LEDGER: Array<Record<string, unknown>>;
export const STORE_KEY: string;
/** State keys that are prototype chrome, not her books — never restored from an old save. */
export const EPHEMERAL: string[];

export function PESO(n: number): string;
export function PESO2(n: number): string;
export function amt(n: number, unit: string): string;
export function amtExact(n: number, unit: string): string;
export function plural(n: number, one: string, many: string): string;
/**
 * The ordering week containing `now`. All timestamps are epoch ms:
 *   open      the order window opens
 *   close     it closes (plus cfg.extendH if the owner extended it)
 *   nextOpen  open + 7 days
 *   mon       pickup - the first Monday after close, 9am
 *   sat, sun  the weekend windows inside the cycle
 * These are NOT in chronological order: sat precedes mon.
 */
export function dropCycle(
  now: number,
  cfg: Record<string, unknown>
): { open: number; close: number; nextOpen: number; mon: number; sat: number; sun: number };
export function orderCount(order: { items: Record<string, number> }): number;
export function loadState(): OpsEngineState;
export function BASE_STATE(): OpsEngineState;
