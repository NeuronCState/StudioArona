import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScheduleTimeline } from './ScheduleTimeline';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function withProviders(Story: React.ComponentType) {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="max-w-2xl p-6">
        <Story />
      </div>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof ScheduleTimeline> = {
  title: 'Features/ScheduleTimeline',
  component: ScheduleTimeline,
  decorators: [withProviders],
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Personal: Story = {
  args: { scope: 'personal' },
};

export const Shared: Story = {
  args: { scope: 'shared' },
};
