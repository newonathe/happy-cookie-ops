import { afterEach, expect, it, vi } from 'vitest';
import {
  readCountRecovery,
  writeCountRecovery,
  type CountRecovery
} from '@/lib/stock/count-recovery';

const scope = 'https://stock.example.test';
const pending: CountRecovery = {
  version: 1,
  scope,
  task: { i: 0, items: ['Flour'], counts: { Flour: '0' } },
  countedAt: { Flour: 1_790_000_000_000 },
  openItem: 'flour',
  pending: [
    {
      name: 'Flour',
      fields: {
        id: '00000000-0000-4000-8000-000000000001',
        itemId: 'flour',
        kind: 'count',
        qty: 0,
        costCents: null,
        supplier: '',
        reason: '',
        at: 1_790_000_000_000
      }
    }
  ]
};
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('survives a fresh read with zero, original physical time and exact retry identity intact', () => {
  expect(writeCountRecovery(scope, pending)).toBe(true);
  expect(readCountRecovery(scope)).toEqual({ status: 'stored', value: pending });
});

it('never exposes a different backend project copy', () => {
  writeCountRecovery(scope, pending);
  expect(readCountRecovery('https://another.example.test')).toEqual({
    status: 'empty',
    value: null
  });
  expect(writeCountRecovery('https://another.example.test', pending)).toBe(false);
});

it('rejects malformed copies, another movement kind, invalid quantities and oversized payloads', () => {
  const bad = [
    { ...pending, version: 2 },
    {
      ...pending,
      pending: [
        { ...pending.pending[0], fields: { ...pending.pending[0]!.fields, kind: 'receipt' } }
      ]
    },
    {
      ...pending,
      pending: [{ ...pending.pending[0], fields: { ...pending.pending[0]!.fields, qty: -1 } }]
    },
    { ...pending, task: { ...pending.task, i: 4 } },
    { ...pending, task: { ...pending.task, counts: { Flour: '1'.repeat(1_000_000) } } }
  ];
  for (const copy of bad) expect(writeCountRecovery(scope, copy as CountRecovery)).toBe(false);
  expect(readCountRecovery(scope)).toEqual({ status: 'empty', value: null });
});

it('keeps unconfirmed operations even when the editable task is absent', () => {
  const value = { ...pending, task: null };
  expect(writeCountRecovery(scope, value)).toBe(true);
  expect(readCountRecovery(scope)).toEqual({ status: 'stored', value });
});

it('reports storage denial instead of claiming a durable save', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(writeCountRecovery(scope, pending)).toBe(false);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readCountRecovery(scope)).toEqual({ status: 'unavailable', value: null });
});

it('removes only its own completed copy, leaving the sale queue and other projects untouched', () => {
  localStorage.setItem('hc-live-bazaar', 'keep');
  writeCountRecovery(scope, pending);
  writeCountRecovery('https://another.example.test', {
    ...pending,
    scope: 'https://another.example.test'
  });
  expect(writeCountRecovery(scope, null)).toBe(true);
  expect(readCountRecovery(scope).status).toBe('empty');
  expect(readCountRecovery('https://another.example.test').status).toBe('stored');
  expect(localStorage.getItem('hc-live-bazaar')).toBe('keep');
});
