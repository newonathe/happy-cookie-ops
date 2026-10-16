import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlavourTile } from '@/components/ui/flavour-tile';
import { ReceiptTable } from '@/components/ui/receipt-table';
import { violations } from './ui-helpers';

afterEach(cleanup);

describe('FlavourTile', () => {
  it('draws the photo from a bundled path, the name and the price', () => {
    const { container } = render(
      <FlavourTile
        name="Classic Chocolate Chip"
        photo="assets/double-chocolate-fudge.png"
        price="₱125.00"
      />
    );
    expect(screen.getByText('Classic Chocolate Chip')).toBeInTheDocument();
    expect(screen.getByText('₱125.00')).toBeInTheDocument();
    const photo = container.querySelector('[data-photo]') as HTMLElement;
    expect(photo).toHaveAttribute('data-photo', 'yes');
    expect(photo.style.backgroundImage).toContain('assets/double-chocolate-fudge.png');
  });

  it('draws the first letter, not a broken image, when the path is not one it will draw', () => {
    const { container } = render(<FlavourTile name="Oat" photo="../../etc/x.png" price="₱1.00" />);
    expect(container.querySelector('[data-photo]')).toHaveAttribute('data-photo', 'none');
    expect(container.querySelector('[data-photo]')).toHaveTextContent('O');
  });

  it('in the cart: a brand ring and a count badge', () => {
    const { container } = render(
      <FlavourTile name="Oat" photo="" price="₱1.00" state="inCart" count={3} />
    );
    expect(container.querySelector('[data-part="count"]')).toHaveTextContent('3');
    expect(container.querySelector('.ring-brand')).not.toBeNull();
  });

  it('shows no badge for a count of 0', () => {
    const { container } = render(<FlavourTile name="Oat" photo="" price="₱1.00" count={0} />);
    expect(container.querySelector('[data-part="count"]')).toBeNull();
  });

  it('a sold-out tile says so and cannot be pressed', () => {
    const press = vi.fn();
    render(<FlavourTile name="Oat" photo="" price="₱1.00" state="soldOut" onPress={press} />);
    expect(screen.getByText('Sold out')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('an off-menu tile says so', () => {
    render(<FlavourTile name="Oat" photo="" price="₱1.00" state="offMenu" />);
    expect(screen.getByText('Not on the menu')).toBeInTheDocument();
  });

  it('a pressable tile presses', () => {
    const press = vi.fn();
    render(<FlavourTile name="Oat" photo="" price="₱1.00" onPress={press} badge="Carried: 12" />);
    fireEvent.click(screen.getByRole('button', { name: /Oat/ }));
    expect(press).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Carried: 12')).toBeInTheDocument();
  });

  it('a tile with a stepper holds it beside, not inside, a button', () => {
    render(
      <FlavourTile
        name="Oat"
        photo=""
        price="₱1.00"
        onPress={() => undefined}
        stepper={<button type="button">Stepper</button>}
      />
    );
    // The tile is not itself a button when it carries a control, so there is no button inside a button.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Stepper' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <FlavourTile
          name="Oat"
          photo=""
          price="₱1.00"
          onPress={() => undefined}
          count={2}
          state="inCart"
        />
        <FlavourTile name="Plain" photo="" price="₱1.00" state="soldOut" />
      </>
    );
    expect(await violations(container)).toEqual([]);
  });
});

describe('ReceiptTable', () => {
  it('writes every amount with two decimals, lines then subtotal then total', () => {
    render(
      <ReceiptTable
        caption="Fees"
        lines={[
          { label: 'Stall rent', value: 2000000 },
          { label: 'Table hire', detail: 'Whole event', value: 50050 }
        ]}
        subtotal={2050050}
        total={2050050}
      />
    );
    const table = screen.getByRole('table', { name: 'Fees' });
    expect(within(table).getByText('₱20,000.00')).toBeInTheDocument();
    expect(within(table).getByText('₱500.50')).toBeInTheDocument();
    expect(within(table).getAllByText('₱20,500.50')).toHaveLength(2);
    expect(within(table).getByText('Whole event')).toBeInTheDocument();
    expect(within(table).getByText('Subtotal')).toBeInTheDocument();
    expect(within(table).getByText('Total')).toBeInTheDocument();
  });

  it('removes a line by name, and offers Remove only on lines that can be removed', () => {
    const remove = vi.fn();
    render(
      <ReceiptTable
        caption="Fees"
        lines={[
          { label: 'Stall rent', value: 100 },
          { label: 'Table hire', value: 200, onRemove: remove }
        ]}
        total={300}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Table hire' }));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('says there is nothing, and a total of ₱0.00', () => {
    render(
      <ReceiptTable
        caption="Fees"
        lines={[]}
        total={0}
        emptyText="No fees yet"
        note="Rent is booked separately."
      />
    );
    expect(screen.getByText('No fees yet')).toBeInTheDocument();
    expect(screen.getByText('₱0.00')).toBeInTheDocument();
    expect(screen.getByText('Rent is booked separately.')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <ReceiptTable
        caption="Fees"
        lines={[{ label: 'Rent', value: 100, onRemove: () => undefined }]}
        subtotal={100}
        total={100}
      />
    );
    expect(await violations(container)).toEqual([]);
  });
});
