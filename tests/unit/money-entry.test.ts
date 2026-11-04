import { describe, expect, it, vi } from 'vitest';
import { MoneyEntry, type MoneyEntryDeps } from '@/store/money-entry';

function entry(over: Partial<MoneyEntryDeps> = {}) {
  const deps = {
    categories: () => ['Ingredients', 'Transport'],
    today: () => '2026-11-04',
    earliest: () => '2026-10-05',
    online: () => true,
    recordExpense: vi.fn(async () => true),
    recordDraw: vi.fn(async () => true),
    rerender: vi.fn(),
    ...over
  };
  return { deps, desk: new MoneyEntry(deps) };
}

describe('Record expense', () => {
  it('is closed until opened, and starts on today and the first category', () => {
    const { desk } = entry();
    expect(desk.vals()).toBeNull();
    desk.open('expense');
    expect(desk.vals()).toMatchObject({
      kind: 'expense',
      step: 'entry',
      date: '2026-11-04',
      category: 'Ingredients'
    });
  });

  it('needs a description and an amount before review', () => {
    const { desk } = entry();
    desk.open('expense');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('entry');
    expect(desk.vals()?.error).toMatch(/amount/);
    desk.vals()?.setAmount('50');
    desk.vals()?.review();
    expect(desk.vals()?.error).toMatch(/what this expense was for/);
    desk.vals()?.setDescription('Parking');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('review');
  });

  it.each(['0', '-5', 'abc', '', '1000000.01', '1.234'])('refuses the amount %s', (amount) => {
    const { desk } = entry();
    desk.open('expense');
    desk.vals()?.setDescription('Parking');
    desk.vals()?.setAmount(amount);
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('entry');
  });

  it('refuses a date after today, and allows an earlier one', () => {
    const { desk } = entry();
    desk.open('expense');
    desk.vals()?.setDescription('Parking');
    desk.vals()?.setAmount('50');
    desk.vals()?.setDate('2026-11-05');
    desk.vals()?.review();
    expect(desk.vals()?.error).toMatch(/today or an earlier/);
    desk.vals()?.setDate('2026-10-04');
    desk.vals()?.review();
    expect(desk.vals()?.error).toMatch(/last 30 days/);
    desk.vals()?.setDate('2026-10-05');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('review');
  });

  it('saves once, with what was reviewed, and closes on the acknowledgement', async () => {
    const { desk, deps } = entry();
    desk.open('expense');
    desk.vals()?.setDescription(' Parking ');
    desk.vals()?.setAmount('50');
    desk.vals()?.setCategory('Transport');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(deps.recordExpense).toHaveBeenCalledTimes(1);
    expect(deps.recordExpense).toHaveBeenCalledWith({
      category: 'Transport',
      description: 'Parking',
      pesos: 50,
      date: '2026-11-04'
    });
    expect(desk.vals()).toBeNull();
  });

  it('stays open, with what was typed, when not acknowledged or when it throws', async () => {
    for (const recordExpense of [
      vi.fn(async () => false),
      vi.fn(() => Promise.reject(new Error('no')))
    ]) {
      const { desk } = entry({ recordExpense });
      desk.open('expense');
      desk.vals()?.setDescription('Parking');
      desk.vals()?.setAmount('50');
      desk.vals()?.review();
      await desk.vals()?.save();
      expect(desk.vals()?.amount).toBe('50');
      expect(desk.vals()?.saving).toBe(false);
      expect(desk.vals()?.error).toMatch(/not saved/);
    }
  });

  it('sends nothing offline', async () => {
    const { desk, deps } = entry({ online: () => false });
    desk.open('expense');
    desk.vals()?.setDescription('Parking');
    desk.vals()?.setAmount('50');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(deps.recordExpense).not.toHaveBeenCalled();
    expect(desk.vals()?.error).toMatch(/signal/);
  });

  it('cannot be left or sent twice while saving', async () => {
    let finish: (ok: boolean) => void = () => {};
    const recordExpense = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    const { desk } = entry({ recordExpense });
    desk.open('expense');
    desk.vals()?.setDescription('Parking');
    desk.vals()?.setAmount('50');
    desk.vals()?.review();
    const saving = desk.vals()?.save();
    void desk.vals()?.save();
    desk.vals()?.close();
    desk.vals()?.change();
    expect(recordExpense).toHaveBeenCalledTimes(1);
    expect(desk.vals()?.step).toBe('review');
    finish(true);
    await saving;
    expect(desk.vals()).toBeNull();
  });
});

describe('Owner draw', () => {
  it('needs only an amount, goes to its own record, and never to expenses', async () => {
    const { desk, deps } = entry();
    desk.open('draw');
    desk.vals()?.setAmount('1500');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('review');
    await desk.vals()?.save();
    expect(deps.recordDraw).toHaveBeenCalledWith({ note: '', pesos: 1500, date: '2026-11-04' });
    expect(deps.recordExpense).not.toHaveBeenCalled();
  });
});
