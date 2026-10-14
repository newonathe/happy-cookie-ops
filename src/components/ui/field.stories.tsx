import type { Meta, StoryObj } from '@storybook/nextjs';
import { Field, SelectField } from './field';

const meta = {
  title: 'Bazaar v2/Field',
  component: Field,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    )
  ],
  args: { label: 'Stall rent', hint: 'In pesos, like 2,500.00', mode: 'decimal', prefix: '₱' }
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Filled: Story = { args: { defaultValue: '20000.00' } };
export const WithError: Story = {
  args: { defaultValue: 'abc', error: 'Enter the stall rent in pesos, like 2,500.00' }
};
export const Disabled: Story = { args: { disabled: true, defaultValue: '0' } };
export const Date: Story = {
  args: { label: 'Starts', mode: 'date', prefix: undefined, hint: undefined }
};
export const Select: Story = {
  render: () => (
    <SelectField
      label="Paid by"
      hint="How the customer paid"
      options={[
        { value: 'cash', label: 'Cash' },
        { value: 'gcash', label: 'GCash' }
      ]}
    />
  )
};
export const SelectWithError: Story = {
  render: () => (
    <SelectField
      label="Paid by"
      error="Pick how it was paid"
      options={[
        { value: '', label: 'Choose…' },
        { value: 'cash', label: 'Cash' }
      ]}
    />
  )
};
