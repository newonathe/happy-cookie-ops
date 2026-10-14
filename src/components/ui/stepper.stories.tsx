import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { peso } from '@/lib/money/format';
import { Stepper } from './stepper';

const meta = {
  title: 'Bazaar v2/Stepper',
  component: Stepper,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Tap – or +, hold to repeat, or tap the number to type it on the numeric keypad. Enter or leaving the field sets it; Escape cancels.'
      }
    }
  },
  args: { label: 'Classic Chocolate Chip made', value: 20, onChange: () => undefined }
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(props: Parameters<typeof Stepper>[0]) {
  const [value, setValue] = useState(props.value);
  return <Stepper {...props} value={value} onChange={setValue} />;
}

export const Medium: Story = { render: (args) => <Controlled {...args} /> };
export const Small: Story = { render: (args) => <Controlled {...args} size="sm" /> };
export const AtMin: Story = { render: (args) => <Controlled {...args} value={0} /> };
export const AtMax: Story = { render: (args) => <Controlled {...args} value={50} max={50} /> };
export const Float: Story = {
  render: (args) => (
    <Controlled {...args} label="Float" value={10000} step={10000} max={1000000} format={peso} />
  )
};
