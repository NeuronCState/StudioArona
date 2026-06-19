import type { Meta, StoryObj } from "@storybook/react";
import { Badge, Tag, Avatar, Spinner, Skeleton } from "@javis/ui-kit";

export default { title: "UI Kit/Data Display" } as Meta;

export const Badges: StoryObj = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="accent">Accent</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
    </div>
  ),
};

export const Tags: StoryObj = {
  render: () => (
    <div className="flex gap-2">
      <Tag variant="default">Default</Tag>
      <Tag variant="accent">Accent</Tag>
      <Tag variant="success" onRemove={() => {}}>
        Removable
      </Tag>
      <Tag variant="warning">Warning</Tag>
      <Tag variant="error">Error</Tag>
    </div>
  ),
};

export const Avatars: StoryObj = {
  render: () => (
    <div className="flex items-end gap-4">
      <div className="flex flex-col items-center gap-1">
        <Avatar alt="User" size="sm" />
        <span className="text-2xs">sm</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Avatar alt="Zhang San" size="md" />
        <span className="text-2xs">md</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Avatar alt="Li Si" size="lg" />
        <span className="text-2xs">lg</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Avatar alt="Wang Wu" size="xl" />
        <span className="text-2xs">xl</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Avatar alt="Arona Studio" size="lg" src="https://i.pravatar.cc/80" />
        <span className="text-2xs">image</span>
      </div>
    </div>
  ),
};

export const Spinners: StoryObj = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};

export const Skeletons: StoryObj = {
  render: () => (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" />
          <Skeleton width="40%" />
        </div>
      </div>
      <Skeleton variant="rect" height={120} />
      <Skeleton variant="text" />
      <Skeleton variant="text" width="80%" />
    </div>
  ),
};
