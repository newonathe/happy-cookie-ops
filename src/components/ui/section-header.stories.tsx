import type { Meta, StoryObj } from '@storybook/nextjs';
import { SectionHeader } from './section-header';

const meta = {
  title: 'Bazaar v2/SectionHeader',
  component: SectionHeader,
  parameters: { layout: 'padded' },
  args: { title: 'Fees' }
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};
export const WithCount: Story = { args: { count: 3 } };
export const WithAction: Story = {
  args: { count: 0, action: { label: 'Add a fee', onPress: () => undefined } }
};
