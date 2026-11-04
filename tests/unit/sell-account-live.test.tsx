import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { OpsVals } from '@/view-models/vals';
import { AccountLive } from '@/components/live/account/account-live';
import { areaOf, groupsOf } from '@/components/live/account/settings-areas';
import { OrdersLive } from '@/components/live/sell/orders-live';
import { CustomersLive } from '@/components/live/sell/customers-live';
import { ShopLive, ShopStatusLive } from '@/components/live/sell/shop-live';

afterEach(cleanup);

const vals = (over: Record<string, unknown>) => over as unknown as OpsVals;

const SHOP_ENTRIES = [
  'Shop status',
  'Order rules',
  'Boxes & add-ons',
  'Payment methods',
  'Shop texts',
  'Preview shop',
  'Preview checkout',
  'Preview order status'
];

function shopVals(extraEntry?: string) {
  const go = vi.fn();
  const capUp = vi.fn();
  const toggleSold = vi.fn();
  const labels = extraEntry ? [...SHOP_ENTRIES, extraEntry] : SHOP_ENTRIES;
  return {
    go,
    capUp,
    toggleSold,
    v: vals({
      liveScreen: {
        tabs: {
          label: 'Sell',
          places: [],
          entries: labels.map((label) => ({
            id: label,
            label,
            primary: false,
            go: () => go(label)
          }))
        }
      },
      drop: { barConfirmed: '', barPending: '', pendingText: '1 awaiting', leftText: '9 open' },
      drop2: {
        no: 'Drop A',
        stateText: 'Open for orders',
        scheduleLine: 'Monday to Thursday',
        capNum: 3,
        capValue: 10,
        capInput: '10',
        setCap: vi.fn(),
        capUp,
        capDown: vi.fn(),
        preview: vi.fn()
      },
      dropProducts: [
        { name: 'Cookie A', priceText: 'Price', toggleSold, soldLabel: 'Mark sold out' }
      ],
      pastDrops: [{ label: 'Drop Z', when: 'earlier', detail: 'Filed' }]
    })
  };
}

describe('Shop', () => {
  it('keeps every existing entry reachable, under the names the reference uses', () => {
    const { v, go } = shopVals();
    render(<ShopLive v={v} />);
    for (const name of ['Shop status', 'Order rules', 'Boxes & add-ons', 'Payment methods']) {
      fireEvent.click(screen.getByRole('button', { name: `Open ${name}` }));
      expect(go).toHaveBeenLastCalledWith(name);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open Shop details & messages' }));
    expect(go).toHaveBeenLastCalledWith('Shop texts');
    fireEvent.click(screen.getByRole('button', { name: 'Preview shop' }));
    expect(go).toHaveBeenLastCalledWith('Preview shop');
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    expect(go).toHaveBeenLastCalledWith('Preview checkout');
    fireEvent.click(screen.getByRole('button', { name: 'Order status' }));
    expect(go).toHaveBeenLastCalledWith('Preview order status');
  });

  it('shows an entry it does not know yet rather than losing it', () => {
    const { v, go } = shopVals('Something new');
    render(<ShopLive v={v} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Something new' }));
    expect(go).toHaveBeenCalledWith('Something new');
  });

  it('moves capacity, sold-out switches and past drops one step down, and comes back', () => {
    const { v, capUp, toggleSold } = shopVals();
    render(<ShopLive v={v} />);
    expect(screen.queryByText('Cookie A')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Opening schedule & drop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raise capacity' }));
    expect(capUp).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Mark sold out' }));
    expect(toggleSold).toHaveBeenCalledOnce();
    expect(screen.getByText('Drop Z')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Shop' }));
    expect(screen.getByRole('button', { name: 'Open Order rules' })).toBeTruthy();
  });

  it('Shop status keeps its options, the roll-over and a way back', () => {
    const option = vi.fn();
    const roll = vi.fn();
    const close = vi.fn();
    render(
      <ShopStatusLive
        v={vals({
          dropStateOptions: [{ label: 'Closed', what: 'No new orders', on: false, go: option }],
          closeDropRollover: roll,
          closeSheet: close,
          dropNoText: 'Drop A'
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Closed/ }));
    expect(option).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close Drop A and open the next' }));
    expect(roll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Shop' }));
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('Account', () => {
  const groups = [
    'People',
    'Orders & payments',
    'Drops & capacity',
    'Customer experience',
    'Products & recipes',
    'Kitchen rules',
    'Inventory & grocery',
    'Money rules',
    'Notifications & data',
    'A group added later'
  ].map((title) => ({
    title,
    rows: [{ label: `${title} row`, value: 'value', go: vi.fn() }]
  }));
  const v = vals({ roleWho: 'Owner', settingsGroups: groups });

  it('places every engine settings group in exactly one area, unknown ones in Other', () => {
    const shown = (['people', 'shop', 'make', 'stock', 'money', 'data', 'other'] as const).flatMap(
      (area) => groupsOf(v, area).map((group) => group.title)
    );
    expect([...shown].sort()).toEqual(groups.map((group) => group.title).sort());
    expect(areaOf(groups[9] as never)).toBe('other');
  });

  it('reaches a row inside an area and comes back', () => {
    render(<AccountLive v={v} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Money settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Money rules row' }));
    expect(groups[7]?.rows[0]?.go).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Account' }));
    expect(screen.getByRole('button', { name: 'Open Other settings' })).toBeTruthy();
  });

  it('does not repeat the word Owner for an owner with no display name', () => {
    render(<AccountLive v={v} />);
    expect(screen.queryByText('Owner · Owner')).toBeNull();
    expect(screen.getByText('Owner')).toBeTruthy();
  });
});

describe('Orders', () => {
  const order = (id: string, label: string) => ({
    id,
    label,
    name: `Customer ${id}`,
    no: id,
    fg: 'inherit',
    bg: 'transparent',
    br: 'transparent',
    pickup: 'Pickup',
    count: '6 cookies',
    items: [],
    totalText: 'Total',
    go: vi.fn()
  });

  it('groups by the work to do, and every row keeps its own status word', () => {
    render(
      <OrdersLive
        v={vals({
          orderList: [
            order('1', 'Awaiting payment'),
            order('2', 'Paid'),
            order('3', 'Baking'),
            order('4', 'Ready'),
            order('5', 'Completed')
          ],
          orderFilters: []
        })}
      />
    );
    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings).toEqual(
      expect.arrayContaining([
        'To prepare (2)',
        'Ready for pickup (1)',
        'Payments & other orders (1)',
        'Closed (1)'
      ])
    );
    expect(headings.indexOf('To prepare (2)')).toBeLessThan(
      headings.indexOf('Payments & other orders (1)')
    );
    expect(screen.getByText('Awaiting payment')).toBeTruthy();
    expect(screen.getByText('Baking')).toBeTruthy();
  });
});

describe('Customers/Waitlist', () => {
  const customer = {
    key: '09170000000',
    name: 'Customer A',
    mobile: '09170000000',
    contactText: '',
    orderCountText: '1 order',
    lastOrderText: 'Last order 1 Nov',
    orders: [
      { id: 'HC-1', statusText: 'Paid', cookiesText: '6 cookies', whenText: '1 Nov', open: vi.fn() }
    ],
    recordCsv: 'x'
  };
  const live = (removeContact = vi.fn(async () => 'removed' as const)) => ({
    rows: [customer],
    loaded: true,
    online: true,
    removeContact
  });

  it('shows who is waiting and what they asked for, with the engine action', () => {
    const go = vi.fn();
    render(
      <CustomersLive
        v={vals({
          liveCustomers: live(),
          waitlist: [{ name: 'Customer B', want: '6 cookies', when: 'joined today', go }]
        })}
      />
    );
    const waiting = screen.getByText('Customer B').closest('li') as HTMLElement;
    expect(within(waiting).getByText('6 cookies · joined today')).toBeTruthy();
    fireEvent.click(within(waiting).getByRole('button', { name: 'Tell them' }));
    expect(go).toHaveBeenCalledOnce();
  });

  it('does not say nobody has ordered before the orders are read', () => {
    render(<CustomersLive v={vals({ liveCustomers: { ...live(), rows: [], loaded: false } })} />);
    expect(screen.getByText('Reading your orders…')).toBeTruthy();
    expect(screen.queryByText('Nobody has ordered yet.')).toBeNull();
  });

  it('opens a customer, their orders and the way back', () => {
    render(<CustomersLive v={vals({ liveCustomers: live() })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Open customer/ }));
    expect(screen.getByRole('heading', { name: 'Customer A' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View order HC-1' }));
    expect(customer.orders[0]?.open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare message' }));
    expect(screen.getByLabelText('Message')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to customer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to customers' }));
    expect(screen.getByRole('heading', { name: 'Customers/Waitlist' })).toBeTruthy();
  });

  it('removes contact details only after the tick, and stays put when it fails', async () => {
    const removeContact = vi.fn(async () => 'failed' as const);
    render(<CustomersLive v={vals({ liveCustomers: live(removeContact as never) })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Open customer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove contact details' }));
    const remove = screen.getByRole('button', { name: 'Remove contact details' });
    expect(remove.hasAttribute('disabled')).toBe(true);
    expect(removeContact).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove contact details' }));
    expect(await screen.findByText(/were not removed/)).toBeTruthy();
    expect(removeContact).toHaveBeenCalledOnce();
  });
});
