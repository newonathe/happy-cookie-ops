import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { FilterChips } from './filter-chips';

const meta = {
  title: 'Bazaar v2/FilterChips',
  component: FilterChips,
  parameters: { layout: 'padded' },
  args: {
    label: 'Events',
    value: 'upcoming',
    options: [
      { id: 'upcoming', label: 'Upcoming', count: 3 },
      { id: 'past', label: 'Past', count: 12 }
    ],
    onChange: () => undefined
  }
} satisfies Meta<typeof FilterChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <FilterChips {...args} value={value} onChange={setValue} />;
  }
};
export const ManyChips: Story = {
  render: function Render(args) {
    const [value, setValue] = useState('menu');
    return (
      <div style={{ width: 280 }}>
        <FilterChips
          {...args}
          label="Flavours"
          value={value}
          onChange={setValue}
          options={[
            { id: 'menu', label: 'On the menu', count: 7 },
            { id: 'all', label: 'All', count: 26 },
            { id: 'off', label: 'Off the menu', count: 19 }
          ]}
        />
      </div>
    );
  }
};
