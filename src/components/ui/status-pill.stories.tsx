import type { Meta, StoryObj } from '@storybook/nextjs';
import { StatusPill } from './status-pill';
import type { Status } from './status-pill';

const meta = {
  title: 'Bazaar v2/StatusPill',
  component: StatusPill,
  args: { status: 'selling' }
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL: Status[] = ['today', 'selling', 'planned', 'closed', 'past', 'costPending', 'good'];

export const Selling: Story = {};
export const Good: Story = { args: { status: 'good', label: 'On the menu' } };
export const Every: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {ALL.map((status) => (
        <StatusPill key={status} status={status} />
      ))}
    </div>
  )
};
