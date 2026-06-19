import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@javis/ui-kit";

const meta: Meta<typeof Button> = {
  title: "UI Kit/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: "primary", children: "Primary Button" },
};
export const Secondary: Story = {
  args: { variant: "secondary", children: "Secondary Button" },
};
export const Ghost: Story = {
  args: { variant: "ghost", children: "Ghost Button" },
};
export const Danger: Story = {
  args: { variant: "danger", children: "Danger Button" },
};
export const Small: Story = {
  args: { variant: "primary", size: "sm", children: "Small" },
};
export const Large: Story = {
  args: { variant: "primary", size: "lg", children: "Large" },
};
export const Disabled: Story = {
  args: { variant: "primary", children: "Disabled", disabled: true },
};
