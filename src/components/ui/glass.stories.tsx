import type { Meta, StoryObj } from '@storybook/nextjs';
import { CountMoney, GlassCard, GoalRing, SplitBar } from './glass';

const meta = {
  title: 'Glass/GlassCard',
  component: GlassCard,
  parameters: {
    layout: 'padded',
    backgrounds: { default: 'espresso', values: [{ name: 'espresso', value: '#2a1810' }] }
  },
  args: { title: 'This month', children: null }
} satisfies Meta<typeof GlassCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The espresso-glass card with the two shared figures: a counted peso amount and the goal ring beside it. */
export const WithFigureAndRing: Story = {
  render: (args) => (
    <GlassCard {...args}>
      <div className="flex items-center gap-8">
        <span className="font-mono text-[40px] font-semibold tabular-nums">
          <CountMoney pesos={8000} />
        </span>
        <GoalRing pct={40} />
      </div>
    </GlassCard>
  )
};

export const WithSplitBar: Story = {
  render: (args) => (
    <GlassCard {...args} title="Where income went">
      <SplitBar
        label="33% spent, 67% kept"
        parts={[
          { id: 'spent', label: 'Spent', value: 4000, tone: 'bg-danger' },
          { id: 'kept', label: 'Kept', value: 8000, tone: 'bg-ok' }
        ]}
      />
    </GlassCard>
  )
};
