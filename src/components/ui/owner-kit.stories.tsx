import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { Button } from './button';
import {
  ChoiceRows,
  FooterActions,
  OwnerField,
  PageTitle,
  Panel,
  SignedMoney,
  SwitchRow,
  TaskRow
} from './owner-kit';

const meta = {
  title: 'Owner workspace/Page kit',
  component: PageTitle,
  args: { title: 'Boxes & add-ons', subtitle: 'What customers can choose in your shop.' }
} satisfies Meta<typeof PageTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Title: Story = {
  args: {
    actions: (
      <>
        <Button variant="primary">Record expense</Button>
        <Button variant="secondary">Settings</Button>
      </>
    )
  }
};

function SettingsPage() {
  const [choices, setChoices] = useState(['Cream', 'Red']);
  const [on, setOn] = useState(true);
  return (
    <div className="max-w-[860px]">
      <PageTitle title="Boxes & add-ons" subtitle="What customers can choose in your shop." />
      <Panel title="Ribbon">
        <OwnerField label="Price (₱)" type="number" defaultValue={15} />
        <SwitchRow
          label="Customer chooses an option"
          checked={on}
          onChange={setOn}
          info="For add-ons that come in versions, like ribbon colours."
        />
        {on ? <ChoiceRows name="choice" values={choices} onChange={setChoices} /> : null}
      </Panel>
      <Panel>
        <TaskRow
          title="Books & costs"
          detail="How stock costs reach your books"
          action={
            <Button variant="secondary" size="sm">
              Open
            </Button>
          }
        />
      </Panel>
      <FooterActions
        back={<Button variant="secondary">Cancel</Button>}
        forward={<Button variant="primary">Save</Button>}
      />
    </div>
  );
}

export const Settings: Story = { render: () => <SettingsPage /> };

export const Money: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-[20px]">
      <SignedMoney pesos={17990} />
      <SignedMoney pesos={-9280} />
      <SignedMoney pesos={0} />
      <SignedMoney pesos={null} />
    </div>
  )
};
