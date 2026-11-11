import { describe, expect, it, vi } from 'vitest';
import {
  ReceiveDelivery,
  StockChange,
  type ReceiveDeliveryDeps,
  type StockChangeDeps,
  type StockEntryItem
} from '@/store/stock-entries';

const items: StockEntryItem[] = [
  { name: 'Flour', unit: 'g', packSize: 1000, supplier: 'Mill', onHand: 800 },
  { name: 'Sugar', unit: 'g', packSize: null, supplier: null, onHand: null }
];

function receive(over: Partial<ReceiveDeliveryDeps> = {}) {
  const deps = {
    items: () => items,
    suppliers: () => ['Mill', 'Other'],
    online: () => true,
    toast: vi.fn(),
    rerender: vi.fn(),
    receiveLine: vi.fn(async () => true),
    refresh: vi.fn(async () => {}),
    ...over
  };
  return { deps, desk: new ReceiveDelivery(deps) };
}

describe('Receive delivery', () => {
  it('starts on the chosen item, with its saved pack size and usual supplier', () => {
    const { desk } = receive();
    desk.open('Flour');
    const view = desk.vals();
    expect(view?.supplier).toBe('Mill');
    expect(view?.lines[0]).toMatchObject({ itemName: 'Flour', perPack: '1000', unit: 'g' });
  });

  it('is closed until opened, and leaves nothing behind when closed', () => {
    const { desk } = receive();
    expect(desk.vals()).toBeNull();
    desk.open('Flour');
    desk.vals()?.close();
    expect(desk.vals()).toBeNull();
  });

  it('will not review a line with no packs or pack size', () => {
    const { desk } = receive();
    desk.open('Sugar');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('entry');
    expect(desk.vals()?.error).toMatch(/packs/);
  });

  it('refuses a paid amount that is not above zero, but allows it to stay empty', () => {
    const { desk } = receive();
    desk.open('Flour');
    desk.vals()?.lines[0]?.setPacks('2');
    desk.vals()?.lines[0]?.setPaid('0');
    desk.vals()?.review();
    expect(desk.vals()?.error).toMatch(/amount/);
    desk.vals()?.lines[0]?.setPaid('');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('review');
    expect(desk.vals()?.totalPaid).toBeNull();
    expect(desk.vals()?.someUnpriced).toBe(true);
  });

  it('shows packs × pack size and the stock after it; unknown stock says nothing', () => {
    const { desk } = receive();
    desk.open('Flour');
    desk.vals()?.lines[0]?.setPacks('2');
    expect(desk.vals()?.lines[0]?.receivedText).toBe('2,000 g received');
    expect(desk.vals()?.lines[0]?.afterText).toBe('After receipt: 2,800 g');
    desk.vals()?.addLine();
    const second = desk.vals()?.lines[1];
    expect(second?.itemName).toBe('Sugar');
    second?.setPacks('1');
    desk.vals()?.lines[1]?.setPerPack('500');
    expect(desk.vals()?.lines[1]?.afterText).toBeNull();
  });

  it('saves each line with its quantity, amount and the one supplier, then finishes', async () => {
    const { desk, deps } = receive();
    desk.open('Flour');
    desk.vals()?.lines[0]?.setPacks('2');
    desk.vals()?.lines[0]?.setPaid('150');
    desk.vals()?.addLine();
    desk.vals()?.lines[1]?.setPacks('1');
    desk.vals()?.lines[1]?.setPerPack('500');
    desk.vals()?.review();
    expect(desk.vals()?.totalPaid).toBe(150);
    await desk.vals()?.save();
    expect(deps.receiveLine).toHaveBeenNthCalledWith(1, 'Flour', 2000, 150, 'Mill');
    expect(deps.receiveLine).toHaveBeenNthCalledWith(2, 'Sugar', 500, 0, 'Mill');
    expect(deps.refresh).toHaveBeenCalledOnce();
    expect(deps.toast).toHaveBeenCalledWith('Delivery recorded.');
    expect(desk.vals()).toBeNull();
  });

  it('stops at a line that fails: saved lines leave, the rest stay as typed', async () => {
    const receiveLine = vi.fn(async (name: string) => name === 'Flour');
    const { desk, deps } = receive({ receiveLine });
    desk.open('Flour');
    desk.vals()?.lines[0]?.setPacks('2');
    desk.vals()?.addLine();
    desk.vals()?.lines[1]?.setPacks('1');
    desk.vals()?.lines[1]?.setPerPack('500');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(desk.vals()?.lines.map((line) => [line.itemName, line.packs])).toEqual([['Sugar', '1']]);
    expect(desk.vals()?.error).toMatch(/1 saved\. Sugar was not saved/);
    expect(deps.refresh).toHaveBeenCalledOnce();
    expect(deps.toast).not.toHaveBeenCalled();
    // Sending it again finishes only what is left.
    receiveLine.mockResolvedValue(true);
    await desk.vals()?.save();
    expect(receiveLine).toHaveBeenLastCalledWith('Sugar', 500, 0, 'Mill');
    expect(desk.vals()).toBeNull();
  });

  it('reads back even when a line throws, and keeps that line', async () => {
    const { desk, deps } = receive({ receiveLine: vi.fn(() => Promise.reject(new Error('no'))) });
    desk.open('Flour');
    desk.vals()?.lines[0]?.setPacks('2');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(deps.refresh).toHaveBeenCalledOnce();
    expect(desk.vals()?.saving).toBe(false);
    expect(desk.vals()?.lines[0]?.packs).toBe('2');
  });

  it('sends nothing offline, and keeps everything typed', async () => {
    const { desk, deps } = receive({ online: () => false });
    desk.open('Flour');
    desk.vals()?.lines[0]?.setPacks('2');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(deps.receiveLine).not.toHaveBeenCalled();
    expect(desk.vals()?.lines[0]?.packs).toBe('2');
    expect(desk.vals()?.error).toMatch(/signal/);
  });

  it('keeps one save at a time, and cannot be left while saving', async () => {
    let finish: (ok: boolean) => void = () => {};
    const receiveLine = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    const { desk } = receive({ receiveLine });
    desk.open('Flour');
    desk.vals()?.lines[0]?.setPacks('2');
    desk.vals()?.review();
    const saving = desk.vals()?.save();
    void desk.vals()?.save();
    desk.vals()?.close();
    desk.vals()?.change();
    expect(receiveLine).toHaveBeenCalledOnce();
    expect(desk.vals()?.saving).toBe(true);
    expect(desk.vals()?.step).toBe('review');
    finish(true);
    await saving;
    expect(desk.vals()).toBeNull();
  });
});

function change(over: Partial<StockChangeDeps> = {}) {
  const deps = {
    items: () => items,
    suppliers: () => [],
    online: () => true,
    toast: vi.fn(),
    rerender: vi.fn(),
    recordWaste: vi.fn(async () => true),
    recordCorrection: vi.fn(async () => true),
    ...over
  };
  return { deps, desk: new StockChange(deps) };
}

const fill = (desk: StockChange, amount: string, note = 'Dropped') => {
  desk.vals()?.setAmount(amount);
  desk.vals()?.setNote(note);
};

describe('Waste / correction', () => {
  it('needs a reason, a quantity and a note before review', () => {
    const { desk } = change();
    desk.open('Flour');
    desk.vals()?.review();
    expect(desk.vals()?.error).toMatch(/reason/);
    desk.vals()?.setReason('Waste');
    fill(desk, '10', '  ');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('entry');
  });

  it('will not take away more than is recorded', () => {
    const { desk } = change();
    desk.open('Flour', 'Waste');
    fill(desk, '900');
    desk.vals()?.review();
    expect(desk.vals()?.error).toMatch(/more than the recorded/);
    fill(desk, '800');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('review');
    expect(desk.vals()?.afterText).toBe('0 g');
  });

  it('records waste as waste, with the note', async () => {
    const { desk, deps } = change();
    desk.open('Flour', 'Waste');
    fill(desk, '10');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(deps.recordWaste).toHaveBeenCalledWith('Flour', 10, 'Dropped');
    expect(deps.recordCorrection).not.toHaveBeenCalled();
    expect(desk.vals()).toBeNull();
  });

  it('a correction can go either way, and is signed', async () => {
    const { desk, deps } = change();
    desk.open('Flour', 'Correction');
    fill(desk, '10');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(deps.recordCorrection).toHaveBeenLastCalledWith('Flour', -10, 'Dropped');
    desk.open('Flour', 'Correction');
    desk.vals()?.setDirection('add');
    fill(desk, '5000');
    desk.vals()?.review();
    expect(desk.vals()?.afterText).toBe('5,800 g');
    await desk.vals()?.save();
    expect(deps.recordCorrection).toHaveBeenLastCalledWith('Flour', 5000, 'Dropped');
  });

  it('does not invent a balance for stock that was never counted', () => {
    const { desk } = change();
    desk.open('Sugar', 'Waste');
    fill(desk, '10');
    desk.vals()?.review();
    expect(desk.vals()?.step).toBe('review');
    expect(desk.vals()?.beforeText).toBeNull();
    expect(desk.vals()?.afterText).toBeNull();
  });

  it('stays open with what was typed when it could not be saved', async () => {
    const { desk } = change({ recordWaste: vi.fn(async () => false) });
    desk.open('Flour', 'Waste');
    fill(desk, '10');
    desk.vals()?.review();
    await desk.vals()?.save();
    expect(desk.vals()?.amount).toBe('10');
    expect(desk.vals()?.error).toMatch(/not saved/);
  });
});
