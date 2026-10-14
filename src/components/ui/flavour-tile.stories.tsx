import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { FlavourTile } from './flavour-tile';
import { Stepper } from './stepper';

// Bundled `assets/…` paths only: a bucket path needs the Supabase origin, which Storybook does not have.
const meta = {
  title: 'Bazaar v2/FlavourTile',
  component: FlavourTile,
  parameters: { layout: 'padded' },
  args: {
    name: 'Classic Chocolate Chip',
    photo: 'assets/double-chocolate-fudge.png',
    price: '₱125.00'
  }
} satisfies Meta<typeof FlavourTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One tile is drawn at the width a two-column phone grid gives it. */
const oneTile: Story['decorators'] = [
  (Story) => (
    <div style={{ width: 168 }}>
      <Story />
    </div>
  )
];

export const Idle: Story = { decorators: oneTile, args: { onPress: () => undefined } };
export const InCart: Story = {
  decorators: oneTile,
  args: { state: 'inCart', count: 3, onPress: () => undefined }
};
export const SoldOut: Story = { decorators: oneTile, args: { state: 'soldOut' } };
export const OffMenu: Story = { decorators: oneTile, args: { state: 'offMenu' } };
export const NoPhoto: Story = { decorators: oneTile, args: { photo: '', badge: 'Carried: 12' } };
export const WithStepper: Story = {
  decorators: oneTile,
  render: function Render(args) {
    const [made, setMade] = useState(20);
    return (
      <FlavourTile
        {...args}
        count={made}
        badge="Carried: 12"
        stepper={<Stepper label={`${args.name} made`} value={made} onChange={setMade} size="sm" />}
      />
    );
  }
};
export const Grid: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 'min(360px, 100%)' }}>
        <Story />
      </div>
    )
  ],
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      <FlavourTile
        name="Classic"
        photo="assets/double-chocolate-fudge.png"
        price="₱125.00"
        count={2}
        state="inCart"
        onPress={() => undefined}
      />
      <FlavourTile
        name="Double Fudge"
        photo="assets/nutella-churro.png"
        price="₱135.00"
        onPress={() => undefined}
      />
      <FlavourTile name="Oat" photo="" price="₱115.00" state="soldOut" />
      <FlavourTile name="Cereal Milk" photo="" price="₱130.00" state="offMenu" />
    </div>
  )
};
