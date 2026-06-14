import type { Meta, StoryObj } from '@storybook/react';
import { IconButton } from '@javis/ui-kit';
import { Search, Bell, Settings } from 'lucide-react';

const meta: Meta<typeof IconButton> = {
  title: 'UI Kit/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof IconButton>;

export const Default: Story = { args: { label: 'Search', children: <Search size={18} /> } };
export const Small: Story = { args: { label: 'Bell', size: 'sm', children: <Bell size={14} /> } };
export const Large: Story = { args: { label: 'Settings', size: 'lg', children: <Settings size={22} /> } };
export const Disabled: Story = { args: { label: 'Search', disabled: true, children: <Search size={18} /> } };
