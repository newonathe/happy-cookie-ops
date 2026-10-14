import type { Meta, StoryObj } from '@storybook/nextjs';
import { ReceiptTable } from './receipt-table';

const meta = {
  title: 'Bazaar v2/ReceiptTable',
  component: ReceiptTable,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    )
  ],
  args: { caption: 'Fees', lines: [], total: 0, emptyText: 'No fees yet' }
} satisfies Meta<typeof ReceiptTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithRemove: Story = {
  args: {
    lines: [
      { label: 'Stall rent', value: 2000000 },
      { label: 'Table hire', detail: 'Whole event', value: 50050, onRemove: () => undefined },
      { label: 'Ice', detail: 'Sat, 24 Oct', value: 12000, onRemove: () => undefined }
    ],
    subtotal: 2062050,
    total: 2062050,
    note: 'Rent is booked when the first day starts.'
  }
};
