import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { Button } from './button';
import { ErrorSummary } from './error-summary';
import { Field } from './field';

const meta = {
  title: 'Bazaar v2/ErrorSummary',
  component: ErrorSummary,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    )
  ],
  args: {
    errors: [
      { field: 'story-name', message: 'Enter a name for the event' },
      { field: 'story-rent', message: 'Enter the stall rent in pesos, like 2,500.00' }
    ]
  }
} satisfies Meta<typeof ErrorSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {};

/** Press Save with the fields empty: the summary takes focus, each line focuses its field. */
export const WithTheForm: Story = {
  render: function Render() {
    const [submits, setSubmits] = useState(0);
    const [name, setName] = useState('');
    const [rent, setRent] = useState('');
    const errors = submits
      ? [
          ...(name.trim() ? [] : [{ field: 'story-name', message: 'Enter a name for the event' }]),
          ...(/^\d+(\.\d\d)?$/.test(rent)
            ? []
            : [{ field: 'story-rent', message: 'Enter the stall rent in pesos, like 2,500.00' }])
        ]
      : [];
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmits((n) => n + 1);
        }}
        className="flex flex-col gap-3"
      >
        <ErrorSummary errors={errors} focusKey={submits} />
        <Field
          id="story-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.find((e) => e.field === 'story-name')?.message}
        />
        <Field
          id="story-rent"
          label="Stall rent"
          mode="decimal"
          prefix="₱"
          value={rent}
          onChange={(e) => setRent(e.target.value)}
          error={errors.find((e) => e.field === 'story-rent')?.message}
        />
        <Button type="submit" variant="primary">
          Save the event →
        </Button>
      </form>
    );
  }
};
