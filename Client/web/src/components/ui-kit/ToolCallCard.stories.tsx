import type { Meta, StoryObj } from '@storybook/react';
import { ToolCallCard } from '@/pages/chat/ToolCallCard';

const meta: Meta<typeof ToolCallCard> = {
  title: 'Chat/ToolCallCard',
  component: ToolCallCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ToolCallCard>;

export const Running: Story = {
  args: {
    toolCall: {
      id: 't1',
      tool: 'system.status',
      status: 'loading',
      startedAt: Date.now(),
    },
  },
  name: 'Running (no result yet)',
};

export const Success: Story = {
  args: {
    toolCall: {
      id: 't2',
      tool: 'rss.fetch',
      args: { url: 'https://example.com/rss', limit: 5 },
      status: 'ok',
      result: '获取到 3 篇新文章',
      latencyMs: 350,
    },
  },
  name: 'Success with result',
};

export const SuccessWithJSON: Story = {
  args: {
    toolCall: {
      id: 't3',
      tool: 'schedules.list',
      args: { upcoming: true, limit: 10 },
      status: 'ok',
      result: {
        count: 3,
        items: [
          { time: '14:00', title: '项目同步' },
          { time: '16:00', title: '设计评审' },
        ],
      },
      latencyMs: 420,
    },
  },
  name: 'Success with JSON result',
};

export const Error: Story = {
  args: {
    toolCall: {
      id: 't4',
      tool: 'vm.create',
      args: { name: 'training-vm', cpu: 8, mem_gb: 32, gpu: 1 },
      status: 'error',
      error: '资源不足：GPU 配额已用完',
      latencyMs: 2500,
    },
  },
  name: 'Error state',
};

export const LongResult: Story = {
  args: {
    toolCall: {
      id: 't5',
      tool: 'system.metrics',
      args: {},
      status: 'ok',
      result: {
        cpu: { avg: 45, cores: 32 },
        memory: { used_gb: 28, total_gb: 64 },
        gpu: [{ name: 'RTX 4090', util: 78, temp: 65 }],
        disks: [{ mount: '/', used_gb: 120, total_gb: 500 }],
      },
      latencyMs: 500,
    },
  },
  name: 'Large JSON result',
};
