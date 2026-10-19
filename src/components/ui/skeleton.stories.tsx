import type { Meta, StoryObj } from '@storybook/nextjs';
import { Skeleton } from './skeleton';

const meta = {
  title: 'Bazaar v2/Skeleton',
  component: Skeleton,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lines: Story = { args: { lines: 3 } };
export const WithTile: Story = { args: { lines: 2, tile: true } };
