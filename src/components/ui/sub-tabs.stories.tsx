import type { Meta, StoryObj } from '@storybook/nextjs';
import { SubTabs } from './sub-tabs';
import type { SubTab } from './sub-tabs';

const meta = {
  title: 'Primitives/SubTabs',
  component: SubTabs,
  parameters: {
    docs: {
      description: {
        component:
          'The sub-tab strip of the live interface. The labels and which tab is open come ' +
          'from data; the row scrolls inside itself, so the page never scrolls sideways.'
      }
    }
  }
} satisfies Meta<typeof SubTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => undefined;
const make = (labels: string[], open: string, badges: Record<string, number> = {}): SubTab[] =>
  labels.map((label) => ({
    id: label.toLowerCase().replace(/[^a-z]+/g, '-'),
    label,
    active: label === open,
    badge: badges[label] ?? null,
    go: noop
  }));

export const Places: Story = {
  args: {
    label: 'Places',
    tabs: make(['Orders', 'Bazaar', 'Customers', 'Shop'], 'Orders', { Orders: 2 })
  }
};

export const Entries: Story = {
  args: {
    label: 'Entries',
    quiet: true,
    tabs: make(['Recipes', 'Products', 'Menu & flavours', 'Recipe drafts'], 'Products')
  }
};

export const Narrow: Story = {
  args: {
    label: 'Places',
    tabs: make(
      [
        'Orders',
        'Bazaar',
        'Customers',
        'Shop',
        'Recipes',
        'Products',
        'Stock',
        'Reports',
        'Settings'
      ],
      'Shop'
    )
  },
  decorators: [
    (Story) => (
      <div style={{ width: '320px' }}>
        <Story />
      </div>
    )
  ]
};
