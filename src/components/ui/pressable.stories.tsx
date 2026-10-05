import type { Meta, StoryObj } from '@storybook/nextjs';
import { Pressable } from './pressable';

const meta = {
  title: 'Primitives/Pressable',
  component: Pressable,
  parameters: {
    docs: {
      description: {
        component:
          "Carries the prototype's hover, press and focus values as style objects. Every " +
          'interactive element in the ported screens is one of these.'
      }
    }
  }
} satisfies Meta<typeof Pressable>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  height: '44px',
  padding: '0 16px',
  borderRadius: '12px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 600
};

export const PrimaryAction: Story = {
  args: {
    as: 'button',
    children: 'Mark as ready',
    style: { ...base, background: '#3A1F14', color: '#FFF5E5' },
    hoverStyle: { background: '#2C160E' },
    activeStyle: { transform: 'scale(0.98)' },
    focusStyle: { outline: '2px solid #E75F23', outlineOffset: '2px' }
  }
};

export const QuietAction: Story = {
  args: {
    as: 'button',
    children: 'Not today',
    style: { ...base, background: '#F4F1EE', color: '#3A1F14', border: '1px solid #EDE8E4' },
    hoverStyle: { background: '#EDE8E4' },
    activeStyle: { transform: 'scale(0.98)' }
  }
};

export const Destructive: Story = {
  args: {
    as: 'button',
    children: 'Cancel this order',
    style: { ...base, background: '#FFFFFF', color: '#A8231B', border: '1px solid #F2CFCB' },
    hoverStyle: { background: '#FFF6F5' }
  }
};
