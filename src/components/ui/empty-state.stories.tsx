import type { Meta, StoryObj } from '@storybook/nextjs';
import { EmptyState } from './empty-state';

const meta = {
  title: 'Bazaar v2/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
  args: { title: 'Everything on the table is sold' }
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = { args: { title: 'No fees yet' } };
export const WithAction: Story = {
  args: {
    body: 'Add cookies to keep selling.',
    action: { label: 'Add cookies', onPress: () => undefined }
  }
};
