import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { Banner } from './banner';
import { Button } from './button';

const meta = {
  title: 'Bazaar v2/Banner',
  component: Banner,
  parameters: { layout: 'padded' },
  args: {
    tone: 'info',
    title: 'You are offline',
    body: 'Selling still works. Starting a day needs signal.'
  }
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Warn: Story = {
  args: {
    tone: 'warn',
    title: 'That is ₱1,000.00 over. Count the drawer again?',
    body: undefined,
    action: { label: 'Count again', onPress: () => undefined }
  }
};
export const Danger: Story = {
  args: {
    tone: 'danger',
    title: 'The day could not be closed',
    body: 'Nothing was changed. Try again.'
  }
};
export const Till: Story = {
  args: {
    tone: 'till',
    title: 'Selling now · Ateneo',
    body: undefined,
    action: { label: 'Back to the till', onPress: () => undefined }
  }
};
export const Dismissible: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <div className="flex flex-col gap-3">
        <Banner
          tone="info"
          title="Saved"
          body="Slides down in, fades out."
          open={open}
          onDismiss={() => setOpen(false)}
        />
        {!open ? <Button onClick={() => setOpen(true)}>Show it again</Button> : null}
      </div>
    );
  }
};
