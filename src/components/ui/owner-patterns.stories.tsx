import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { ChipRow, FactRow, ReviewPanel, StackedBar } from './owner-patterns';

const meta = {
  title: 'Owner workspace/Page patterns',
  component: FactRow,
  args: { label: 'Cookies counted', children: '24' }
} satisfies Meta<typeof FactRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fact: Story = {};

export const FactWithDetail: Story = {
  args: { label: 'Cost per cookie', detail: 'From the saved recipe', children: 'Not recorded' }
};

function Chips() {
  const [active, setActive] = useState('all');
  const ids = ['all', 'to-prepare', 'ready'];
  return (
    <ChipRow
      label="Show orders"
      options={ids.map((id) => ({
        id,
        label: id.replace('-', ' '),
        count: 3,
        active: active === id,
        onSelect: () => setActive(id)
      }))}
    />
  );
}

export const Chip: Story = { render: () => <Chips /> };

export const Bar: Story = {
  render: () => (
    <StackedBar
      parts={[
        { id: 'prepare', label: 'To prepare', value: 4, tone: 'bg-warn' },
        { id: 'ready', label: 'Ready', value: 2, tone: 'bg-brand' },
        { id: 'done', label: 'Completed', value: 6, tone: 'bg-ok' }
      ]}
    />
  )
};

export const Review: Story = {
  render: () => (
    <ReviewPanel
      note="Nothing is saved until you press the button."
      backLabel="Change delivery"
      onBack={() => {}}
      saveLabel="Record delivery"
      onSave={() => {}}
    >
      <FactRow label="Supplier">Baking supplier</FactRow>
      <FactRow label="Lines">2</FactRow>
    </ReviewPanel>
  )
};
