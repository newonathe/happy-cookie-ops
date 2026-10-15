import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PackagingForm } from '@/components/live/packaging-form';
import { PACKAGING_COPY as C } from '@/lib/orders/staff-copy';
import type { OpsVals } from '@/view-models/vals';

/**
 * B3b: the owner's packaging form (container rules, and each flavour's packaging per cookie). The names, sizes and quantities
 * here are made-up test data: the form carries none of its own, so an empty shop shows only empty states.
 */
type Live = NonNullable<OpsVals['livePackaging']>;

const ITEMS: Live['items'] = [
  { id: 'i-wrap', name: 'Wrap X', unit: 'pcs', category: 'Packaging', active: true },
  { id: 'i-tray', name: 'Tray Y', unit: 'pcs', category: 'Packaging', active: true },
  { id: 'i-dust', name: 'Dust Z', unit: 'g', category: 'Ingredients', active: true },
  { id: 'i-old', name: 'Old W', unit: 'pcs', category: 'Packaging', active: false }
];

const live = (over: Partial<Live> = {}): Live => ({
  online: true,
  available: true,
  rulesStamp: 'r1',
  items: ITEMS,
  rules: [
    {
      container: 'box',
      boxSize: 7,
      itemId: 'i-wrap',
      itemName: 'Wrap X',
      qty: 1,
      per: 'container'
    },
    { container: 'box', boxSize: 7, itemId: 'i-dust', itemName: 'Dust Z', qty: 0.5, per: 'cookie' },
    {
      container: 'loose',
      boxSize: null,
      itemId: 'i-tray',
      itemName: 'Tray Y',
      qty: 2,
      per: 'container'
    }
  ],
  flavours: [
    {
      productId: 'p1',
      name: 'Flavour One',
      hasRecipe: true,
      stamp: 's1',
      lines: [{ itemId: 'i-wrap', name: 'Wrap X', qty: 1 }]
    },
    { productId: 'p2', name: 'Flavour Two', hasRecipe: false, stamp: null, lines: [] }
  ],
  saveRules: vi.fn(),
  saveLines: vi.fn(),
  close: vi.fn(),
  ...over
});

afterEach(cleanup);

describe('PackagingForm: rules', () => {
  it('shows each container and its lines, with the box size heading from the rules', () => {
    render(<PackagingForm livePackaging={live()} />);
    expect(screen.getByRole('group', { name: C.boxOf(7) })).toBeTruthy();
    expect(screen.getByRole('group', { name: C.containers.loose })).toBeTruthy();
    expect(screen.getByRole('group', { name: C.containers.order })).toBeTruthy();
    expect(screen.getByRole('group', { name: C.containers.bazaar_sale })).toBeTruthy();
    const box = within(screen.getByRole('group', { name: C.boxOf(7) }));
    expect(box.getAllByLabelText(C.item)).toHaveLength(2);
    expect((box.getAllByLabelText(C.item)[0] as HTMLSelectElement).value).toBe('i-wrap');
    expect((box.getAllByLabelText(C.qty)[1] as HTMLInputElement).value).toBe('0.5');
    expect((box.getAllByLabelText(C.per)[1] as HTMLSelectElement).value).toBe('cookie');
  });

  it('offers active items by name (and an item already used even when switched off)', () => {
    const rules: Live['rules'] = [
      {
        container: 'order',
        boxSize: null,
        itemId: 'i-old',
        itemName: 'Old W',
        qty: 1,
        per: 'container'
      }
    ];
    render(<PackagingForm livePackaging={live({ rules })} />);
    const order = within(screen.getByRole('group', { name: C.containers.order }));
    const select = order.getByLabelText(C.item) as HTMLSelectElement;
    expect(select.value).toBe('i-old');
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('i-wrap');
    expect(options).toContain('i-dust');
    const bazaar = within(screen.getByRole('group', { name: C.containers.bazaar_sale }));
    fireEvent.click(bazaar.getByRole('button', { name: C.addLine }));
    const fresh = bazaar.getByLabelText(C.item) as HTMLSelectElement;
    expect(Array.from(fresh.options).map((o) => o.value)).not.toContain('i-old');
  });

  it('saves the rules in container order with exact numbers', () => {
    const l = live();
    render(<PackagingForm livePackaging={l} />);
    fireEvent.change(
      within(screen.getByRole('group', { name: C.boxOf(7) })).getAllByLabelText(
        C.qty
      )[0] as HTMLElement,
      { target: { value: '3' } }
    );
    fireEvent.click(screen.getByRole('button', { name: C.saveRules }));
    expect(l.saveRules).toHaveBeenCalledTimes(1);
    expect(l.saveRules).toHaveBeenCalledWith([
      { container: 'box', boxSize: 7, itemId: 'i-wrap', qty: 3, per: 'container' },
      { container: 'box', boxSize: 7, itemId: 'i-dust', qty: 0.5, per: 'cookie' },
      { container: 'loose', boxSize: null, itemId: 'i-tray', qty: 2, per: 'container' }
    ]);
  });

  it('adds a box size and a line to it, and removes a line', () => {
    const l = live({ rules: [] });
    render(<PackagingForm livePackaging={l} />);
    fireEvent.change(screen.getByLabelText(C.boxSizeLabel), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: C.addBoxSize }));
    const group = within(screen.getByRole('group', { name: C.boxOf(9) }));
    fireEvent.click(group.getByRole('button', { name: C.addLine }));
    fireEvent.change(group.getByLabelText(C.item), { target: { value: 'i-tray' } });
    fireEvent.change(group.getByLabelText(C.qty), { target: { value: '4' } });
    fireEvent.change(group.getByLabelText(C.per), { target: { value: 'cookie' } });
    fireEvent.click(screen.getByRole('button', { name: C.saveRules }));
    expect(l.saveRules).toHaveBeenCalledWith([
      { container: 'box', boxSize: 9, itemId: 'i-tray', qty: 4, per: 'cookie' }
    ]);
    fireEvent.click(group.getByRole('button', { name: C.remove }));
    fireEvent.click(screen.getByRole('button', { name: C.saveRules }));
    expect(l.saveRules).toHaveBeenLastCalledWith([]);
  });

  it('does not send an unfinished line; it says so', () => {
    const l = live({ rules: [] });
    render(<PackagingForm livePackaging={l} />);
    const order = within(screen.getByRole('group', { name: C.containers.order }));
    fireEvent.click(order.getByRole('button', { name: C.addLine }));
    fireEvent.click(screen.getByRole('button', { name: C.saveRules }));
    expect(l.saveRules).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(C.incomplete);
  });

  it('refuses a box size that is not a whole number from 2 to 48 without adding it', () => {
    render(<PackagingForm livePackaging={live({ rules: [] })} />);
    for (const bad of ['1', '49', '2.5', '']) {
      fireEvent.change(screen.getByLabelText(C.boxSizeLabel), { target: { value: bad } });
      fireEvent.click(screen.getByRole('button', { name: C.addBoxSize }));
    }
    expect(screen.queryAllByRole('group', { name: /\d/ })).toHaveLength(0);
  });
});

describe('PackagingForm: each flavour', () => {
  it('shows its lines and saves them by product id', () => {
    const l = live();
    render(<PackagingForm livePackaging={l} />);
    const one = within(screen.getByRole('group', { name: 'Flavour One' }));
    expect((one.getByLabelText(C.item) as HTMLSelectElement).value).toBe('i-wrap');
    fireEvent.click(one.getByRole('button', { name: C.addLine }));
    const items = one.getAllByLabelText(C.item);
    fireEvent.change(items[1] as HTMLElement, { target: { value: 'i-tray' } });
    fireEvent.change(one.getAllByLabelText(C.qtyPerCookie)[1] as HTMLElement, {
      target: { value: '0.25' }
    });
    fireEvent.click(one.getByRole('button', { name: C.saveLines('Flavour One') }));
    expect(l.saveLines).toHaveBeenCalledWith('p1', [
      { itemId: 'i-wrap', qty: 1 },
      { itemId: 'i-tray', qty: 0.25 }
    ]);
    expect(l.saveRules).not.toHaveBeenCalled();
  });

  it('a flavour with no recipe says to save the recipe first and has no editor', () => {
    render(<PackagingForm livePackaging={live()} />);
    const two = within(screen.getByRole('group', { name: 'Flavour Two' }));
    expect(two.getByText(C.noRecipe)).toBeTruthy();
    expect(two.queryByRole('button')).toBeNull();
  });
});

describe('PackagingForm: states', () => {
  it('on a database without the functions shows one note and no editor', () => {
    const { container } = render(<PackagingForm livePackaging={live({ available: false })} />);
    expect(screen.getByText(C.missing)).toBeTruthy();
    expect(container.querySelector('select, input, form')).toBeNull();
    expect(screen.queryByRole('button', { name: C.saveRules })).toBeNull();
  });

  it('says when this device is offline', () => {
    render(<PackagingForm livePackaging={live({ online: false })} />);
    expect(screen.getByText(C.offline)).toBeTruthy();
  });

  it('an empty shop shows only empty states: no items, rules or flavours, and no number', () => {
    const { container } = render(
      <PackagingForm livePackaging={live({ items: [], rules: [], flavours: [] })} />
    );
    expect(screen.getByText(C.noItems)).toBeTruthy();
    expect(screen.getByText(C.noFlavours)).toBeTruthy();
    expect(screen.getAllByText(C.noRules).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: C.addLine })).toBeNull();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\d/);
  });

  it('closes', () => {
    const l = live();
    render(<PackagingForm livePackaging={l} />);
    fireEvent.click(screen.getByRole('button', { name: C.close }));
    expect(l.close).toHaveBeenCalled();
  });
});

describe('PackagingForm: a reload under the form', () => {
  it('re-reads only the section whose stamp moved; typing elsewhere is kept', () => {
    const first = live();
    const { rerender } = render(<PackagingForm livePackaging={first} />);
    const box = () => within(screen.getByRole('group', { name: C.boxOf(7) }));
    const one = () => within(screen.getByRole('group', { name: 'Flavour One' }));
    fireEvent.change(box().getAllByLabelText(C.qty)[0], { target: { value: '3' } });
    // Flavour One was saved (its stamp moved, with a new quantity): its lines are re-read, the typed rule is kept.
    rerender(
      <PackagingForm
        livePackaging={{
          ...first,
          flavours: [
            {
              ...first.flavours[0],
              stamp: 's2',
              lines: [{ itemId: 'i-wrap', name: 'Wrap X', qty: 4 }]
            },
            first.flavours[1]
          ]
        }}
      />
    );
    expect((box().getAllByLabelText(C.qty)[0] as HTMLInputElement).value).toBe('3');
    expect((one().getAllByLabelText(C.qtyPerCookie)[0] as HTMLInputElement).value).toBe('4');
    // Mutation: remounting the whole form on every reload throws away the typed '3'.
    // The rules were saved (their stamp moved): the rules section shows what is saved.
    rerender(<PackagingForm livePackaging={{ ...first, rulesStamp: 'r2' }} />);
    expect((box().getAllByLabelText(C.qty)[0] as HTMLInputElement).value).toBe('1');
  });
});
