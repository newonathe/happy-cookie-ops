import type { Meta, StoryObj } from '@storybook/nextjs';
import { peso } from '@/lib/money/format';
import { StatTile } from './stat-tile';

const meta = {
  title: 'Bazaar v2/StatTile',
  component: StatTile,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 200 }}>
        <Story />
      </div>
    )
  ],
  args: { label: 'Sold', value: 144 }
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The numeral counts up the first time it shows (400 ms); not under reduced motion. */
export const CountingUp: Story = {
  args: { label: 'Cookies sold', value: 144, unit: 'of 200', detail: '56 left' }
};
export const Money: Story = {
  args: { label: 'Revenue', value: 605000, format: peso, detail: '+₱120.00 on day 1', tone: 'ok' }
};
export const Pending: Story = {
  args: { label: 'Profit', value: null, detail: 'Cost pending', tone: 'warn' }
};
export const Danger: Story = {
  args: { label: 'Drawer', value: '₱20.00', detail: 'Short', tone: 'danger' }
};
export const Openable: Story = {
  args: {
    label: 'Revenue',
    value: '₱1,640.00',
    parts: [
      { label: 'Cash', value: '₱900.00' },
      { label: 'GCash', value: '₱740.00' }
    ]
  }
};
