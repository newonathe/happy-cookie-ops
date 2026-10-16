import type { Meta, StoryObj } from '@storybook/nextjs';
import { Button } from './button';

const meta = {
  title: 'Bazaar v2/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'The screen’s one forward action is primary (with an arrow); a confirm that commits money or a close is dark; everything else is secondary or ghost. Press it: it scales to 0.97, and not under reduced motion.'
      }
    }
  }
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary', children: 'Start the day →' } };
export const Dark: Story = { args: { variant: 'dark', children: 'Close the day' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'Review the day' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Remove' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Add a fee' } };
export const Icon: Story = { args: { variant: 'icon', 'aria-label': 'Close', children: '✕' } };
export const Busy: Story = {
  args: { variant: 'primary', busy: true, busyLabel: 'Saving…', children: 'Save the event' }
};
export const DisabledWithReason: Story = {
  args: {
    variant: 'primary',
    disabled: true,
    reason: 'Starting a day needs signal. Selling does not.',
    children: 'Start the day →'
  }
};
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  )
};
