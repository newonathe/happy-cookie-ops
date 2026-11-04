import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StockSuppliersForm, readSupplierForm } from '@/components/live/stock-suppliers-form';
import type { LiveStockSupplierEdit, OpsVals } from '@/view-models/vals';

afterEach(cleanup);
function mount(over: Partial<LiveStockSupplierEdit> = {}) {
  const before: LiveStockSupplierEdit = {
    id: 'supplier',
    isNew: false,
    name: 'Fixture supplier',
    phone: '',
    notes: '',
    place: '',
    active: true,
    prices: [
      {
        id: 'a3a00000-0000-4000-8000-000000000001',
        itemName: 'Butter',
        packLabel: '1 kg',
        pricePesos: 420,
        lastBought: '',
        preferred: true,
        active: true,
        previousText: 'First price'
      },
      {
        id: 'a3a00000-0000-4000-8000-000000000002',
        itemName: 'Box',
        packLabel: '25 boxes',
        pricePesos: 90,
        lastBought: '',
        preferred: false,
        active: false,
        previousText: 'First price'
      }
    ],
    newPriceId: 'a3a00000-0000-4000-8000-000000000003',
    newPriceDefaults: { itemName: 'Butter', packLabel: '1 kg' },
    focusNewPrice: true,
    ...over
  };
  const save = vi.fn();
  const data: NonNullable<OpsVals['liveStockSuppliers']> = {
    online: true,
    editing: before,
    rows: [],
    itemNames: ['Butter', 'Box'],
    version: 1,
    itemContextName: 'Butter',
    add: vi.fn(),
    edit: vi.fn(),
    save,
    back: vi.fn(),
    close: vi.fn()
  };
  const { container } = render(<StockSuppliersForm liveStock={data} />);
  const form = container.querySelector('form')!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  return { before, save, form, field };
}

it('saves a new supplier with no price controls or invented quote', () => {
  const { form, save } = mount({ isNew: true, prices: [], newPriceDefaults: undefined });
  expect(form.elements.namedItem('prItem0')).toBeNull();
  fireEvent.submit(form);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ isNew: true, prices: [] }));
});

it('prefills only known item/pack, focuses the new quote, and retains collapsed existing prices on contact save', () => {
  const { before, save, form, field } = mount();
  expect(field('prItem2')).toHaveValue('Butter');
  expect(field('prPack2')).toHaveValue('1 kg');
  expect(field('prPrice2')).toHaveValue(null);
  expect(field('prPrice2')).toHaveFocus();
  expect([...form.querySelectorAll('details')].every((node) => !node.open)).toBe(true);
  fireEvent.change(field('supPhone'), { target: { value: 'Fixture contact' } });
  fireEvent.submit(form);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ phone: 'Fixture contact', prices: before.prices })
  );
});

it('keeps an explicit zero quote, an incomplete edited new row and a cleared existing price distinct', () => {
  const { before, form, field } = mount();
  fireEvent.change(field('prPrice2'), { target: { value: '0' } });
  expect(readSupplierForm(form, before).prices[2]).toMatchObject({
    id: before.newPriceId,
    itemName: 'Butter',
    pricePesos: 0
  });
  fireEvent.change(field('prItem2'), { target: { value: '' } });
  expect(readSupplierForm(form, before).prices[2]).toMatchObject({ itemName: '', pricePesos: 0 });
  fireEvent.change(field('prItem2'), { target: { value: 'Butter' } });
  fireEvent.change(field('prPrice2'), { target: { value: '' } });
  fireEvent.change(field('prPack2'), { target: { value: 'Different pack' } });
  expect(readSupplierForm(form, before).prices[2]).toMatchObject({
    packLabel: 'Different pack',
    pricePesos: Number.NaN
  });
  fireEvent.change(field('prPrice0'), { target: { value: '' } });
  expect(readSupplierForm(form, before).prices[0]?.pricePesos).toBeNaN();
});
