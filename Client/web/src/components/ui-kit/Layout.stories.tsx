import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Card, Surface, Tabs, EmptyState, Button } from '@javis/ui-kit';
import { Inbox } from 'lucide-react';

export default { title: 'UI Kit/Layout' } as Meta;

export const Cards: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <h3 className="font-medium">Card (md padding)</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">A standard card with border and shadow.</p>
      </Card>
      <Card padding="sm">
        <p className="text-sm">Card (sm padding)</p>
      </Card>
      <Card padding="none">
        <div className="p-4">
          <p className="text-sm">Card (no padding, custom content)</p>
        </div>
      </Card>
    </div>
  ),
};

export const Surfaces: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Surface padding="md">
        <h3 className="font-medium">Standard Surface</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Subtle shadow, for grouping content.</p>
      </Surface>
      <Surface padding="md" elevated>
        <h3 className="font-medium">Elevated Surface</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Stronger shadow for overlays.</p>
      </Surface>
    </div>
  ),
};

export const TabExample: StoryObj = {
  render: () => {
    const [active, setActive] = useState('tab1');
    return (
      <div>
        <Tabs
          tabs={[
            { id: 'tab1', label: 'Timeline' },
            { id: 'tab2', label: 'Grid' },
            { id: 'tab3', label: 'Graph' },
          ]}
          activeTab={active}
          onTabChange={setActive}
        />
        <div className="mt-4 p-4 text-sm text-[var(--color-text-secondary)]">
          Active tab: {active}
        </div>
      </div>
    );
  },
};

export const EmptyStateExample: StoryObj = {
  render: () => (
    <EmptyState
      icon={<Inbox size={32} />}
      title="No items yet"
      description="Get started by creating your first item."
      action={<Button size="sm">Create Item</Button>}
    />
  ),
};
