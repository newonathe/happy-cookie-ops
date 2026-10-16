import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { Button } from './button';
import { Field } from './field';
import { Sheet } from './sheet';

const meta = {
  title: 'Bazaar v2/Sheet',
  component: Sheet,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A bottom sheet on a phone, a 460 px panel on the right from 768 px. Rises in 400 ms, leaves in 150 ms; at once under reduced motion.'
      }
    }
  },
  args: { title: 'Add an event', onClose: () => undefined }
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ side }: { side?: 'bottom' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="dark" onClick={() => setOpen(true)}>
        Add an event
      </Button>
      <Sheet
        title="Add an event"
        side={side}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="primary" size="lg" onClick={() => setOpen(false)}>
              Save the event →
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Name" />
          <Field label="Place" />
          <Field label="Stall rent" mode="decimal" prefix="₱" hint="Optional" />
        </div>
      </Sheet>
    </>
  );
}

export const Responsive: Story = { render: () => <Demo /> };
export const Right: Story = { render: () => <Demo side="right" /> };
export const Bottom: Story = { render: () => <Demo side="bottom" /> };
