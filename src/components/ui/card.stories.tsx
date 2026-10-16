import type { Meta, StoryObj } from '@storybook/nextjs';
import { Card } from './card';

const meta = {
  title: 'Bazaar v2/Card',
  component: Card,
  parameters: { layout: 'padded' },
  args: { children: 'A card holds one headline figure and what explains it.' }
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = { args: { variant: 'plain' } };
export const Accent: Story = {
  args: {
    variant: 'accent',
    children: 'Accent: the 4 px brand bar on the left, as Home’s “Prepare” card.'
  }
};
export const Inset: Story = { args: { variant: 'inset' } };
export const Warm: Story = { args: { variant: 'warm' } };
