import type { Meta, StoryObj } from '@storybook/react';
import { FeedItemDetail } from './FeedItemDetail';

const meta: Meta<typeof FeedItemDetail> = {
  title: 'Features/FeedItemDetail',
  component: FeedItemDetail,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    feedId: 'f_hn',
    onBack: () => alert('返回'),
  },
};
