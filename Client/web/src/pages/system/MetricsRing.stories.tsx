import type { Meta, StoryObj } from '@storybook/react';
import { MetricsRing } from './MetricsRing';

const meta: Meta<typeof MetricsRing> = {
  title: 'Components/MetricsRing',
  component: MetricsRing,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 45, max: 100, label: 'CPU', unit: '%' },
};

export const High: Story = {
  args: { value: 92, max: 100, label: '内存', unit: '%', color: '#F59E0B' },
};

export const Critical: Story = {
  args: { value: 85, max: 100, label: 'GPU 温度', unit: '°C', color: '#EF4444' },
};

export const Small: Story = {
  args: { value: 33, max: 100, size: 80, strokeWidth: 6, label: '磁盘', unit: '%' },
};

export const AllMetrics: Story = {
  render: () => (
    <div className="flex gap-8">
      <MetricsRing value={45} max={100} label="CPU" unit="%" />
      <MetricsRing value={72} max={100} label="内存" unit="%" />
      <MetricsRing value={65} max={100} label="GPU" unit="%" />
      <MetricsRing value={72} max={100} label="温度" unit="°C" color="#F59E0B" />
    </div>
  ),
};
