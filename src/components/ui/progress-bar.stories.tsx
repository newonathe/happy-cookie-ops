import type { Meta, StoryObj } from '@storybook/nextjs';
import { ProgressBar } from './progress-bar';

const meta = {
  title: 'Bazaar v2/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    )
  ],
  args: { value: 144, max: 200, label: '144 of 200 sold · 56 left' }
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { value: 0, label: '0 of 200 sold' } };
export const Part: Story = {};
export const WithSecondary: Story = {
  args: { value: 120, secondary: 24, label: '120 sold, 24 given away' }
};
export const Full: Story = { args: { value: 200, label: '200 of 200 sold' } };
export const Over: Story = {
  args: {
    overBy: '₱210.00',
    value: 6210,
    max: 6000,
    label: '₱6,210.00 of ₱6,000.00 target'
  }
};
